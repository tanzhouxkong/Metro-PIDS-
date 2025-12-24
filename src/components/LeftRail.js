import { useUIState } from '../composables/useUIState.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useSettings } from '../composables/useSettings.js'
import { cloneDisplayState } from '../utils/displayStateSerializer.js'

export default {
    name: 'LeftRail',
    setup() {
        const { uiState, togglePanel } = useUIState()
        const { state } = usePidsState()
        const { settings } = useSettings()
        const DISPLAY_SNAPSHOT_KEY = 'metro_pids_display_snapshot'
        const getDisplaySize = () => {
            const w = settings && settings.display && settings.display.width ? Number(settings.display.width) : 1900;
            const h = settings && settings.display && settings.display.height ? Number(settings.display.height) : 600;
            return { w: Math.max(100, w), h: Math.max(100, h) };
        };
        const hasNativeDisplay =
            typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function'
        let displayWindowUrl = 'display_window.html'
        try {
            displayWindowUrl = new URL('../../display_window.html', import.meta.url).href
        } catch (error) {
            // import.meta 不可用时回退到相对路径
        }
        let browserDisplayWindow = null
        let lastSentDirType = null;

        const btnStyle = (panelId) => {
            const isActive = uiState.activePanel === panelId
            return {
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'var(--btn-blue-bg)' : 'transparent',
                color: isActive ? '#fff' : 'var(--muted)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(22, 119, 255, 0.3)' : 'none'
            }
        }

        const displayBtnStyle = () => {
            const isActive = uiState.showDisplay
            return {
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'var(--btn-blue-bg)' : 'transparent',
                color: isActive ? '#fff' : 'var(--muted)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(22, 119, 255, 0.3)' : 'none'
            }
        }

        const closeBrowserDisplayWindow = () => {
            if (browserDisplayWindow && !browserDisplayWindow.closed) {
                browserDisplayWindow.close()
            }
            browserDisplayWindow = null
            uiState.showDisplay = false
        }

        const persistDisplaySnapshot = (payload) => {
            if (typeof window === 'undefined' || !window.localStorage) return
            try {
                window.localStorage.setItem(DISPLAY_SNAPSHOT_KEY, JSON.stringify(payload))
            } catch (err) {
                console.warn('Unable to cache display snapshot', err)
            }
        }

        const sendStateToDisplay = (win) => {
            if (!win || win.closed) return
            const payload = {
                t: 'SYNC',
                d: cloneDisplayState(state.appData),
                r: cloneDisplayState(state.rt)
            }
            // 仅在折返类型为 pre 时，为当前到站计算有效车门
            try {
                const app = payload.d;
                const rt = payload.r || {};
                const meta = app && app.meta ? app.meta : null;
                if (app && Array.isArray(app.stations) && meta) {
                    const prevDir = lastSentDirType || null;
                    const currDir = meta.dirType || null;
                    const upSet = new Set(['up', 'outer']);
                    const downSet = new Set(['down', 'inner']);
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
                    // 构建 payload 后再更新 lastSentDirType 以便下次比较
                    lastSentDirType = meta.dirType || lastSentDirType;
                }
            } catch (e) {
                // 构建有效车门失败可忽略
            }
            persistDisplaySnapshot(payload)
            try {
                win.postMessage(payload, '*')
            } catch (err) {
                console.warn('Failed to send display payload', err)
            }
        }

        const openBrowserDisplayWindow = () => {
            if (browserDisplayWindow && !browserDisplayWindow.closed) {
                browserDisplayWindow.focus()
                sendStateToDisplay(browserDisplayWindow)
                return browserDisplayWindow
            }
            const { w, h } = getDisplaySize();
            const displayFeatures = `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`;
            const win = window.open(displayWindowUrl, 'metro-pids-display', displayFeatures)
            if (win) {
                win.addEventListener('beforeunload', () => {
                    uiState.showDisplay = false
                    browserDisplayWindow = null
                }, { once: true })
                sendStateToDisplay(win)
                // 告知弹窗由控制端打开（避免在不允许时调用 window.close）
                try { win.postMessage({ t: 'METRO_PIDS_OPENED_BY', src: 'controller' }, '*'); } catch (e) {}
                win.addEventListener('load', () => sendStateToDisplay(win), { once: true })
                    // 监听弹窗请求自闭
                    const popupCloseHandler = (ev) => {
                        try {
                            const data = ev && ev.data;
                            if (!data || data.t !== 'REQ_DISPLAY_CLOSE') return;
                            if (win && !win.closed) win.close();
                            browserDisplayWindow = null;
                            uiState.showDisplay = false;
                        } catch (err) {}
                    };
                    window.addEventListener('message', popupCloseHandler);
                    // 弹窗卸载时移除监听
                    win.addEventListener('beforeunload', () => {
                        try { window.removeEventListener('message', popupCloseHandler); } catch(e) {}
                    }, { once: true })
            }
            browserDisplayWindow = win
            return win
        }

        const handleDisplayAction = () => {
            if (hasNativeDisplay) {
                try {
                    const { w, h } = getDisplaySize();
                    window.electronAPI.openDisplay(w, h);
                } catch (e) {
                    try { window.electronAPI.openDisplay(); } catch (e) {}
                }
                return
            }

            if (typeof window === 'undefined') return

            if (uiState.showDisplay) {
                closeBrowserDisplayWindow()
                return
            }

            const opened = openBrowserDisplayWindow()
            if (opened) uiState.showDisplay = true
        }

        const openGithub = async () => {
            const url = 'https://github.com/tanzhouxkong/Metro-PIDS-';
            try {
                if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                    try {
                        const res = await window.electronAPI.openExternal(url);
                        // 若 Electron 无法外链打开，则回退到 window.open
                        if (!res || (res.ok === false)) {
                            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) { console.warn('Failed to open external URL', e); }
                        }
                    } catch (e) {
                        try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) { console.warn('Failed to open external URL', e); }
                    }
                    return;
                }
            } catch (e) {}
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) { console.warn('Failed to open external URL', e); }
        }

        return {
            uiState,
            togglePanel,
            btnStyle,
            displayBtnStyle,
            handleDisplayAction,
            openGithub
        }
    },
    template: `
    <div id="leftRail" style="position:fixed; left:0; top:0; bottom:0; width:72px; z-index:420; display:flex; flex-direction:column; align-items:center; padding-top:60px; padding-bottom:20px; background: var(--rail-bg); border-right: 1px solid var(--card-border); box-shadow: 2px 0 8px rgba(0,0,0,0.02); backdrop-filter: blur(20px);">
      
      <!-- Top Section -->
      <div id="railInner" style="width:100%; display:flex; flex-direction:column; align-items:center; gap:16px; flex:1;">
        
        <button 
            class="ft-btn" 
            :style="btnStyle('panel-1')"
            @click="togglePanel('panel-1')" 
            title="PIDS 控制台"
        >
            <i class="fas fa-sliders-h" style="font-size:20px;"></i>
        </button>

        <button 
            class="ft-btn" 
            :style="displayBtnStyle()"
            @click="handleDisplayAction()" 
            title="显示预览"
        >
            <i class="fas fa-desktop" style="font-size:20px;"></i>
        </button>
        
        <!-- third-party display button removed -->
      </div>

      <!-- Bottom Section -->
      <div style="width:100%; display:flex; flex-direction:column; align-items:center; gap:12px;">
         <button 
            class="ft-btn" 
            :style="btnStyle('panel-4')"
            @click="togglePanel('panel-4')" 
            title="设置"
        >
            <i class="fas fa-cog" style="font-size:20px;"></i>
        </button>
        <button
            type="button"
            class="ft-btn"
            :style="{ width: '48px', height: '48px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'var(--muted)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'none' }"
            @click="openGithub()"
            title="Github"
        >
            <i class="fab fa-github" style="font-size:20px;"></i>
        </button>
      </div>

    </div>
    `
}
