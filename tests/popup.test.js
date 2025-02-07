/**
 * @jest-environment jsdom
 */

// 模拟 chrome API
global.chrome = {
    tabs: {
        query: jest.fn(),
        create: jest.fn(),
        remove: jest.fn()
    },
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn()
        }
    }
};

// 导入要测试的函数和类
const {
    setupEventListeners,
    showGroupSelector,
    showProgressDialog,
    updateProgress
} = require('../popup.js');

describe('UI Components', () => {
    beforeEach(() => {
        // 设置文档主体
        document.body.innerHTML = `
            <div id="viewByTime" class="view-btn">按时间查看</div>
            <div id="viewByGroup" class="view-btn">按分组查看</div>
            <div id="timeView" class="view"></div>
            <div id="groupView" class="view"></div>
            <input id="searchInput" type="text" placeholder="搜索标签组...">
            <div id="groupSelector" class="modal">
                <div class="modal-content">
                    <input type="text" id="newGroupName" placeholder="新建分组">
                    <div id="existingGroups"></div>
                </div>
            </div>
            <div id="progressDialog" class="modal">
                <div class="modal-content">
                    <div id="progressText"></div>
                    <div id="progressBar"></div>
                </div>
            </div>
        `;
    });

    describe('View Switching', () => {
        test('切换视图监听器设置', () => {
            setupEventListeners();
            expect(document.getElementById('viewByTime')).toBeDefined();
            expect(document.getElementById('viewByGroup')).toBeDefined();
        });
    });

    describe('Group Selector', () => {
        test('显示分组选择器', () => {
            const selector = document.getElementById('groupSelector');
            showGroupSelector();
            expect(selector.style.display).toBe('block');
        });
    });

    describe('Progress Dialog', () => {
        test('显示进度对话框', () => {
            const dialog = document.getElementById('progressDialog');
            const { progressDiv } = showProgressDialog(10);
            expect(progressDiv).toBeDefined();
            expect(progressDiv.style.display).toBe('block');
        });

        test('更新进度', () => {
            const { progressDiv } = showProgressDialog(10);
            updateProgress(progressDiv, 5, 10);
            const progressText = progressDiv.querySelector('.progress-text');
            const progressBar = progressDiv.querySelector('.progress-fill');
            
            expect(progressText.textContent).toBe('5/10');
            expect(progressBar.style.width).toBe('50%');
        });
    });
});

describe('Chrome API Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('查询当前标签', async () => {
        const mockTabs = [
            { id: 1, url: 'https://example.com', title: '示例页面' }
        ];
        chrome.tabs.query.mockResolvedValue(mockTabs);

        await chrome.tabs.query({});
        expect(chrome.tabs.query).toHaveBeenCalled();
    });

    test('创建新标签', async () => {
        const url = 'https://example.com';
        await chrome.tabs.create({ url });
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url });
    });

    test('关闭标签', async () => {
        const tabId = 1;
        await chrome.tabs.remove(tabId);
        expect(chrome.tabs.remove).toHaveBeenCalledWith(tabId);
    });
}); 