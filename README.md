# Tabay - Chrome 标签管理器

Tabay 是一个强大的 Chrome 标签页管理工具，帮助你更好地组织和管理浏览器标签。

## 功能特点

### 标签组管理
- 一键保存当前标签页到新分组
- 一键保存所有标签页到新分组
- 自定义标签组名称
- 支持编辑标签组名称
- 按时间自动分类标签组（今天、昨天、本周、本月、更早）
- 删除标签组功能

### 标签操作
- 拖拽标签在不同组之间移动
- 一键打开单个标签
- 一键打开组内所有标签
- 删除单个标签
- 显示标签页图标（favicon）
- 显示标签页标题和 URL

### 搜索和过滤
- 实时搜索标签页（支持标题和 URL 搜索）
- 自动过滤空标签组

### 数据同步
- 自动同步到 Chrome 账号
- 支持导出数据备份
- 支持导入数据恢复
- 显示同步状态和进度
- 支持清除云端数据

### 用户界面
- 简洁现代的界面设计
- 标签组展开/折叠功能
- 标签拖拽时的视觉反馈
- 操作成功/失败提示
- 加载状态指示
- 进度条显示（批量操作时）

### 数据管理
- 分块存储大型数据
- 自动备份机制
- 数据有效性检查
- 损坏数据自动修复

## 技术特点

- 使用 Chrome Extension Manifest V3
- 模块化代码结构
- 完整的错误处理机制
- 优化的数据存储方案
- 自动化测试支持
- 持续集成支持

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

### v1.0.12
- 添加标签拖拽功能
- 优化标签组编辑功能
- 改进数据同步机制
- 添加加载状态提示
- 优化用户界面交互

### v1.0.11
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