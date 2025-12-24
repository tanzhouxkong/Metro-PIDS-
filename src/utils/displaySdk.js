// 轻量显示端 SDK：用于控制显示窗口
// 支持 BroadcastChannel (metro_pids_v3)，否则回退 window.postMessage
// 用法示例：
// 示例：const sdk = createDisplaySdk();
// 示例：sdk.sendSync(appData, rt);
// 示例：sdk.startRec(800000);
// 示例：sdk.onMessage((msg) => { console.log(msg); });

export function createDisplaySdk(options = {}) {
  const channelName = options.channelName || 'metro_pids_v3';
  const targetWindow = options.targetWindow || null; // 可选：指定目标窗口引用
  const targetOrigin = options.targetOrigin || '*';
  let bc = null;
  let usingBC = false;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel(channelName);
      usingBC = true;
    } catch (err) {
      bc = null;
      usingBC = false;
    }
  }

  const post = (msg) => {
    try {
      if (usingBC && bc) {
        bc.postMessage(msg);
        return true;
      }
      if (targetWindow && typeof targetWindow.postMessage === 'function') {
        targetWindow.postMessage(msg, targetOrigin);
        return true;
      }
      if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
        // 发送给同源监听者（显示端也监听 window.message）
        window.postMessage(msg, targetOrigin);
        return true;
      }
    } catch (err) {
      console.warn('displaySdk: post failed', err);
    }
    return false;
  };

  const sendSync = (appData, rtState = null) => {
    const msg = { t: 'SYNC', d: appData };
    if (rtState) msg.r = rtState;
    // 同步时也持久化快照（显示端启动时从 localStorage 恢复）
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // 如需倒换车门则写入 _effectiveDoor，便于恢复
        try {
          const app = msg.d;
          const rt = msg.r || {};
          const meta = app && app.meta ? app.meta : null;
          // 尝试读取上一次快照以识别上下行切换
          let prevDir = null;
          try {
            const prevRaw = window.localStorage.getItem('metro_pids_display_snapshot');
            if (prevRaw) {
              const prev = JSON.parse(prevRaw);
              if (prev && prev.d && prev.d.meta) prevDir = prev.d.meta.dirType || null;
            }
          } catch (e) {}
          if (app && Array.isArray(app.stations) && meta) {
            const upSet = new Set(['up', 'outer']);
            const downSet = new Set(['down', 'inner']);
            const currDir = meta.dirType || null;
            const idx = typeof rt.idx === 'number' ? rt.idx : -1;
            if (idx >= 0 && idx < app.stations.length) {
              const st = app.stations[idx];
              if (st && st.turnback === 'pre' && prevDir && upSet.has(prevDir) && downSet.has(currDir)) {
                const invertDoor = (door) => {
                  if (!door) return 'left';
                  if (door === 'left') return 'right';
                  if (door === 'right') return 'left';
                  return door;
                };
                st._effectiveDoor = invertDoor(st.door || 'left');
              }
            }
          }
        } catch (err) {}
        window.localStorage.setItem('metro_pids_display_snapshot', JSON.stringify(msg));
      }
    } catch (e) {
      // 存储异常忽略
    }
    return post(msg);
  };

  const request = () => post({ t: 'REQ' });
  const startRec = (bps = 800000) => post({ t: 'REC_START', bps });
  const stopRec = () => post({ t: 'REC_STOP' });

  // 发送显示端期望的原始命令类型
  const sendCmd = (type, payload = {}) => post(Object.assign({ t: type }, payload));

  // 订阅来自显示端或其他控制端的消息
  const listeners = new Set();
  const handleIncoming = (ev) => {
    const data = ev && ev.data ? ev.data : ev;
    if (!data) return;
    // 统一处理 BroadcastChannel 与 window message
    const msg = data;
    listeners.forEach((fn) => {
      try { fn(msg); } catch (e) { console.warn('displaySdk listener error', e); }
    });
  };

  const onMessage = (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };

  // 注册监听
  if (usingBC && bc) {
    bc.addEventListener('message', handleIncoming);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleIncoming);
  }

  const close = () => {
    if (usingBC && bc) {
      try { bc.close(); } catch (e) {}
      bc = null;
    }
    if (typeof window !== 'undefined') {
      try { window.removeEventListener('message', handleIncoming); } catch (e) {}
    }
    listeners.clear();
  };

  return {
    post,
    sendSync,
    request,
    startRec,
    stopRec,
    sendCmd,
    onMessage,
    close,
    _usingBroadcastChannel: usingBC
  };
}
