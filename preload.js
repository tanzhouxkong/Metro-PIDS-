const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDisplay: async (width, height) => {
    try {
      return await ipcRenderer.invoke('open-display', { width: Number(width) || undefined, height: Number(height) || undefined });
    } catch (e) {
      return false;
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
    }
    ,
    openFolder: async (dir) => {
      return await ipcRenderer.invoke('lines/openFolder', dir);
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
    }
  }
  ,
  onMaxState: (cb) => {
    const listener = (e, state) => cb(state);
    ipcRenderer.on('window/maxstate', listener);
    return () => ipcRenderer.removeListener('window/maxstate', listener);
  }
  ,
  // allow modal pages to send alert responses back to main
  sendAlertResponse: (data) => {
    try { ipcRenderer.send('electron-alert-response', data); } catch (e) {}
  }
});
