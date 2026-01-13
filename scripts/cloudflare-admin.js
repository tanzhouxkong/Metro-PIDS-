// Cloudflare 运控管理小工具（带 Token 的写操作）
// ---------------------------------------------
// 通过命令行安全地对 Cloudflare Worker 上的预设线路做增删改查。
//
// 使用前准备：
//   1) 确保 Cloudflare Worker 已部署，并实现了：
//        GET    /preset
//        GET    /preset/:lineName
//        POST   /preset
//        PUT    /preset/:lineName
//        DELETE /preset/:lineName
//   2) 在 Worker 的 wrangler.toml 中设置 CLOUD_TOKEN（可选但推荐）
//   3) 在本机设置环境变量（PowerShell 示例）：
//        $env:CF_LINES_API_BASE="https://your-worker-subdomain.workers.dev"
//        $env:CF_LINES_TOKEN="与你在 CLOUD_TOKEN 中设置的一致"
//
// 命令示例（在项目根目录）：
//   node scripts/cloudflare-admin.js list
//   node scripts/cloudflare-admin.js show "上海地铁2号线"
//   node scripts/cloudflare-admin.js delete "上海地铁2号线"
//   node scripts/cloudflare-admin.js upload "上海地铁2号线" preset-lines/上海地铁2号线.json
//
// 注意：脚本不会在源码里写死 Token，只从环境变量读取，安全性更高。

const fs = require('fs');
const path = require('path');

const API_BASE =
  process.env.CF_LINES_API_BASE ||
  'https://your-worker-subdomain.workers.dev';
const TOKEN = process.env.CF_LINES_TOKEN || '';

function log(...args) {
  console.log('[cf-admin]', ...args);
}

function usage() {
  console.log(`
用法：
  node scripts/cloudflare-admin.js list
  node scripts/cloudflare-admin.js show <lineName>
  node scripts/cloudflare-admin.js delete <lineName>
  node scripts/cloudflare-admin.js upload <lineName> <filePath>

环境变量：
  CF_LINES_API_BASE  Cloudflare Worker 基础地址，例如：https://metro-pids-cloud.xxx.workers.dev
  CF_LINES_TOKEN     写操作使用的 Token（需要与 Worker 中的 CLOUD_TOKEN 一致）
`);
}

async function callApi(method, pathName, body) {
  const url = `${API_BASE.replace(/\/+$/, '')}${pathName}`;
  const headers = {
    'Accept': 'application/json'
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let jsonText = '';
  try {
    jsonText = await res.text();
  } catch {
    jsonText = '';
  }
  let data = null;
  try {
    data = jsonText ? JSON.parse(jsonText) : null;
  } catch {
    data = jsonText;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${jsonText}`);
  }
  return data;
}

async function cmdList() {
  log('列出所有预设线路...');
  const data = await callApi('GET', '/preset');
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  log(`共 ${lines.length} 条线路：`);
  for (const line of lines) {
    const name = line?.meta?.lineName || '(无名称)';
    console.log(' -', name);
  }
}

async function cmdShow(lineName) {
  if (!lineName) throw new Error('缺少 lineName');
  log(`获取线路详情: "${lineName}" ...`);
  const data = await callApi(
    'GET',
    '/preset/' + encodeURIComponent(lineName)
  );
  console.log(JSON.stringify(data, null, 2));
}

async function cmdDelete(lineName) {
  if (!lineName) throw new Error('缺少 lineName');
  log(`删除线路: "${lineName}" ...`);
  const data = await callApi(
    'DELETE',
    '/preset/' + encodeURIComponent(lineName)
  );
  console.log(JSON.stringify(data, null, 2));
}

async function cmdUpload(lineName, filePath) {
  if (!lineName || !filePath) {
    throw new Error('缺少参数，正确用法：upload <lineName> <filePath>');
  }
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`文件不存在：${absPath}`);
  }
  log(`上传/更新线路: "${lineName}"，文件: ${absPath}`);
  const raw = fs.readFileSync(absPath, 'utf-8');
  const json = JSON.parse(raw);
  if (!json?.meta?.lineName) {
    throw new Error('JSON 中缺少 meta.lineName 字段');
  }
  if (json.meta.lineName !== lineName) {
    log(
      `提示：文件中的 meta.lineName = "${json.meta.lineName}" 与传入的 lineName 不一致，将以 URL 中的名称为准。`
    );
    json.meta.lineName = lineName;
  }
  const data = await callApi(
    'PUT',
    '/preset/' + encodeURIComponent(lineName),
    json
  );
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const [, , cmd, arg1, arg2] = process.argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    return;
  }

  if (!API_BASE || API_BASE.includes('your-worker-subdomain')) {
    console.error(
      '请先设置 CF_LINES_API_BASE 环境变量指向你的 Cloudflare Worker 地址。'
    );
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'list':
        await cmdList();
        break;
      case 'show':
        await cmdShow(arg1);
        break;
      case 'delete':
        await cmdDelete(arg1);
        break;
      case 'upload':
        await cmdUpload(arg1, arg2);
        break;
      default:
        console.error('未知命令:', cmd);
        usage();
        process.exit(1);
    }
  } catch (e) {
    console.error('[cf-admin] 操作失败:', e.message);
    process.exit(1);
  }
}

main();


