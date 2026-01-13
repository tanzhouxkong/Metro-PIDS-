#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);

// 设置 NODE_OPTIONS 环境变量以使用系统 CA 证书
process.env.NODE_OPTIONS = '--use-system-ca';

// 构建 electron-builder 命令
const electronBuilderPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-builder');
const isWindows = process.platform === 'win32';
const command = isWindows ? 'electron-builder.cmd' : 'electron-builder';

// 默认参数
const defaultArgs = ['--publish=always'];

// 合并参数
const finalArgs = [...defaultArgs, ...args];

console.log(`运行命令: ${command} ${finalArgs.join(' ')}`);
console.log(`NODE_OPTIONS=${process.env.NODE_OPTIONS}`);

// 运行 electron-builder
const child = spawn(command, finalArgs, {
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    NODE_OPTIONS: '--use-system-ca'
  }
});

child.on('error', (error) => {
  console.error('执行错误:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

