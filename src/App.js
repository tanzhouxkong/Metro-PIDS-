import AdminApp from './components/AdminApp.js'
import Topbar from './components/Topbar.js'
import LeftRail from './components/LeftRail.js'
import SlidePanel from './components/SlidePanel.js'
import UnifiedDialogs from './components/UnifiedDialogs.js'
import { usePidsState } from './composables/usePidsState.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useController } from './composables/useController.js'
import { useSettings } from './composables/useSettings.js'

export default {
  name: 'App',
  components: { AdminApp, Topbar, LeftRail, SlidePanel, UnifiedDialogs },
  setup() {
    const { state: pidState, bcOn } = usePidsState();
    const { next, move, setArr, setDep, getStep, sync } = useController();
    const { settings } = useSettings();
    const kbd = useKeyboard();

    // Keyboard handling
    kbd.install();
    kbd.onKey((e) => {
        if (pidState.isRec || ['INPUT','TEXTAREA'].includes((e.target && e.target.tagName) || '')) return;
        
        const code = e.code;
        const key = e.key;
        const km = settings.keys || { arrdep: 'Enter', prev: 'ArrowLeft', next: 'ArrowRight' };
        
        const normalize = (s) => {
            if (!s) return '';
            if (s === ' ') return 'Space';
            return s.toLowerCase();
        };

        const match = (target) => {
            if (!target) return false;
            const t = normalize(target);
            return normalize(code) === t || normalize(key) === t;
        };

        if (match(km.arrdep)) { e.preventDefault(); next(); return; }
        if (match(km.prev)) { move(-getStep()); return; }
        if (match(km.next)) { move(getStep()); return; }
        
        // Hardcoded fallbacks
        if (code === 'Enter' || key === 'Enter') { e.preventDefault(); next(); }
        if (code === 'ArrowLeft' || key === 'ArrowLeft') move(-getStep());
        if (code === 'ArrowRight' || key === 'ArrowRight') move(getStep());
    });

    // Broadcast handling
    bcOn((data) => {
      // DEBUG: log CMD_UI messages received via BroadcastChannel
      try { if (data && data.t === 'CMD_UI') console.log('[debug][bc] CMD_UI received in App.js', data); } catch(e) {}
      // Security: do not act on CMD_UI messages delivered via BroadcastChannel.
      // Display windows may erroneously broadcast these; ignore to prevent
      // remote-close/minimize/maximize affecting the main control panel.
      if (data && data.t === 'CMD_UI') {
        try { console.log('[debug][bc] Ignoring CMD_UI from BroadcastChannel', data); } catch(e) {}
        return;
      }
      if (data && data.t === 'REQ') sync();
      // Remote key commands
      if (data && data.t === 'CMD_KEY') {
         const code = data.code || data.key;
         if (code === 'Enter') next();
         if (code === 'ArrowLeft') move(-getStep());
         if (code === 'ArrowRight') move(getStep());
      }
      // Remote UI commands from display window — IGNORE if message explicitly marked from display
      if (data && data.t === 'CMD_UI') {
        // If the sender marked the message as originating from the display, do not act on it here.
        if (data.src && data.src === 'display') return;
        const cmd = data.cmd;
        if (!cmd) return;
        if (cmd === 'winMin') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.minimize) window.electronAPI.windowControls.minimize();
          else try{ window.blur(); }catch(e){}
        }
        if (cmd === 'winMax') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.toggleMax) window.electronAPI.windowControls.toggleMax();
          else {
            if (!document.fullscreenElement) { try{ document.documentElement.requestFullscreen(); }catch(e){} }
            else { try{ document.exitFullscreen(); }catch(e){} }
          }
        }
        if (cmd === 'winClose') {
          if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.close) window.electronAPI.windowControls.close();
          else try{ window.close(); }catch(e){}
        }
      }
    });

    // Fallback: handle postMessage from popup display windows
    const handleWindowMsg = (ev) => {
      // DEBUG: log postMessage events targeting App
      try { console.log('[debug][postMessage] window.message received in App.js', ev.origin, ev.data); } catch(e) {}
      const data = ev.data;
      if (!data) return;
      // Security: ignore CMD_UI messages sent via postMessage from other windows
      if (data.t === 'CMD_UI') {
        try { console.log('[debug][postMessage] Ignoring CMD_UI from postMessage', ev.origin, data); } catch(e) {}
        return;
      }
      return;
    };
    if (typeof window !== 'undefined') window.addEventListener('message', handleWindowMsg);

    return { pidState };
  },
  template: `
    <div style="height:100vh; display:flex; flex-direction:column;">
      <Topbar />
      <div style="flex:1; display:flex; overflow:hidden; position:relative; margin-top:32px;">
        <LeftRail />
        
        <!-- Main Content Area -->
        <div id="admin-app" style="flex:1; display:flex; margin-left:72px; overflow:hidden;">
            <!-- AdminApp takes full available space -->
            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
              <AdminApp />
            </div>
        </div>

        <SlidePanel />
        <UnifiedDialogs />
      </div>
    </div>
  `
}
