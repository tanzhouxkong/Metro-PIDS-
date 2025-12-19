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

// Very small UMD wrapper: expose createDisplaySdk as window.MetroPidsDisplaySdk.createDisplaySdk
const umd = `(function(global){\n${srcContent}\n\n// expose factory to global\nif (typeof global !== 'undefined') {\n  global.MetroPidsDisplaySdk = global.MetroPidsDisplaySdk || {} ;\n  global.MetroPidsDisplaySdk.createDisplaySdk = createDisplaySdk;\n}\n})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));\n`;

fs.writeFileSync(outFile, umd, 'utf8');
console.log('UMD bundle written to', outFile);
