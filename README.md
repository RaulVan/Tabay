# Tabay - Chrome 标签管理器

Tabay 是一个强大的 Chrome 标签页管理工具，帮助你更好地组织和管理浏览器标签。

## 功能特点

- 一键保存所有标签页到新分组
- 按时间查看保存的标签页
- 快速搜索已保存的标签页
- 数据自动同步到 Chrome 账号
- 支持导出/导入数据备份
- 美观的用户界面

## 开发环境

- Node.js >= 14
- Chrome >= 88

## 安装依赖

```bash
npm install
```

## 开发命令

```bash
# 运行测试
npm test

# 运行测试（监视模式）
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage

# 更新版本号
node update_version.js

# 打包插件
./package.sh
```

## 安装插件

1. 打开 Chrome 浏览器，进入扩展程序页面 (chrome://extensions/)
2. 开启右上角的"开发者模式"
3. 将 `tabay.zip` 文件拖放到浏览器窗口中，或者点击"加载已解压的扩展程序"并选择解压后的文件夹

## 目录结构

```
├── manifest.json        # 插件配置文件
├── popup.html          # 弹出窗口 HTML
├── popup.js           # 弹出窗口脚本
├── fullpage.html      # 全屏页面 HTML
├── fullpage.js       # 全屏页面脚本
├── state.js          # 状态管理
├── background.js     # 后台脚本
├── styles.css        # 样式文件
├── icons/            # 图标文件
├── tests/            # 测试文件
└── package.json      # 项目配置文件
```

## 更新记录

### v1.0.1
- 优化数据存储方式，解决存储限制问题
- 改进用户界面交互
- 添加数据同步状态显示

### v1.0.0
- 初始版本发布
- 实现基本的标签管理功能

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m '添加一些特性'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

MIT License 