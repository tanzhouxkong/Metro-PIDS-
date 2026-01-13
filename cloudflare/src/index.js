// Cloudflare Worker: Metro-PIDS 预设线路 API
// 与 CLOUD_LINES_USAGE.md 中的 API 规范兼容
// 支持以下接口：
//   GET    /preset
//   GET    /preset/:lineName
//   POST   /preset
//   PUT    /preset/:lineName
//   DELETE /preset/:lineName

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method || 'GET';

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 简单鉴权（可选）：如果在 wrangler.toml 中配置了 CLOUD_TOKEN，则需要携带 Authorization: Bearer <token>
    const expectedToken = env.CLOUD_TOKEN;
    if (expectedToken) {
      const auth = request.headers.get('Authorization') || '';
      const ok = auth === `Bearer ${expectedToken}`;
      if (!ok) {
        return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
      }
    }

    // 简单可视化管理页面：GET /admin
    if (pathname === '/admin' && method === 'GET') {
      const html = getAdminHtml(url.origin);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...corsHeaders
        }
      });
    }

    // 列表：GET /preset
    if (pathname === '/preset' && method === 'GET') {
      const list = await env.LINES.list();
      const lines = [];
      for (const key of list.keys) {
        const raw = await env.LINES.get(key.name);
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          lines.push(obj);
        } catch {
          // 忽略坏数据
        }
      }
      return json({ ok: true, lines }, 200, corsHeaders);
    }

    // 创建：POST /preset
    if (pathname === '/preset' && method === 'POST') {
      const body = await readJson(request);
      if (!body?.meta?.lineName) {
        return json({ ok: false, error: '缺少 meta.lineName' }, 400, corsHeaders);
      }
      const key = String(body.meta.lineName);
      const exists = await env.LINES.get(key);
      if (exists) {
        return json({ ok: false, error: '该预设线路已存在，请使用 PUT 更新' }, 409, corsHeaders);
      }
      await env.LINES.put(key, JSON.stringify(body));
      return json({ ok: true, line: body }, 201, corsHeaders);
    }

    // 单条：/preset/:lineName
    if (pathname.startsWith('/preset/')) {
      const name = decodeURIComponent(pathname.slice('/preset/'.length));

      if (!name) {
        return json({ ok: false, error: '缺少线路名称' }, 400, corsHeaders);
      }

      // GET 单条
      if (method === 'GET') {
        const raw = await env.LINES.get(name);
        if (!raw) {
          return json({ ok: false, error: '预设线路不存在' }, 404, corsHeaders);
        }
        return json({ ok: true, line: JSON.parse(raw) }, 200, corsHeaders);
      }

      // PUT 更新/创建
      if (method === 'PUT') {
        const body = await readJson(request);
        if (!body?.meta?.lineName) {
          return json({ ok: false, error: '缺少 meta.lineName' }, 400, corsHeaders);
        }
        if (body.meta.lineName !== name) {
          return json({ ok: false, error: 'URL 与 body 中的 lineName 不一致' }, 400, corsHeaders);
        }
        await env.LINES.put(name, JSON.stringify(body));
        return json({ ok: true, line: body }, 200, corsHeaders);
      }

      // DELETE 删除
      if (method === 'DELETE') {
        await env.LINES.delete(name);
        return json({ ok: true }, 200, corsHeaders);
      }
    }

    // 根路径：简单说明
    if (pathname === '/' && method === 'GET') {
      return json(
        {
          ok: true,
          message: 'Metro-PIDS Cloudflare 预设线路 API',
          endpoints: [
            'GET    /preset',
            'GET    /preset/:lineName',
            'POST   /preset',
            'PUT    /preset/:lineName',
            'DELETE /preset/:lineName'
          ]
        },
        200,
        corsHeaders
      );
    }

    return json({ ok: false, error: 'Not Found' }, 404, corsHeaders);
  }
};

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

