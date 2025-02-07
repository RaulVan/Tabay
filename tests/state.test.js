// 模拟 chrome.storage.sync API
global.chrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn(),
            QUOTA_BYTES: 102400, // 100KB
            QUOTA_BYTES_PER_ITEM: 8192 // 8KB
        }
    }
};

// 导入要测试的类和函数
const {
    TabGroup,
    TabItem,
    state,
    loadState,
    saveState,
    formatDate,
    filterGroups,
    groupByTime
} = require('../state.js');

describe('数据结构测试', () => {
    describe('TabGroup', () => {
        test('创建新的标签组', () => {
            const name = '测试组';
            const group = new TabGroup(name);
            
            expect(group.name).toBe(name);
            expect(group.tabs).toEqual([]);
            expect(group.id).toBeDefined();
            expect(group.createdAt).toBeDefined();
        });

        test('创建带有标签的标签组', () => {
            const tabs = [
                new TabItem({ id: 1, url: 'https://example.com', title: '示例' })
            ];
            const group = new TabGroup('测试组', tabs);
            expect(group.tabs).toEqual(tabs);
        });
    });

    describe('TabItem', () => {
        test('从 Chrome 标签创建标签项', () => {
            const chromeTab = {
                id: 123,
                url: 'https://example.com',
                title: '示例页面',
                favIconUrl: 'https://example.com/favicon.ico'
            };
            
            const tab = new TabItem(chromeTab);
            
            expect(tab.id).toBe('123');
            expect(tab.url).toBe(chromeTab.url);
            expect(tab.title).toBe(chromeTab.title);
            expect(tab.favIconUrl).toBe(chromeTab.favIconUrl);
            expect(tab.createdAt).toBeDefined();
        });
    });
});

describe('状态管理测试', () => {
    beforeEach(() => {
        // 重置状态和模拟函数
        state.groups = [];
        state.searchQuery = '';
        jest.clearAllMocks();
    });

    describe('loadState', () => {
        test('加载空状态', async () => {
            chrome.storage.sync.get.mockImplementation(() => Promise.resolve({}));
            
            await loadState();
            
            expect(state.groups).toEqual([]);
            expect(state.searchQuery).toBe('');
        });

        test('加载有效状态', async () => {
            const mockGroup = {
                id: '123',
                name: '测试组',
                tabs: [{
                    chunkIndex: 0,
                    count: 1
                }],
                createdAt: new Date().toISOString()
            };

            const mockChunk = [{
                id: '1',
                url: 'https://example.com',
                title: '示例',
                favIconUrl: 'favicon.ico',
                createdAt: new Date().toISOString()
            }];

            chrome.storage.sync.get.mockImplementation((key) => {
                if (key === 'tabManagerState') {
                    return Promise.resolve({
                        tabManagerState: {
                            groups: [mockGroup],
                            searchQuery: ''
                        }
                    });
                } else if (key === 'chunkCount') {
                    return Promise.resolve({ chunkCount: 1 });
                } else if (key === 'chunk_0') {
                    return Promise.resolve({ chunk_0: mockChunk });
                }
                return Promise.resolve({});
            });

            await loadState();

            expect(state.groups.length).toBe(1);
            expect(state.groups[0].name).toBe('测试组');
            expect(state.groups[0].tabs.length).toBe(1);
        });

        test('处理损坏的数据', async () => {
            const mockGroup = {
                id: '123',
                name: '测试组',
                tabs: [{
                    chunkIndex: 0,
                    count: 1
                }],
                createdAt: new Date().toISOString()
            };

            chrome.storage.sync.get.mockImplementation((key) => {
                if (key === 'tabManagerState') {
                    return Promise.resolve({
                        tabManagerState: {
                            groups: [mockGroup],
                            searchQuery: ''
                        }
                    });
                } else if (key === 'chunkCount') {
                    return Promise.resolve({ chunkCount: 1 });
                } else if (key === 'chunk_0') {
                    return Promise.resolve({ chunk_0: null }); // 损坏的数据块
                }
                return Promise.resolve({});
            });

            await loadState();

            expect(state.groups.length).toBe(1);
            expect(state.groups[0].tabs.length).toBe(0); // 损坏的数据块应该被忽略
        });
    });

    describe('saveState', () => {
        test('保存空状态', async () => {
            await saveState();
            
            expect(chrome.storage.sync.set).toHaveBeenCalledWith({
                tabManagerState: {
                    groups: [],
                    searchQuery: ''
                }
            });
        });

        test('保存大型数据时进行分片', async () => {
            // 创建一个大型标签组
            const group = new TabGroup('测试组');
            for (let i = 0; i < 10; i++) {
                group.tabs.push(new TabItem({
                    id: i,
                    url: `https://example${i}.com`,
                    title: `示例 ${i}`,
                    favIconUrl: 'favicon.ico'
                }));
            }
            state.groups.push(group);

            await saveState();

            // 验证是否调用了多次 set
            expect(chrome.storage.sync.set).toHaveBeenCalled();
            const calls = chrome.storage.sync.set.mock.calls;
            expect(calls.length).toBeGreaterThan(1); // 应该有多次调用
        });
    });
});

describe('工具函数测试', () => {
    describe('filterGroups', () => {
        beforeEach(() => {
            state.groups = [
                new TabGroup('组1', [
                    new TabItem({
                        id: 1,
                        url: 'https://example1.com',
                        title: '示例1'
                    }),
                    new TabItem({
                        id: 2,
                        url: 'https://example2.com',
                        title: '测试2'
                    })
                ])
            ];
        });

        test('空搜索时返回所有分组', () => {
            state.searchQuery = '';
            const filtered = filterGroups();
            expect(filtered).toEqual(state.groups);
        });

        test('按标题搜索', () => {
            state.searchQuery = '测试';
            const filtered = filterGroups();
            expect(filtered[0].tabs.length).toBe(1);
            expect(filtered[0].tabs[0].title).toContain('测试');
        });

        test('按 URL 搜索', () => {
            state.searchQuery = 'example1';
            const filtered = filterGroups();
            expect(filtered[0].tabs.length).toBe(1);
            expect(filtered[0].tabs[0].url).toContain('example1');
        });
    });

    describe('groupByTime', () => {
        test('正确分类时间组', () => {
            const now = new Date();
            const yesterday = new Date(now - 24 * 60 * 60 * 1000);
            const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
            
            const groups = [
                { ...new TabGroup('今天'), createdAt: now.toISOString() },
                { ...new TabGroup('昨天'), createdAt: yesterday.toISOString() },
                { ...new TabGroup('上周'), createdAt: lastWeek.toISOString() }
            ];

            const timeGroups = groupByTime(groups);
            
            expect(timeGroups['今天']).toBeDefined();
            expect(timeGroups['昨天']).toBeDefined();
            expect(timeGroups['本周']).toBeDefined();
            expect(timeGroups['今天'].length).toBe(1);
            expect(timeGroups['昨天'].length).toBe(1);
        });
    });
}); 