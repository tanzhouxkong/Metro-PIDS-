<<<<<<< HEAD
const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage, desktopCapturer, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const crypto = require('crypto');
=======
const { app, BrowserWindow, ipcMain, dialog, shell, screen, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
<<<<<<< HEAD
<<<<<<< HEAD
const crypto = require('crypto');
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055

// 引入日志和存储
let logger = null;
let Store = null;
let store = null;
try {
  logger = require('electron-log');
  Store = require('electron-store');
  store = new Store();
} catch (e) {
  console.warn('electron-log or electron-store not available:', e);
}

let autoUpdater = null;
try {
  // electron-updater 仅安装后可用，需安全 require
  // eslint-disable-next-line global-require
  console.log('[main] 尝试加载 electron-updater...');
  const updater = require('electron-updater');
  console.log('[main] electron-updater 模块加载成功:', typeof updater);
  console.log('[main] updater.autoUpdater:', typeof updater.autoUpdater);
  
  autoUpdater = updater.autoUpdater;
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  
  if (!autoUpdater) {
    console.error('[main] updater.autoUpdater 为 undefined');
    // 尝试其他可能的导出方式
    if (updater.default && updater.default.autoUpdater) {
      autoUpdater = updater.default.autoUpdater;
      console.log('[main] 使用 updater.default.autoUpdater');
    }
  }
  
<<<<<<< HEAD
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  // 配置日志
  if (logger && autoUpdater) {
    autoUpdater.logger = logger;
  }
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  
  if (autoUpdater) {
    console.log('[main] electron-updater loaded successfully');
  } else {
    console.error('[main] electron-updater 加载失败：autoUpdater 为 null');
  }
  
  // 注意：在开发模式下（未打包），electron-updater 默认不会检查更新
  // 这是正常行为，更新功能需要在打包后的应用中测试
<<<<<<< HEAD
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
} catch (e) {
  console.error('[main] Failed to load electron-updater:', e);
  console.error('[main] Error details:', {
    message: e.message,
    stack: e.stack,
    code: e.code,
    name: e.name
  });
  autoUpdater = null;
}

let mainWin = null;
let displayWin = null;
let lineManagerWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false, // 无边框，应用自绘标题栏
    titleBarStyle: 'hidden',
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const controlPath = `file://${path.join(__dirname, 'index.html')}`;
  mainWin.loadURL(controlPath);

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  // 监听来自线路管理器的线路切换请求
  ipcMain.on('switch-line-request', (event, lineName) => {
    if (mainWin && !mainWin.isDestroyed()) {
      // 通过 webContents.send 发送消息到渲染进程
      mainWin.webContents.send('switch-line-request', lineName);
    }
  });

  // 开启 DevTools 控制台（用于调试）
  // 仅在开发模式下自动打开
  if (!app.isPackaged) {
    mainWin.webContents.openDevTools();
  }
  
  // 将主进程日志发送到渲染进程（用于调试）
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    originalLog.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-log', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-error', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };

  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

<<<<<<< HEAD
=======
=======
  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  // 拦截 renderer 的 window.open 来创建受控窗口
  mainWin.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    try {
      const u = url.toString();
      if (u.endsWith('display_window.html') || u.includes('display_window.html')) {
        createDisplayWindow();
        return { action: 'deny' };
      }
    } catch (e) {
      // 忽略错误
    }
    return { action: 'allow' };
  });

  // 暴露 IPC 供渲染层打开显示窗口
  ipcMain.handle('open-display', (event, opts) => {
    const w = opts && typeof opts.width === 'number' ? opts.width : undefined;
    const h = opts && typeof opts.height === 'number' ? opts.height : undefined;
    console.log('[main] open-display requested, width=', w, 'height=', h);
    createDisplayWindow(w, h);
    return true;
  });

  // 暴露 IPC 供渲染层打开线路管理器
  ipcMain.handle('open-line-manager', (event) => {
    createLineManagerWindow();
    return true;
  });

  ipcMain.handle('dialog/alert', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return;
    try {
      await showElectronAlert({ parent: win, type: 'alert', title: '提示', msg: String(message) });
      return true;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('dialog/confirm', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return false;
    try {
      const res = await showElectronAlert({ parent: win, type: 'confirm', title: '确认', msg: String(message) });
      return !!res;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('effects/dialog-blur', (event, enable) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    try {
      if (typeof win.setVisualEffectState === 'function') {
        win.setVisualEffectState(enable ? 'active' : 'inactive');
      }
      if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
        win.setVibrancy(enable ? 'fullscreen-ui' : 'none');
      }
      if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
        win.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
      }
      return { ok: true };
    } catch (err) {
      console.warn('failed to toggle dialog blur', err);
      return { ok: false, error: String(err) };
    }
  });

  // 广播最大化/还原事件供渲染层更新 UI
  mainWin.on('maximize', () => {
    try { mainWin.webContents.send('window/maxstate', true); } catch (e) {}
  });
  mainWin.on('unmaximize', () => {
    try { mainWin.webContents.send('window/maxstate', false); } catch (e) {}
  });

  // 窗口 ready 后发送初始最大化状态
  mainWin.once('ready-to-show', () => {
    try { mainWin.webContents.send('window/maxstate', mainWin.isMaximized()); } catch (e) {}
  });

// 辅助：默认线路文件目录位于 userData
function getLinesDir(dir) {
  if (dir && typeof dir === 'string' && dir.length > 0) return dir;
  // 获取当前活动的文件夹
  const currentFolder = store ? (store.get('linesCurrentFolder') || 'default') : 'default';
  const folders = store ? (store.get('linesFolders') || {}) : {};
  if (folders[currentFolder]) {
    return folders[currentFolder].path;
  }
  // 如果默认文件夹不存在，使用默认路径
  const defaultPath = path.join(app.getPath('userData'), 'lines');
  // 确保默认文件夹被添加到列表中
  if (store) {
    const currentFolders = store.get('linesFolders') || {};
    if (!currentFolders.default) {
      currentFolders.default = { name: '默认', path: defaultPath };
      store.set('linesFolders', currentFolders);
      if (!store.get('linesCurrentFolder')) {
        store.set('linesCurrentFolder', 'default');
      }
    }
  }
  return defaultPath;
}

// 获取所有文件夹配置
function getLinesFolders() {
  if (!store) return { default: { name: '默认', path: path.join(app.getPath('userData'), 'lines') } };
  const folders = store.get('linesFolders') || {};
  // 确保有默认文件夹
  if (!folders.default) {
    folders.default = { name: '默认', path: path.join(app.getPath('userData'), 'lines') };
    store.set('linesFolders', folders);
  }
  return folders;
}

// 获取当前活动的文件夹ID
function getCurrentLinesFolder() {
  if (!store) return 'default';
  return store.get('linesCurrentFolder') || 'default';
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // 忽略错误
  }
}

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055

// 查找 JSON 文件的辅助函数（recursive 参数控制是否递归查找子文件夹）
async function findJsonFiles(dir, baseDir = null, recursive = false) {
  if (!baseDir) baseDir = dir;
  const out = [];
<<<<<<< HEAD
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果启用递归，递归查找子文件夹
        if (recursive) {
          const subFiles = await findJsonFiles(fullPath, baseDir, recursive);
          out.push(...subFiles);
        }
        // 如果不递归，跳过子文件夹
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          const txt = await fsPromises.readFile(fullPath, 'utf8');
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { json = null; }
          const version = json && json.meta && json.meta.version ? json.meta.version : null;
          // 计算相对路径作为文件名（相对于 baseDir）
          const relativePath = path.relative(baseDir, fullPath);
          const nameWithoutExt = relativePath.replace(/\.json$/i, '').replace(/\\/g, '/');
          out.push({ name: nameWithoutExt, version, mtime: stat.mtimeMs, fullPath });
        } catch (e) {
          // 出错则跳过该文件
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return out;
}

