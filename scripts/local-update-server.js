// 简单本地静态服务器，用于测试 electron-updater 本地更新源
// 使用方法：
//   1) 先执行打包生成更新文件（包含 latest.yml 和安装包），例如：npm run build
//   2) 在项目根目录运行：
//        node scripts/local-update-server.js
//      或在 package.json 中配合 npm script 使用（见 package.json 修改）
//   3) 启动 Metro-PIDS 前设置环境变量：
//        Windows PowerShell:  $env:LOCAL_UPDATE_URL="http://localhost:8080/"
//        CMD:                 set LOCAL_UPDATE_URL=http://localhost:8080/
//        macOS/Linux:         export LOCAL_UPDATE_URL="http://localhost:8080/"
//      然后正常启动应用（npm start / 已安装版本）
//
// 默认会以项目根目录下的 dist 目录为根目录托管静态文件，
// 你也可以通过环境变量 LOCAL_UPDATE_DIR 指定目录。

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.LOCAL_UPDATE_PORT || '8080', 10);
const ROOT_DIR = path.resolve(
  process.env.LOCAL_UPDATE_DIR || path.join(__dirname, '..', 'dist')
);

function send404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Not Found');
}

function send500(res, err) {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('500 Internal Server Error\n' + (err && err.message));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.yml':
    case '.yaml':
      return 'text/yaml; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.exe':
      return 'application/octet-stream';
    case '.zip':
      return 'application/zip';
    case '.dmg':
    case '.appimage':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

const server = http.createServer((req, res) => {
  try {
    // 防止路径穿越
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let safePath = urlPath.replace(/^\/+/, '');
    if (!safePath) {
      // 默认返回目录列表提示
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(
        `Metro-PIDS 本地更新服务器已启动\n根目录: ${ROOT_DIR}\n` +
          `示例 LOCAL_UPDATE_URL: http://localhost:${PORT}/\n\n` +
          `请确保 latest.yml 和安装包文件位于该目录下。`
      );
      return;
    }

    const filePath = path.join(ROOT_DIR, safePath);
    if (!filePath.startsWith(ROOT_DIR)) {
      return send404(res);
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        return send404(res);
      }

      const stream = fs.createReadStream(filePath);
      stream.on('error', (e) => send500(res, e));

      res.statusCode = 200;
      res.setHeader('Content-Type', getContentType(filePath));
      stream.pipe(res);
    });
  } catch (e) {
    send500(res, e);
  }
});

server.listen(PORT, () => {
  console.log(
    `[local-update-server] 已启动，本地静态目录: ${ROOT_DIR}, 端口: ${PORT}`
  );
  console.log(
    `[local-update-server] 请设置 LOCAL_UPDATE_URL="http://localhost:${PORT}/" 后再启动 Metro-PIDS 测试更新。`
  );
});


