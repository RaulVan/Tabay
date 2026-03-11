// 统一 Chrome API mock，供所有测试使用（勿在单测文件内再次覆盖 global.chrome）
global.chrome = {
    tabs: {
        query: jest.fn(),
        create: jest.fn(),
        remove: jest.fn()
    },
    windows: {
        getCurrent: jest.fn(() => Promise.resolve({ id: 1 }))
    },
    runtime: {
        getManifest: jest.fn(() => ({ version: '1.0.0' })),
        sendMessage: jest.fn()
    },
    contextMenus: {
        create: jest.fn(),
        onClicked: { addListener: jest.fn() }
    },
    notifications: {
        create: jest.fn()
    },
    storage: {
        sync: {
            get: jest.fn(),
            set: jest.fn(),
            remove: jest.fn(() => Promise.resolve()),
            clear: jest.fn(() => Promise.resolve()),
            getBytesInUse: jest.fn(() => Promise.resolve(0)),
            QUOTA_BYTES: 102400,
            QUOTA_BYTES_PER_ITEM: 8192
        }
    }
};

global.location = {
    href: 'chrome-extension://extension-id/popup.html'
};

global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};