// 列出线路文件(JSON)，返回 { name, version, mtime } 数组（支持递归查找子文件夹）
// dir 可以是文件夹路径（字符串）或文件夹ID
ipcMain.handle('lines/list', async (event, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  await ensureDir(base);
  try {
    // 不递归查找子文件夹，只查找当前文件夹下的 JSON 文件
    const files = await findJsonFiles(base, base, false);
=======
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果启用递归，递归查找子文件夹
        if (recursive) {
          const subFiles = await findJsonFiles(fullPath, baseDir, recursive);
          out.push(...subFiles);
        }
        // 如果不递归，跳过子文件夹
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          const txt = await fsPromises.readFile(fullPath, 'utf8');
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { json = null; }
          const version = json && json.meta && json.meta.version ? json.meta.version : null;
          // 计算相对路径作为文件名（相对于 baseDir）
          const relativePath = path.relative(baseDir, fullPath);
          const nameWithoutExt = relativePath.replace(/\.json$/i, '').replace(/\\/g, '/');
          out.push({ name: nameWithoutExt, version, mtime: stat.mtimeMs, fullPath });
        } catch (e) {
          // 出错则跳过该文件
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return out;
}

// 列出线路文件(JSON)，返回 { name, version, mtime } 数组（支持递归查找子文件夹）
// dir 可以是文件夹路径（字符串）或文件夹ID
ipcMain.handle('lines/list', async (event, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  await ensureDir(base);
  try {
    // 不递归查找子文件夹，只查找当前文件夹下的 JSON 文件
    const files = await findJsonFiles(base, base, false);
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
// 递归查找 JSON 文件的辅助函数
async function findJsonFiles(dir, baseDir = null) {
  if (!baseDir) baseDir = dir;
  const out = [];
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 递归查找子文件夹
        const subFiles = await findJsonFiles(fullPath, baseDir);
        out.push(...subFiles);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          const txt = await fsPromises.readFile(fullPath, 'utf8');
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { json = null; }
          const version = json && json.meta && json.meta.version ? json.meta.version : null;
          // 计算相对路径作为文件名（相对于 baseDir）
          const relativePath = path.relative(baseDir, fullPath);
          const nameWithoutExt = relativePath.replace(/\.json$/i, '').replace(/\\/g, '/');
          out.push({ name: nameWithoutExt, version, mtime: stat.mtimeMs, fullPath });
        } catch (e) {
          // 出错则跳过该文件
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return out;
}

// 列出线路文件(JSON)，返回 { name, version, mtime } 数组（支持递归查找子文件夹）
ipcMain.handle('lines/list', async (event, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  try {
    const files = await findJsonFiles(base);
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    return files;
  } catch (err) {
    return { error: String(err) };
  }
});

// 读取单个线路文件（支持子文件夹路径）
ipcMain.handle('lines/read', async (event, filename, dir) => {
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
<<<<<<< HEAD
=======
=======
  const base = getLinesDir(dir);
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 保存线路文件，附带简单版本处理（支持子文件夹路径）
ipcMain.handle('lines/save', async (event, filename, contentObj, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  // 如果 filename 包含路径分隔符，说明要保存到子文件夹
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
    // 确保父目录存在
    await ensureDir(path.dirname(fp));
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    let existing = null;
    try {
      const t = await fsPromises.readFile(fp, 'utf8');
      existing = JSON.parse(t);
    } catch (e) {
      existing = null;
    }
    const existingVer = existing && existing.meta && existing.meta.version ? existing.meta.version : 0;
    if (!contentObj.meta) contentObj.meta = {};
    const incomingVer = contentObj.meta.version ? contentObj.meta.version : 0;
    if (incomingVer <= existingVer) {
      contentObj.meta.version = existingVer + 1; // 版本递增
    }
    // 写入文件
    await fsPromises.writeFile(fp, JSON.stringify(contentObj, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

<<<<<<< HEAD
// 删除线路文件（支持子文件夹路径）
=======
<<<<<<< HEAD
<<<<<<< HEAD
// 删除线路文件（支持子文件夹路径）
=======
// 删除线路文件
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
// 删除线路文件
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
ipcMain.handle('lines/delete', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 在文件管理器中打开线路目录
ipcMain.handle('lines/openFolder', async (event, dir) => {
  const base = getLinesDir(dir);
  try {
    await ensureDir(base);
    const r = await shell.openPath(base);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: base };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 打开指定的文件夹路径（用于右键菜单）
ipcMain.handle('lines/folders/open', async (event, folderPath) => {
  try {
    const r = await shell.openPath(folderPath);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：列出所有文件夹（自动扫描并添加已存在的文件夹）
ipcMain.handle('lines/folders/list', async () => {
  try {
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 扫描 lines 目录下的所有子文件夹
    const existingDirs = [];
    try {
      const entries = await fsPromises.readdir(baseLinesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(baseLinesDir, entry.name);
          existingDirs.push({
            name: entry.name,
            path: dirPath
          });
        }
      }
    } catch (e) {
      console.warn('扫描文件夹失败:', e);
    }
    
    // 获取当前配置的文件夹
    let folders = getLinesFolders();
    let hasChanges = false;
    
    // 将已存在但未配置的文件夹添加到配置中
    for (const dir of existingDirs) {
      const existingId = Object.keys(folders).find(id => folders[id].path === dir.path);
      if (!existingId) {
        // 文件夹存在但不在配置中，自动添加
        const newId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        folders[newId] = { name: dir.name, path: dir.path };
        hasChanges = true;
      }
    }
    
    // 如果有新文件夹被添加，保存配置
    if (hasChanges && store) {
      store.set('linesFolders', folders);
    }
    
    const current = getCurrentLinesFolder();
    const result = Object.keys(folders).map(id => ({
      id,
      name: folders[id].name,
      path: folders[id].path,
      isCurrent: id === current
    }));
    return { ok: true, folders: result, current };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：添加文件夹（在 lines 目录下创建子文件夹）
ipcMain.handle('lines/folders/add', async (event, folderName) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
  if (!win) return { ok: false, error: 'no-window' };
  try {
    // 获取 lines 基础目录
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 如果没有提供文件夹名，返回错误提示前端先获取用户输入
    if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
      return { ok: false, error: 'folder-name-required' };
    }
    
    // 清理文件夹名称，移除不合法字符
    const sanitizedFolderName = folderName.trim().replace(/[<>:"/\\|?*]/g, '');
    if (!sanitizedFolderName) {
      return { ok: false, error: '文件夹名称无效' };
    }
    
    // 构建完整路径
    const folderPath = path.join(baseLinesDir, sanitizedFolderName);
    
    // 检查文件夹是否已存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (stat.isDirectory()) {
        // 文件夹已存在，检查是否已在配置中
        const folders = getLinesFolders();
        const existingId = Object.keys(folders).find(id => folders[id].path === folderPath);
        if (existingId) {
          return { ok: false, error: '该文件夹已存在', folderId: existingId };
        }
        // 文件夹已存在但不在配置中，直接添加到配置
      } else {
        return { ok: false, error: '路径已存在但不是文件夹' };
      }
    } catch (e) {
      // 文件夹不存在，创建它
      await ensureDir(folderPath);
    }
    
    // 检查该路径是否已经在配置中
    const folders = getLinesFolders();
    const existingId = Object.keys(folders).find(id => folders[id].path === folderPath);
    if (existingId) {
      return { ok: false, error: '该文件夹已存在', folderId: existingId };
    }
    
    // 生成新的文件夹ID（使用时间戳）
    const newId = `folder_${Date.now()}`;
    
    folders[newId] = { name: sanitizedFolderName, path: folderPath };
    if (store) {
      store.set('linesFolders', folders);
    }
    
    return { ok: true, folderId: newId, name: sanitizedFolderName, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：删除文件夹（同时删除文件夹及其内部的所有文件）
// 支持通过路径或ID来删除文件夹（优先使用路径）
ipcMain.handle('lines/folders/remove', async (event, folderPathOrId) => {
  try {
    if (folderPathOrId === 'default') {
      return { ok: false, error: '不能删除默认文件夹' };
    }
    
    console.log(`[main] 删除文件夹，参数: ${folderPathOrId}`);
    const folders = getLinesFolders();
    
    let targetFolderId = null;
    let folderPath = null;
    
    // 判断传入的是路径还是ID
    const isPath = folderPathOrId.includes(path.sep) || path.isAbsolute(folderPathOrId);
    
    if (isPath) {
      // 传入的是路径，通过路径查找配置中的文件夹
      folderPath = folderPathOrId;
      // 标准化路径（处理路径分隔符差异）
      const normalizedPath = path.normalize(folderPath);
      
      // 在配置中查找匹配的路径
      for (const [id, folder] of Object.entries(folders)) {
        if (id === 'default') continue;
        const normalizedFolderPath = path.normalize(folder.path);
        if (normalizedFolderPath === normalizedPath) {
          targetFolderId = id;
          break;
        }
      }
      
      if (!targetFolderId) {
        console.warn(`[main] 通过路径找不到文件夹配置，路径: ${folderPath}`);
        // 即使配置中找不到，也尝试直接删除文件系统中的文件夹
        // 这样可以处理配置不同步的情况
      }
    } else {
      // 传入的是ID，通过ID查找
      targetFolderId = folderPathOrId;
      if (!folders[targetFolderId]) {
        const availableIds = Object.keys(folders);
        const errorMsg = `文件夹配置不存在。请求的ID: "${targetFolderId}"，当前可用的ID: ${availableIds.length > 0 ? availableIds.map(id => `"${id}"`).join(', ') : '无'}`;
        console.warn(`[main] ${errorMsg}`);
        return { ok: false, error: errorMsg };
      }
      folderPath = folders[targetFolderId].path;
    }
    
    // 如果没有找到配置但传入了路径，使用传入的路径直接删除
    if (!targetFolderId && isPath) {
      console.log(`[main] 配置中未找到文件夹，但将尝试删除路径: ${folderPath}`);
    }
    
    // 验证文件夹路径是否存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (!stat.isDirectory()) {
        // 路径存在但不是文件夹，只删除配置（如果找到了配置）
        console.warn(`路径 ${folderPath} 存在但不是文件夹，只删除配置`);
        if (targetFolderId && folders[targetFolderId]) {
          delete folders[targetFolderId];
          if (store) {
            store.set('linesFolders', folders);
          }
        }
        return { ok: true };
      }
    } catch (statErr) {
      // 文件夹路径不存在，可能已经被删除，只删除配置（如果找到了配置）
      console.warn(`文件夹路径 ${folderPath} 不存在，只删除配置:`, statErr.message);
      if (targetFolderId && folders[targetFolderId]) {
        delete folders[targetFolderId];
        if (store) {
          store.set('linesFolders', folders);
        }
      }
      return { ok: true };
    }
    
    // 如果删除的是当前文件夹，切换到默认文件夹
    if (targetFolderId) {
      const current = getCurrentLinesFolder();
      if (current === targetFolderId) {
        if (store) {
          store.set('linesCurrentFolder', 'default');
        }
      }
    }
    
    // 删除文件夹及其内部的所有文件
    try {
      // 使用 Node.js 14.14.0+ 的 fs.promises.rm，支持 recursive 选项
      await fsPromises.rm(folderPath, { recursive: true, force: true });
      console.log(`成功删除文件夹: ${folderPath}`);
    } catch (rmErr) {
      // 如果 fs.promises.rm 不可用或失败，尝试使用 rmdir
      try {
        await fsPromises.rmdir(folderPath, { recursive: true });
        console.log(`使用 rmdir 成功删除文件夹: ${folderPath}`);
      } catch (rmdirErr) {
        // 如果都失败，记录错误但继续删除配置
        console.error(`删除文件夹失败 ${folderPath}:`, rmdirErr);
        // 即使删除失败，也继续删除配置，避免配置和实际文件不一致
        // return { ok: false, error: `删除文件夹失败: ${rmdirErr.message}` };
      }
    }
    
    // 从配置中移除文件夹（如果找到了配置）
    if (targetFolderId && folders[targetFolderId]) {
      delete folders[targetFolderId];
      if (store) {
        store.set('linesFolders', folders);
      }
    }
    
    return { ok: true };
  } catch (err) {
    console.error('删除文件夹时发生错误:', err);
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：重命名文件夹
ipcMain.handle('lines/folders/rename', async (event, folderId, newName) => {
  try {
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return { ok: false, error: '文件夹名称不能为空' };
    }
    
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    folders[folderId].name = newName.trim();
    if (store) {
      store.set('linesFolders', folders);
    }
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：切换当前文件夹
ipcMain.handle('lines/folders/switch', async (event, folderId) => {
  try {
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    if (store) {
      store.set('linesCurrentFolder', folderId);
    }
    
    return { ok: true, folderId, name: folders[folderId].name, path: folders[folderId].path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：获取当前文件夹
ipcMain.handle('lines/folders/current', async () => {
  try {
    const folders = getLinesFolders();
    const current = getCurrentLinesFolder();
    const folder = folders[current];
    if (!folder) {
      return { ok: false, error: '当前文件夹不存在' };
    }
    return { ok: true, folderId: current, name: folder.name, path: folder.path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 短交路预设目录
function getShortTurnsDir() {
  return path.join(app.getPath('userData'), 'shortturns');
}

// 列出短交路预设（按线路名称筛选）
ipcMain.handle('shortturns/list', async (event, lineName) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  try {
    const files = await findJsonFiles(base, base, false); // 不递归查找子文件夹
    const presets = [];
    for (const file of files) {
      try {
        const res = await fsPromises.readFile(file.fullPath, 'utf8');
        const preset = JSON.parse(res);
        // 如果指定了线路名称，只返回匹配的预设
        if (!lineName || (preset.lineName && preset.lineName === lineName)) {
          // file.name 可能包含路径，我们只需要文件名（不含扩展名）
          const presetName = path.basename(file.name, '.json');
          presets.push({
            name: presetName,
            ...preset,
            mtime: file.mtime
          });
        }
      } catch (e) {
        // 跳过无效文件
      }
    }
    return presets;
  } catch (err) {
    return { error: String(err) };
  }
});

// 保存短交路预设
ipcMain.handle('shortturns/save', async (event, presetName, presetData) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.writeFile(fp, JSON.stringify(presetData, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 读取短交路预设
ipcMain.handle('shortturns/read', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 删除短交路预设
ipcMain.handle('shortturns/delete', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 计算数据的 MD5 哈希值（用于比较线路是否相同）
ipcMain.handle('utils/calculate-md5', async (event, data) => {
  try {
    // 标准化数据（移除版本号等可能变化的字段）
    const normalizeForCompare = (line) => {
      const normalized = JSON.parse(JSON.stringify(line));
      if (normalized.meta) {
        delete normalized.meta.version;
      }
      return normalized;
    };
    
    const normalized = normalizeForCompare(data);
    
    // 将数据转换为 JSON 字符串（标准化格式，排序键）
    const jsonStr = JSON.stringify(normalized, Object.keys(normalized).sort());
    
    // 使用 Node.js crypto 模块计算 MD5
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    return { ok: true, hash };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

<<<<<<< HEAD
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 在默认浏览器打开外部链接
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false, error: 'invalid-url' };
    const result = await shell.openExternal(url);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 提供应用版本给渲染层
ipcMain.handle('app/get-version', async () => {
  try {
    return { ok: true, version: app.getVersion() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

<<<<<<< HEAD
// 获取环境变量中的 Gitee Token
ipcMain.handle('env/get-gitee-token', () => {
  // 优先从环境变量读取，支持多种命名方式
  return process.env.GITEE_TOKEN || 
         process.env.GITEE_ACCESS_TOKEN || 
         null;
});

=======
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 取色窗口和状态
let colorPickerWin = null;
let colorPickResolve = null;

// 启动取色模式
ipcMain.handle('color/startPick', async (event) => {
  try {
    // 如果已经有取色窗口，先关闭
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    // 获取主屏幕尺寸和位置
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const screenBounds = primaryDisplay.bounds;
    
    colorPickerWin = new BrowserWindow({
      width: screenSize.width,
      height: screenSize.height,
      x: screenBounds.x,
      y: screenBounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // 创建取色页面 HTML
    const pickerHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      background: transparent;
      cursor: crosshair;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      color: white;
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      user-select: none;
    }
    .picker-hint {
      background: rgba(0,0,0,0.7);
      padding: 16px 24px;
      border-radius: 8px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
  </style>
</head>
<body>
  <div class="picker-hint">点击屏幕任意位置取色 (ESC 取消)</div>
  <script>
    document.addEventListener('click', (e) => {
      window.electronAPI.sendColorPickClick(e.screenX, e.screenY);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.electronAPI.cancelColorPick();
      }
    });
  </script>
</body>
</html>`;
    
    // 等待窗口准备好后再显示
    colorPickerWin.once('ready-to-show', () => {
      // 允许鼠标事件，但确保窗口在最上层
      colorPickerWin.setIgnoreMouseEvents(false);
      colorPickerWin.show();
      colorPickerWin.focus();
      // 确保窗口始终在最上层
      colorPickerWin.setAlwaysOnTop(true, 'screen-saver');
    });
    
    colorPickerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pickerHTML)}`);
    
    // 监听窗口关闭
    colorPickerWin.on('closed', () => {
      colorPickerWin = null;
      if (colorPickResolve) {
        const resolve = colorPickResolve;
        colorPickResolve = null;
        resolve({ ok: false, error: 'cancelled' });
      }
    });
    
    // 返回 Promise，等待取色结果
    return new Promise((resolve) => {
      colorPickResolve = resolve;
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

<<<<<<< HEAD
// 显示系统通知
ipcMain.handle('notification/show', async (event, { title, body, options = {} }) => {
  try {
    // Electron 的 Notification 在 Windows/Linux 上需要应用已就绪
    if (!Notification.isSupported()) {
      return { ok: false, error: '系统不支持通知' };
    }

    const notification = new Notification({
      title: title || '通知',
      body: body || '',
      icon: options.icon || undefined,
      badge: options.badge || undefined,
      tag: options.tag || undefined,
      silent: options.silent || false,
      urgency: options.urgency || 'normal' // 'normal', 'critical', 'low'
    });

    // 可选：添加点击事件处理
    notification.on('click', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.focus();
      }
    });

    notification.show();
    return { ok: true };
  } catch (e) {
    console.error('显示通知失败:', e);
    return { ok: false, error: String(e) };
  }
});

=======
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 处理取色点击
ipcMain.on('color-picker-click', async (event, x, y) => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  try {
    // 使用系统 API 获取准确的鼠标位置
    const cursorPoint = screen.getCursorScreenPoint();
    const actualX = cursorPoint.x;
    const actualY = cursorPoint.y;
    
    // 使用系统 API 获取像素颜色（各平台使用不同的方法）
    const { execSync } = require('child_process');
    let systemColor = null;
    
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell 调用 Windows API GetPixel
      try {
        const psScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PixelColor {
  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("gdi32.dll")]
  public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);
}
"@; $hdc = [PixelColor]::GetDC([IntPtr]::Zero); $colorRef = [PixelColor]::GetPixel($hdc, ${actualX}, ${actualY}); [PixelColor]::ReleaseDC([IntPtr]::Zero, $hdc); $r = $colorRef -band 0x0000FF; $g = ($colorRef -band 0x00FF00) -shr 8; $b = ($colorRef -band 0xFF0000) -shr 16; Write-Output "$r,$g,$b"`;
        
        const result = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf-8', timeout: 5000 });
        const parts = result.trim().split(',');
        if (parts.length === 3) {
          const r = parseInt(parts[0].trim());
          const g = parseInt(parts[1].trim());
          const b = parseInt(parts[2].trim());
          
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
        }
      } catch (psError) {
        console.warn('[ColorPicker] Windows PowerShell 取色失败:', psError.message || psError);
      }
    } else if (process.platform === 'darwin') {
      // macOS: 使用 screencapture 命令截取指定坐标的像素
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 使用 screencapture 截取指定坐标的 1x1 像素区域
        // -R x,y,w,h: 指定区域，-x: 不播放快门声音
        execSync(`screencapture -R ${actualX},${actualY},1,1 -x "${tmpFile}"`, { timeout: 5000 });
        
        if (fs.existsSync(tmpFile)) {
          // 读取图片并获取像素颜色
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // macOS 上 getBitmap() 返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (macError) {
        console.warn('[ColorPicker] macOS 系统 API 取色失败:', macError.message || macError);
      }
    } else if (process.platform === 'linux') {
      // Linux: 使用 xwd + ImageMagick convert 或者 import 命令
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 方法1: 尝试使用 import 命令（ImageMagick）直接截取指定坐标的像素
        try {
          execSync(`import -window root -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
        } catch (importError) {
          // import 失败，尝试使用 xwd + convert
          const xwdFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.xwd`);
          try {
            // 使用 xwd 截取整个屏幕
            execSync(`xwd -root -silent -out "${xwdFile}"`, { timeout: 5000 });
            
            if (fs.existsSync(xwdFile)) {
              // 使用 convert 裁剪指定坐标的像素
              execSync(`convert "${xwdFile}" -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
            }
            
            // 清理 xwd 文件
            try { fs.unlinkSync(xwdFile); } catch (e) {}
          } catch (xwdError) {
            throw importError; // 如果都失败，抛出原始错误
          }
        }
        
        if (fs.existsSync(tmpFile)) {
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // Linux 上 getBitmap() 通常返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (linuxError) {
        console.warn('[ColorPicker] Linux 系统 API 取色失败:', linuxError.message || linuxError);
      }
    }
    
    // 如果系统 API 成功获取颜色，直接返回
    if (systemColor) {
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: systemColor });
      return;
    }
    
    // 回退方法：使用 desktopCapturer（适用于所有平台或 Windows API 失败时）
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;
    
    // 使用原始分辨率（考虑缩放因子）获取屏幕源
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: {
        width: screenSize.width * scaleFactor,
        height: screenSize.height * scaleFactor
      }
    });
    
    if (!sources || sources.length === 0) {
      throw new Error('无法获取屏幕源');
    }
    
    // 找到主显示器
    const source = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
    
    if (!source || !source.thumbnail) {
      throw new Error('无法获取屏幕缩略图');
    }
    
    // 直接从 thumbnail 获取 bitmap
    const bitmap = source.thumbnail.getBitmap();
    const thumbnailSize = source.thumbnail.getSize();
    
    // 计算坐标：鼠标位置需要乘以缩放因子来匹配缩略图分辨率
    const pixelX = Math.floor(actualX * scaleFactor);
    const pixelY = Math.floor(actualY * scaleFactor);
    
    // 确保坐标在有效范围内
    if (pixelX < 0 || pixelX >= thumbnailSize.width || pixelY < 0 || pixelY >= thumbnailSize.height) {
      throw new Error('坐标超出范围');
    }
    
    const width = thumbnailSize.width;
    const pixelIndex = (pixelY * width + pixelX) * 4;
    
    if (bitmap && bitmap.length > pixelIndex + 3) {
      // Electron 的 getBitmap() 在 Windows 上返回 BGRA 格式
      const b = bitmap[pixelIndex];
      const g = bitmap[pixelIndex + 1];
      const r = bitmap[pixelIndex + 2];
      
      // 确保值在 0-255 范围内
      const rClamped = Math.max(0, Math.min(255, r));
      const gClamped = Math.max(0, Math.min(255, g));
      const bClamped = Math.max(0, Math.min(255, b));
      
      const rgbColor = `#${rClamped.toString(16).padStart(2, '0')}${gClamped.toString(16).padStart(2, '0')}${bClamped.toString(16).padStart(2, '0')}`;
      
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: rgbColor });
    } else {
      throw new Error('无法读取像素颜色');
    }
  } catch (err) {
    console.error('取色失败:', err);
    
    const resolve = colorPickResolve;
    colorPickResolve = null;
    
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    resolve({ ok: false, error: String(err) });
  }
});

// 取消取色
ipcMain.on('color-picker-cancel', () => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  const resolve = colorPickResolve;
  colorPickResolve = null;
  
  if (colorPickerWin) {
    colorPickerWin.close();
    colorPickerWin = null;
  }
  
  resolve({ ok: false, error: 'cancelled' });
});


  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// 渲染层可调用的窗口控制（最小化/最大化或还原/关闭）
ipcMain.handle('window/minimize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.minimize();
    try { event.sender.send('window/maxstate', win ? win.isMaximized() : false); } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/toggleMax', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    const maximized = win.isMaximized();
    try { event.sender.send('window/maxstate', maximized); } catch (e) {}
    return { ok: true, maximized };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/close', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.close();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

// 辅助函数：延迟执行
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, ms);
  });
}

<<<<<<< HEAD
// 获取静默更新配置（默认为 false）
function getSilentUpdateEnabled() {
  if (!store) return false;
  return store.get('silentUpdateEnabled', false);
}

=======
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 初始化自动更新
async function initAutoUpdater() {
  if (!autoUpdater) return;
  
  try {
    autoUpdater.disableWebInstaller = false;
<<<<<<< HEAD
    
    // 根据静默更新配置决定是否自动下载
    const silentUpdateEnabled = getSilentUpdateEnabled();
    autoUpdater.autoDownload = silentUpdateEnabled;
    console.log(`[main] 初始化自动更新，静默更新: ${silentUpdateEnabled ? '已启用' : '已禁用'}`);
    console.log(`[main] autoUpdater.autoDownload: ${autoUpdater.autoDownload}`);
    
=======
    // 下载由界面控制，不自动下载
    autoUpdater.autoDownload = false;
    
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    // 设置请求头，确保正确的 User-Agent
    autoUpdater.requestHeaders = {
      'User-Agent': `Metro-PIDS-App/${app.getVersion()} (${process.platform})`
    };
    
    // 开发环境下也允许检查更新
    // electron-updater 在开发模式下会使用 package.json 中的配置
    if (!app.isPackaged) {
      // 开发模式下，可以设置 channel 为 latest 或使用默认配置
      // autoUpdater.channel = 'latest';
      console.log('[main] 开发模式下初始化更新检查，将使用 package.json 中的 GitHub 配置');
    }
    
    // 错误处理
    autoUpdater.on('error', (err) => {
      const errorMsg = String(err);
      const errorDetails = {
        message: errorMsg,
        stack: err.stack,
        code: err.code,
        name: err.name
      };
      if (logger) {
        logger.error(['检查更新失败', errorDetails]);
      } else {
        console.error('检查更新失败:', errorDetails);
<<<<<<< HEAD
=======
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
    // 错误处理
    autoUpdater.on('error', (err) => {
      const errorMsg = String(err);
      if (logger) {
        logger.error(['检查更新失败', errorMsg]);
      } else {
        console.error('检查更新失败:', errorMsg);
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
      }
      try { 
        mainWin && mainWin.webContents.send('update/error', errorMsg); 
      } catch (e) {}
    });
    
    // 有可用更新
    autoUpdater.on('update-available', (info) => {
<<<<<<< HEAD
      const currentVersion = app.getVersion();
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
=======
<<<<<<< HEAD
<<<<<<< HEAD
      const currentVersion = app.getVersion();
      if (logger) {
        logger.info('检查到有更新', { currentVersion, latestVersion: info.version });
        logger.info(info);
      } else {
        console.log('[main] 检查到有更新', { currentVersion, latestVersion: info.version });
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-available 详细信息:', {
        version: info.version,
        currentVersion: currentVersion,
        releaseDate: info.releaseDate,
<<<<<<< HEAD
        path: info.path,
        silentUpdate: silentUpdateEnabled
      });
      
      // 如果启用了静默更新，自动开始下载
      if (silentUpdateEnabled && !autoUpdater.autoDownload) {
        console.log('[main] 静默更新已启用，自动开始下载更新...');
        // 由于 autoDownload 可能为 false，我们需要手动触发下载
        autoUpdater.downloadUpdate().catch(err => {
          console.error('[main] 静默下载更新失败:', err);
          if (logger) {
            logger.error('静默下载更新失败', err);
          }
        });
      }
      
=======
        path: info.path
      });
      
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
      try { 
        // 通知渲染进程有更新可用（用于显示NEW标记）
        mainWin && mainWin.webContents.send('update/available', info);
        // 发送一个特殊事件来标记有更新（用于UI显示）
<<<<<<< HEAD
        mainWin && mainWin.webContents.send('update/has-update', { version: info.version, silentUpdate: silentUpdateEnabled });
      } catch (e) {
        console.error('[main] 发送 update-available 事件失败:', e);
      }
=======
        mainWin && mainWin.webContents.send('update/has-update', { version: info.version });
      } catch (e) {
        console.error('[main] 发送 update-available 事件失败:', e);
      }
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
      if (logger) {
        logger.info('检查到有更新');
        logger.info(info);
      }
      try { 
        mainWin && mainWin.webContents.send('update/available', info); 
      } catch (e) {}
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    });
    
    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
      const currentVersion = app.getVersion();
      if (logger) {
        logger.info('没有可用更新', { currentVersion, info });
      } else {
        console.log('[main] 没有可用更新', { currentVersion, info });
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-not-available 详细信息:', {
        version: info ? info.version : 'N/A',
        currentVersion: currentVersion,
        releaseDate: info ? info.releaseDate : 'N/A',
        path: info ? info.path : 'N/A',
        // 如果 info 中有 updateInfo，也输出
        updateInfo: info ? info.updateInfo : null
      });
      
      // 如果 info 为空或版本号相同，说明确实没有更新
      // 如果版本号不同但没有触发 update-available，可能是版本格式问题
      if (info && info.version) {
        console.log('[main] 版本对比:', {
          current: currentVersion,
          latest: info.version,
          areEqual: currentVersion === info.version,
          // 尝试比较去掉 'v' 前缀的版本
          currentClean: currentVersion.replace(/^v/, ''),
          latestClean: info.version.replace(/^v/, ''),
          areEqualClean: currentVersion.replace(/^v/, '') === info.version.replace(/^v/, '')
        });
      }
      
      try { 
        mainWin && mainWin.webContents.send('update/not-available', info || {}); 
      } catch (e) {
        console.error('[main] 发送 update-not-available 事件失败:', e);
      }
<<<<<<< HEAD
=======
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
      if (logger) {
        logger.info('没有可用更新');
      }
      try { 
        mainWin && mainWin.webContents.send('update/not-available', info); 
      } catch (e) {}
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    });
    
    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      if (logger) {
        logger.info('下载进度:', progress);
      }
      try { 
        mainWin && mainWin.webContents.send('update/progress', progress); 
      } catch (e) {}
    });
    
    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
<<<<<<< HEAD
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('下载完毕！提示安装更新', { silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 下载完成', { version: info.version, silentUpdate: silentUpdateEnabled });
=======
      if (logger) {
        logger.info('下载完毕！提示安装更新');
        logger.info(info);
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
      }
      
      // 检查是否用户已经跳过了当前版本
      if (store) {
        const skippedVersion = store.get('skippedVersion');
        if (info && info.version === skippedVersion) {
          if (logger) {
            logger.info('用户已跳过此版本，不提示更新');
          }
          return;
        }
      }
      
<<<<<<< HEAD
      // 如果启用了静默更新，自动安装
      if (silentUpdateEnabled) {
        console.log('[main] 静默更新模式：下载完成，自动安装更新...');
        if (logger) {
          logger.info('静默更新：下载完成，自动安装更新', { version: info.version });
        }
        
        try {
          // 清除跳过的版本标记
          if (store) {
            store.delete('skippedVersion');
          }
          
          // 延迟一小段时间，确保下载完全完成，然后自动安装
          setTimeout(() => {
            try {
              console.log('[main] 执行自动安装更新...');
              // quitAndInstall(isSilent, isForceRunAfter)
              // isSilent: true = 静默安装（Windows 需要 NSIS 配置支持）
              // isForceRunAfter: true = 安装完成后自动运行应用
              autoUpdater.quitAndInstall(true, true);
              if (logger) {
                logger.info('已调用 quitAndInstall(true, true)，应用将退出并静默安装更新');
              }
            } catch (installErr) {
              console.error('[main] 自动安装更新失败:', installErr);
              if (logger) {
                logger.error('自动安装更新失败', installErr);
              }
              // 如果自动安装失败，发送通知给用户
              try {
                mainWin && mainWin.webContents.send('update/downloaded', info);
              } catch (e) {}
            }
          }, 1000); // 延迟 1 秒
        } catch (e) {
          console.error('[main] 静默更新自动安装处理失败:', e);
          if (logger) {
            logger.error('静默更新自动安装处理失败', e);
          }
          // 如果出错，发送通知给用户
          try {
            mainWin && mainWin.webContents.send('update/downloaded', info);
          } catch (sendErr) {}
        }
      } else {
        // 非静默模式，发送通知给用户
        try { 
          mainWin && mainWin.webContents.send('update/downloaded', info); 
        } catch (e) {}
      }
=======
      try { 
        mainWin && mainWin.webContents.send('update/downloaded', info); 
      } catch (e) {}
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    });
  } catch (e) {
    if (logger) {
      logger.error('autoUpdater setup failed', e);
    } else {
      console.warn('autoUpdater setup failed', e);
    }
  }
}

app.whenReady().then(async () => {
  createWindow();
  
  // 初始化自动更新
  await initAutoUpdater();
  
  // 延迟检查更新，确保窗口准备完成
  scheduleAutoUpdateCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

<<<<<<< HEAD
// 检查 Gitee 更新（自定义逻辑，因为 electron-updater 不支持 Gitee）
async function checkGiteeUpdate() {
  try {
    const https = require('https');
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    const currentVersion = app.getVersion().replace(/^v/, ''); // 移除可能的 v 前缀
    
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            if (!Array.isArray(releases) || releases.length === 0) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-releases' });
              return;
            }
            
            // 获取最新的非预发布版本
            const latestRelease = releases.find(r => !r.prerelease) || releases[0];
            if (!latestRelease || !latestRelease.tag_name) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-valid-release' });
              return;
            }
            
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            const needsUpdate = latestVersion !== currentVersion;
            
            console.log('[main] Gitee 更新检查:', {
              current: currentVersion,
              latest: latestVersion,
              needsUpdate: needsUpdate
            });
            
            if (needsUpdate) {
              // 检查是否启用了静默更新
              const silentUpdateEnabled = getSilentUpdateEnabled();
              
              // 发送更新可用事件
              try {
                const updateInfo = {
                  version: latestVersion,
                  releaseDate: latestRelease.created_at,
                  releaseNotes: latestRelease.body,
                  releaseUrl: latestRelease.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${latestRelease.tag_name}`,
                  assets: latestRelease.assets || []
                };
                mainWin && mainWin.webContents.send('update/available', updateInfo);
                mainWin && mainWin.webContents.send('update/has-update', { version: latestVersion, silentUpdate: silentUpdateEnabled });
                
                // 如果启用了静默更新，自动触发下载（通过调用 update/download IPC）
                if (silentUpdateEnabled) {
                  console.log('[main] Gitee 静默更新已启用，自动开始下载更新...');
                  // 注意：Gitee 的下载需要通过自定义逻辑实现，这里只是触发事件通知前端
                  // 前端可以监听 update/available 事件，如果 silentUpdate 为 true，则自动调用 downloadUpdate
                }
              } catch (e) {
                console.error('[main] 发送 Gitee 更新事件失败:', e);
              }
              
              resolve({ ok: true, hasUpdate: true, version: latestVersion, release: latestRelease, silentUpdate: silentUpdateEnabled });
            } else {
              // 发送无更新事件
              try {
                mainWin && mainWin.webContents.send('update/not-available', { version: currentVersion });
              } catch (e) {}
              resolve({ ok: true, hasUpdate: false, reason: 'already-latest' });
            }
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            reject(new Error('解析失败: ' + String(e)));
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        reject(err);
      });
    });
  } catch (e) {
    throw new Error('检查 Gitee 更新失败: ' + String(e));
  }
}

// 供渲染层触发更新动作的 IPC
ipcMain.handle('update/check', async () => {
  console.log('[main] update/check: 收到检查更新请求');
  
  const updateSource = getUpdateSource();
  console.log('[main] update/check: 更新源:', updateSource);
  
  // 如果使用 Gitee，使用自定义检查逻辑
  if (updateSource === 'gitee') {
    try {
      const result = await checkGiteeUpdate();
      return { ok: true, source: 'gitee', ...result };
    } catch (e) {
      const errorDetails = {
        message: String(e),
        stack: e.stack,
        code: e.code,
        name: e.name
      };
      console.error('[main] Gitee update/check error:', errorDetails);
      if (logger) {
        logger.error('Gitee update/check error:', errorDetails);
      }
      
      try {
        mainWin && mainWin.webContents.send('update/error', String(e));
      } catch (sendErr) {
        console.error('[main] 发送更新错误事件失败:', sendErr);
      }
      
      return { ok: false, error: String(e), source: 'gitee' };
    }
  }
  
  // 使用 GitHub（electron-updater）
  console.log('[main] update/check: autoUpdater 状态:', autoUpdater ? '已加载' : '未加载');
  console.log('[main] update/check: app.isPackaged:', app.isPackaged);
  
  // 开发模式下也允许检查更新
  if (!app.isPackaged) {
    console.log('[main] update/check: 当前为开发模式，将检查 GitHub releases 是否有新版本');
    // 开发模式下，electron-updater 会使用 package.json 中的配置来检查更新
  }
  
  if (!autoUpdater) {
    console.error('[main] update/check: autoUpdater is null');
    console.error('[main] update/check: 尝试重新加载 electron-updater...');
    
    // 尝试重新加载
    try {
      delete require.cache[require.resolve('electron-updater')];
      const updater = require('electron-updater');
      autoUpdater = updater.autoUpdater;
      console.log('[main] update/check: 重新加载成功，autoUpdater:', autoUpdater ? '已加载' : '未加载');
      
      if (autoUpdater) {
        // 重新初始化配置
        autoUpdater.disableWebInstaller = false;
        const silentUpdateEnabled = getSilentUpdateEnabled();
        autoUpdater.autoDownload = silentUpdateEnabled;
        if (logger) {
          autoUpdater.logger = logger;
        }
        // 重新绑定事件监听（如果之前已经绑定过，这里会重复绑定，但不影响功能）
        await initAutoUpdater();
      }
    } catch (e) {
      console.error('[main] update/check: 重新加载失败:', e);
      console.error('[main] update/check: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
    }
    
    if (!autoUpdater) {
      return { ok: false, error: 'autoUpdater 未加载，请确保应用已正确打包' };
    }
  }
  
  try {
    console.log('[main] update/check: checking for updates...');
    console.log('[main] app.getVersion():', app.getVersion());
    
    // 检查更新配置
    if (autoUpdater.config) {
      console.log('[main] updater config:', {
        provider: autoUpdater.config.provider,
        owner: autoUpdater.config.owner,
        repo: autoUpdater.config.repo,
        channel: autoUpdater.config.channel
      });
    } else {
      if (app.isPackaged) {
        console.warn('[main] updater config 为空，将使用 app-update.yml 中的配置');
      } else {
        console.log('[main] 开发模式：将使用 package.json 中的 build.publish 配置检查更新');
        console.log('[main] GitHub 仓库:', 'tanzhouxkong/Metro-PIDS-');
      }
    }
    
    // 强制刷新更新检查
    // electron-updater 会在每次 checkForUpdates 时自动检查 GitHub releases
    // 但为了确保获取最新信息，我们使用 checkForUpdates() 而不是缓存的检查结果
    console.log('[main] 开始检查 GitHub releases...');
    const checkPromise = autoUpdater.checkForUpdates();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('检查更新超时（30秒）')), 30000)
    );
    
    const result = await Promise.race([checkPromise, timeoutPromise]);
    console.log('[main] checkForUpdates result:', result);
    
    // 输出详细信息用于调试
    if (result && result.updateInfo) {
      console.log('[main] 检查到的更新信息:', {
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        path: result.updateInfo.path,
        sha512: result.updateInfo.sha512
      });
      console.log('[main] 当前应用版本:', app.getVersion());
      console.log('[main] 版本比较:', {
        current: app.getVersion(),
        latest: result.updateInfo.version,
        needsUpdate: result.updateInfo.version !== app.getVersion()
      });
    }
    
    // 如果返回了 result，说明检查已完成，但事件可能稍后触发
    // 所以这里只返回成功，实际结果通过事件通知
    return { ok: true, source: 'github' };
  } catch (e) {
=======
// 供渲染层触发更新动作的 IPC
ipcMain.handle('update/check', async () => {
  console.log('[main] update/check: 收到检查更新请求');
  console.log('[main] update/check: autoUpdater 状态:', autoUpdater ? '已加载' : '未加载');
  console.log('[main] update/check: app.isPackaged:', app.isPackaged);
  
  // 开发模式下也允许检查更新
  if (!app.isPackaged) {
    console.log('[main] update/check: 当前为开发模式，将检查 GitHub releases 是否有新版本');
    // 开发模式下，electron-updater 会使用 package.json 中的配置来检查更新
  }
  
  if (!autoUpdater) {
    console.error('[main] update/check: autoUpdater is null');
    console.error('[main] update/check: 尝试重新加载 electron-updater...');
    
    // 尝试重新加载
    try {
      delete require.cache[require.resolve('electron-updater')];
      const updater = require('electron-updater');
      autoUpdater = updater.autoUpdater;
      console.log('[main] update/check: 重新加载成功，autoUpdater:', autoUpdater ? '已加载' : '未加载');
      
      if (autoUpdater) {
        // 重新初始化配置
        autoUpdater.disableWebInstaller = false;
        autoUpdater.autoDownload = false;
        if (logger) {
          autoUpdater.logger = logger;
        }
        // 重新绑定事件监听（如果之前已经绑定过，这里会重复绑定，但不影响功能）
        await initAutoUpdater();
      }
    } catch (e) {
      console.error('[main] update/check: 重新加载失败:', e);
      console.error('[main] update/check: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
    }
    
    if (!autoUpdater) {
      return { ok: false, error: 'autoUpdater 未加载，请确保应用已正确打包' };
    }
  }
  
  try {
    console.log('[main] update/check: checking for updates...');
    console.log('[main] app.getVersion():', app.getVersion());
    
    // 检查更新配置
    if (autoUpdater.config) {
      console.log('[main] updater config:', {
        provider: autoUpdater.config.provider,
        owner: autoUpdater.config.owner,
        repo: autoUpdater.config.repo,
        channel: autoUpdater.config.channel
      });
    } else {
      if (app.isPackaged) {
        console.warn('[main] updater config 为空，将使用 app-update.yml 中的配置');
      } else {
        console.log('[main] 开发模式：将使用 package.json 中的 build.publish 配置检查更新');
        console.log('[main] GitHub 仓库:', 'tanzhouxkong/Metro-PIDS-');
      }
    }
    
    // 强制刷新更新检查
    // electron-updater 会在每次 checkForUpdates 时自动检查 GitHub releases
    // 但为了确保获取最新信息，我们使用 checkForUpdates() 而不是缓存的检查结果
    console.log('[main] 开始检查 GitHub releases...');
    const checkPromise = autoUpdater.checkForUpdates();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('检查更新超时（30秒）')), 30000)
    );
    
    const result = await Promise.race([checkPromise, timeoutPromise]);
    console.log('[main] checkForUpdates result:', result);
    
    // 输出详细信息用于调试
    if (result && result.updateInfo) {
      console.log('[main] 检查到的更新信息:', {
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        path: result.updateInfo.path,
        sha512: result.updateInfo.sha512
      });
      console.log('[main] 当前应用版本:', app.getVersion());
      console.log('[main] 版本比较:', {
        current: app.getVersion(),
        latest: result.updateInfo.version,
        needsUpdate: result.updateInfo.version !== app.getVersion()
      });
    }
    
    // 如果返回了 result，说明检查已完成，但事件可能稍后触发
    // 所以这里只返回成功，实际结果通过事件通知
    return { ok: true };
  } catch (e) {
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    const errorDetails = {
      message: String(e),
      stack: e.stack,
      code: e.code,
      name: e.name
    };
    console.error('[main] update/check error:', errorDetails);
    if (logger) {
      logger.error('update/check error:', errorDetails);
    }
    
    // 尝试发送错误事件给渲染进程
    try {
      mainWin && mainWin.webContents.send('update/error', String(e));
    } catch (sendErr) {
      console.error('[main] 发送更新错误事件失败:', sendErr);
    }
    
<<<<<<< HEAD
    return { ok: false, error: String(e), source: 'github' };
=======
    return { ok: false, error: String(e) };
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  }
});

// 清除所有可能的缓存目录
async function clearUpdaterCache() {
  const os = require('os');
  const platform = process.platform;
  const cacheDirs = [];
  
  if (platform === 'win32') {
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'metro-pids-updater'));
    cacheDirs.push(path.join(app.getPath('userData'), 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Roaming', 'metro-pids-updater'));
    // electron-updater 默认缓存位置（基于 appId）
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else if (platform === 'darwin') {
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else {
    cacheDirs.push(path.join(os.homedir(), '.cache', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), '.cache', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  }
  
  let clearedCount = 0;
  for (const cacheDir of cacheDirs) {
    try {
      if (fs.existsSync(cacheDir)) {
        console.log(`[main] 清除缓存目录: ${cacheDir}`);
        await fsPromises.rm(cacheDir, { recursive: true, force: true });
        clearedCount++;
      }
    } catch (dirErr) {
      console.warn(`[main] 清除缓存目录失败 ${cacheDir}:`, dirErr);
    }
  }
  
  return clearedCount;
}

ipcMain.handle('update/download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[main] update/download: 开始下载更新... (尝试 ${attempt}/${maxRetries})`);
      
      // 如果是重试，先清除之前的下载缓存
      if (attempt > 1) {
        console.log('[main] update/download: 清除之前的下载缓存...');
        const clearedCount = await clearUpdaterCache();
        if (clearedCount > 0) {
          console.log(`[main] update/download: 已清除 ${clearedCount} 个缓存目录`);
          // 等待确保缓存清理完成
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('[main] update/download: 未找到缓存目录');
        }
      }
      
      // 使用 Promise 来捕获错误事件和异常
      const downloadPromise = new Promise((resolve, reject) => {
        let downloadError = null;
        let downloaded = false;
        let timeout = null;
        
        // 监听下载进度，用于诊断
        let lastProgressPercent = 0;
        const progressHandler = (progress) => {
          const percent = Math.round(progress.percent || 0);
          if (percent !== lastProgressPercent && percent % 10 === 0) {
            // 每10%记录一次日志
            console.log(`[main] update/download: 下载进度 ${percent}% (${progress.transferred || 0}/${progress.total || 0} bytes)`);
            lastProgressPercent = percent;
          }
        };
        
        // 清理函数
        const cleanup = () => {
          if (timeout) clearTimeout(timeout);
          try {
            autoUpdater.removeListener('error', errorHandler);
            autoUpdater.removeListener('update-downloaded', downloadedHandler);
            autoUpdater.removeListener('download-progress', progressHandler);
          } catch (e) {}
        };
        
        // 监听错误事件（注意：error 事件可能会在下载过程中多次触发）
        const errorHandler = (err) => {
          const errorMsg = String(err);
          console.error('[main] update/download: 收到错误事件:', errorMsg);
          console.error('[main] update/download: 错误对象详情:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            name: err.name,
            errno: err.errno,
            syscall: err.syscall
          });
          
          // 如果是校验和错误，标记为需要重试
          if (errorMsg.includes('checksum') || errorMsg.includes('sha512')) {
            downloadError = new Error(errorMsg);
            downloadError.isChecksumError = true;
            cleanup();
            reject(downloadError);
          } else {
            downloadError = new Error(errorMsg);
          }
        };
        
        // 监听下载完成事件
        const downloadedHandler = (info) => {
          downloaded = true;
          console.log('[main] update/download: 收到下载完成事件:', info);
          cleanup();
          resolve(info);
        };
        
        // 设置超时（10分钟，给大文件下载更多时间）
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error('下载超时（10分钟）'));
        }, 10 * 60 * 1000);
        
        // 绑定事件监听器（使用 once 确保只触发一次）
        autoUpdater.once('error', errorHandler);
        autoUpdater.once('update-downloaded', downloadedHandler);
        autoUpdater.on('download-progress', progressHandler);
        
        // 开始下载
        autoUpdater.downloadUpdate().then(() => {
          // downloadUpdate 返回的 Promise 通常只表示开始下载，不表示完成
          // 真正的完成和错误通过事件通知
          console.log('[main] update/download: downloadUpdate() 调用完成，等待事件...');
        }).catch((err) => {
          cleanup();
          reject(err);
        });
      });
      
      await downloadPromise;
      console.log('[main] update/download: 下载完成');
      return { ok: true };
    } catch (e) {
      lastError = e;
      const errorMsg = String(e);
      const isChecksumError = errorMsg.includes('checksum') || errorMsg.includes('sha512') || e.isChecksumError;
      
      console.error(`[main] update/download: 下载失败 (尝试 ${attempt}/${maxRetries}):`, errorMsg);
      console.error('[main] update/download: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code,
        name: e.name,
        isChecksumError: isChecksumError
      });
      
      if (isChecksumError && attempt < maxRetries) {
        console.log(`[main] update/download: 检测到校验和错误，将在 ${attempt * 2} 秒后重试...`);
        // 通知渲染进程正在重试
        try {
          mainWin && mainWin.webContents.send('update/progress', { 
            percent: 0, 
            retrying: true, 
            attempt: attempt + 1,
            maxRetries: maxRetries
          });
        } catch (sendErr) {}
        
        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // 递增延迟：2秒、4秒
        continue;
      }
      
      // 如果不是校验和错误，或者已经达到最大重试次数，直接返回错误
      if (logger) {
        logger.error('下载更新失败', {
          attempt,
          maxRetries,
          message: errorMsg,
          stack: e.stack,
          code: e.code,
          name: e.name,
          isChecksumError: isChecksumError
        });
      }
      
      // 如果是最后一次尝试，返回详细错误
      if (attempt === maxRetries) {
        return { 
          ok: false, 
          error: errorMsg,
          attempts: attempt,
          isChecksumError: isChecksumError
        };
      }
    }
  }
  
  // 理论上不会到达这里，但为了安全起见
  return { ok: false, error: lastError ? String(lastError) : '未知错误' };
});

// 清除更新缓存并重新下载
ipcMain.handle('update/clear-cache-and-download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    console.log('[main] update/clear-cache-and-download: 清除缓存并重新下载...');
    
    // 清除所有缓存
    const clearedCount = await clearUpdaterCache();
    if (clearedCount > 0) {
      console.log(`[main] 已清除 ${clearedCount} 个缓存目录`);
    } else {
      console.log('[main] 未找到缓存目录');
    }
    
    // 等待确保缓存清理完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 重新下载（这里不使用重试循环，因为用户主动触发的）
    await autoUpdater.downloadUpdate();
    console.log('[main] update/clear-cache-and-download: 重新下载完成');
    return { ok: true };
  } catch (e) {
    const errorMsg = String(e);
    console.error('[main] update/clear-cache-and-download: 失败:', errorMsg);
    
    if (logger) {
      logger.error('清除缓存并重新下载失败', {
        message: errorMsg,
        stack: e.stack,
        code: e.code,
        name: e.name
      });
    }
    
    return { ok: false, error: errorMsg };
  }
});

ipcMain.handle('update/install', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    // 安装的时候如果设置过 skippedVersion, 需要清除掉
    if (store) {
      store.delete('skippedVersion');
    }
    
    if (logger) {
      logger.info('退出应用，安装开始！');
    }
    
    // 开发环境 quitAndInstall 可能抛错，需包裹
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 获取 GitHub Releases 列表（用于显示更新日志）
ipcMain.handle('github/get-releases', async () => {
  try {
    const https = require('https');
    const url = 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.published_at,
              html_url: release.html_url,
              prerelease: release.prerelease,
              draft: release.draft
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 GitHub Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 GitHub Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

<<<<<<< HEAD
// 获取 Gitee Releases 列表（用于显示更新日志和检查更新）
ipcMain.handle('gitee/get-releases', async () => {
  try {
    const https = require('https');
    // Gitee API v5: GET /api/v5/repos/{owner}/{repo}/releases
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // Gitee API 返回格式与 GitHub 略有不同，进行适配
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.created_at || release.published_at, // Gitee 使用 created_at
              html_url: release.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${release.tag_name}`,
              prerelease: release.prerelease || false,
              draft: release.draft || false,
              assets: release.assets || [] // 包含下载文件信息
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 检查更新源配置（从存储中读取，默认为 'github'）
function getUpdateSource() {
  if (!store) return 'github';
  return store.get('updateSource', 'github'); // 'github' 或 'gitee'
}

// 设置更新源配置
ipcMain.handle('update/set-source', async (event, source) => {
  if (!store) return { ok: false, error: 'no-store' };
  if (source !== 'github' && source !== 'gitee') {
    return { ok: false, error: 'invalid-source' };
  }
  store.set('updateSource', source);
  console.log(`[main] 更新源已设置为: ${source}`);
  return { ok: true };
});

// 获取更新源配置
ipcMain.handle('update/get-source', async () => {
  return { ok: true, source: getUpdateSource() };
});

// 设置静默更新配置
ipcMain.handle('update/set-silent', async (event, enabled) => {
  if (!store) return { ok: false, error: 'no-store' };
  const silentEnabled = Boolean(enabled);
  store.set('silentUpdateEnabled', silentEnabled);
  console.log(`[main] 静默更新已${silentEnabled ? '启用' : '禁用'}`);
  
  // 如果启用了静默更新，更新 autoUpdater 配置
  if (autoUpdater) {
    autoUpdater.autoDownload = silentEnabled;
    console.log(`[main] autoUpdater.autoDownload 已设置为: ${silentEnabled}`);
  }
  
  return { ok: true };
});

// 获取静默更新配置
ipcMain.handle('update/get-silent', async () => {
  return { ok: true, enabled: getSilentUpdateEnabled() };
});

=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 跳过版本更新
ipcMain.handle('update/skip-version', async (event, version) => {
  if (store && version) {
    store.set('skippedVersion', version);
    if (logger) {
      logger.info('用户跳过版本:', version);
    }
    return { ok: true };
  }
  return { ok: false, error: 'no-store-or-version' };
});

<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
// 自动检查更新：启动时执行（包括开发环境）
async function scheduleAutoUpdateCheck() {
  if (!autoUpdater) {
    console.log('[main] scheduleAutoUpdateCheck: autoUpdater is null');
    return;
  }
  
  // 开发环境和打包环境都执行自动检查
  console.log('[main] scheduleAutoUpdateCheck: 准备检查更新 (开发模式:', !app.isPackaged, ')');
  
  console.log('[main] scheduleAutoUpdateCheck: starting...');
  console.log('[main] app version:', app.getVersion());
<<<<<<< HEAD
=======
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
// 自动检查更新：仅打包且存在 autoUpdater 时执行
async function scheduleAutoUpdateCheck() {
  if (!autoUpdater) return;
  if (!app.isPackaged) return;
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
  
  // 等待 3 秒再检查更新，确保窗口准备完成，用户进入系统
  await sleep(3000);
  
  try {
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    console.log('[main] scheduleAutoUpdateCheck: calling checkForUpdates...');
    const result = await autoUpdater.checkForUpdates();
    console.log('[main] scheduleAutoUpdateCheck: result:', result);
  } catch (err) {
    const errorDetails = {
      message: String(err),
      stack: err.stack,
      code: err.code,
      name: err.name
    };
    if (logger) {
      logger.error('自动检查更新失败:', errorDetails);
    } else {
      console.error('[main] 自动检查更新失败:', errorDetails);
    }
    try { 
      mainWin && mainWin.webContents.send('update/error', String(err)); 
<<<<<<< HEAD
=======
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const errorMsg = String(err);
    if (logger) {
      logger.error('自动检查更新失败:', errorMsg);
    }
    try { 
      mainWin && mainWin.webContents.send('update/error', errorMsg); 
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    } catch (e) {}
  }
}

function createDisplayWindow(width, height) {
  // 已存在则可选调整尺寸并聚焦
  if (displayWin && !displayWin.isDestroyed()) {
    try {
      if (typeof width === 'number' && typeof height === 'number') {
        displayWin.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)));
      }
      displayWin.focus();
    } catch (e) {
      // 忽略尺寸设置异常
    }
    return displayWin;
  }

  // 计算适配缩放后的窗口尺寸
  // 始终使用内容尺寸（1900x600）作为窗口的逻辑尺寸，确保在所有缩放比例下显示内容一致
  // 无论系统缩放是多少（100%, 125%, 150%, 200%, 250%, 300%等），窗口逻辑尺寸都保持1900×600
  const contentWidth = 1900;
  const contentHeight = 600;
  
  // 窗口逻辑尺寸始终与内容尺寸一致，不受系统缩放影响
  // 这样可以确保在所有缩放比例下，显示的内容范围都是一样的
  let logicalWidth, logicalHeight;
  if (typeof width === 'number' && typeof height === 'number') {
    // 如果传入了尺寸参数，使用传入的尺寸
    logicalWidth = Math.max(100, Math.floor(width));
    logicalHeight = Math.max(100, Math.floor(height));
  } else {
    // 始终使用内容尺寸，不受系统缩放影响
    logicalWidth = contentWidth;
    logicalHeight = contentHeight;
  }
  
  // 确保尺寸为4的倍数，以避免在高DPI下的渲染问题
  const adjustedWidth = Math.ceil(logicalWidth / 4) * 4;
  const adjustedHeight = Math.ceil(logicalHeight / 4) * 4;

  const opts = {
<<<<<<< HEAD
    width: adjustedWidth,
    height: adjustedHeight,
    useContentSize: false, // 使用窗口尺寸，确保窗口逻辑尺寸与内容尺寸完全匹配
=======
<<<<<<< HEAD
    width: adjustedWidth,
    height: adjustedHeight,
    useContentSize: false, // 使用窗口尺寸，确保窗口逻辑尺寸与内容尺寸完全匹配
=======
    width: typeof width === 'number' ? Math.max(100, Math.floor(width)) : 2371,
    height: typeof height === 'number' ? Math.max(100, Math.floor(height)) : 810,
    useContentSize: true,
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
    frame: false, // 无边框，移除系统标题栏
    titleBarStyle: 'hidden',
    resizable: false,
    show: true,
    skipTaskbar: false,
    title: 'Metro PIDS - Display',
    // 顶级窗口（无父级），以独立原生窗口呈现
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 禁用自动缩放，使用CSS transform来控制缩放
      zoomFactor: 1.0,
      // 允许高DPI支持
      enableBlinkFeatures: ''
    }
  };

  displayWin = new BrowserWindow(opts);

  const dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
  displayWin.loadURL(dispPath);
  
  // 确保缩放因子始终为1.0，禁用Electron的自动缩放
  displayWin.webContents.setZoomFactor(1.0);
  
  // 监听缩放变化事件，确保始终保持1.0缩放
  displayWin.webContents.on('did-finish-load', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });
  
  // 监听窗口显示事件，再次确保缩放正确
  displayWin.on('show', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });

  displayWin.on('closed', () => {
    displayWin = null;
  });

  return displayWin;
}

// 辅助：显示带模糊背景的自定义 Electron 警告/确认弹窗
function showElectronAlert({ parent, type = 'alert', title = '提示', msg = '' } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const modal = new BrowserWindow({
        parent: parent || null,
        modal: !!parent,
        width: 680,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        frame: true,
        show: false,
        transparent: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: true
        }
      });

      const id = Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
      const url = `file://${path.join(__dirname, 'electron_alert.html')}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}`;

      let _blurApplied = false;
      const applyParentBlur = (enable) => {
        try {
          if (!parent) return;
          if (typeof parent.setVisualEffectState === 'function') {
            parent.setVisualEffectState(enable ? 'active' : 'inactive');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'darwin' && typeof parent.setVibrancy === 'function') {
            parent.setVibrancy(enable ? 'fullscreen-ui' : 'none');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'win32' && typeof parent.setBackgroundMaterial === 'function') {
            parent.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
            _blurApplied = enable;
            return;
          }
        } catch (e) {
      // 忽略
        }
      };

      const cleanup = () => {
        try { modal.removeAllListeners(); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
      };

      const responseHandler = (event, data) => {
        try {
          if (!data || data.id !== id) return;
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(!!data.result);
        } catch (e) {
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(false);
        }
      };

      ipcMain.once('electron-alert-response', responseHandler);

      modal.once('ready-to-show', () => {
        try { applyParentBlur(true); } catch (e) {}
        try { modal.show(); } catch (e) {}
      });

      modal.on('closed', () => {
        // 若未返回结果即关闭，视为取消/false
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
        resolve(false);
      });

      modal.loadURL(url).catch((e) => {
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { modal.close(); } catch (e) {}
        reject(e);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// 创建线路管理器窗口
function createLineManagerWindow() {
  if (lineManagerWin && !lineManagerWin.isDestroyed()) {
    lineManagerWin.focus();
    return;
  }
  
  lineManagerWin = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    frame: false, // 无边框，应用自绘标题栏
    titleBarStyle: 'hidden',
    transparent: false,
    resizable: true,
    // 移除 parent，使其成为独立窗口
    // 移除 skipTaskbar，使其在任务栏显示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  const lineManagerPath = `file://${path.join(__dirname, 'line_manager_window.html')}`;
  lineManagerWin.loadURL(lineManagerPath);

  lineManagerWin.once('ready-to-show', () => {
    lineManagerWin.show();
    if (!app.isPackaged) {
      lineManagerWin.webContents.openDevTools();
    }
  });

  lineManagerWin.on('closed', () => {
    lineManagerWin = null;
  });
}

// 处理线路管理器的线路切换请求
ipcMain.handle('line-manager/switch-line', async (event, lineName) => {
  try {
    // 通知主窗口切换线路
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('switch-line-request', lineName);
      // 关闭线路管理器窗口
      if (lineManagerWin && !lineManagerWin.isDestroyed()) {
        lineManagerWin.close();
      }
      return { ok: true };
    }
    return { ok: false, error: '主窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 处理关闭窗口请求
ipcMain.handle('line-manager/close', async (event) => {
  try {
    if (lineManagerWin && !lineManagerWin.isDestroyed()) {
      lineManagerWin.close();
      return { ok: true };
    }
    return { ok: false, error: '窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
