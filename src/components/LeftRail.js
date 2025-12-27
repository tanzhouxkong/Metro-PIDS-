import { useUIState } from '../composables/useUIState.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useSettings } from '../composables/useSettings.js'
import { cloneDisplayState } from '../utils/displayStateSerializer.js'
import { ref, onMounted, onUnmounted } from 'vue'

export default {
    name: 'LeftRail',
    setup() {
        const { uiState, togglePanel } = useUIState()
        const { state } = usePidsState()
        const { settings } = useSettings()
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
        const hasUpdate = ref(false)
        const showReleaseNotes = ref(false)
        const releaseNotes = ref([])
        const loadingNotes = ref(false)
<<<<<<< HEAD
=======
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
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

        // 加载更新日志
        const loadReleaseNotes = async () => {
            if (loadingNotes.value || releaseNotes.value.length > 0) return;
            loadingNotes.value = true;
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getGitHubReleases) {
                    const result = await window.electronAPI.getGitHubReleases();
                    if (result && result.ok && result.releases) {
                        releaseNotes.value = result.releases;
                    }
                }
            } catch (e) {
                console.error('加载更新日志失败:', e);
            } finally {
                loadingNotes.value = false;
            }
        }

        // 打开更新日志弹窗
        const openReleaseNotes = async () => {
            await loadReleaseNotes();
            showReleaseNotes.value = true;
        }

        // 关闭更新日志弹窗
        const closeReleaseNotes = () => {
            showReleaseNotes.value = false;
        }

        // 格式化更新日志内容（将Markdown转换为简单的HTML）
        const formatReleaseBody = (body, release) => {
            if (!body) return '';
            const githubRepo = 'tanzhouxkong/Metro-PIDS-';
            const githubBaseUrl = 'https://github.com';
            const githubRawBaseUrl = 'https://raw.githubusercontent.com';
            
            let formatted = body;
            
            // 处理图片：![alt](url) 或 ![alt](url "title")
            formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)(?:\s+"[^"]*")?\)/g, (match, alt, url) => {
                let imageUrl = url.trim();
                
                // 如果是相对路径，转换为GitHub releases assets URL
                if (!imageUrl.match(/^https?:\/\//)) {
                    // 相对路径，假设是release assets中的文件
                    const tagName = release?.tag_name || '';
                    if (tagName) {
                        imageUrl = `${githubBaseUrl}/${githubRepo}/releases/download/${tagName}/${imageUrl}`;
                    } else {
                        // 如果没有tag，使用raw.githubusercontent.com（如果图片在repo根目录）
                        imageUrl = `${githubRawBaseUrl}/${githubRepo}/main/${imageUrl}`;
                    }
                }
                
                // 返回img标签，支持响应式和样式
                return `<img src="${imageUrl}" alt="${alt || ''}" style="max-width:100%; height:auto; border-radius:6px; margin:12px 0; box-shadow:0 2px 8px rgba(0,0,0,0.1); display:block;" onerror="this.style.display='none';">`;
            });
            
            // 简单的Markdown转换（在图片处理之后）
            formatted = formatted
                .replace(/\n## (.*)/g, '<h4 style="margin-top:16px; margin-bottom:8px; font-weight:bold; color:var(--text);">$1</h4>')
                .replace(/\n### (.*)/g, '<h5 style="margin-top:12px; margin-bottom:6px; font-weight:bold; color:var(--text);">$1</h5>')
                .replace(/\n- (.*)/g, '<div style="margin-left:16px; margin-top:4px;">• $1</div>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
            
            return formatted;
        }

        // 监听更新事件
        let updateListenerCleanup = null;
        onMounted(() => {
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onUpdateHasUpdate) {
                updateListenerCleanup = window.electronAPI.onUpdateHasUpdate((data) => {
                    hasUpdate.value = true;
                });
            }
        });

        onUnmounted(() => {
            if (updateListenerCleanup) {
                updateListenerCleanup();
            }
        });

        return {
            uiState,
            togglePanel,
            btnStyle,
            displayBtnStyle,
            handleDisplayAction,
            openGithub,
            hasUpdate,
            showReleaseNotes,
            releaseNotes,
            loadingNotes,
            openReleaseNotes,
            closeReleaseNotes,
            formatReleaseBody
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
         <div style="position:relative;">
            <button 
                class="ft-btn" 
                :style="btnStyle('panel-4')"
                @click="togglePanel('panel-4')" 
                title="设置"
            >
                <i class="fas fa-cog" style="font-size:20px;"></i>
            </button>
            <div 
                v-if="hasUpdate" 
                @click.stop="openReleaseNotes()"
                style="position:absolute; top:-6px; right:-6px; background:#ff4757; color:white; padding:2px 6px; border-radius:8px; font-size:10px; font-weight:bold; cursor:pointer; box-shadow:0 2px 6px rgba(255,71,87,0.4); z-index:10; white-space:nowrap;"
                title="查看更新日志"
            >
                NEW
            </div>
        </div>
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
