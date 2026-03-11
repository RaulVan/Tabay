// 监听安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        console.log('插件安装/更新事件：', details.reason);

        const result = await chrome.storage.sync.get(['tabManagerState', 'chunkCount', 'isCompressed']);

        if (details.reason === 'install') {
            console.log('首次安装，初始化存储...');
            if (!result.tabManagerState) {
                await chrome.storage.sync.set({
                    tabManagerState: {
                        groups: [],
                        searchQuery: ''
                    },
                    chunkCount: 0
                });
            }
        } else if (details.reason === 'update') {
            console.log('插件更新，检查数据完整性...');
            const raw = result.tabManagerState;
            // 压缩存储时为字符串，无法直接读 groups；视为已存在有效数据，不覆盖
            if (raw && typeof raw === 'string' && result.isCompressed) {
                console.log('数据为压缩格式，跳过结构修复');
            } else if (raw && typeof raw === 'object' && Array.isArray(raw.groups)) {
                console.log('数据正常，无需处理');
            } else if (raw && typeof raw === 'object') {
                console.warn('数据异常，尝试修复...');
                const fixedState = {
                    groups: Array.isArray(raw.groups) ? raw.groups : [],
                    searchQuery: raw.searchQuery || ''
                };
                await chrome.storage.sync.set({
                    tabManagerState: fixedState,
                    chunkCount: result.chunkCount || 0
                });
            }
        }

        chrome.contextMenus.create({
            id: 'openTabay',
            title: '打开 Tabay',
            contexts: ['page', 'link']
        });
    } catch (error) {
        console.error('安装/更新处理时出错：', error);
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'openTabay') {
        chrome.tabs.create({ url: 'fullpage.html' });
    }
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'saveAndCloseTabs') {
        try {
            const newTab = await chrome.tabs.create({
                url: 'fullpage.html',
                active: true,
                windowId: message.windowId
            });
            const currentTabs = await chrome.tabs.query({ windowId: message.windowId });
            const tabsToClose = currentTabs.filter(t => t.id !== newTab.id);
            if (tabsToClose.length > 0) {
                await chrome.tabs.remove(tabsToClose.map(t => t.id));
            }
        } catch (error) {
            console.error('处理标签页时出错：', error);
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Tabay',
                message: '关闭标签页时出错，请手动关闭'
            });
        }
    }
});
