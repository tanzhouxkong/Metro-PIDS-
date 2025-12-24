import { initDisplayWindow } from '../utils/displayWindowLogic.js'

export default {
  name: 'DisplayWindow',
  components: { WindowControls: (await import('./WindowControls.js')).default },
  setup() {
    const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('metro_pids_v3') : null;
      let showControls = false;
      // 显示端窗口控制处理
      const winControls = {
        minimize: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.minimize(); else window.blur(); } catch(e){} },
        toggleMax: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.toggleMax(); else { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } } catch(e){} },
        close: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.close(); else window.close(); } catch(e){} }
      };
    // 在 Electron 内部时，用本地 stub 覆盖共享 windowControls，避免触发主进程广播
    try {
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.windowControls) {
        const originalWC = window.electronAPI.windowControls;
        window.electronAPI.windowControls = {
          close: () => { try { window.close(); } catch (e) {} },
          minimize: () => { try { window.blur(); } catch (e) {} },
          toggleMax: () => { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {} }
        };
        // 保留原始引用以便调试
        window.__metro_pids_original_windowControls = originalWC;
      }
    } catch (e) {}
      let _openedByController = false;
      // 监听 opener/控制端消息，标记归属
      try {
        window.addEventListener('message', (ev) => {
          try {
            const d = ev && ev.data;
            if (!d) return;
            if (d.t === 'METRO_PIDS_OPENED_BY' && d.src === 'controller') {
              _openedByController = true;
            }
            // 兼容旧流程，处理本窗口发出的 REQ_DISPLAY_CLOSE
            if (d.t === 'REQ_DISPLAY_CLOSE') {
              try { window.close(); } catch(e) {}
            }
          } catch(e) {}
        });
      } catch(e) {}
    function sendUiCmd(cmd) {
      try {
        // 注意：不要将窗口控制指令广播给控制端，只在本地执行。
        // 若其他代码转发了 UI 命令，控制端会因 src==='display' 而忽略。
        try { console.log('[display] sendUiCmd', cmd); } catch(e) {}
        if (cmd === 'winClose') {
          // 显示端不要调用共享的 electronAPI.windowControls，防止主进程转发。
          // 若由脚本打开（存在 opener），让 opener 关闭，避免浏览器报错。
          try {
            if (window.opener && !window.opener.closed) {
              try { window.opener.postMessage({ t: 'REQ_DISPLAY_CLOSE' }, '*'); } catch (e) {}
              return;
            }
          } catch (e) {}
          // 仅当确认 opener/控制端打开时直接 close
          try {
            if (_openedByController || (window.opener && !window.opener.closed)) {
              try { window.close(); } catch(e) {}
              return;
            }
          } catch (e) {}
          // 其他情况尝试更强制的关闭，可能被浏览器拦截，但会尽量吞掉错误
          try {
            try { window.open('', '_self'); } catch(e) {}
            try { window.close(); } catch(e) {}
          } catch(e) {}
          return;
        } 

        if (cmd === 'winMin') {
          // 仅本地最小化：只做失焦，不调主进程
          try { window.blur(); } catch(e) {}
          return;
        }

        if (cmd === 'winMax') {
          // 仅本地切换全屏
          if (!document.fullscreenElement) { try{ document.documentElement.requestFullscreen(); }catch(e){} }
          else { try{ document.exitFullscreen(); }catch(e){} }
          return;
        }

        // 此处不广播显示端的窗口指令
      } catch (e) { console.warn('Failed to handle local UI cmd', e); }
    }

    // 显示模式移除了状态栏/窗口控制，这里提供简易自定义标题栏

    // 通过模板生命周期绑定/解绑监听
    return { winControls };
  },
  template: `
    <div id="display-app">
      <!-- display statusbar removed for kiosk/display mode -->
      <div id="scaler">
        <div id="display-titlebar" style="-webkit-app-region: drag; display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:rgba(0,0,0,0.02); position:absolute; top:0; left:0; right:0; z-index:9999;">
          <div style="font-weight:700; letter-spacing:1px; -webkit-app-region: drag; color:#000">Metro PIDS - Display</div>
          <div style="flex:1;"></div>
          <div role="controls" style="-webkit-app-region:no-drag; display:flex; align-items:center; --text:#000;">
            <WindowControls />
          </div>
        </div>
        <div class="header">
          <div class="h-left">
            <div class="logo-area">
              <div class="logo-txt">Metro PIDS</div>
            </div>
            <div class="line-info">
              <div id="d-line-no" class="line-badge">--</div>
            </div>
          </div>
          <div class="h-next">
            <div class="lbl">
              下一站
              <span class="en">Next Station</span>
            </div>
            <div class="val">
              <span id="d-next-st">--</span>
            </div>
          </div>
          <div class="h-door"></div>
          <div class="h-term">
            <div class="lbl">
              终点站
              <span class="en">Terminal Station</span>
            </div>
            <div class="val">
              --
              <span class="en">--</span>
            </div>
          </div>

        </div>
        <div id="rec-tip">REC</div>
        <div id="d-map" class="btm-map map-l"></div>
        <div id="arrival-screen">
          <div class="as-body">
            <div class="as-panel-left">
              <div class="as-door-area">
                <div class="as-door-graphic">
                  <div class="door-arrow l-arrow">
                    <i class="fas fa-chevron-left"></i>
                  </div>
                  <div class="as-door-img">
                    <i class="fas fa-door-open"></i>
                  </div>
                  <div class="door-arrow r-arrow">
                    <i class="fas fa-chevron-right"></i>
                  </div>
                </div>
                <div class="as-door-text">
                  <div id="as-door-msg-cn" class="as-door-t-cn">左侧开门</div>
                  <div id="as-door-msg-en" class="as-door-t-en">Left side doors open</div>
                </div>
              </div>
              <div class="as-car-area">
                <div class="as-car-exits"></div>
              </div>
            </div>
            <div class="as-panel-right">
              <div class="as-map-track"></div>
              <div class="as-map-nodes"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  mounted() {
    this.cleanup = initDisplayWindow(this.$el)
  },
  beforeUnmount() {
    if (this.cleanup) {
      this.cleanup()
      this.cleanup = null
    }
    // 无需移除全局鼠标/触摸监听（状态栏已移除）
  }
}
