// 数据结构
class TabGroup {
    constructor(name, tabs = []) {
        this.id = Date.now().toString();
        this.name = name || '未命名分组';
        this.tabs = Array.isArray(tabs) ? tabs.filter(tab => tab instanceof TabItem) : [];
        this.createdAt = new Date().toISOString();
    }

    static isValid(group) {
        return group &&
            typeof group === 'object' &&
            typeof group.id === 'string' &&
            typeof group.name === 'string' &&
            Array.isArray(group.tabs) &&
            typeof group.createdAt === 'string';
    }

    addTab(tab) {
        if (tab instanceof TabItem) {
            this.tabs.push(tab);
        } else if (typeof tab === 'object') {
            this.tabs.push(new TabItem(tab));
        }
    }
}

class TabItem {
    constructor(tab) {
        if (!tab || !tab.url || !tab.title) {
            throw new Error('无效的标签数据');
        }

        this.id = String(tab.id || Date.now());
        this.url = tab.url;
        this.title = tab.title;
        this.favIconUrl = tab.favIconUrl || 'default-favicon.png';
        this.createdAt = new Date().toISOString();
    }

    static isValid(tab) {
        return tab &&
            typeof tab === 'object' &&
            typeof tab.id === 'string' &&
            typeof tab.url === 'string' &&
            typeof tab.title === 'string' &&
            typeof tab.createdAt === 'string';
    }

    static createSafe(tab) {
        try {
            return new TabItem(tab);
        } catch (error) {
            console.warn('创建标签项时出错：', error);
            return null;
        }
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
        console.log('开始加载状态...');
        
        // 尝试从主存储加载
        const result = await chrome.storage.sync.get(['tabManagerState', 'chunkCount', 'lastBackup']);
        const mainState = result.tabManagerState;
        const lastBackup = result.lastBackup;
        
        // 检查主状态
        if (!mainState || !Array.isArray(mainState?.groups)) {
            console.log('主状态无效，尝试从备份恢复...');
            if (lastBackup && lastBackup.state) {
                console.log('找到可用备份，正在恢复...');
                state.groups = lastBackup.state.groups || [];
                state.searchQuery = lastBackup.state.searchQuery || '';
                await saveState(); // 立即保存以更新主存储
                return;
            } else {
                console.log('没有找到可用备份，初始化空状态');
                state.groups = [];
                state.searchQuery = '';
                await chrome.storage.sync.set({
                    tabManagerState: {
                        groups: [],
                        searchQuery: ''
                    },
                    chunkCount: 0
                });
                return;
            }
        }

        // 获取块数量
        const chunkCount = result.chunkCount || 0;
        console.log(`找到 ${chunkCount} 个数据块`);
        
        // 加载所有数据块
        const chunks = [];
        let dataCorrupted = false;
        
        for (let i = 0; i < chunkCount; i++) {
            try {
                const { [`chunk_${i}`]: chunk } = await chrome.storage.sync.get(`chunk_${i}`);
                if (Array.isArray(chunk)) {
                    chunks.push(chunk);
                } else {
                    console.warn(`数据块 ${i} 无效，使用空数组代替`);
                    chunks.push([]);
                    dataCorrupted = true;
                }
            } catch (error) {
                console.warn(`加载数据块 ${i} 时出错：`, error);
                chunks.push([]);
                dataCorrupted = true;
            }
        }

        // 重建完整的状态对象
        state.searchQuery = mainState.searchQuery || '';
        state.groups = mainState.groups.map(group => {
            try {
                if (!group || typeof group !== 'object') {
                    console.warn('跳过无效的分组数据');
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
                            dataCorrupted = true;
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
                dataCorrupted = true;
                return null;
            }
        }).filter(group => group !== null);

        // 如果数据有损坏，尝试修复并重新保存
        if (dataCorrupted) {
            console.log('检测到数据损坏，尝试修复...');
            await saveState();
            showNotification('数据已修复并重新保存');
        }

        console.log(`加载完成：${state.groups.length} 个分组`);

    } catch (error) {
        console.error('加载状态时出错：', error);
        // 显示错误通知
        showNotification('加载数据时出错，请刷新页面重试');
        
        // 初始化空状态
        state.searchQuery = '';
        state.groups = [];
        
        // 保存空状态
        await chrome.storage.sync.set({
            tabManagerState: {
                groups: [],
                searchQuery: ''
            },
            chunkCount: 0
        });
    }
}

// 保存状态
async function saveState() {
    try {
        // 创建备份
        await createBackup();

        // 将大型数据结构分片存储
        const chunks = [];
        const groupChunks = [];
        const CHUNK_SIZE = 6000;
        
        // 分割标签组数据
        state.groups.forEach((group, groupIndex) => {
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
                
                if (currentChunkSize >= CHUNK_SIZE || tabIndex === group.tabs.length - 1) {
                    if (currentChunk.length > 0) {
                        tabs.push({
                            chunkIndex: chunks.length,
                            count: currentChunk.length
                        });
                        chunks.push([...currentChunk]);
                        currentChunk = [];
                    }
                }
            });
            
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

        // 压缩主状态数据
        const mainState = {
            groups: groupChunks,
            searchQuery: state.searchQuery || ''
        };
        const compressedMainState = await compressData(mainState);
        
        // 保存压缩后的主状态
        await chrome.storage.sync.set({ 
            'tabManagerState': compressedMainState,
            'isCompressed': true
        });
        
        // 分批压缩和保存数据块
        const BATCH_SIZE = 3;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = {};
            const end = Math.min(i + BATCH_SIZE, chunks.length);
            for (let j = i; j < end; j++) {
                const compressedChunk = await compressData(chunks[j]);
                batch[`chunk_${j}`] = compressedChunk;
            }
            await chrome.storage.sync.set(batch);
        }
        
        // 保存块数量信息
        await chrome.storage.sync.set({ 'chunkCount': chunks.length });
        
        console.log(`保存完成：${chunks.length} 个数据块，${groupChunks.length} 个分组`);
        
    } catch (error) {
        console.error('保存状态时出错：', error);
        throw error;
    }
}