// 管理页面 HTML（简化版，前端直接调用同源 /preset 接口）
function getAdminHtml(origin) {
  const apiBase = origin || '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Metro-PIDS Cloudflare 运控管理</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;margin:0;padding:16px;color:#333}
    .container{max-width:980px;margin:0 auto}
    h1{font-size:22px;margin:0 0 6px}
    p.desc{margin:0 0 12px;color:#666;font-size:13px}
    .card{background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    .field{margin-bottom:10px}
    .field label{display:block;font-size:13px;color:#666;margin-bottom:4px}
    .field input,.field textarea{width:100%;padding:7px 9px;border-radius:6px;border:1px solid #d9d9d9;font-size:13px}
    .field textarea{min-height:150px;font-family:Consolas,Menlo,monospace;resize:vertical}
    .btn{display:inline-block;padding:7px 13px;border-radius:6px;border:none;cursor:pointer;font-size:13px;margin-right:6px;margin-bottom:6px;color:#fff;background:#1677ff}
    .btn.secondary{background:#d9d9d9;color:#333}
    .btn.danger{background:#ff4d4f}
    .status{font-size:12px;color:#666;margin-left:6px}
    .status.ok{color:#52c41a}
    .status.err{color:#ff4d4f}
    pre{background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:12px;max-height:260px;overflow:auto;white-space:pre}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Metro-PIDS Cloudflare 运控管理</h1>
      <p class="desc">
        当前 API 地址：<code id="api-base-text">${apiBase}</code><br/>
        此页面运行在 Cloudflare Worker 上，只用于你自己管理预设线路。写操作可通过 Token 保护（CLOUD_TOKEN）。
      </p>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">登录与基础配置</h2>
      <div class="field">
        <label for="login-username">登录用户名（默认：admin）</label>
        <input id="login-username" type="text" placeholder="默认：admin" />
      </div>
      <div class="field">
        <label for="login-password">登录密码（默认：password）</label>
        <input id="login-password" type="password" placeholder="默认：password" />
      </div>
      <button class="btn secondary" id="btn-login">登录</button>
      <span class="status" id="login-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="api-token">写操作 Token（可选，仅你自己知道）</label>
        <input id="api-token" type="password" placeholder="与 CLOUD_TOKEN 一致时才允许写入" />
      </div>
      <button class="btn secondary" id="btn-save-conf">保存到浏览器</button>
      <span class="status" id="conf-status"></span>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee" />
      <div class="field">
        <label for="old-password">修改登录密码（当前登录用户）</label>
        <input id="old-password" type="password" placeholder="当前密码" />
      </div>
      <div class="field">
        <input id="new-password" type="password" placeholder="新密码" />
      </div>
      <div class="field">
        <input id="new-password2" type="password" placeholder="重复新密码" />
      </div>
      <button class="btn secondary" id="btn-change-pwd">修改密码（仅保存在浏览器）</button>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">线路列表</h2>
      <button class="btn" id="btn-list">列出所有线路 (GET /preset)</button>
      <div class="field" style="margin-top:8px">
        <label>结果</label>
        <pre id="list-output">尚未请求。</pre>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:18px;margin:0 0 10px">单条线路操作</h2>
      <div class="field">
        <label for="line-name">线路名称 (meta.lineName)</label>
        <input id="line-name" type="text" placeholder="例如：上海地铁2号线" />
      </div>
      <div style="margin-bottom:8px">
        <button class="btn secondary" id="btn-get">读取 (GET /preset/:lineName)</button>
        <button class="btn" id="btn-put">上传/更新 (PUT /preset/:lineName)</button>
        <button class="btn danger" id="btn-del">删除 (DELETE /preset/:lineName)</button>
        <span class="status" id="line-status"></span>
      </div>
      <div class="field">
        <label for="line-json">线路 JSON 内容</label>
        <textarea id="line-json" placeholder='{"meta": {"lineName": "示例线路"}, "stations": [...]}'></textarea>
      </div>
    </div>
  </div>

  <script>
    const STORAGE_KEY = 'metro_pids_cf_worker_admin_conf';
    const AUTH_KEY = 'metro_pids_cf_worker_admin_auth';
    const apiBase = '${apiBase}';

    function loadConf() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveConf(conf) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conf));
    }
    function getToken() {
      return document.getElementById('api-token').value.trim();
    }
    function showStatus(id, msg, ok) {
      const el = document.getElementById(id);
      el.textContent = msg || '';
      el.className = 'status ' + (ok ? 'ok' : 'err');
    }
    function headers(body) {
      const h = { 'Accept': 'application/json' };
      if (body) h['Content-Type'] = 'application/json';
      const token = getToken();
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    }
    async function callApi(method, path, body) {
      const url = apiBase.replace(/\\/+$/, '') + path;
      const res = await fetch(url, {
        method,
        headers: headers(!!body),
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text);
      return data;
    }
    // 登录信息
    function loadAuth() {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch { return null; }
    }
    function saveAuth(auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }
    function ensureDefaultAuth() {
      let auth = loadAuth();
      if (!auth || !auth.username || !auth.password) {
        auth = { username: 'admin', password: 'password' };
        saveAuth(auth);
      }
      return auth;
    }
    let isAuthed = false;
    function handleLogin() {
      const auth = ensureDefaultAuth();
      const u = document.getElementById('login-username').value.trim() || 'admin';
      const p = document.getElementById('login-password').value;
      if (u === auth.username && p === auth.password) {
        isAuthed = true;
        showStatus('login-status', '登录成功', true);
      } else {
        isAuthed = false;
        showStatus('login-status', '用户名或密码错误（默认：admin / password）', false);
      }
    }
    function handleChangePassword() {
      if (!isAuthed) {
        showStatus('login-status', '请先登录后再修改密码', false);
        return;
      }
      const auth = ensureDefaultAuth();
      const oldPwd = document.getElementById('old-password').value;
      const newPwd = document.getElementById('new-password').value;
      const newPwd2 = document.getElementById('new-password2').value;
      if (!oldPwd || !newPwd || !newPwd2) {
        showStatus('login-status', '请完整填写旧密码和两次新密码', false);
        return;
      }
      if (oldPwd !== auth.password) {
        showStatus('login-status', '旧密码不正确', false);
        return;
      }
      if (newPwd !== newPwd2) {
        showStatus('login-status', '两次新密码不一致', false);
        return;
      }
      const updated = { username: auth.username, password: newPwd };
      saveAuth(updated);
      showStatus('login-status', '密码已更新（仅保存在当前浏览器）', true);
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('new-password2').value = '';
      document.getElementById('login-password').value = '';
    }
    window.addEventListener('DOMContentLoaded', () => {
      const conf = loadConf();
      if (conf && conf.token) {
        document.getElementById('api-token').value = conf.token;
      }
      const auth = ensureDefaultAuth();
      document.getElementById('login-username').placeholder = '默认：' + auth.username;
      document.getElementById('login-password').placeholder = '默认：' + auth.password;

      document.getElementById('btn-login').addEventListener('click', handleLogin);
      document.getElementById('btn-save-conf').addEventListener('click', () => {
        const token = getToken();
        saveConf({ token });
        showStatus('conf-status', '已保存到本地浏览器', true);
      });
      document.getElementById('btn-change-pwd').addEventListener('click', handleChangePassword);
      document.getElementById('btn-list').addEventListener('click', async () => {
        const out = document.getElementById('list-output');
        out.textContent = '请求中...';
        try {
          const data = await callApi('GET', '/preset');
          out.textContent = JSON.stringify(data, null, 2);
          showStatus('conf-status', '请求成功', true);
        } catch (e) {
          out.textContent = '请求失败：' + e.message;
          showStatus('conf-status', '请求失败', false);
        }
      });
      document.getElementById('btn-get').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        showStatus('line-status', '读取中...', true);
        try {
          const data = await callApi('GET', '/preset/' + encodeURIComponent(name));
          document.getElementById('line-json').value = JSON.stringify(data.line || data, null, 2);
          showStatus('line-status', '读取成功', true);
        } catch (e) {
          showStatus('line-status', '读取失败：' + e.message, false);
        }
      });
      document.getElementById('btn-put').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        const text = document.getElementById('line-json').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!text) { showStatus('line-status', '请先填写线路 JSON', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        showStatus('line-status', '上传中...', true);
        try {
          const json = JSON.parse(text);
          if (!json.meta) json.meta = {};
          json.meta.lineName = name;
          const data = await callApi('PUT', '/preset/' + encodeURIComponent(name), json);
          document.getElementById('line-json').value = JSON.stringify(data.line || json, null, 2);
          showStatus('line-status', '上传/更新成功', true);
        } catch (e) {
          showStatus('line-status', '上传失败：' + e.message, false);
        }
      });
      document.getElementById('btn-del').addEventListener('click', async () => {
        const name = document.getElementById('line-name').value.trim();
        if (!name) { showStatus('line-status', '请先填写线路名称', false); return; }
        if (!isAuthed) { showStatus('line-status', '请先登录（默认：admin / password）', false); return; }
        if (!confirm('确定要删除 \"' + name + '\" 吗？')) return;
        showStatus('line-status', '删除中...', true);
        try {
          await callApi('DELETE', '/preset/' + encodeURIComponent(name));
          showStatus('line-status', '删除成功', true);
        } catch (e) {
          showStatus('line-status', '删除失败：' + e.message, false);
        }
      });
    });
  </script>
</body>
</html>`;
}



