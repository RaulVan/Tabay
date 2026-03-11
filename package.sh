#!/bin/bash

echo "创建临时目录..."
rm -rf dist
mkdir dist

echo "更新版本号..."
node update_version.js

echo "生成 PNG 图标..."
npm run build:icons

echo "复制文件..."
cp manifest.json dist/
cp popup.html dist/
cp fullpage.html dist/
cp popup.js dist/
cp fullpage.js dist/
cp state.js dist/
cp styles.css dist/
cp background.js dist/
cp -r icons dist/
cp default-favicon.png dist/ 2>/dev/null || cp default-favicon.svg dist/default-favicon.png 2>/dev/null || true

echo "创建 zip 文件..."
cd dist
zip -r ../tabay.zip *
cd ..

echo "清理临时文件..."
rm -rf dist

echo "打包完成！"
echo "插件文件已保存为：tabay.zip"
