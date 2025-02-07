// 使用 state.js 中的类和状态
// 注意：state.js 必须在 popup.js 之前加载

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 加载数据
        await loadState();
        // 设置事件监听器
        setupEventListeners();
        // 设置事件委托
        setupEventDelegation();
        // 渲染界面
        renderUI();
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
        
        if (mainState) {
            // 获取块数量
            const { chunkCount } = await chrome.storage.sync.get('chunkCount');
            
            // 加载所有数据块
            const chunks = [];
            for (let i = 0; i < chunkCount; i++) {
                const { [`chunk_${i}`]: chunk } = await chrome.storage.sync.get(`chunk_${i}`);
                chunks.push(chunk);
            }
            
            // 重建完整的状态对象
            state.searchQuery = mainState.searchQuery || '';
            state.groups = mainState.groups.map(group => {
                // 重建标签数组
                const tabs = [];
                group.tabs.forEach(tabRef => {
                    tabs.push(...chunks[tabRef.chunkIndex].slice(0, tabRef.count));
                });
                
                return {
                    ...group,
                    tabs
                };
            });
        }
    } catch (error) {
        console.error('加载状态时出错：', error);
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
    // 保存所有标签页
    document.getElementById('saveAllTabs')?.addEventListener('click', saveAllTabs);
    
    // 创建新分组
    document.getElementById('createGroup')?.addEventListener('click', createNewGroup);
    
    // 搜索功能
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        renderUI();
    });

    // 打开完整界面
    document.getElementById('openFullPage')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'fullpage.html' });
    });
}

// 添加事件委托处理程序
function setupEventDelegation() {
    document.addEventListener('click', async (e) => {
        // 删除分组按钮
        if (e.target.closest('.delete-group-btn')) {
            const groupId = e.target.closest('.delete-group-btn').dataset.groupId;
            await deleteGroup(groupId);
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
        }
    });
}

// 保存所有标签页
async function saveAllTabs() {
    try {
        // 获取所有标签页
        const tabs = await chrome.tabs.query({});
        
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
        
        // 移除进度条
        progressDiv.remove();
        
        // 显示成功提示
        showNotification(`成功保存了 ${tabs.length} 个标签页到"${targetGroup.name}"`);
        
        // 刷新界面
        renderUI();
        
    } catch (error) {
        console.error('保存标签页时出错：', error);
        showNotification('保存标签页时出错，请重试');
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
    const group = state.groups.find(g => g.id === groupId);
    if (group) {
        group.tabs = group.tabs.filter(tab => tab.id !== tabId);
        await saveState();
        renderUI();
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
    
    // 渲染每个时间段
    Object.entries(timeGroups).forEach(([timeLabel, groups]) => {
        const section = document.createElement('div');
        section.className = 'time-section';
        
        section.innerHTML = `
            <div class="time-section-header">${timeLabel}</div>
            <div class="time-section-content">
                ${groups.map(group => createGroupElementHTML(group)).join('')}
            </div>
        `;
        
        timeView.appendChild(section);
    });
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
                    <button class="delete-group-btn" data-group-id="${group.id}" title="删除分组">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
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
        }
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
        }
    };
} 