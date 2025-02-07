// 模拟 Chrome API
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

// 模拟 window.location
global.location = {
    href: 'chrome-extension://extension-id/popup.html'
};

// 模拟 localStorage
global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

// 模拟 console 方法
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}; 