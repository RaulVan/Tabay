// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
    // 初始化存储
    chrome.storage.sync.get('tabManagerState', (result) => {
        if (!result.tabManagerState) {
            chrome.storage.sync.set({
                tabManagerState: {
                    groups: [],
                    searchQuery: ''
                }
            });
        }
    });

    // 创建父菜单
    chrome.contextMenus.create({
        id: 'tabayMenu',
        title: 'Tabay',
        contexts: ['page', 'link']
    });

    // 创建子菜单
    chrome.contextMenus.create({
        id: 'saveTab',
        parentId: 'tabayMenu',
        title: '保存当前标签',
        contexts: ['page', 'link']
    });

    chrome.contextMenus.create({
        id: 'saveAllTabs',
        parentId: 'tabayMenu',
        title: '保存所有标签',
        contexts: ['page', 'link']
    });

    chrome.contextMenus.create({
        id: 'openTabay',
        parentId: 'tabayMenu',
        title: '打开 Tabay',
        contexts: ['page', 'link']
    });
});

// 保存标签到未分组
async function saveToUngrouped(state, tabItems) {
    // 如果没有未分组的标签组，创建一个
    if (!state.groups.find(g => g.name === '未分组')) {
        state.groups.unshift({
            id: Date.now().toString(),
            name: '未分组',
            tabs: [],
            createdAt: new Date().toISOString()
        });
    }
    
    // 添加到未分组
    state.groups[0].tabs.push(...tabItems);
    
    // 保存状态
    await chrome.storage.sync.set({ tabManagerState: state });
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'saveTab') {
        const result = await chrome.storage.sync.get('tabManagerState');
        const state = result.tabManagerState || { groups: [], searchQuery: '' };
        
        // 创建新标签项
        const tabItem = {
            id: tab.id.toString(),
            url: info.linkUrl || tab.url, // 如果点击的是链接，使用链接URL
            title: tab.title,
            favIconUrl: tab.favIconUrl,
            createdAt: new Date().toISOString()
        };
        
        await saveToUngrouped(state, [tabItem]);

        // 显示通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Tabay',
            message: '标签已保存到"未分组"'
        });
    } else if (info.menuItemId === 'saveAllTabs') {
        // 获取当前窗口的所有标签
        const currentWindow = await chrome.windows.getCurrent();
        const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
        
        const result = await chrome.storage.sync.get('tabManagerState');
        const state = result.tabManagerState || { groups: [], searchQuery: '' };

        // 创建新标签组
        const groupName = `标签组 ${new Date().toLocaleString()}`;
        const newGroup = {
            id: Date.now().toString(),
            name: groupName,
            tabs: tabs.map(tab => ({
                id: tab.id.toString(),
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl,
                createdAt: new Date().toISOString()
            })),
            createdAt: new Date().toISOString()
        };

        // 添加新标签组
        state.groups.unshift(newGroup);
        await chrome.storage.sync.set({ tabManagerState: state });

        // 显示通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Tabay',
            message: `已保存 ${tabs.length} 个标签到"${groupName}"`
        });
    } else if (info.menuItemId === 'openTabay') {
        // 打开完整界面
        chrome.tabs.create({ url: 'fullpage.html' });
    }
}); 