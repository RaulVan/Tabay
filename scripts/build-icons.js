/**
 * 从 SVG 生成 manifest 所需的 PNG 图标与 default-favicon.png
 * 依赖 sharp；若未安装则跳过（需先 npm install）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharpPath = path.join(root, 'node_modules', 'sharp');

if (!fs.existsSync(sharpPath)) {
    console.warn('sharp 未安装，跳过 PNG 生成。请执行: npm install');
    process.exit(0);
}

const sharp = require('sharp');

async function main() {
    const iconSvg = path.join(root, 'icons', 'icon.svg');
    const faviconSvg = path.join(root, 'default-favicon.svg');
    const iconsDir = path.join(root, 'icons');

    if (!fs.existsSync(iconSvg)) {
        console.error('缺少 icons/icon.svg');
        process.exit(1);
    }

    for (const size of [16, 48, 128]) {
        const out = path.join(iconsDir, `icon${size}.png`);
        await sharp(iconSvg).resize(size, size).png().toFile(out);
        console.log('写入', out);
    }

    if (fs.existsSync(faviconSvg)) {
        const out = path.join(root, 'default-favicon.png');
        await sharp(faviconSvg).resize(32, 32).png().toFile(out);
        console.log('写入', out);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
