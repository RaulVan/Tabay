// 使用 state.js 中的类和状态
// 注意：state.js 必须在 popup.js 之前加载

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 显示加载状态
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-overlay';
        loadingDiv.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">检查数据中...</div>
            </div>
        `;
        document.body.appendChild(loadingDiv);

        // 检查同步数据有效性
        const syncStatus = await checkSyncDataValidity();
        
        // 如果数据无效但有备份，尝试恢复
        if (!syncStatus.isValid && syncStatus.hasBackup) {
            console.log('检测到数据无效，尝试从备份恢复...');
            const { lastBackup } = await chrome.storage.sync.get('lastBackup');
            if (lastBackup) {
                await restoreFromBackup(lastBackup);
            }
        }

        // 加载数据
        await loadState();

        // 设置事件监听器
        setupEventListeners();
        
        // 设置事件委托
        setupEventDelegation();
        
        // 渲染界面
        renderUI();

        // 移除加载状态
        loadingDiv.remove();

        // 显示同步状态
        showSyncStatus(syncStatus);

        // 监听系统主题变化
        setupThemeListener();

    } catch (error) {
        console.error('初始化时出错：', error);
        showNotification('初始化时出错，请刷新页面重试');
    }
});

// 加载状态
async function loadState() {
    try {
        const result = await chrome.storage.sync.get('tabManagerState');
        const mainState = result.tabManagerState;
        
        if (!mainState) {
            console.log('没有找到已保存的状态');
            return;
        }

        // 获取块数量
        const { chunkCount = 0 } = await chrome.storage.sync.get('chunkCount');
        
        // 加载所有数据块
        const chunks = [];
        for (let i = 0; i < chunkCount; i++) {
            try {
                const { [`chunk_${i}`]: chunk } = await chrome.storage.sync.get(`chunk_${i}`);
                if (Array.isArray(chunk)) {
                    chunks.push(chunk);
                } else {
                    console.warn(`数据块 ${i} 无效，使用空数组代替`);
                    chunks.push([]);
                }
            } catch (error) {
                console.warn(`加载数据块 ${i} 时出错：`, error);
                chunks.push([]);
            }
        }
        
        // 重建完整的状态对象
        state.searchQuery = mainState.searchQuery || '';
        state.groups = mainState.groups.map(group => {
            try {
                // 验证分组基本信息
                if (!group || typeof group !== 'object') {
                    console.warn('无效的分组数据');
                    return null;
                }

                // 重建标签数组
                const tabs = [];
                if (Array.isArray(group.tabs)) {
                    group.tabs.forEach(tabRef => {
                        try {
                            if (tabRef && 
                                typeof tabRef.chunkIndex === 'number' && 
                                typeof tabRef.count === 'number' &&
                                tabRef.chunkIndex >= 0 && 
                                tabRef.chunkIndex < chunks.length) {
                                
                                const chunk = chunks[tabRef.chunkIndex];
                                if (Array.isArray(chunk) && chunk.length > 0) {
                                    const validTabs = chunk
                                        .slice(0, Math.min(tabRef.count, chunk.length))
                                        .filter(tab => tab && tab.url && tab.title);
                                    tabs.push(...validTabs);
                                }
                            }
                        } catch (error) {
                            console.warn('处理标签引用时出错：', error);
                        }
                    });
                }

                return {
                    id: group.id || Date.now().toString(),
                    name: group.name || '未命名分组',
                    tabs: tabs,
                    createdAt: group.createdAt || new Date().toISOString()
                };
            } catch (error) {
                console.warn('处理分组时出错：', error);
                return null;
            }
        }).filter(group => group !== null); // 移除无效的分组

    } catch (error) {
        console.error('加载状态时出错：', error);
        // 确保状态被重置为有效值
        state.searchQuery = '';
        state.groups = [];
        throw error;
    }
}

// 保存状态
async function saveState() {
    try {
        // 将大型数据结构分片存储
        const chunks = [];
        const groupChunks = [];
        const CHUNK_SIZE = 6000; // 设置较小的块大小，预留一些空间给其他数据
        
        // 分割标签组数据
        state.groups.forEach((group, groupIndex) => {
            const tabs = [];
            let currentChunk = [];
            
            group.tabs.forEach((tab, tabIndex) => {
                currentChunk.push(tab);
                
                // 当前块接近限制或是最后一个标签时，创建新块
                if (JSON.stringify(currentChunk).length >= CHUNK_SIZE || tabIndex === group.tabs.length - 1) {
                    if (currentChunk.length > 0) {
                        tabs.push({
                            chunkIndex: chunks.length,
                            count: currentChunk.length
                        });
                        chunks.push(currentChunk);
                        currentChunk = [];
                    }
                }
            });
            
            // 存储分组信息，但不包含具体的标签数据
            groupChunks.push({
                ...group,
                tabs: tabs // 只存储引用信息
            });
        });
        
        // 保存主状态对象（不包含具体的标签数据）
        const mainState = {
            groups: groupChunks,
            searchQuery: state.searchQuery
        };
        
        // 清理旧数据
        const oldChunkCount = (await chrome.storage.sync.get('chunkCount')).chunkCount || 0;
        for (let i = 0; i < oldChunkCount; i++) {
            await chrome.storage.sync.remove(`chunk_${i}`);
        }
        
        // 保存主状态
        await chrome.storage.sync.set({ 'tabManagerState': mainState });
        
        // 保存数据块
        for (let i = 0; i < chunks.length; i++) {
            await chrome.storage.sync.set({ [`chunk_${i}`]: chunks[i] });
        }
        
        // 保存块数量信息
        await chrome.storage.sync.set({ 'chunkCount': chunks.length });
        
    } catch (error) {
        console.error('保存状态时出错：', error);
        throw error;
    }
}

// 设置事件监听器
function setupEventListeners() {
    try {
        // 保存所有标签页
        const saveAllTabsBtn = document.getElementById('saveAllTabs');
        if (saveAllTabsBtn) {
            saveAllTabsBtn.addEventListener('click', saveAllTabs);
        }
        
        // 创建新分组
        const createGroupBtn = document.getElementById('createGroup');
        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', createNewGroup);
        }
        
        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery = e.target.value.toLowerCase();
                renderUI();
            });
        }

        // 打开完整界面
        const openFullPageBtn = document.getElementById('openFullPage');
        if (openFullPageBtn) {
            openFullPageBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: 'fullpage.html' });
            });
        }

        // 清除数据按钮
        const clearDataBtn = document.getElementById('clearData');
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', async () => {
                if (confirm('确定要清除所有云端数据吗？此操作不可恢复。')) {
                    try {
                        updateSyncStatus('正在清除...');
                        const result = await clearSyncData();
                        
                        if (result.success) {
                            // 重新加载状态
                            await loadState();
                            // 重新渲染 UI
                            renderUI();
                            // 更新统计信息
                            if (typeof updateStats === 'function') {
                                updateStats();
                            }
                            showNotification(result.message);
                            updateSyncStatus('已清除');
                        } else {
                            showNotification(result.message);
                            updateSyncStatus('清除失败');
                        }
                    } catch (error) {
                        console.error('清除数据时出错：', error);
                        showNotification('清除数据时出错，请重试');
                        updateSyncStatus('清除失败');
                    }
                }
            });
        }

        // 导入数据
        document.getElementById('importData')?.addEventListener('change', async (event) => {
            try {
                const file = event.target.files[0];
                if (!file) return;

                // 显示加载状态
                updateSyncStatus('正在导入...');

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const importedData = JSON.parse(e.target.result);
                        
                        // 使用新的导入函数处理数据
                        const result = await importData(importedData);
                        
                        if (result.success) {
                            showNotification(result.message);
                            renderUI();
                            updateSyncStatus('导入完成');
                        } else {
                            showNotification(result.message);
                            updateSyncStatus('导入失败');
                        }
                    } catch (error) {
                        console.error('解析导入文件时出错：', error);
                        showNotification('导入失败：文件格式错误');
                        updateSyncStatus('导入失败');
                    }
                };

                reader.onerror = () => {
                    showNotification('读取文件失败，请重试');
                    updateSyncStatus('导入失败');
                };

                reader.readAsText(file);
                
                // 清除文件选择，允许重复导入相同文件
                event.target.value = '';
            } catch (error) {
                console.error('导入数据时出错：', error);
                showNotification('导入数据时出错，请重试');
                updateSyncStatus('导入失败');
            }
        });

        // 保存当前标签页
        const saveCurrentTabBtn = document.getElementById('saveCurrentTab');
        if (saveCurrentTabBtn) {
            saveCurrentTabBtn.addEventListener('click', saveCurrentTab);
        }

        // 初始化拖拽功能
        setupDragAndDrop();
    } catch (error) {
        console.error('设置事件监听器时出错：', error);
    }
}

// 添加事件委托处理程序
function setupEventDelegation() {
    try {
        document.addEventListener('click', async (e) => {
            // 删除分组按钮
            if (e.target.closest('.delete-group-btn')) {
                const groupId = e.target.closest('.delete-group-btn').dataset.groupId;
                if (groupId && confirm('确定要删除这个分组吗？')) {
                    await deleteGroup(groupId);
                }
                return;
            }
            
            // 打开标签按钮
            if (e.target.closest('.open-tab-btn')) {
                const url = e.target.closest('.open-tab-btn').dataset.url;
                if (url) {
                    openTab(url);
                }
                return;
            }
            
            // 删除标签按钮
            if (e.target.closest('.delete-tab-btn')) {
                const tabElement = e.target.closest('.tab-item');
                const groupElement = e.target.closest('.tab-group');
                if (tabElement && groupElement) {
                    const groupId = groupElement.dataset.groupId;
                    const tabId = tabElement.dataset.tabId;
                    if (groupId && tabId) {
                        await deleteTab(groupId, tabId);
                    }
                }
                return;
            }
            
            // 打开所有标签按钮
            if (e.target.closest('.open-all-tabs-btn')) {
                const groupId = e.target.closest('.open-all-tabs-btn').dataset.groupId;
                if (groupId) {
                    await openAllTabs(groupId);
                }
                return;
            }
            
            // 分组标题点击（展开/折叠）
            const groupHeader = e.target.closest('.group-header-content');
            if (groupHeader && !e.target.closest('.group-actions') && !e.target.closest('.edit-title-btn')) {
                const group = groupHeader.closest('.tab-group');
                if (group) {
                    group.classList.toggle('expanded');
                }
            }

            // 编辑按钮点击处理
            if (e.target.closest('.edit-title-btn')) {
                const groupTitle = e.target.closest('.group-title');
                const titleText = groupTitle.querySelector('.title-text');
                const currentName = titleText.textContent;
                const groupId = groupTitle.dataset.groupId;
                
                // 创建输入框
                const input = document.createElement('input');
                input.type = 'text';
                input.value = currentName;
                input.className = 'edit-title-input';
                
                // 替换文本为输入框
                titleText.style.display = 'none';
                groupTitle.insertBefore(input, titleText);
                input.focus();
                input.select();
                
                // 处理输入框失去焦点和回车事件
                const saveNewName = async () => {
                    const newName = input.value.trim();
                    if (newName && newName !== currentName) {
                        // 更新状态
                        const group = state.groups.find(g => g.id === groupId);
                        if (group) {
                            group.name = newName;
                            await saveState();
                            titleText.textContent = newName;
                            showNotification('分组名称已更新');
                        }
                    }
                    titleText.style.display = '';
                    input.remove();
                };
                
                input.addEventListener('blur', saveNewName);
                input.addEventListener('keyup', (e) => {
                    if (e.key === 'Enter') {
                        saveNewName();
                    } else if (e.key === 'Escape') {
                        titleText.style.display = '';
                        input.remove();
                    }
                });
            }
        });
    } catch (error) {
        console.error('设置事件委托时出错：', error);
    }
}

// 保存所有标签页
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
        
        // 批量保存标签页
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const tabItem = new TabItem(tab);
            targetGroup.tabs.push(tabItem);
            
            // 更新进度
            updateProgress(i + 1);
            
            // 等待一小段时间，让用户看到进度
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 将新分组添加到状态中
        state.groups.unshift(targetGroup);
        
        // 保存状态（使用分片存储）
        await saveState();
        
        // 更新同步状态
        updateSyncStatus('正在同步...');
        
        // 等待同步完成
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 检查同步状态
        const syncStatus = await checkSyncDataValidity();
        showSyncStatus(syncStatus);
        
        // 移除进度条
        progressDiv.remove();
        
        // 显示成功提示
        showNotification(`成功保存了 ${tabs.length} 个标签页到"${targetGroup.name}"`);

        // 发送消息给后台脚本，让它处理关闭标签和打开新页面的操作
        chrome.runtime.sendMessage({
            action: 'saveAndCloseTabs',
            windowId: currentWindow.id
        });
        
    } catch (error) {
        console.error('保存标签页时出错：', error);
        showNotification('保存标签页时出错，请重试');
        updateSyncStatus('同步失败');
    }
}

// 显示分组选择器
function showGroupSelector() {
    const groupSelector = document.getElementById('groupSelector');
    groupSelector.style.display = 'block';
    return groupSelector;
}

// 显示进度对话框
function showProgressDialog(total) {
    // 先移除可能存在的旧进度条
    const existingProgress = document.querySelector('.save-progress');
    if (existingProgress) {
        existingProgress.remove();
    }

    // 创建新的进度条
    const progressDiv = document.createElement('div');
    progressDiv.className = 'save-progress';
    progressDiv.style.display = 'block';
    progressDiv.innerHTML = `
        <div class="progress-overlay"></div>
        <div class="progress-content">
            <h3>正在保存标签页...</h3>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">0/${total}</div>
        </div>
    `;
    
    // 确保添加到 DOM 中
    document.body.appendChild(progressDiv);

    // 获取进度条和文本元素的引用
    const progressFill = progressDiv.querySelector('.progress-fill');
    const progressText = progressDiv.querySelector('.progress-text');
    
    return {
        progressDiv,
        updateProgress: (current) => {
            if (progressFill && progressText) {
                const progress = (current / total) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${current}/${total}`;
            }
        }
    };
}

