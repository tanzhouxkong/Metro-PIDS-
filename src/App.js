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

    // 键盘处理
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
        
        // 硬编码兜底
        if (code === 'Enter' || key === 'Enter') { e.preventDefault(); next(); }
        if (code === 'ArrowLeft' || key === 'ArrowLeft') move(-getStep());
        if (code === 'ArrowRight' || key === 'ArrowRight') move(getStep());
    });

    // 广播处理
    bcOn((data) => {
      // 调试：记录收到的 CMD_UI 消息
      try { if (data && data.t === 'CMD_UI') console.log('[debug][bc] CMD_UI received in App.js', data); } catch(e) {}
      // 安全：忽略通过 BroadcastChannel 传入的 CMD_UI，防止显示端误触主控的窗口操作
      if (data && data.t === 'CMD_UI') {
        try { console.log('[debug][bc] Ignoring CMD_UI from BroadcastChannel', data); } catch(e) {}
        return;
      }
      if (data && data.t === 'REQ') sync();
      // 远端按键指令
      if (data && data.t === 'CMD_KEY') {
         const code = data.code || data.key;
         if (code === 'Enter') next();
         if (code === 'ArrowLeft') move(-getStep());
         if (code === 'ArrowRight') move(getStep());
      }
      // 来自显示端的 UI 命令；若标记 src=display 则忽略
      if (data && data.t === 'CMD_UI') {
        // 标记为 display 来源时不处理
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

    // 兜底：处理显示端弹窗的 postMessage
    const handleWindowMsg = (ev) => {
      // 调试：记录指向 App 的 postMessage
      try { console.log('[debug][postMessage] window.message received in App.js', ev.origin, ev.data); } catch(e) {}
      const data = ev.data;
      if (!data) return;
      // 安全：忽略其他窗口通过 postMessage 发送的 CMD_UI
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
