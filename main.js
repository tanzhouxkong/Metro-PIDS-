const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
let autoUpdater = null;
try {
  // electron-updater is only available after install; require safely
  // eslint-disable-next-line global-require
  const updater = require('electron-updater');
  autoUpdater = updater.autoUpdater;
} catch (e) {
  autoUpdater = null;
}

let mainWin = null;
let displayWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false, // frameless so app provides custom titlebar
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

  // Make main window frameless so we can fully replace system controls
  // Note: frameless windows require a draggable region in the renderer (CSS -webkit-app-region: drag)
  // We set it here by recreating BrowserWindow with frame:false
  // (If mainWin was already created above, this new option is effective only on creation.)

  // Intercept window.open from renderer to create a controlled BrowserWindow
  mainWin.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    try {
      const u = url.toString();
      if (u.endsWith('display_window.html') || u.includes('display_window.html')) {
        createDisplayWindow();
        return { action: 'deny' };
      }
    } catch (e) {
      // ignore
    }
    return { action: 'allow' };
  });

  // Expose IPC to open display window from renderer
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

  // Broadcast maximize/unmaximize events so renderer can update UI
  mainWin.on('maximize', () => {
    try { mainWin.webContents.send('window/maxstate', true); } catch (e) {}
  });
  mainWin.on('unmaximize', () => {
    try { mainWin.webContents.send('window/maxstate', false); } catch (e) {}
  });

  // Send initial maximize state after window is ready
  mainWin.once('ready-to-show', () => {
    try { mainWin.webContents.send('window/maxstate', mainWin.isMaximized()); } catch (e) {}
  });

// Helper: default lines directory under userData
function getLinesDir(dir) {
  if (dir && typeof dir === 'string' && dir.length > 0) return dir;
  return path.join(app.getPath('userData'), 'lines');
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

// List line files (JSON). Returns array of { name, version, mtime }
ipcMain.handle('lines/list', async (event, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  try {
    const files = await fsPromises.readdir(base);
    const out = [];
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue;
      try {
        const fp = path.join(base, f);
        const stat = await fsPromises.stat(fp);
        const txt = await fsPromises.readFile(fp, 'utf8');
        let json = null;
        try { json = JSON.parse(txt); } catch (e) { json = null; }
        const version = json && json.meta && json.meta.version ? json.meta.version : null;
        out.push({ name: path.basename(f, '.json'), version, mtime: stat.mtimeMs });
      } catch (e) {
        // skip file on error
      }
    }
    return out;
  } catch (err) {
    return { error: String(err) };
  }
});

// Read a single line file
ipcMain.handle('lines/read', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Save a line file with simple version handling
ipcMain.handle('lines/save', async (event, filename, contentObj, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  const fp = path.join(base, name);
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
      contentObj.meta.version = existingVer + 1; // bump
    }
    // Write file
    await fsPromises.writeFile(fp, JSON.stringify(contentObj, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Delete a line file
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

// Open lines folder in OS file manager
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

// Open external URLs in user's default browser
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false, error: 'invalid-url' };
    const result = await shell.openExternal(url);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Provide app version to renderer
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

// Window control handlers for renderer to call (minimize, maximize/restore, close)
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

app.whenReady().then(() => {
  createWindow();
  // Setup auto-updater if available and running in packaged app
  if (autoUpdater) {
    try {
      autoUpdater.autoDownload = false; // we'll control when to download
      autoUpdater.on('error', (err) => {
        try { mainWin && mainWin.webContents.send('update/error', String(err)); } catch (e) {}
      });
      autoUpdater.on('update-available', (info) => {
        try { mainWin && mainWin.webContents.send('update/available', info); } catch (e) {}
      });
      autoUpdater.on('update-not-available', (info) => {
        try { mainWin && mainWin.webContents.send('update/not-available', info); } catch (e) {}
      });
      autoUpdater.on('download-progress', (progress) => {
        try { mainWin && mainWin.webContents.send('update/progress', progress); } catch (e) {}
      });
      autoUpdater.on('update-downloaded', (info) => {
        try { mainWin && mainWin.webContents.send('update/downloaded', info); } catch (e) {}
      });
    } catch (e) {
      console.warn('autoUpdater setup failed', e);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers to trigger update actions from renderer
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
    // quitAndInstall may throw in dev; wrap safely
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

function createDisplayWindow(width, height) {
  // If window exists, optionally resize and focus
  if (displayWin && !displayWin.isDestroyed()) {
    try {
      if (typeof width === 'number' && typeof height === 'number') {
        displayWin.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)));
      }
      displayWin.focus();
    } catch (e) {
      // ignore sizing errors
    }
    return displayWin;
  }

  const opts = {
    width: typeof width === 'number' ? Math.max(100, Math.floor(width)) : 2371,
    height: typeof height === 'number' ? Math.max(100, Math.floor(height)) : 810,
    useContentSize: true,
    frame: false, // frameless - remove system title bar
    titleBarStyle: 'hidden',
    resizable: false,
    show: true,
    skipTaskbar: false,
    title: 'Metro PIDS - Display',
    // top-level window (no parent) so it appears as a separate native window
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

// Helper: show a custom Electron alert/confirm modal with blurred background
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
          // ignore
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
        // If closed without response, treat as cancel/false for confirm
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