// 创建新分组
async function createNewGroup() {
    const name = prompt('请输入分组名称：');
    if (name) {
        const newGroup = new TabGroup(name);
        state.groups.unshift(newGroup);
        await saveState();
        renderUI();
    }
}

// 删除分组
async function deleteGroup(groupId) {
    state.groups = state.groups.filter(group => group.id !== groupId);
    await saveState();
    renderUI();
}

// 打开标签页
function openTab(url) {
    chrome.tabs.create({ url });
}

// 删除标签页
async function deleteTab(groupId, tabId) {
    try {
        const group = state.groups.find(g => g.id === groupId);
        if (group) {
            group.tabs = group.tabs.filter(tab => tab.id !== tabId);
            await saveState();
            renderUI();
            showNotification('标签页已删除');
        }
    } catch (error) {
        console.error('删除标签页时出错：', error);
        showNotification('删除标签页失败');
    }
}

// 打开分组中的所有标签
async function openAllTabs(groupId) {
    try {
        const group = state.groups.find(g => g.id === groupId);
        if (!group || !group.tabs || group.tabs.length === 0) {
            showNotification('没有找到可打开的标签页');
            return;
        }

        // 显示进度对话框
        const { progressDiv, updateProgress } = showProgressDialog(group.tabs.length);

        // 批量打开标签页
        for (let i = 0; i < group.tabs.length; i++) {
            const tab = group.tabs[i];
            await chrome.tabs.create({ url: tab.url, active: false });
            updateProgress(i + 1);
            // 等待一小段时间，避免浏览器过载
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 移除进度条
        progressDiv.remove();
        
        // 显示成功提示
        showNotification(`成功打开了 ${group.tabs.length} 个标签页`);
    } catch (error) {
        console.error('打开标签页时出错：', error);
        showNotification('打开标签页时出错，请重试');
    }
}

// 渲染 UI
function renderUI() {
    const timeView = document.getElementById('timeView');
    timeView.innerHTML = '';
    
    const filteredGroups = filterGroups();
    if (filteredGroups.length === 0) {
        timeView.innerHTML = '<div class="empty-state">没有找到标签页</div>';
        return;
    }
    
    // 按时间分组
    const timeGroups = groupByTime(filteredGroups);
    
    // 用于跟踪是否已经展开了第一个组
    let isFirstGroupExpanded = false;
    
    // 渲染每个时间段
    Object.entries(timeGroups).forEach(([timeLabel, groups]) => {
        const section = document.createElement('div');
        section.className = 'time-section';
        
        const header = document.createElement('div');
        header.className = 'time-section-header';
        header.textContent = timeLabel;
        section.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'time-section-content';
        
        // 渲染每个分组
        groups.forEach(group => {
            const groupElement = renderGroup(group);
            // 如果这是第一个组且还没有展开过任何组，则展开它
            if (!isFirstGroupExpanded) {
                groupElement.classList.add('expanded');
                isFirstGroupExpanded = true;
            }
            content.appendChild(groupElement);
        });
        
        section.appendChild(content);
        timeView.appendChild(section);
    });
}

// 渲染标签组
function renderGroup(group) {
    const groupElement = document.createElement('div');
    groupElement.className = 'tab-group';
    groupElement.dataset.groupId = group.id;

    const headerContent = `
        <div class="group-header">
            <div class="group-header-content">
                <div class="toggle-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6 12.796V3.204L11.481 8 6 12.796z"/>
                    </svg>
                </div>
                <div class="title-container">
                    <div class="group-title" data-group-id="${group.id}">
                        <span class="title-text">${group.name}</span>
                        <button class="edit-title-btn" title="编辑名称">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="group-meta">
                        ${formatDate(group.createdAt)} · ${group.tabs.length} 个标签
                    </div>
                </div>
                <div class="group-actions">
                    <button class="open-all-tabs-btn" title="打开所有标签" data-group-id="${group.id}">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4.5 9a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zM4 10.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm.5 1.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7z"/>
                            <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                        </svg>
                    </button>
                    <button class="delete-group-btn" title="删除分组" data-group-id="${group.id}">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    groupElement.innerHTML = headerContent;
    
    // 添加标签列表容器
    const tabList = document.createElement('div');
    tabList.className = 'tab-list';
    group.tabs.forEach(tab => {
        tabList.appendChild(renderTab(tab, group.id));
    });
    groupElement.appendChild(tabList);

    return groupElement;
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

// 创建分组元素的 HTML
function createGroupElementHTML(group) {
    return `
        <div class="tab-group" data-group-id="${group.id}">
            <div class="group-header">
                <div class="group-header-content">
                    <div>
                        <div class="group-title">${group.name}</div>
                        <div class="group-meta">
                            ${group.tabs.length} 个标签页 · 
                            ${formatDate(group.createdAt)}
                        </div>
                    </div>
                    <div class="group-actions">
                        <button class="open-all-tabs-btn" data-group-id="${group.id}" title="打开所有标签">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                                    <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                            </svg>
                        </button>
                        <button class="delete-group-btn" data-group-id="${group.id}" title="删除分组">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="tab-list">
                ${group.tabs.map(tab => `
                    <div class="tab-item" data-group-id="${group.id}" data-tab-id="${tab.id}">
                        <img src="${tab.favIconUrl || 'default-favicon.png'}" class="tab-favicon" 
                             onerror="this.src='default-favicon.png'">
                        <div class="tab-content">
                            <div class="tab-title">${tab.title}</div>
                            <div class="tab-url">${tab.url}</div>
                        </div>
                        <div class="tab-actions">
                            <button class="open-tab-btn" data-url="${tab.url}" title="打开">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                                    <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                                </svg>
                            </button>
                            <button class="delete-tab-btn" data-group-id="${group.id}" data-tab-id="${tab.id}" title="删除">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 按时间分组
function groupByTime(groups) {
    const now = new Date();
    const timeGroups = {
        '今天': [],
        '昨天': [],
        '本周': [],
        '本月': [],
        '更早': []
    };
    
    groups.forEach(group => {
        const createdAt = new Date(group.createdAt);
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            timeGroups['今天'].push(group);
        } else if (diffDays === 1) {
            timeGroups['昨天'].push(group);
        } else if (diffDays <= 7) {
            timeGroups['本周'].push(group);
        } else if (diffDays <= 30) {
            timeGroups['本月'].push(group);
        } else {
            timeGroups['更早'].push(group);
        }
    });
    
    // 移除空的时间组
    Object.keys(timeGroups).forEach(key => {
        if (timeGroups[key].length === 0) {
            delete timeGroups[key];
        }
    });
    
    return timeGroups;
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 60) {
        return `${diffMins} 分钟前`;
    } else if (diffHours < 24) {
        return `${diffHours} 小时前`;
    } else if (diffDays < 30) {
        return `${diffDays} 天前`;
    } else {
        return date.toLocaleDateString();
    }
}

// 过滤分组
function filterGroups() {
    if (!state.searchQuery) {
        return state.groups;
    }
    
    return state.groups.map(group => ({
        ...group,
        tabs: group.tabs.filter(tab => 
            tab.title.toLowerCase().includes(state.searchQuery) ||
            tab.url.toLowerCase().includes(state.searchQuery)
        )
    })).filter(group => group.tabs.length > 0);
}

// 导出函数
if (typeof window !== 'undefined') {
    Object.assign(window, {
        setupEventListeners,
        setupEventDelegation,
        saveAllTabs,
        createNewGroup,
        deleteGroup,
        openTab,
        deleteTab,
        renderUI,
        createGroupElementHTML,
        groupByTime,
        formatDate,
        filterGroups,
        showGroupSelector,
        showProgressDialog,
        updateProgress: (progressDiv, current, total) => {
            const progress = (current / total) * 100;
            const progressFill = progressDiv.querySelector('.progress-fill');
            const progressText = progressDiv.querySelector('.progress-text');
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${current}/${total}`;
        },
        renderTab,
    });
}

