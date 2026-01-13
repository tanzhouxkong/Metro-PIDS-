// Metro-PIDS 显示器控制 API 服务器
// 提供 HTTP API 接口用于控制显示器
//
// 启动方式（项目根目录）：
//   node scripts/display-api-server.js
//   或：npm run serve:display-api
//
// 默认端口：9001
// 可以通过环境变量 DISPLAY_API_PORT 修改端口

const http = require('http');
const url = require('url');

// 全局变量，由 main.js 注入
let apiHandlers = {
  getDisplayWindows: null,
  createDisplayWindow: null,
  closeDisplayWindow: null,
  sendBroadcastMessage: null,
  getMainWindow: null,
  getStore: null
};

// 设置API处理器（由main.js调用）
function setApiHandlers(handlers) {
  apiHandlers = { ...apiHandlers, ...handlers };
}

// 解析请求体
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body));
        } else {
          resolve(null);
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 发送JSON响应
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.end(JSON.stringify(data));
}

// 发送错误响应
function sendError(res, status, message) {
  sendJson(res, status, { ok: false, error: message });
}

// 创建HTTP服务器
function createDisplayApiServer() {
  const PORT = parseInt(process.env.DISPLAY_API_PORT || '9001', 10);
  
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';

    // CORS 预检请求
    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.end();
      return;
    }

    try {
      // ============ API 路由 ============
      
      // GET /api/display/status - 获取显示器状态
      if (pathname === '/api/display/status' && method === 'GET') {
        const displayWindows = apiHandlers.getDisplayWindows ? apiHandlers.getDisplayWindows() : new Map();
        const windows = [];
        for (const [id, win] of displayWindows.entries()) {
          if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            windows.push({
              id,
              isOpen: true,
              width: bounds.width,
              height: bounds.height,
              x: bounds.x,
              y: bounds.y
            });
          }
        }
        return sendJson(res, 200, {
          ok: true,
          displays: windows,
          count: windows.length
        });
      }

      // POST /api/display/open - 打开显示器
      if (pathname === '/api/display/open' && method === 'POST') {
        const body = await parseBody(req);
        const displayId = body?.displayId || 'display-1';
        const width = body?.width || undefined;
        const height = body?.height || undefined;

        if (apiHandlers.createDisplayWindow) {
          try {
            apiHandlers.createDisplayWindow(width, height, displayId);
            return sendJson(res, 200, {
              ok: true,
              message: `显示器 ${displayId} 已打开`,
              displayId
            });
          } catch (e) {
            return sendError(res, 500, `打开显示器失败: ${e.message}`);
          }
        } else {
          return sendError(res, 503, '显示器控制功能未初始化');
        }
      }

      // POST /api/display/close - 关闭显示器
      if (pathname === '/api/display/close' && method === 'POST') {
        const body = await parseBody(req);
        const displayId = body?.displayId;

        if (apiHandlers.closeDisplayWindow) {
          try {
            const result = apiHandlers.closeDisplayWindow(displayId);
            return sendJson(res, 200, {
              ok: true,
              message: displayId ? `显示器 ${displayId} 已关闭` : '所有显示器已关闭',
              closed: result
            });
          } catch (e) {
            return sendError(res, 500, `关闭显示器失败: ${e.message}`);
          }
        } else {
          return sendError(res, 503, '显示器控制功能未初始化');
        }
      }

      // POST /api/display/sync - 同步数据到显示器
      if (pathname === '/api/display/sync' && method === 'POST') {
        const body = await parseBody(req);
        const appData = body?.appData;
        const rtState = body?.rtState || body?.rt;

        if (!appData) {
          return sendError(res, 400, '缺少 appData 参数');
        }

        if (apiHandlers.sendBroadcastMessage) {
          try {
            const payload = {
              t: 'SYNC',
              d: appData,
              r: rtState || null
            };
            apiHandlers.sendBroadcastMessage(payload);
            return sendJson(res, 200, {
              ok: true,
              message: '数据已同步到所有显示器'
            });
          } catch (e) {
            return sendError(res, 500, `同步数据失败: ${e.message}`);
          }
        } else {
          return sendError(res, 503, '广播功能未初始化');
        }
      }

      // POST /api/display/control - 发送控制命令
      if (pathname === '/api/display/control' && method === 'POST') {
        const body = await parseBody(req);
        const command = body?.command; // 'next', 'prev', 'arrive', 'depart', 'key'

        if (!command) {
          return sendError(res, 400, '缺少 command 参数');
        }

        if (apiHandlers.sendBroadcastMessage) {
          try {
            let payload = null;
            
            if (command === 'next' || command === 'prev' || command === 'arrive' || command === 'depart') {
              // 控制命令通过 CMD_KEY 发送
              let keyCode = 'Enter';
              if (command === 'prev') keyCode = 'ArrowLeft';
              if (command === 'next') keyCode = 'ArrowRight';
              if (command === 'arrive') keyCode = 'Enter';
              if (command === 'depart') keyCode = 'Space';
              
              payload = {
                t: 'CMD_KEY',
                code: keyCode,
                key: keyCode
              };
            } else if (command === 'key' && body.keyCode) {
              // 自定义按键
              payload = {
                t: 'CMD_KEY',
                code: body.keyCode,
                key: body.keyCode
              };
            } else {
              return sendError(res, 400, `不支持的命令: ${command}`);
            }

            if (payload) {
              apiHandlers.sendBroadcastMessage(payload);
              return sendJson(res, 200, {
                ok: true,
                message: `命令 ${command} 已发送`,
                command
              });
            }
          } catch (e) {
            return sendError(res, 500, `发送命令失败: ${e.message}`);
          }
        } else {
          return sendError(res, 503, '广播功能未初始化');
        }
      }

      // POST /api/display/edit - 编辑显示端配置
      if (pathname === '/api/display/edit' && method === 'POST') {
        const body = await parseBody(req);
        const displayId = body?.displayId;
        const displayData = body?.displayData || {};

        if (!displayId) {
          return sendError(res, 400, '缺少 displayId 参数');
        }

        if (apiHandlers.editDisplay) {
          try {
            const result = await apiHandlers.editDisplay(displayId, displayData);
            if (result && result.ok) {
              return sendJson(res, 200, {
                ok: true,
                message: `显示端 ${displayId} 配置已更新`,
                displayId
              });
            } else {
              return sendError(res, 400, result?.error || '编辑显示端失败');
            }
          } catch (e) {
            return sendError(res, 500, `编辑显示端失败: ${e.message}`);
          }
        } else {
          return sendError(res, 503, '编辑显示端功能未初始化');
        }
      }

      // GET /api/display/info - 获取API信息
      if (pathname === '/api/display/info' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          name: 'Metro-PIDS Display Control API',
          version: '1.0.0',
          endpoints: [
            'GET    /api/display/status - 获取显示器状态',
            'POST   /api/display/open - 打开显示器',
            'POST   /api/display/close - 关闭显示器',
            'POST   /api/display/sync - 同步数据到显示器',
            'POST   /api/display/control - 发送控制命令',
            'POST   /api/display/edit - 编辑显示端配置',
            'GET    /api/display/info - 获取API信息'
          ],
          commands: {
            next: '下一站',
            prev: '上一站',
            arrive: '到达',
            depart: '发车',
            key: '自定义按键（需要提供keyCode参数）'
          }
        });
      }

      // 根路径：显示API信息
      if (pathname === '/' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          message: 'Metro-PIDS 显示器控制 API 服务器已启动',
          port: PORT,
          endpoints: [
            'GET    /api/display/status',
            'POST   /api/display/open',
            'POST   /api/display/close',
            'POST   /api/display/sync',
            'POST   /api/display/control',
            'POST   /api/display/edit',
            'GET    /api/display/info'
          ]
        });
      }

      // 404
      sendError(res, 404, 'Not Found');
    } catch (e) {
      console.error('[DisplayAPI] 处理请求时出错:', e);
      sendError(res, 500, `服务器错误: ${e.message}`);
    }
  });

  return { server, PORT, setApiHandlers };
}

// 如果直接运行此文件，启动独立服务器（用于测试）
if (require.main === module) {
  const { server, PORT } = createDisplayApiServer();
  server.listen(PORT, () => {
    console.log(`[DisplayAPI] 显示器控制 API 服务器已启动，端口: ${PORT}`);
    console.log(`[DisplayAPI] 访问 http://localhost:${PORT}/api/display/info 查看API文档`);
  });
}

module.exports = { createDisplayApiServer, setApiHandlers };
