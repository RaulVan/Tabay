// 数据结构
class TabGroup {
    constructor(name, tabs = []) {
        this.id = Date.now().toString();
        this.name = name;
        this.tabs = tabs;
        this.createdAt = new Date().toISOString();
    }
}

class TabItem {
    constructor(tab) {
        this.id = String(tab.id);
        this.url = tab.url;
        this.title = tab.title;
        this.favIconUrl = tab.favIconUrl;
        this.createdAt = new Date().toISOString();
    }
}

// 全局状态
const state = {
    groups: [],
    searchQuery: ''
};

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
                    tabs.push({
                        chunkIndex: chunks.length,
                        count: currentChunk.length
                    });
                    chunks.push(currentChunk);
                    currentChunk = [];
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

// 显示通知
function showNotification(message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 添加显示动画
    setTimeout(() => notification.classList.add('show'), 10);
    
    // 自动关闭
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, duration);
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

// 为浏览器环境导出
if (typeof window !== 'undefined') {
    Object.assign(window, {
        TabGroup,
        TabItem,
        state,
        loadState,
        saveState,
        showNotification,
        formatDate,
        filterGroups,
        groupByTime
    });
}

// 为 Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TabGroup,
        TabItem,
        state,
        loadState,
        saveState,
        showNotification,
        formatDate,
        filterGroups,
        groupByTime
    };
} 