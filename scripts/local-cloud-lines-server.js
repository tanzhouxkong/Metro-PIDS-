// 本地云控预设线路测试服务器（API 模式）
// ---------------------------------------------
// 用途：配合 CLOUD_LINES_USAGE.md 中的 api 模式，在本机模拟云端线路增删改查。
//
// 启动方式（项目根目录）：
//   node scripts/local-cloud-lines-server.js
//   或：npm run serve:cloud
//
// 然后在代码中这样配置：
//   cloudLines.setCloudConfig('api', {
//     apiBase: 'http://localhost:9000',
//     token: '' // 本地测试可留空
//   });
//
// 支持的接口（与文档保持一致）：
//   GET    /preset                -> 返回 { lines: [...] }
//   GET    /preset/:lineName      -> 返回单条线路
//   POST   /preset                -> 创建线路
//   PUT    /preset/:lineName      -> 更新线路
//   DELETE /preset/:lineName      -> 删除线路

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.CLOUD_LINES_PORT || '9000', 10);
const DATA_FILE = path.resolve(
  process.env.CLOUD_LINES_DB || path.join(__dirname, 'cloud-lines-data.json')
);
// 默认从项目根目录下的 preset-lines 目录尝试导入初始线路
const PRESET_DIR = path.resolve(__dirname, '..', 'preset-lines');

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

function loadInitialFromPresetDir() {
  try {
    if (!fs.existsSync(PRESET_DIR)) return [];
    const files = fs
      .readdirSync(PRESET_DIR)
      .filter((f) => f.toLowerCase().endsWith('.json'));
    const lines = [];
    for (const file of files) {
      const fullPath = path.join(PRESET_DIR, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const json = JSON.parse(raw);
        if (json && json.meta && json.meta.lineName) {
          lines.push(json);
        } else {
          console.warn(
            `[local-cloud-lines] 略过 ${file}：缺少 meta.lineName`
          );
        }
      } catch (e) {
        console.warn(
          `[local-cloud-lines] 解析預設文件失敗 ${file}:`,
          e.message
        );
      }
    }
    if (lines.length > 0) {
      console.log(
        `[local-cloud-lines] 從 preset-lines 導入 ${lines.length} 條預設線路。`
      );
      // 首次导入时写入数据文件，后续直接从 DATA_FILE 读取
      writeDb(lines);
    }
    return lines;
  } catch (e) {
    console.warn('[local-cloud-lines] 掃描預設線路目錄失敗:', e);
    return [];
  }
}

function readDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // 数据文件不存在时，尝试从 preset-lines 目录导入一份初始数据
      return loadInitialFromPresetDir();
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!raw.trim()) {
      // 空文件，同样尝试导入
      return loadInitialFromPresetDir();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      // 没有数据时尝试导入一次
      return loadInitialFromPresetDir();
    }
    return parsed;
  } catch (e) {
    console.warn('[local-cloud-lines] 读取数据文件失败:', e);
    return [];
  }
}

function writeDb(lines) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(lines, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[local-cloud-lines] 导入文件到本地失败:', e);
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // 防止過大
      if (data.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        const json = JSON.parse(data);
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function normalizeName(name) {
  try {
    return decodeURIComponent(name || '').trim();
  } catch {
    return (name || '').trim();
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const method = req.method || 'GET';

  // CORS（便于在浏览器工具中直接调试）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // /preset 与 /preset/:lineName 路由
  if (url === '/preset' && method === 'GET') {
    const lines = readDb();
    return sendJson(res, 200, { ok: true, lines });
  }

  if (url === '/preset' && method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body || !body.meta || !body.meta.lineName) {
        return sendError(res, 400, '缺少 meta.lineName');
      }
      const lineName = String(body.meta.lineName);
      const lines = readDb();
      const idx = lines.findIndex(
        (l) => l.meta && l.meta.lineName === lineName
      );
      if (idx >= 0) {
        return sendError(res, 409, '该预设线路已存在，请使用 PUT 更新');
      }
      lines.push(body);
      writeDb(lines);
      return sendJson(res, 201, { ok: true, line: body });
    } catch (e) {
      return sendError(res, 400, 'JSON 解析失败: ' + e.message);
    }
  }

  if (url.startsWith('/preset/')) {
    const namePart = url.slice('/preset/'.length);
    const lineName = normalizeName(namePart);
    const lines = readDb();
    const idx = lines.findIndex(
      (l) => l.meta && l.meta.lineName === lineName
    );

    if (method === 'GET') {
      if (idx === -1) return sendError(res, 404, '预设线路不存在');
      return sendJson(res, 200, { ok: true, line: lines[idx] });
    }

    if (method === 'PUT') {
      try {
        const body = await parseBody(req);
        if (!body || !body.meta || !body.meta.lineName) {
          return sendError(res, 400, '缺少 meta.lineName');
        }
        if (body.meta.lineName !== lineName) {
          return sendError(res, 400, 'URL 与 body 中的 lineName 不一致');
        }
        if (idx === -1) {
          lines.push(body);
        } else {
          lines[idx] = body;
        }
        writeDb(lines);
        return sendJson(res, 200, { ok: true, line: body });
      } catch (e) {
        return sendError(res, 400, 'JSON 解析失败: ' + e.message);
      }
    }

    if (method === 'DELETE') {
      if (idx === -1) return sendError(res, 404, '预设线路不存在');
      lines.splice(idx, 1);
      writeDb(lines);
      return sendJson(res, 200, { ok: true });
    }
  }

  // 其他路由：提示信息
  if (url === '/' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      message: 'Metro-PIDS 本地云控预设线路 API 已启动',
      endpoints: [
        'GET    /preset',
        'GET    /preset/:lineName',
        'POST   /preset',
        'PUT    /preset/:lineName',
        'DELETE /preset/:lineName'
      ],
      dataFile: DATA_FILE
    });
  }

  sendError(res, 404, 'Not Found');
});

server.listen(PORT, () => {
  console.log(
    `[local-cloud-lines] 本地云控预设线路 API 已启动，端口: ${PORT}`
  );
  console.log(
    `[local-cloud-lines] 数据文件: ${DATA_FILE}`
  );
  console.log(
    `[local-cloud-lines] 在应用中配置: cloudLines.setCloudConfig('api', { apiBase: 'http://localhost:${PORT}' })`
  );
});


