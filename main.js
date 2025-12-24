const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;

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
  const updater = require('electron-updater');
  autoUpdater = updater.autoUpdater;
  // 配置日志
  if (logger && autoUpdater) {
    autoUpdater.logger = logger;
  }
} catch (e) {
  autoUpdater = null;
}

let mainWin = null;
let displayWin = null;

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

  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

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
  return path.join(app.getPath('userData'), 'lines');
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // 忽略错误
  }
}

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
    return files;
  } catch (err) {
    return { error: String(err) };
  }
});

// 读取单个线路文件（支持子文件夹路径）
ipcMain.handle('lines/read', async (event, filename, dir) => {
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

// 删除线路文件
ipcMain.handle('lines/delete', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
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

// 初始化自动更新
async function initAutoUpdater() {
  if (!autoUpdater) return;
  
  try {
    autoUpdater.disableWebInstaller = false;
    // 下载由界面控制，不自动下载
    autoUpdater.autoDownload = false;
    
    // 错误处理
    autoUpdater.on('error', (err) => {
      const errorMsg = String(err);
      if (logger) {
        logger.error(['检查更新失败', errorMsg]);
      } else {
        console.error('检查更新失败:', errorMsg);
      }
      try { 
        mainWin && mainWin.webContents.send('update/error', errorMsg); 
      } catch (e) {}
    });
    
    // 有可用更新
    autoUpdater.on('update-available', (info) => {
      if (logger) {
        logger.info('检查到有更新');
        logger.info(info);
      }
      try { 
        mainWin && mainWin.webContents.send('update/available', info); 
      } catch (e) {}
    });
    
    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
      if (logger) {
        logger.info('没有可用更新');
      }
      try { 
        mainWin && mainWin.webContents.send('update/not-available', info); 
      } catch (e) {}
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
      if (logger) {
        logger.info('下载完毕！提示安装更新');
        logger.info(info);
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
      
      try { 
        mainWin && mainWin.webContents.send('update/downloaded', info); 
      } catch (e) {}
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

// 供渲染层触发更新动作的 IPC
ipcMain.handle('update/check', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('update/download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
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

// 自动检查更新：仅打包且存在 autoUpdater 时执行
async function scheduleAutoUpdateCheck() {
  if (!autoUpdater) return;
  if (!app.isPackaged) return;
  
  // 等待 3 秒再检查更新，确保窗口准备完成，用户进入系统
  await sleep(3000);
  
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const errorMsg = String(err);
    if (logger) {
      logger.error('自动检查更新失败:', errorMsg);
    }
    try { 
      mainWin && mainWin.webContents.send('update/error', errorMsg); 
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

  const opts = {
    width: typeof width === 'number' ? Math.max(100, Math.floor(width)) : 2371,
    height: typeof height === 'number' ? Math.max(100, Math.floor(height)) : 810,
    useContentSize: true,
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
      nodeIntegration: false
    }
  };

  displayWin = new BrowserWindow(opts);

  const dispPath = `file://${path.join(__dirname, 'display_window.html')}`;
  displayWin.loadURL(dispPath);

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
