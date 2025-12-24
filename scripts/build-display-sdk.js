const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../src/utils/displaySdk.js');
const outDir = path.resolve(__dirname, '../dist');
const outFile = path.join(outDir, 'display-sdk.umd.js');

if (!fs.existsSync(src)) {
  console.error('source file not found:', src);
  process.exit(1);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const srcContent = fs.readFileSync(src, 'utf8');

// 简易 UMD 包装：将 createDisplaySdk 暴露为 window.MetroPidsDisplaySdk.createDisplaySdk
const umd = `(function(global){\n${srcContent}\n\n// 将工厂方法暴露到全局\nif (typeof global !== 'undefined') {\n  global.MetroPidsDisplaySdk = global.MetroPidsDisplaySdk || {} ;\n  global.MetroPidsDisplaySdk.createDisplaySdk = createDisplaySdk;\n}\n})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));\n`;

fs.writeFileSync(outFile, umd, 'utf8');
console.log('UMD bundle written to', outFile);
