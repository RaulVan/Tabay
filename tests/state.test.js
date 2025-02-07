// 模拟 chrome.storage.sync API
global.chrome = {
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn()
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

describe('TabGroup', () => {
    test('创建新的标签组', () => {
        const name = '测试组';
        const group = new TabGroup(name);
        
        expect(group.name).toBe(name);
        expect(group.tabs).toEqual([]);
        expect(group.id).toBeDefined();
        expect(group.createdAt).toBeDefined();
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

describe('State Management', () => {
    beforeEach(() => {
        // 重置状态
        state.groups = [];
        state.searchQuery = '';
    });

    test('加载状态', async () => {
        const mockState = {
            groups: [new TabGroup('测试组')],
            searchQuery: '测试'
        };
        
        chrome.storage.sync.get.mockImplementation((key, callback) => {
            return Promise.resolve({ tabManagerState: mockState });
        });
        
        await loadState();
        
        expect(state.groups).toEqual(mockState.groups);
        expect(state.searchQuery).toBe(mockState.searchQuery);
    });

    test('保存状态', async () => {
        const group = new TabGroup('测试组');
        state.groups.push(group);
        state.searchQuery = '测试';
        
        await saveState();
        
        expect(chrome.storage.sync.set).toHaveBeenCalledWith({
            tabManagerState: state
        });
    });
});

describe('Utility Functions', () => {
    describe('formatDate', () => {
        test('格式化最近时间', () => {
            const now = new Date();
            const date = new Date(now - 30 * 60 * 1000); // 30分钟前
            
            expect(formatDate(date.toISOString())).toBe('30 分钟前');
        });

        test('格式化较早时间', () => {
            const now = new Date();
            const date = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2天前
            
            expect(formatDate(date.toISOString())).toBe('2 天前');
        });
    });

    describe('filterGroups', () => {
        beforeEach(() => {
            state.groups = [
                new TabGroup('组1', [
                    new TabItem({ id: 1, url: 'https://example1.com', title: '示例1' }),
                    new TabItem({ id: 2, url: 'https://example2.com', title: '测试2' })
                ]),
                new TabGroup('组2', [
                    new TabItem({ id: 3, url: 'https://example3.com', title: '示例3' })
                ])
            ];
        });

        test('无搜索词时返回所有分组', () => {
            state.searchQuery = '';
            const filtered = filterGroups();
            expect(filtered).toEqual(state.groups);
        });

        test('按标题搜索', () => {
            state.searchQuery = '测试';
            const filtered = filterGroups();
            expect(filtered.length).toBe(1);
            expect(filtered[0].tabs.length).toBe(1);
            expect(filtered[0].tabs[0].title).toContain('测试');
        });
    });

    describe('groupByTime', () => {
        test('按时间分组', () => {
            const now = new Date();
            const groups = [
                Object.assign(new TabGroup('今天'), { createdAt: now.toISOString() }),
                Object.assign(new TabGroup('昨天'), { 
                    createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() 
                }),
                Object.assign(new TabGroup('上周'), { 
                    createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString() 
                })
            ];

            const timeGroups = groupByTime(groups);
            
            expect(timeGroups['今天']).toBeDefined();
            expect(timeGroups['昨天']).toBeDefined();
            expect(timeGroups['本月']).toBeDefined();
            expect(timeGroups['今天'].length).toBe(1);
            expect(timeGroups['昨天'].length).toBe(1);
        });
    });
}); 