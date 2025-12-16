import { initDisplayWindow } from '../utils/displayWindowLogic.js'

export default {
  name: 'DisplayWindow',
  components: { WindowControls: (await import('./WindowControls.js')).default },
  setup() {
    const bc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('metro_pids_v3') : null;
      let showControls = false;
      // Expose window control handlers for the display window
      const winControls = {
        minimize: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.minimize(); else window.blur(); } catch(e){} },
        toggleMax: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.toggleMax(); else { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } } catch(e){} },
        close: async () => { try { if (window.electronAPI && window.electronAPI.windowControls) await window.electronAPI.windowControls.close(); else window.close(); } catch(e){} }
      };
    // If running inside Electron, replace shared windowControls with local-only stubs
    // to avoid invoking main-process handlers that may broadcast to other windows.
    try {
      if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.windowControls) {
        const originalWC = window.electronAPI.windowControls;
        window.electronAPI.windowControls = {
          close: () => { try { window.close(); } catch (e) {} },
          minimize: () => { try { window.blur(); } catch (e) {} },
          toggleMax: () => { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {} }
        };
        // keep a reference to original in case needed for debugging
        window.__metro_pids_original_windowControls = originalWC;
      }
    } catch (e) {}
      let _openedByController = false;
      // Listen for opener/controller messages to mark ownership
      try {
        window.addEventListener('message', (ev) => {
          try {
            const d = ev && ev.data;
            if (!d) return;
            if (d.t === 'METRO_PIDS_OPENED_BY' && d.src === 'controller') {
              _openedByController = true;
            }
            // Also handle REQ_DISPLAY_CLOSE from this window in older flows
            if (d.t === 'REQ_DISPLAY_CLOSE') {
              try { window.close(); } catch(e) {}
            }
          } catch(e) {}
        });
      } catch(e) {}
    function sendUiCmd(cmd) {
      try {
        // IMPORTANT: Do not broadcast these window-control commands to the controller.
        // Execute them locally only. As a defensive fallback, if some other code
        // attempts to forward UI commands via BroadcastChannel/postMessage the
        // controller will ignore messages with src==='display'.
        try { console.log('[display] sendUiCmd', cmd); } catch(e) {}
        if (cmd === 'winClose') {
          // Do NOT call shared electronAPI.windowControls from display — it may forward
          // the action to other windows via the main process. Always try local close.
          // If this window was opened by a script (has an opener), ask opener to close it
          // to avoid the browser console error "Scripts may close only the windows that were opened by them.".
          try {
            if (window.opener && !window.opener.closed) {
              try { window.opener.postMessage({ t: 'REQ_DISPLAY_CLOSE' }, '*'); } catch (e) {}
              return;
            }
          } catch (e) {}
          // Only call window.close() directly if we know opener/controller opened us
          try {
            if (_openedByController || (window.opener && !window.opener.closed)) {
              try { window.close(); } catch(e) {}
              return;
            }
          } catch (e) {}
          // Otherwise attempt a stronger close fallback. This may still be blocked by some browsers,
          // but we'll try to replace the current window then close, swallowing any errors.
          try {
            try { window.open('', '_self'); } catch(e) {}
            try { window.close(); } catch(e) {}
          } catch(e) {}
          return;
        } 

        if (cmd === 'winMin') {
          // Local-only minimize behavior: blur the window to remove focus; do not call main process
          try { window.blur(); } catch(e) {}
          return;
        }

        if (cmd === 'winMax') {
          // Local-only: toggle fullscreen in this renderer only
          if (!document.fullscreenElement) { try{ document.documentElement.requestFullscreen(); }catch(e){} }
          else { try{ document.exitFullscreen(); }catch(e){} }
          return;
        }

        // No broadcasting of display-side window UI commands from here.
      } catch (e) { console.warn('Failed to handle local UI cmd', e); }
    }

    // statusbar and window-controls removed for display-only mode
    // But we provide a small custom titlebar in the template for display window

    // bind/unbind listeners on mount/unmount via lifecycle hooks in template
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
    // no global mouse/touch listeners to remove (statusbar removed)
  }
}
