// 确保在页面加载时初始化数据
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 加载数据
        await loadState();
        // 设置全屏页面特有的事件监听器
        setupFullPageEventListeners();
        // 渲染界面
        renderUI();
        // 更新统计信息
        updateStats();
        // 添加视图切换监听
        setupViewListeners();
        // 检查同步状态
        await checkSyncStatus();
    } catch (error) {
        console.error('初始化时出错：', error);
        showNotification('初始化时出错，请刷新页面重试');
    }
});

// 设置视图切换监听器
function setupViewListeners() {
    // 视图模式切换
    document.getElementById('listView')?.addEventListener('click', () => {
        document.getElementById('listView').classList.add('active');
        document.getElementById('gridView').classList.remove('active');
        document.getElementById('timeView').classList.remove('grid-view');
    });

    document.getElementById('gridView')?.addEventListener('click', () => {
        document.getElementById('gridView').classList.add('active');
        document.getElementById('listView').classList.remove('active');
        document.getElementById('timeView').classList.add('grid-view');
    });

    // 搜索功能
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderUI();
        updateStats();
    });
}

// 渲染单个标签页
function renderTab(tab, groupId) {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab-item';
    tabElement.draggable = true;
    tabElement.dataset.tabId = tab.id;
    tabElement.dataset.groupId = groupId;
    
    tabElement.innerHTML = `
        <img class="tab-favicon" src="${tab.favIconUrl || 'default-favicon.png'}" onerror="this.src='default-favicon.png'">
        <div class="tab-content">
            <div class="tab-title">${tab.title}</div>
            <div class="tab-url">${tab.url}</div>
        </div>
        <div class="tab-actions">
            <button class="open-tab-btn" data-url="${tab.url}" title="打开标签页">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.5 1h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1h-8z"/>
                    <path d="M8.293 7.293a1 1 0 0 1 1.414 0l2 2a1 1 0 0 1-1.414 1.414L9 9.414V13a1 1 0 1 1-2 0V9.414L5.707 10.707a1 1 0 0 1-1.414-1.414l2-2a1 1 0 0 1 1.414 0z"/>
                </svg>
            </button>
            <button class="delete-tab-btn" data-group-id="${groupId}" data-tab-id="${tab.id}" title="删除标签页">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                </svg>
            </button>
        </div>
    `;
    
    return tabElement;
}

// 设置全屏页面特有的事件监听器
function setupFullPageEventListeners() {
    // 创建新分组
    document.getElementById('createGroup')?.addEventListener('click', createNewGroup);

    // 导出数据
    document.getElementById('exportData')?.addEventListener('click', () => {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabay-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('数据导出成功！');
    });

    // 导入数据
    document.getElementById('importButton')?.addEventListener('click', () => {
        document.getElementById('importData')?.click();
    });

    document.getElementById('importData')?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedState = JSON.parse(e.target.result);
                    if (importedState.groups) {
                        state.groups = importedState.groups;
                        state.searchQuery = importedState.searchQuery || '';
                        await saveState();
                        renderUI();
                        updateStats();
                        showNotification('数据导入成功！');
                    } else {
                        showNotification('无效的数据格式！');
                    }
                } catch (error) {
                    console.error('导入数据时出错：', error);
                    showNotification('导入数据时出错，请检查文件格式');
                }
            };
            reader.readAsText(file);
        } catch (error) {
            console.error('读取文件时出错：', error);
            showNotification('读取文件时出错，请重试');
        }
    });

    // 将事件委托绑定到标签容器上
    const tabsContainer = document.querySelector('.tabs-container');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', async (e) => {
            // 如果点击的是按钮内部的 SVG 或 path，获取最近的按钮父元素
            const button = e.target.closest('button');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();

            // 根据按钮类型处理不同的操作
            if (button.classList.contains('open-tab-btn')) {
                const url = button.dataset.url;
                if (url) {
                    openTab(url);
                }
            } else if (button.classList.contains('delete-group-btn')) {
                const groupId = button.dataset.groupId;
                await deleteGroup(groupId);
                updateStats();
            } else if (button.classList.contains('delete-tab-btn')) {
                const groupId = button.dataset.groupId;
                const tabId = button.dataset.tabId;
                await deleteTab(groupId, tabId);
                updateStats();
            } else if (button.classList.contains('open-all-tabs-btn')) {
                const groupId = button.dataset.groupId;
                if (groupId) {
                    await openAllTabs(groupId);
                }
            }
        });
    }
}

