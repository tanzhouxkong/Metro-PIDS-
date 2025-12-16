export function useKeyboard() {
  const listeners = new Set();

  function handle(ev) {
    try {
      for (const l of Array.from(listeners)) {
        try { l(ev); } catch(e){ console.warn('keyboard listener', e); }
      }
    } catch(e) {}
  }

  function onKey(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function install() { document.addEventListener('keydown', handle); }
  function uninstall() { document.removeEventListener('keydown', handle); listeners.clear(); }

  return { onKey, install, uninstall };
}
