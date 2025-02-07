// 监听安装事件
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        console.log('插件安装/更新事件：', details.reason);
        
        // 获取现有状态
        const result = await chrome.storage.sync.get(['tabManagerState', 'chunkCount']);
        
        // 如果是首次安装
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
        }
        // 如果是更新
        else if (details.reason === 'update') {
            console.log('插件更新，检查数据完整性...');
            // 验证现有数据
            if (result.tabManagerState && Array.isArray(result.tabManagerState.groups)) {
                console.log('数据正常，无需处理');
            } else {
                console.warn('数据异常，尝试修复...');
                // 尝试修复数据结构
                const fixedState = {
                    groups: Array.isArray(result.tabManagerState?.groups) ? 
                        result.tabManagerState.groups : [],
                    searchQuery: result.tabManagerState?.searchQuery || ''
                };
                await chrome.storage.sync.set({
                    tabManagerState: fixedState,
                    chunkCount: result.chunkCount || 0
                });
            }
        }

        // 创建右键菜单
        chrome.contextMenus.create({
            id: 'openTabay',
            title: '打开 Tabay',
            contexts: ['page', 'link']
        });

    } catch (error) {
        console.error('安装/更新处理时出错：', error);
    }
});

// 保存标签到未分组
async function saveToUngrouped(state, tabItems) {
    try {
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
        await saveState(state);
        
        return true;
    } catch (error) {
        console.error('保存到未分组失败：', error);
        return false;
    }
}

// 保存状态
async function saveState(state) {
    try {
        // 将大型数据结构分片存储
        const chunks = [];
        const groupChunks = [];
        const CHUNK_SIZE = 6000; // 设置较小的块大小，预留空间
        
        // 分割标签组数据
        state.groups.forEach(group => {
            if (!group || !Array.isArray(group.tabs)) {
                console.warn('跳过无效的分组数据');
                return;
            }

            const tabs = [];
            let currentChunk = [];
            
            group.tabs.forEach((tab, tabIndex) => {
                if (!tab || !tab.url || !tab.title) {
                    console.warn('跳过无效的标签数据');
                    return;
                }

                currentChunk.push(tab);
                const currentChunkSize = JSON.stringify(currentChunk).length;
                
                // 当前块接近限制或是最后一个标签时，创建新块
                if (currentChunkSize >= CHUNK_SIZE || tabIndex === group.tabs.length - 1) {
                    if (currentChunk.length > 0) {
                        tabs.push({
                            chunkIndex: chunks.length,
                            count: currentChunk.length
                        });
                        chunks.push([...currentChunk]); // 创建副本
                        currentChunk = [];
                    }
                }
            });
            
            // 存储分组信息
            groupChunks.push({
                id: group.id || Date.now().toString(),
                name: group.name || '未命名分组',
                tabs: tabs,
                createdAt: group.createdAt || new Date().toISOString()
            });
        });

        // 清理旧数据
        const oldChunkCount = (await chrome.storage.sync.get('chunkCount')).chunkCount || 0;
        for (let i = 0; i < oldChunkCount; i++) {
            await chrome.storage.sync.remove(`chunk_${i}`);
        }

        // 保存主状态
        await chrome.storage.sync.set({ 
            'tabManagerState': {
                groups: groupChunks,
                searchQuery: state.searchQuery || ''
            }
        });
        
        // 分批保存数据块
        const BATCH_SIZE = 3; // 每批处理的块数
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = {};
            const end = Math.min(i + BATCH_SIZE, chunks.length);
            for (let j = i; j < end; j++) {
                batch[`chunk_${j}`] = chunks[j];
            }
            await chrome.storage.sync.set(batch);
        }
        
        // 保存块数量信息
        await chrome.storage.sync.set({ 'chunkCount': chunks.length });
        
        return true;
    } catch (error) {
        console.error('保存状态时出错：', error);
        return false;
    }
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'openTabay') {
        // 打开完整界面
        chrome.tabs.create({ url: 'fullpage.html' });
    }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'saveAndCloseTabs') {
        try {
            // 创建新标签页并打开 Tabay 全屏页
            const newTab = await chrome.tabs.create({ 
                url: 'fullpage.html',
                active: true,
                windowId: message.windowId
            });

            // 获取当前窗口中除了新创建的标签页之外的所有标签
            const currentTabs = await chrome.tabs.query({ windowId: message.windowId });
            const tabsToClose = currentTabs.filter(t => t.id !== newTab.id);

            // 关闭这些标签
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