// 修改打开标签的函数
function openTab(url) {
    if (!url) return;
    
    // 处理 chrome:// URLs
    if (url.startsWith('chrome://')) {
        // 对于常见的 chrome:// URLs，使用特殊处理
        switch (url) {
            case 'chrome://newtab/':
                chrome.tabs.create({ active: true });
                return;
            case 'chrome://bookmarks/':
                chrome.tabs.create({ url: 'chrome://bookmarks' });
                return;
            case 'chrome://downloads/':
                chrome.tabs.create({ url: 'chrome://downloads' });
                return;
            case 'chrome://history/':
                chrome.tabs.create({ url: 'chrome://history' });
                return;
            case 'chrome://extensions/':
                chrome.tabs.create({ url: 'chrome://extensions' });
                return;
            case 'chrome://settings/':
                chrome.tabs.create({ url: 'chrome://settings' });
                return;
            default:
                // 尝试直接打开，如果失败则显示提示
                try {
                    chrome.tabs.create({ url });
                } catch (error) {
                    console.error('无法打开内部页面：', error);
                    showNotification('无法直接打开此 Chrome 内部页面，请手动打开');
                }
                return;
        }
    }
    
    // 正常打开其他 URL
    chrome.tabs.create({ url, active: true });
}

// 更新统计信息
function updateStats() {
    const totalGroups = state.groups.length;
    const totalTabs = state.groups.reduce((sum, group) => sum + group.tabs.length, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const savedToday = state.groups.reduce((sum, group) => {
        const groupDate = new Date(group.createdAt);
        return sum + (groupDate >= today ? group.tabs.length : 0);
    }, 0);

    document.getElementById('totalGroups').textContent = totalGroups;
    document.getElementById('totalTabs').textContent = totalTabs;
    document.getElementById('savedToday').textContent = savedToday;
}

// 导出函数
window.updateStats = updateStats;

// 监听同步状态
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        const syncStatus = document.getElementById('syncStatus');
        const syncIcon = document.getElementById('syncIcon').parentElement;
        
        // 显示同步中状态
        syncIcon.classList.add('syncing');
        syncStatus.textContent = '同步中...';
        
        // 延迟更新状态，给用户一个视觉反馈
        setTimeout(() => {
            syncIcon.classList.remove('syncing');
            syncStatus.textContent = '已同步';
        }, 1000);
    }
});

// 检查同步状态
async function checkSyncStatus() {
    try {
        const bytesInUse = await chrome.storage.sync.getBytesInUse();
        const quotaBytes = chrome.storage.sync.QUOTA_BYTES;
        const usagePercent = (bytesInUse / quotaBytes * 100).toFixed(1);
        
        // 如果使用超过 80%，显示警告
        if (usagePercent > 80) {
            showNotification(`同步存储空间使用已达 ${usagePercent}%，建议导出备份`, 5000);
        }
    } catch (error) {
        const syncStatus = document.getElementById('syncStatus');
        const syncIcon = document.getElementById('syncIcon').parentElement;
        
        syncIcon.classList.add('error');
        syncStatus.textContent = '同步错误';
        
        console.error('同步状态检查失败：', error);
    }
}

// 打开分组中的所有标签
async function openAllTabs(groupId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;

    try {
        // 显示进度提示
        showNotification('正在打开标签页...');
        
        // 依次打开每个标签
        for (const tab of group.tabs) {
            if (tab.url) {
                await chrome.tabs.create({ url: tab.url, active: false });
            }
        }
        
        showNotification(`成功打开 ${group.tabs.length} 个标签页`);
    } catch (error) {
        console.error('打开标签页时出错：', error);
        showNotification('打开标签页时出错，请重试');
    }
}

// 删除标签
async function deleteTab(groupId, tabId) {
    try {
        // 保存删除前的展开状态
        const group = document.querySelector(`.tab-group[data-group-id="${groupId}"]`);
        const wasExpanded = group?.classList.contains('expanded');
        
        // 更新状态
        const groupIndex = state.groups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
            state.groups[groupIndex].tabs = state.groups[groupIndex].tabs.filter(t => t.id !== tabId);
            
            // 如果分组为空，删除分组
            if (state.groups[groupIndex].tabs.length === 0) {
                state.groups.splice(groupIndex, 1);
            }
            
            await saveState();
            
            // 重新渲染并恢复展开状态
            await renderUI();
            
            if (wasExpanded) {
                const updatedGroup = document.querySelector(`.tab-group[data-group-id="${groupId}"]`);
                if (updatedGroup) {
                    updatedGroup.classList.add('expanded');
                }
            }
            
            showNotification('标签已删除');
        }
    } catch (error) {
        console.error('删除标签时出错：', error);
        showNotification('删除标签时出错，请重试');
    }
}

