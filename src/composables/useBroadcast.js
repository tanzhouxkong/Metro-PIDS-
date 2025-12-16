export function useBroadcast(channelName = 'metro_pids_v3') {
  let bc = null;
  try { if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(channelName); } catch(e) { bc = null }

  function post(msg) {
    try { if (bc) bc.postMessage(msg); } catch(e) {}
  }

  function onMessage(handler) {
    if (!bc) return () => {};
    const wrapped = (e) => handler(e.data);
    bc.addEventListener('message', wrapped);
    return () => bc.removeEventListener('message', wrapped);
  }

  return { bc, post, onMessage };
}
