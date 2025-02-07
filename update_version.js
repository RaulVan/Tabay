const fs = require('fs');
const path = require('path');

// 读取 manifest.json
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = require(manifestPath);

// 解析当前版本号
const version = manifest.version.split('.');
const major = parseInt(version[0]);
const minor = parseInt(version[1]);
const patch = parseInt(version[2] || 0);

// 增加补丁版本号
manifest.version = `${major}.${minor}.${patch + 1}`;

// 写回 manifest.json
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`版本已更新到: ${manifest.version}`); 