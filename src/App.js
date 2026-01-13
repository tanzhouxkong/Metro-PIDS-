import { onUnmounted } from 'vue'
import AdminApp from './components/AdminApp.js'
import Topbar from './components/Topbar.js'
import LeftRail from './components/LeftRail.js'
import SlidePanel from './components/SlidePanel.js'
import ConsolePage from './components/ConsolePage.js'
import SettingsPage from './components/SettingsPage.js'
import UnifiedDialogs from './components/UnifiedDialogs.js'
import { usePidsState } from './composables/usePidsState.js'
import { useKeyboard } from './composables/useKeyboard.js'
import { useController } from './composables/useController.js'
import { useSettings } from './composables/useSettings.js'
import { useUIState } from './composables/useUIState.js'

export default {
  name: 'App',
  components: { AdminApp, Topbar, LeftRail, SlidePanel, ConsolePage, SettingsPage, UnifiedDialogs },
  setup() {
    const { uiState } = useUIState()
    const { state: pidState, bcOn } = usePidsState();
    const { next, move, setArr, setDep, getStep, sync } = useController();
    const { settings } = useSettings();
    const kbd = useKeyboard();

    // 监听来自侧边栏的面板切换消息
    let panelStateCleanup = null;
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onPanelStateChange) {
      panelStateCleanup = window.electronAPI.onPanelStateChange((panelId) => {
        uiState.activePanel = panelId;
      });
    }
    
    // 在组件卸载时清理监听器
    onUnmounted(() => {
      if (panelStateCleanup) {
        panelStateCleanup();
      }
    });

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
      // 处理第三方显示器的数据请求
      if (data && data.t === 'REQ') {
        console.log('[App] 收到第三方显示器的数据请求，立即同步数据');
        sync();
      }
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

    // 页面加载完成后，自动同步一次数据（确保第三方显示器能立即获取数据）
    // 延迟一小段时间，确保数据已加载完成
    setTimeout(() => {
      if (pidState.appData && pidState.appData.stations && pidState.appData.stations.length > 0) {
        console.log('[App] 页面加载完成，自动同步数据到所有显示器');
        sync();
      }
    }, 500);

    return { pidState, uiState };
  },
  template: `
    <div class="root" style="
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: transparent;
        position: relative;
      z-index: 1;
      ">
      <!-- Main Content Area (顶部栏+侧边栏已通过 BrowserView 嵌入，主内容区需要透明背景以透到桌面) -->
      <div id="admin-app" style="display:flex; overflow:hidden; position: absolute; top: 32px; left: 60px; right: 16px; bottom: 16px; z-index: 10; pointer-events: auto; border-radius: 12px;">
            <!-- Show different pages based on activePanel - 使用 v-show 避免组件卸载/挂载导致的闪烁 -->
            <div v-show="uiState.activePanel === 'panel-1'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <ConsolePage />
            </div>
            <div v-show="uiState.activePanel === 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SettingsPage />
            </div>
            <div v-show="uiState.activePanel && uiState.activePanel !== 'panel-1' && uiState.activePanel !== 'panel-4'" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <SlidePanel />
            </div>
            <div v-show="!uiState.activePanel" style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:absolute; top:0; left:0; right:0; bottom:0;">
              <AdminApp />
            </div>
        </div>

        <UnifiedDialogs />
    </div>
  `
}