// 创建备份
async function createBackup() {
    try {
        const backup = {
            timestamp: Date.now(),
            state: {
                groups: state.groups,
                searchQuery: state.searchQuery
            }
        };
        await chrome.storage.sync.set({ 'lastBackup': backup });
        console.log('创建备份成功');
    } catch (error) {
        console.error('创建备份时出错：', error);
    }
}

// 从备份恢复
async function restoreFromBackup(backup) {
    try {
        if (backup && backup.state) {
            state.groups = backup.state.groups || [];
            state.searchQuery = backup.state.searchQuery || '';
            console.log('从备份恢复成功');
            // 立即保存以更新主存储
            await saveState();
            return true;
        }
    } catch (error) {
        console.error('从备份恢复时出错：', error);
    }
    return false;
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

// 检查同步数据有效性
async function checkSyncDataValidity() {
    try {
        const result = await chrome.storage.sync.get(['tabManagerState', 'chunkCount', 'lastBackup']);
        const mainState = result.tabManagerState;
        const chunkCount = result.chunkCount || 0;
        const lastBackup = result.lastBackup;
        
        console.log('开始检查同步数据有效性...');
        
        // 检查主状态
        if (!mainState || !Array.isArray(mainState.groups)) {
            console.error('主状态无效或不存在');
            return {
                isValid: false,
                details: '主状态数据无效',
                hasBackup: !!lastBackup
            };
        }

        // 检查数据块
        let validChunks = 0;
        let invalidChunks = 0;
        for (let i = 0; i < chunkCount; i++) {
            const { [`chunk_${i}`]: chunk } = await chrome.storage.sync.get(`chunk_${i}`);
            if (Array.isArray(chunk) && chunk.length > 0) {
                validChunks++;
            } else {
                invalidChunks++;
            }
        }

        // 检查分组数据完整性
        let validGroups = 0;
        let invalidGroups = 0;
        let totalTabs = 0;
        
        mainState.groups.forEach(group => {
            if (TabGroup.isValid(group)) {
                validGroups++;
                if (Array.isArray(group.tabs)) {
                    totalTabs += group.tabs.length;
                }
            } else {
                invalidGroups++;
            }
        });

        // 检查备份
        const backupStatus = lastBackup ? '存在' : '不存在';
        const backupAge = lastBackup ? formatDate(new Date(lastBackup.timestamp)) : '无';

        const status = {
            isValid: invalidChunks === 0 && invalidGroups === 0,
            details: {
                totalGroups: validGroups + invalidGroups,
                validGroups,
                invalidGroups,
                totalChunks: chunkCount,
                validChunks,
                invalidChunks,
                totalTabs,
                backupStatus,
                backupAge,
                storageUsage: await getStorageUsage()
            },
            hasBackup: !!lastBackup
        };

        console.log('同步数据状态：', status);
        return status;

    } catch (error) {
        console.error('检查同步数据时出错：', error);
        return {
            isValid: false,
            details: error.message,
            hasBackup: false
        };
    }
}

// 获取存储使用情况
async function getStorageUsage() {
    try {
        const bytesInUse = await chrome.storage.sync.getBytesInUse();
        const quotaBytes = chrome.storage.sync.QUOTA_BYTES;
        const usagePercent = (bytesInUse / quotaBytes * 100).toFixed(1);
        return {
            used: bytesInUse,
            total: quotaBytes,
            percent: usagePercent
        };
    } catch (error) {
        console.error('获取存储使用情况时出错：', error);
        return null;
    }
}

// 显示同步状态通知
function showSyncStatus(status) {
    let message = '';
    if (status.isValid) {
        message = `数据正常：${status.details.validGroups} 个分组，${status.details.totalTabs} 个标签，存储使用 ${status.details.storageUsage.percent}%`;
    } else {
        message = `数据异常：${status.details.invalidGroups} 个无效分组，${status.details.invalidChunks} 个损坏数据块`;
        if (status.hasBackup) {
            message += '，但存在可用备份';
        }
    }
    showNotification(message, 5000);
}

// 清除云端数据
async function clearSyncData() {
    try {
        // 获取所有存储的键
        const allKeys = await chrome.storage.sync.get(null);
        const keys = Object.keys(allKeys);
        
        // 清除所有数据
        await chrome.storage.sync.clear();
        
        // 重置状态
        state.groups = [];
        state.searchQuery = '';
        
        // 初始化空状态
        await chrome.storage.sync.set({
            tabManagerState: {
                groups: [],
                searchQuery: ''
            },
            chunkCount: 0
        });
        
        console.log(`已清除 ${keys.length} 个数据项`);
        return {
            success: true,
            message: `已清除 ${keys.length} 个数据项`
        };
    } catch (error) {
        console.error('清除数据时出错：', error);
        return {
            success: false,
            message: '清除数据失败：' + error.message
        };
    }
}

// 数据兼容性处理
async function importData(importedData) {
    try {
        console.log('开始导入数据...');
        
        // 验证导入的数据基本结构
        if (!importedData || typeof importedData !== 'object') {
            throw new Error('无效的数据格式');
        }

        // 处理不同版本的数据格式
        let processedData = {
            groups: [],
            searchQuery: ''
        };

        // 处理旧版本数据格式（直接是数组的情况）
        if (Array.isArray(importedData)) {
            console.log('检测到旧版本数据格式（数组）');
            processedData.groups = importedData;
        } 
        // 处理包含 groups 的新版本格式
        else if (Array.isArray(importedData.groups)) {
            console.log('检测到新版本数据格式');
            processedData = importedData;
        }
        // 处理包含 state 的备份格式
        else if (importedData.state && Array.isArray(importedData.state.groups)) {
            console.log('检测到备份数据格式');
            processedData = importedData.state;
        }
        // 其他未知格式
        else {
            throw new Error('不支持的数据格式');
        }

        // 处理分组数据
        const processedGroups = processedData.groups.map(group => {
            try {
                // 确保基本字段存在
                const processedGroup = {
                    id: group.id || Date.now().toString(),
                    name: group.name || '未命名分组',
                    createdAt: group.createdAt || new Date().toISOString(),
                    tabs: []
                };

                // 处理标签数据
                if (Array.isArray(group.tabs)) {
                    processedGroup.tabs = group.tabs.map(tab => {
                        try {
                            // 处理旧版本的标签格式
                            if (typeof tab === 'string') {
                                // 旧版本只存储 URL
                                return new TabItem({
                                    id: Date.now().toString(),
                                    url: tab,
                                    title: new URL(tab).hostname,
                                    favIconUrl: 'default-favicon.png'
                                });
                            }
                            
                            // 处理新版本的标签格式
                            return new TabItem({
                                id: tab.id || Date.now().toString(),
                                url: tab.url,
                                title: tab.title || new URL(tab.url).hostname,
                                favIconUrl: tab.favIconUrl || 'default-favicon.png',
                                createdAt: tab.createdAt || new Date().toISOString()
                            });
                        } catch (error) {
                            console.warn('处理标签数据时出错，已跳过：', error);
                            return null;
                        }
                    }).filter(tab => tab !== null); // 移除无效的标签
                }

                return processedGroup;
            } catch (error) {
                console.warn('处理分组数据时出错，已跳过：', error);
                return null;
            }
        }).filter(group => group !== null && group.tabs.length > 0); // 移除无效的分组和空分组

        // 验证处理后的数据
        if (processedGroups.length === 0) {
            throw new Error('没有找到有效的数据');
        }

        // 更新状态
        state.groups = processedGroups;
        state.searchQuery = processedData.searchQuery || '';

        // 保存到云端
        await saveState();

        return {
            success: true,
            message: `成功导入 ${processedGroups.length} 个分组，共 ${processedGroups.reduce((sum, group) => sum + group.tabs.length, 0)} 个标签`
        };

    } catch (error) {
        console.error('导入数据时出错：', error);
        return {
            success: false,
            message: '导入失败：' + error.message
        };
    }
}

// 数据压缩工具函数
async function compressData(data) {
    try {
        // 将数据转换为字符串
        const jsonString = JSON.stringify(data);
        
        // 创建压缩流
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        const encoder = new TextEncoder();
        
        // 写入数据
        writer.write(encoder.encode(jsonString));
        writer.close();
        
        // 读取压缩后的数据
        const reader = cs.readable.getReader();
        const chunks = [];
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        
        // 合并压缩后的数据
        const compressedData = new Uint8Array(chunks.reduce((acc, val) => acc + val.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            compressedData.set(chunk, offset);
            offset += chunk.length;
        }
        
        // 转换为 base64 字符串
        return btoa(String.fromCharCode.apply(null, compressedData));
    } catch (error) {
        console.error('压缩数据时出错：', error);
        return null;
    }
}

// 数据解压工具函数
async function decompressData(compressedString) {
    try {
        // 将 base64 字符串转换回 Uint8Array
        const compressedData = Uint8Array.from(atob(compressedString), c => c.charCodeAt(0));
        
        // 创建解压流
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        
        // 写入压缩数据
        writer.write(compressedData);
        writer.close();
        
        // 读取解压后的数据
        const reader = ds.readable.getReader();
        const chunks = [];
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        
        // 合并解压后的数据
        const decompressedData = new Uint8Array(chunks.reduce((acc, val) => acc + val.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            decompressedData.set(chunk, offset);
            offset += chunk.length;
        }
        
        // 转换回 JSON 对象
        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decompressedData));
    } catch (error) {
        console.error('解压数据时出错：', error);
        return null;
    }
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
        groupByTime,
        checkSyncDataValidity,
        getStorageUsage,
        showSyncStatus,
        clearSyncData,
        importData,
        compressData,
        decompressData
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
        groupByTime,
        checkSyncDataValidity,
        getStorageUsage,
        showSyncStatus,
        clearSyncData,
        importData,
        compressData,
        decompressData
    };
} 