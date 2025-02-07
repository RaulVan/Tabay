#!/bin/bash

# 创建临时目录
echo "创建临时目录..."
rm -rf dist
mkdir dist

# 复制必要文件
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
cp default-favicon.png dist/

# 更新版本号
echo "更新版本号..."
node update_version.js

# 创建 zip 文件
echo "创建 zip 文件..."
cd dist
zip -r ../tabay.zip *
cd ..

# 清理临时文件
echo "清理临时文件..."
rm -rf dist

echo "打包完成！"
echo "插件文件已保存为：tabay.zip"
echo ""
echo "安装说明："
echo "1. 打开 Chrome 浏览器，进入扩展程序页面 (chrome://extensions/)"
echo "2. 开启右上角的"开发者模式""
echo "3. 将 tabay.zip 文件拖放到浏览器窗口中，或者点击"加载已解压的扩展程序"并选择解压后的文件夹" 