// 为 Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        setupEventListeners,
        setupEventDelegation,
        saveAllTabs,
        createNewGroup,
        deleteGroup,
        openTab,
        deleteTab,
        renderUI,
        createGroupElementHTML,
        groupByTime,
        formatDate,
        filterGroups,
        showGroupSelector,
        showProgressDialog,
        updateProgress: (progressDiv, current, total) => {
            const progress = (current / total) * 100;
            const progressFill = progressDiv.querySelector('.progress-fill');
            const progressText = progressDiv.querySelector('.progress-text');
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${current}/${total}`;
        },
        renderTab,
    };
}

// 更新同步状态
function updateSyncStatus(status) {
    const syncStatus = document.getElementById('syncStatus');
    const syncIcon = document.getElementById('syncIcon');
    if (syncStatus && syncIcon) {
        syncStatus.textContent = status;
        if (status === '正在同步...' || status === '正在清除...') {
            syncIcon.classList.add('rotating');
        } else {
            syncIcon.classList.remove('rotating');
        }
    }
}

// 保存当前标签页
async function saveCurrentTab() {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) {
            showNotification('无法获取当前标签页信息', 'error');
            return;
        }

        const tabItem = TabItem.createSafe(activeTab);
        if (!tabItem) {
            showNotification('当前页面类型不支持保存', 'warning');
            return;
        }

        // 获取选中的分组
        const selectedGroup = document.querySelector('input[name="group-select"]:checked');
        if (!selectedGroup) {
            showNotification('请先选择一个分组', 'warning');
            return;
        }

        const groupId = selectedGroup.value;
        const group = await TabGroup.get(groupId);
        if (!group) {
            showNotification('所选分组不存在', 'error');
            return;
        }

        // 检查标签是否已存在
        if (group.hasTab(activeTab.url)) {
            showNotification('该标签页已在分组中', 'info');
            return;
        }

        // 保存标签
        await group.addTab(tabItem);
        showNotification('标签页已保存', 'success');
        
        // 刷新UI
        await renderGroups();
        
    } catch (error) {
        console.error('保存标签时出错：', error);
        showNotification(error.message || '保存标签时出错', 'error');
    }
}

function setupDragAndDrop() {
    let draggedTab = null;
    let dragFeedback = document.getElementById('dragFeedback');
    let sourceGroupId = null;

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
        dragFeedback.style.display = 'flex';

        // 设置拖拽数据
        e.dataTransfer.setData('text/plain', JSON.stringify(draggedTab));
        e.dataTransfer.effectAllowed = 'move';
    });

    document.addEventListener('dragend', (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (tabItem) {
            tabItem.classList.remove('drag-source');
        }
        dragFeedback.style.display = 'none';
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
        if (!targetGroup || !draggedTab) return;

        const targetGroupId = targetGroup.dataset.groupId;
        if (targetGroupId === sourceGroupId) return;

        try {
            // 从源组中移除标签
            const sourceGroup = state.groups.find(g => g.id === sourceGroupId);
            const targetGroup = state.groups.find(g => g.id === targetGroupId);
            
            if (!sourceGroup || !targetGroup) return;

            const tabIndex = sourceGroup.tabs.findIndex(t => t.id === draggedTab.id);
            if (tabIndex === -1) return;

            const [movedTab] = sourceGroup.tabs.splice(tabIndex, 1);
            targetGroup.tabs.push(movedTab);

            // 保存状态并重新渲染
            await saveState();
            renderUI();
            
            // 显示成功提示
            showNotification(`标签页已移动到"${targetGroup.name}"`);
        } catch (error) {
            console.error('移动标签页时出错：', error);
            showNotification('移动标签页失败，请重试');
        }

        clearDropTargets();
    });
}

function clearDropTargets() {
    document.querySelectorAll('.tab-group.drop-target').forEach(group => {
        group.classList.remove('drop-target');
    });
}

// 监听系统主题变化
function setupThemeListener() {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // 初始检查
    handleThemeChange(darkModeMediaQuery);
    
    // 监听变化
    darkModeMediaQuery.addEventListener('change', handleThemeChange);
}

// 处理主题变化
function handleThemeChange(e) {
    const isDarkMode = e.matches;
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
} 