function setupDragAndDrop() {
    let draggedTab = null;
    let dragFeedback = document.getElementById('dragFeedback');
    let sourceGroupId = null;

    // 确保 dragFeedback 元素存在
    if (!dragFeedback) {
        // 如果不存在，创建一个
        dragFeedback = document.createElement('div');
        dragFeedback.id = 'dragFeedback';
        dragFeedback.className = 'drag-feedback';
        dragFeedback.style.display = 'none';
        dragFeedback.innerHTML = `
            <div class="drag-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
            </div>
            <span class="drag-text">正在移动标签页...</span>
        `;
        document.body.appendChild(dragFeedback);
    }

    // 监听标签项的拖拽事件
    document.addEventListener('dragstart', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (!tabItem) return;

        draggedTab = {
            id: tabItem.dataset.tabId,
            groupId: tabItem.closest('.tab-group').dataset.groupId
        };
        sourceGroupId = draggedTab.groupId;

        // 设置拖拽效果
        tabItem.classList.add('drag-source');
        if (dragFeedback) {
            dragFeedback.style.display = 'flex';
        }

        // 设置拖拽数据
        e.dataTransfer.setData('text/plain', JSON.stringify(draggedTab));
        e.dataTransfer.effectAllowed = 'move';
    });

    document.addEventListener('dragend', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (tabItem) {
            tabItem.classList.remove('drag-source');
        }
        if (dragFeedback) {
            dragFeedback.style.display = 'none';
        }
        clearDropTargets();
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetGroup = e.target.closest('.tab-group');
        if (targetGroup && targetGroup.dataset.groupId !== sourceGroupId) {
            targetGroup.classList.add('drop-target');
        }
    });

    document.addEventListener('dragleave', (e) => {
        const targetGroup = e.target.closest('.tab-group');
        if (targetGroup) {
            targetGroup.classList.remove('drop-target');
        }
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        const targetGroup = e.target.closest('.tab-group');
        if (!targetGroup || !draggedTab) {
            clearDropTargets();
            return;
        }

        const targetGroupId = targetGroup.dataset.groupId;
        if (targetGroupId === sourceGroupId) {
            clearDropTargets();
            return;
        }

        try {
            // 从源组中移除标签
            const sourceGroup = state.groups.find(g => g.id === sourceGroupId);
            const targetGroupObj = state.groups.find(g => g.id === targetGroupId);
            
            if (!sourceGroup || !targetGroupObj) {
                throw new Error('找不到源组或目标组');
            }

            const tabIndex = sourceGroup.tabs.findIndex(t => t.id === draggedTab.id);
            if (tabIndex === -1) {
                throw new Error('找不到要移动的标签');
            }

            const [movedTab] = sourceGroup.tabs.splice(tabIndex, 1);
            targetGroupObj.tabs.push(movedTab);

            // 保存状态并重新渲染
            await saveState();
            renderUI();
            
            // 显示成功提示
            showNotification(`标签页已移动到"${targetGroupObj.name}"`);
        } catch (error) {
            console.error('移动标签页时出错：', error);
            showNotification('移动标签页失败，请重试');
        } finally {
            clearDropTargets();
            if (dragFeedback) {
                dragFeedback.style.display = 'none';
            }
        }
    });
}

function clearDropTargets() {
    document.querySelectorAll('.tab-group.drop-target').forEach(group => {
        group.classList.remove('drop-target');
    });
}

async function saveAllTabs() {
    try {
        // 获取当前窗口
        const currentWindow = await chrome.windows.getCurrent();
        // 获取当前窗口的所有标签页
        const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
        
        // 如果没有标签页，显示提示
        if (tabs.length === 0) {
            showNotification('没有找到可保存的标签页');
            return;
        }

        // 创建新分组
        const defaultName = `标签组 ${new Date().toLocaleString()}`;
        const targetGroup = new TabGroup(defaultName);
        
        // 显示并更新保存进度
        const { progressDiv, updateProgress } = showProgressDialog(tabs.length);
        
        let savedCount = 0;
        let skippedTabs = [];

        // 批量保存标签页
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const result = TabItem.createSafe(tab);
            
            if (!(result instanceof TabItem)) {
                // 如果创建失败，记录错误信息
                skippedTabs.push({
                    title: tab.title || '无标题',
                    url: tab.url,
                    reason: result.message || '不支持保存此类型的页面'
                });
                console.warn(`跳过标签页: ${tab.url}`, result);
            } else {
                // 成功创建标签项
                targetGroup.tabs.push(result);
                savedCount++;
            }
            
            // 更新进度
            updateProgress(i + 1);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 如果没有保存任何标签页，显示提示并返回
        if (savedCount === 0) {
            progressDiv.remove();
            showNotification('没有找到可保存的标签页，所有标签页都是不支持的类型');
            console.log('跳过的标签页：', skippedTabs);
            return;
        }

        // 将新分组添加到状态中
        state.groups.unshift(targetGroup);
        
        // 保存状态
        await saveState();
        
        // 移除进度条
        progressDiv.remove();
        
        // 显示成功提示，包含跳过的标签页信息
        let message = `成功保存了 ${savedCount} 个标签页到"${targetGroup.name}"`;
        if (skippedTabs.length > 0) {
            message += `，${skippedTabs.length} 个不支持的页面已跳过`;
            // 在控制台输出详细信息
            console.log('跳过的标签页：', skippedTabs);
        }
        showNotification(message);

        // 发送消息给后台脚本，让它处理关闭标签和打开新页面的操作
        chrome.runtime.sendMessage({
            action: 'saveAndCloseTabs',
            windowId: currentWindow.id
        });
        
    } catch (error) {
        console.error('保存标签页时出错：', error);
        showNotification('保存标签页时出错：' + error.message);
    }
} 