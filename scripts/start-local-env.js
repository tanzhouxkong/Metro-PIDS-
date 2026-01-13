/**
 * Metro-PIDS 本地一键运行脚本（跨平台：Windows / macOS / Linux）
 *
 * 功能：
 *  1. 检查并安装依赖（npm install）
 *  2. 如果没有 dist/latest.yml，自动执行 npm run build
 *  3. 启动本地更新服务器（npm run serve:update）
 *  4. 启动本地云控 API（npm run serve:cloud）
 *  5. 设置 LOCAL_UPDATE_URL 后启动应用（npm start）
 *
 * 使用方式（项目根目录）：
 *   npm run start:local-env
 * 或：
 *   node scripts/start-local-env.js
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const UPDATE_PORT = process.env.LOCAL_UPDATE_PORT || '8080';
const LOCAL_UPDATE_URL = `http://localhost:${UPDATE_PORT}/`;

function log(msg) {
  // 统一前缀，方便在终端中识别
  console.log(`[start-local-env] ${msg}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`执行命令: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true, // 兼容 Windows / *nix
      ...options
    });

    child.on('error', (err) => {
      log(`命令启动失败: ${err.message}`);
      reject(err);
    });

    child.on('exit', (code) => {
      if (code === 0 || options.ignoreExitCode) {
        resolve();
      } else {
        reject(new Error(`${command} 退出代码: ${code}`));
      }
    });
  });
}

function startBackground(command, args, name) {
  log(`后台启动 ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true,
    detached: false
  });
  child.on('error', (err) => {
    log(`${name} 启动失败: ${err.message}`);
  });
  return child;
}

async function ensureNodeModules() {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    log('检测到 node_modules，跳过 npm install。');
    return;
  }
  log('未检测到 node_modules，开始执行 npm install...');
  await runCommand('npm', ['install']);
}

async function ensureBuild() {
  const latestYml = path.join(DIST_DIR, 'latest.yml');
  if (fs.existsSync(latestYml)) {
    log('检测到 dist/latest.yml，跳过 npm run build。');
    return;
  }
  log('未检测到 dist/latest.yml，开始执行 npm run build...');
  await runCommand('npm', ['run', 'build']);
}

async function main() {
  try {
    log(`项目根目录: ${ROOT_DIR}`);
    log(`打包输出目录: ${DIST_DIR}`);

    await ensureNodeModules();
    await ensureBuild();

    // 启动本地更新服务器
    startBackground('npm', ['run', 'serve:update'], '本地更新服务器 (serve:update)');

    // 启动本地云控服务器
    startBackground('npm', ['run', 'serve:cloud'], '本地云控服务器 (serve:cloud)');

    // 等待几秒钟，给两个服务一点启动时间
    await new Promise((r) => setTimeout(r, 3000));

    log(`使用 LOCAL_UPDATE_URL=${LOCAL_UPDATE_URL} 启动 Metro-PIDS...`);
    const env = {
      ...process.env,
      LOCAL_UPDATE_URL
    };

    await runCommand('npm', ['start'], { env, ignoreExitCode: true });

    log('应用已退出。如需停止本地服务，请在终端中手动结束 serve:update / serve:cloud。');
  } catch (err) {
    log(`一键运行失败: ${err.message}`);
    process.exitCode = 1;
  }
}

main();


