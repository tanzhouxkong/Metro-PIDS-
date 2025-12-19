// Lightweight Display SDK for controlling the display endpoint
// Supports BroadcastChannel (metro_pids_v3) and falls back to window.postMessage
// Usage:
// const sdk = createDisplaySdk();
// sdk.sendSync(appData, rt);
// sdk.startRec(800000);
// sdk.onMessage((msg) => { console.log(msg); });

export function createDisplaySdk(options = {}) {
  const channelName = options.channelName || 'metro_pids_v3';
  const targetWindow = options.targetWindow || null; // optional - a Window reference
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
        // Send to same-origin listeners (display listens to window.message too)
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
    // also persist a snapshot locally (display restores from localStorage on boot)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // compute and embed effectiveDoor if needed so display restore keeps the inverted side
        try {
          const app = msg.d;
          const rt = msg.r || {};
          const meta = app && app.meta ? app.meta : null;
          // try to read previous snapshot from localStorage to detect up->down transition
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
      // ignore storage errors
    }
    return post(msg);
  };

  const request = () => post({ t: 'REQ' });
  const startRec = (bps = 800000) => post({ t: 'REC_START', bps });
  const stopRec = () => post({ t: 'REC_STOP' });

  // Helper to send raw command types expected by display
  const sendCmd = (type, payload = {}) => post(Object.assign({ t: type }, payload));

  // Subscribe to messages coming back from display or other controllers
  const listeners = new Set();
  const handleIncoming = (ev) => {
    const data = ev && ev.data ? ev.data : ev;
    if (!data) return;
    // normalize BroadcastChannel event vs Window message
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

  // wire up listeners
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
