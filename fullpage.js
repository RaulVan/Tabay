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

    // 设置事件委托
    document.addEventListener('click', async (e) => {
        // 删除分组按钮
        if (e.target.closest('.delete-group-btn')) {
            const groupId = e.target.closest('.delete-group-btn').dataset.groupId;
            await deleteGroup(groupId);
            updateStats();
        }
        
        // 打开标签按钮
        if (e.target.closest('.open-tab-btn')) {
            const url = e.target.closest('.open-tab-btn').dataset.url;
            openTab(url);
        }
        
        // 删除标签按钮
        if (e.target.closest('.delete-tab-btn')) {
            const btn = e.target.closest('.delete-tab-btn');
            const groupId = btn.dataset.groupId;
            const tabId = btn.dataset.tabId;
            await deleteTab(groupId, tabId);
            updateStats();
        }
    });
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