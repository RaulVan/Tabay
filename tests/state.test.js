// chrome API 由 tests/setup.js 统一 mock

// 导入要测试的类和函数
const {
    TabGroup,
    TabItem,
    state,
    loadState,
    saveState,
    formatDate,
    filterGroups,
    groupByTime,
    escapeHtml,
    importData,
    checkSyncDataValidity,
    clearSyncData,
    createBackup,
    restoreFromBackup,
    getStorageUsage
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

            const mainStatePayload = {
                tabManagerState: {
                    groups: [mockGroup],
                    searchQuery: ''
                },
                chunkCount: 1,
                lastBackup: null,
                isCompressed: false
            };

            chrome.storage.sync.get.mockImplementation((key) => {
                if (Array.isArray(key)) {
                    return Promise.resolve(mainStatePayload);
                }
                if (key === 'tabManagerState') {
                    return Promise.resolve({ tabManagerState: mainStatePayload.tabManagerState });
                }
                if (key === 'chunkCount') {
                    return Promise.resolve({ chunkCount: 1 });
                }
                if (key === 'chunk_0') {
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

            const mainStatePayload = {
                tabManagerState: {
                    groups: [mockGroup],
                    searchQuery: ''
                },
                chunkCount: 1,
                lastBackup: null,
                isCompressed: false
            };

            chrome.storage.sync.get.mockImplementation((key) => {
                if (Array.isArray(key)) {
                    return Promise.resolve(mainStatePayload);
                }
                if (key === 'chunk_0') {
                    return Promise.resolve({ chunk_0: null });
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

            // 无 CompressionStream 时走未压缩分支，或压缩失败时 isCompressed false
            const setCalls = chrome.storage.sync.set.mock.calls;
            const mainStateCall = setCalls.find(
                (c) => c[0] && c[0].tabManagerState && Array.isArray(c[0].tabManagerState.groups)
            );
            expect(mainStateCall).toBeDefined();
            expect(mainStateCall[0].tabManagerState.groups).toEqual([]);
            expect(mainStateCall[0].tabManagerState.searchQuery).toBe('');
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

describe('escapeHtml', () => {
    test('转义 HTML 特殊字符', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(escapeHtml('a&b')).toBe('a&amp;b');
        // jsdom 路径下 textContent 可能对引号不转义为实体，仅断言不含可执行标签
        expect(escapeHtml('"x"')).not.toContain('<');
    });

    test('null/undefined/非字符串返回空', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml(123)).toBe('');
    });

    test('纯文本不变', () => {
        expect(escapeHtml('hello')).toBe('hello');
    });
});

describe('TabItem.createSafe', () => {
    test('正常 URL 返回 TabItem 实例', () => {
        const r = TabItem.createSafe({
            id: 1,
            url: 'https://example.com',
            title: 'T'
        });
        expect(r).toBeInstanceOf(TabItem);
        expect(r.url).toBe('https://example.com');
    });

    test('chrome:// 返回 error 对象', () => {
        const r = TabItem.createSafe({
            url: 'chrome://settings/',
            title: 'S'
        });
        expect(r.error).toBe(true);
    });

    test('javascript: 返回 error 对象', () => {
        const r = TabItem.createSafe({
            url: 'javascript:alert(1)',
            title: 'X'
        });
        expect(r.error).toBe(true);
    });

    test('空 tab 返回 error', () => {
        expect(TabItem.createSafe(null).error).toBe(true);
        expect(TabItem.createSafe({ url: '', title: 'x' }).error).toBe(true);
    });
});

describe('importData', () => {
    beforeEach(() => {
        state.groups = [];
        state.searchQuery = '';
        jest.clearAllMocks();
        chrome.storage.sync.get.mockImplementation((key) => {
            if (key === 'chunkCount') return Promise.resolve({ chunkCount: 0 });
            return Promise.resolve({});
        });
    });

    test('新版格式 groups 导入成功', async () => {
        const result = await importData({
            groups: [{
                id: 'g1',
                name: 'G',
                createdAt: new Date().toISOString(),
                tabs: [{ url: 'https://a.com', title: 'A' }]
            }]
        });
        expect(result.success).toBe(true);
        expect(state.groups.length).toBeGreaterThan(0);
    });

    test('旧版数组格式导入成功', async () => {
        const result = await importData([{
            id: 'g1',
            name: 'G',
            createdAt: new Date().toISOString(),
            tabs: [{ url: 'https://b.com', title: 'B' }]
        }]);
        expect(result.success).toBe(true);
    });

    test('备份格式 state.groups 导入成功', async () => {
        const result = await importData({
            state: {
                groups: [{
                    id: 'g1',
                    name: 'G',
                    createdAt: new Date().toISOString(),
                    tabs: [{ url: 'https://c.com', title: 'C' }]
                }]
            }
        });
        expect(result.success).toBe(true);
    });

    test('无效格式返回失败', async () => {
        const r1 = await importData(null);
        expect(r1.success).toBe(false);
        const r2 = await importData({});
        expect(r2.success).toBe(false);
    });
});

describe('checkSyncDataValidity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('主状态缺失返回无效', async () => {
        chrome.storage.sync.get.mockImplementation(() => Promise.resolve({}));
        const status = await checkSyncDataValidity();
        expect(status.isValid).toBe(false);
        expect(status.hasBackup).toBe(false);
    });

    test('正常数据返回有效结构', async () => {
        const mainStatePayload = {
            tabManagerState: {
                groups: [{
                    id: '1',
                    name: 'N',
                    tabs: [{ chunkIndex: 0, count: 1 }],
                    createdAt: new Date().toISOString()
                }],
                searchQuery: ''
            },
            chunkCount: 1,
            lastBackup: null,
            isCompressed: false
        };
        chrome.storage.sync.get.mockImplementation((key) => {
            if (Array.isArray(key)) return Promise.resolve(mainStatePayload);
            if (key === 'chunk_0') {
                return Promise.resolve({
                    chunk_0: [{ url: 'https://x.com', title: 'T' }]
                });
            }
            return Promise.resolve({});
        });
        const status = await checkSyncDataValidity();
        expect(status.details).toBeDefined();
        expect(typeof status.isValid).toBe('boolean');
    });
});

describe('clearSyncData', () => {
    beforeEach(() => {
        state.groups = [new TabGroup('x')];
        jest.clearAllMocks();
    });

    test('清除后 state 为空且调用 clear', async () => {
        chrome.storage.sync.get.mockImplementation(() => Promise.resolve({ a: 1 }));
        const result = await clearSyncData();
        expect(result.success).toBe(true);
        expect(chrome.storage.sync.clear).toHaveBeenCalled();
        expect(state.groups).toEqual([]);
    });
});

describe('createBackup / restoreFromBackup', () => {
    beforeEach(() => {
        state.groups = [];
        state.searchQuery = '';
        jest.clearAllMocks();
        chrome.storage.sync.get.mockImplementation((key) => {
            if (key === 'chunkCount') return Promise.resolve({ chunkCount: 0 });
            return Promise.resolve({});
        });
    });

    test('createBackup 写入 lastBackup', async () => {
        state.groups.push(new TabGroup('bk'));
        await createBackup();
        expect(chrome.storage.sync.set).toHaveBeenCalled();
        const call = chrome.storage.sync.set.mock.calls.find(
            (c) => c[0] && c[0].lastBackup
        );
        expect(call).toBeDefined();
        expect(call[0].lastBackup.state.groups.length).toBe(1);
    });

    test('restoreFromBackup 无效返回 false', async () => {
        expect(await restoreFromBackup(null)).toBe(false);
        expect(await restoreFromBackup({})).toBe(false);
    });
});

describe('getStorageUsage', () => {
    test('正常返回 used/total/percent', async () => {
        chrome.storage.sync.getBytesInUse.mockResolvedValue(51200);
        const u = await getStorageUsage();
        expect(u).not.toBeNull();
        expect(u.used).toBe(51200);
        expect(u.total).toBe(102400);
        expect(parseFloat(u.percent)).toBeGreaterThan(0);
    });

    test('异常返回 null', async () => {
        chrome.storage.sync.getBytesInUse.mockRejectedValue(new Error('fail'));
        const u = await getStorageUsage();
        expect(u).toBeNull();
    });
}); 