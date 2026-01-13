const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  isPackaged: async () => {
    try {
      return await ipcRenderer.invoke('app/is-packaged');
    } catch (e) {
      return false;
    }
  },
  openDisplay: async (width, height, displayId) => {
    try {
      return await ipcRenderer.invoke('open-display', { 
        width: Number(width) || undefined, 
        height: Number(height) || undefined,
        displayId: displayId || 'display-1'
      });
    } catch (e) {
      return false;
    }
  },
  switchDisplay: async (displayId, width, height) => {
    try {
      return await ipcRenderer.invoke('switch-display', displayId, Number(width) || 1900, Number(height) || 600);
    } catch (e) {
      console.error('switchDisplay failed:', e);
      return false;
    }
  },
  syncSettings: async (settings) => {
    try {
      return await ipcRenderer.invoke('settings/sync', settings);
    } catch (e) {
      console.error('syncSettings failed:', e);
      return false;
    }
  },
  openLineManager: async (target) => {
    try {
      return await ipcRenderer.invoke('open-line-manager', target);
    } catch (e) {
      return false;
    }
  },
  openDevWindow: async () => {
    try {
      return await ipcRenderer.invoke('open-dev-window');
    } catch (e) {
      return false;
    }
  },
  closeDevWindow: async () => {
    try {
      return await ipcRenderer.invoke('close-dev-window');
    } catch (e) {
      return false;
    }
  },
  openDevTools: async () => {
    try {
      return await ipcRenderer.invoke('dev/open-dev-tools');
    } catch (e) {
      return false;
    }
  },
  updateF12DevToolsSetting: async (enabled) => {
    try {
      return await ipcRenderer.invoke('dev/update-f12-setting', enabled);
    } catch (e) {
      return false;
    }
  },
  switchLine: async (lineName) => {
    try {
      return await ipcRenderer.invoke('line-manager/switch-line', lineName);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  closeWindow: async () => {
    try {
      return await ipcRenderer.invoke('line-manager/close');
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // 监听线路切换请求（用于主窗口）
  onSwitchLineRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, lineName, target) => callback(lineName, target);
    ipcRenderer.on('switch-line-request', handler);
    return () => ipcRenderer.removeListener('switch-line-request', handler);
  },
  // 监听API编辑显示端请求
  onEditDisplayRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, displayId, displayData) => callback(displayId, displayData);
    ipcRenderer.on('api/edit-display-request', handler);
    return () => ipcRenderer.removeListener('api/edit-display-request', handler);
  },
  // 发送编辑显示端响应
  sendEditDisplayResult: (result) => {
    try {
      ipcRenderer.send('api/edit-display-result', result);
    } catch (e) {
      console.error('发送编辑显示端响应失败:', e);
    }
  },
  openExternal: async (url) => {
    try { return await ipcRenderer.invoke('open-external', url); } catch (e) { return { ok: false, error: String(e) }; }
  },
  alert: async (msg) => ipcRenderer.invoke('dialog/alert', msg),
  confirm: async (msg) => ipcRenderer.invoke('dialog/confirm', msg),
  lines: {
    list: async (dir) => {
      return await ipcRenderer.invoke('lines/list', dir);
    },
    read: async (filename, dir) => {
      return await ipcRenderer.invoke('lines/read', filename, dir);
    },
    save: async (filename, contentObj, dir) => {
      return await ipcRenderer.invoke('lines/save', filename, contentObj, dir);
    },
    delete: async (filename, dir) => {
      return await ipcRenderer.invoke('lines/delete', filename, dir);
    },
    openFolder: async (dir) => {
      return await ipcRenderer.invoke('lines/openFolder', dir);
    },
    folders: {
      list: async () => {
        try { return await ipcRenderer.invoke('lines/folders/list'); } catch (e) { return { ok: false, error: String(e) }; }
      },
      open: async (folderPath) => {
        try { return await ipcRenderer.invoke('lines/folders/open', folderPath); } catch (e) { return { ok: false, error: String(e) }; }
      },
      add: async (folderName) => {
        try { return await ipcRenderer.invoke('lines/folders/add', folderName); } catch (e) { return { ok: false, error: String(e) }; }
      },
      remove: async (folderPathOrId) => {
        try { return await ipcRenderer.invoke('lines/folders/remove', folderPathOrId); } catch (e) { return { ok: false, error: String(e) }; }
      },
      rename: async (folderId, newName) => {
        try { return await ipcRenderer.invoke('lines/folders/rename', folderId, newName); } catch (e) { return { ok: false, error: String(e) }; }
      },
      switch: async (folderId) => {
        try { return await ipcRenderer.invoke('lines/folders/switch', folderId); } catch (e) { return { ok: false, error: String(e) }; }
      },
      current: async () => {
        try { return await ipcRenderer.invoke('lines/folders/current'); } catch (e) { return { ok: false, error: String(e) }; }
      }
    }
  },
  shortturns: {
    list: async (lineName) => {
      return await ipcRenderer.invoke('shortturns/list', lineName);
    },
    save: async (presetName, presetData) => {
      return await ipcRenderer.invoke('shortturns/save', presetName, presetData);
    },
    read: async (presetName) => {
      return await ipcRenderer.invoke('shortturns/read', presetName);
    },
    delete: async (presetName) => {
      return await ipcRenderer.invoke('shortturns/delete', presetName);
    }
  },
  utils: {
    calculateMD5: async (data) => {
      try { return await ipcRenderer.invoke('utils/calculate-md5', data); } catch (e) { return { ok: false, error: String(e) }; }
    }
  }
  ,
  windowControls: {
    minimize: async () => { try { return await ipcRenderer.invoke('window/minimize'); } catch(e){return {ok:false,error:String(e)}} },
    toggleMax: async () => { try { return await ipcRenderer.invoke('window/toggleMax'); } catch(e){return {ok:false,error:String(e)}} },
    close: async () => { try { return await ipcRenderer.invoke('window/close'); } catch(e){return {ok:false,error:String(e)}} }
  }
  ,
  effects: {
    setDialogBlur: async (enable) => {
      try {
        return await ipcRenderer.invoke('effects/dialog-blur', !!enable);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setMainBlur: async (enable) => {
      try {
        return await ipcRenderer.invoke('effects/main-blur', !!enable);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
  }
  ,
  onMaxState: (cb) => {
    const listener = (e, state) => cb(state);
    ipcRenderer.on('window/maxstate', listener);
    return () => ipcRenderer.removeListener('window/maxstate', listener);
  }
  ,
  // 更新相关 API
  checkForUpdates: async () => {
    try { return await ipcRenderer.invoke('update/check'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  downloadUpdate: async () => {
    try { return await ipcRenderer.invoke('update/download'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  clearCacheAndDownload: async () => {
    try { return await ipcRenderer.invoke('update/clear-cache-and-download'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  installUpdate: async () => {
    try { return await ipcRenderer.invoke('update/install'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  skipVersion: async (version) => {
    try { return await ipcRenderer.invoke('update/skip-version', version); } catch (e) { return { ok: false, error: String(e) }; }
  },
  onUpdateAvailable: (cb) => {
    const l = (e, info) => cb(info);
    ipcRenderer.on('update/available', l);
    return () => ipcRenderer.removeListener('update/available', l);
  },
  onUpdateNotAvailable: (cb) => {
    const l = (e, info) => cb(info);
    ipcRenderer.on('update/not-available', l);
    return () => ipcRenderer.removeListener('update/not-available', l);
  },
  onUpdateError: (cb) => {
    const l = (e, err) => cb(err);
    ipcRenderer.on('update/error', l);
    return () => ipcRenderer.removeListener('update/error', l);
  },
  onUpdateProgress: (cb) => {
    const l = (e, progress) => cb(progress);
    ipcRenderer.on('update/progress', l);
    return () => ipcRenderer.removeListener('update/progress', l);
  },
  onUpdateDownloaded: (cb) => {
    const l = (e, info) => cb(info);
    ipcRenderer.on('update/downloaded', l);
    return () => ipcRenderer.removeListener('update/downloaded', l);
  },
  onUpdateHasUpdate: (cb) => {
    const l = (e, data) => cb(data);
    ipcRenderer.on('update/has-update', l);
    return () => ipcRenderer.removeListener('update/has-update', l);
  },
  // 获取 GitHub Releases 列表
  getGitHubReleases: async () => {
    try { return await ipcRenderer.invoke('github/get-releases'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 获取 Gitee Releases 列表
  getGiteeReleases: async () => {
    try { return await ipcRenderer.invoke('gitee/get-releases'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 设置更新源
  setUpdateSource: async (source) => {
    try { return await ipcRenderer.invoke('update/set-source', source); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 获取更新源
  getUpdateSource: async () => {
    try { return await ipcRenderer.invoke('update/get-source'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  getAppVersion: async () => {
    try { return await ipcRenderer.invoke('app/get-version'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  getOSVersion: async () => {
    try { return await ipcRenderer.invoke('app/get-os-version'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 获取环境变量中的 Gitee Token
  getGiteeTokenFromEnv: async () => {
    try { return await ipcRenderer.invoke('env/get-gitee-token'); } catch (e) { return null; }
  },
  // 重启应用（用于重置数据后彻底刷新）
  relaunchApp: async () => {
    try { return await ipcRenderer.invoke('app/relaunch'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 监听主进程日志
  onMainConsoleLog: (cb) => {
    const l = (e, msg) => cb(msg);
    ipcRenderer.on('main-console-log', l);
    return () => ipcRenderer.removeListener('main-console-log', l);
  },
  onMainConsoleError: (cb) => {
    const l = (e, msg) => cb(msg);
    ipcRenderer.on('main-console-error', l);
    return () => ipcRenderer.removeListener('main-console-error', l);
  },
  // 允许模态页将 alert 结果回传主进程
  sendAlertResponse: (data) => {
    try { ipcRenderer.send('electron-alert-response', data); } catch (e) {}
  },
  // 取色相关 API
  startColorPick: async () => {
    try { return await ipcRenderer.invoke('color/startPick'); } catch (e) { return { ok: false, error: String(e) }; }
  },
  sendColorPickClick: (x, y) => {
    try { ipcRenderer.send('color-picker-click', x, y); } catch (e) {}
  },
  cancelColorPick: () => {
    try { ipcRenderer.send('color-picker-cancel'); } catch (e) {}
  },
  // 通知 API
  showNotification: async (title, body, options) => {
    try { return await ipcRenderer.invoke('notification/show', { title, body, options }); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // 文件选择对话框
  showOpenDialog: async (options) => {
    try { return await ipcRenderer.invoke('dialog/showOpenDialog', options); } catch (e) { return { canceled: true, error: String(e) }; }
  },
  // 更新主窗口进度条
  setProgressBar: async (progress) => {
    try { return await ipcRenderer.invoke('window/set-progress-bar', progress); } catch (e) { return { ok: false, error: String(e) }; }
  },
  // BrowserView 复合布局 API
  browserView: {
    create: async (viewId, url, bounds) => {
      try {
        return await ipcRenderer.invoke('browserview/create', { viewId, url, bounds });
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    remove: async (viewId) => {
      try {
        return await ipcRenderer.invoke('browserview/remove', viewId);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    updateBounds: async (viewId, bounds) => {
      try {
        return await ipcRenderer.invoke('browserview/update-bounds', viewId, bounds);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    list: async () => {
      try {
        return await ipcRenderer.invoke('browserview/list');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
  },
  // 面板切换 API（用于侧边栏通知主窗口）
  switchPanel: async (panelId) => {
    try {
      return await ipcRenderer.invoke('ui/switch-panel', panelId);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  closePanel: async () => {
    try {
      return await ipcRenderer.invoke('ui/close-panel');
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // 监听面板状态变化（用于主窗口接收侧边栏的状态更新）
  onPanelStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, panelId) => callback(panelId);
    ipcRenderer.on('ui/panel-state-changed', handler);
    return () => ipcRenderer.removeListener('ui/panel-state-changed', handler);
  },
  // 设置框架层级（用于控制 BrowserView 的层级）
  setFrameLevel: async (top) => {
    try {
      return await ipcRenderer.invoke('browserview/set-frame-level', { top });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  // Mica Electron API
  mica: {
    getInfo: async () => {
      try {
        return await ipcRenderer.invoke('mica/get-info');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setMicaEffect: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-mica-effect');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setAcrylic: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-acrylic');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setLightTheme: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-light-theme');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setDarkTheme: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-dark-theme');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setAutoTheme: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-auto-theme');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setBackgroundColor: async (color) => {
      try {
        return await ipcRenderer.invoke('mica/set-background-color', color);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },
    setRoundedCorner: async () => {
      try {
        return await ipcRenderer.invoke('mica/set-rounded-corner');
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
  }
});
