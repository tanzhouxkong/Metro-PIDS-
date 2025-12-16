export default {
  name: 'WindowControls',
  setup() {
    async function winMin() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.minimize) {
        await window.electronAPI.windowControls.minimize();
        return;
      }
      try { window.blur(); } catch(e){}
    }

    async function winMax() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.toggleMax) {
        await window.electronAPI.windowControls.toggleMax();
        return;
      }
      if (!document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); } catch(e){}
      } else {
        try { await document.exitFullscreen(); } catch(e){}
      }
    }

    async function winClose() {
      if (window.electronAPI && window.electronAPI.windowControls && window.electronAPI.windowControls.close) {
        await window.electronAPI.windowControls.close();
        return;
      }
      try { window.close(); } catch(e){ alert('无法在此环境下关闭窗口'); }
    }

    return { winMin, winMax, winClose };
  },
  template: `
    <div id="windowControls" style="display:flex; height:100%; -webkit-app-region:no-drag; gap:8px; align-items:center;">
      <!-- Traffic-light style buttons: small colored circles inside a clickable area -->
      <div class="win-btn" @click="winMin" title="最小化" style="width:44px; height:100%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        <div style="width:12px; height:12px; border-radius:50%; background:#ffbd2e;"></div>
      </div>
      <div class="win-btn" id="win-max" @click="winMax" title="最大化/还原" style="width:44px; height:100%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        <div style="width:12px; height:12px; border-radius:50%; background:#27c93f;"></div>
      </div>
      <div class="win-btn close" @click="winClose" title="关闭" style="width:44px; height:100%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
        <div style="width:12px; height:12px; border-radius:50%; background:#ff5f56;"></div>
      </div>
    </div>
  `
}
