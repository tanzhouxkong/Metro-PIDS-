import { useUIState } from '../composables/useUIState.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useSettings } from '../composables/useSettings.js'
import { cloneDisplayState } from '../utils/displayStateSerializer.js'
import { showNotification } from '../utils/notificationService.js'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

export default {
    name: 'LeftRail',
    setup() {
        const { uiState, togglePanel, closePanel } = useUIState()
        
        // 通过 IPC 通知主窗口切换面板
        const notifyMainWindow = async (panelId) => {
            if (typeof window !== 'undefined' && window.electronAPI) {
                try {
                    if (panelId === null) {
                        await window.electronAPI.closePanel();
                    } else {
                        await window.electronAPI.switchPanel(panelId);
                    }
                } catch (e) {
                    console.warn('[LeftRail] 通知主窗口失败:', e);
                }
            }
        }
        const { state } = usePidsState()
        const { settings } = useSettings()
        const hasUpdate = ref(false)
        const showReleaseNotes = ref(false)
        const releaseNotes = ref([])
        const loadingNotes = ref(false)
        const DISPLAY_SNAPSHOT_KEY = 'metro_pids_display_snapshot'
        
        // 使用 computed 让显示端信息响应式更新
        const currentDisplayInfo = computed(() => {
            // 获取当前活动显示端的配置
            const currentDisplayId = settings?.display?.currentDisplayId || 'display-1';
            const currentDisplay = settings?.display?.displays?.[currentDisplayId];
            
            // 如果找不到当前显示端配置，使用默认值或第一个可用的显示端
            let displayConfig = currentDisplay;
            if (!displayConfig && settings?.display?.displays) {
                const firstDisplayId = Object.keys(settings.display.displays)[0];
                displayConfig = settings.display.displays[firstDisplayId];
            }
            
            // 获取宽度和高度，如果没有配置则使用默认值
            const w = displayConfig?.width ? Number(displayConfig.width) : 1900;
            const h = displayConfig?.height ? Number(displayConfig.height) : 600;
            
            return { 
                w: Math.max(100, w), 
                h: Math.max(100, h),
                displayId: currentDisplayId,
                displayName: displayConfig?.name || '显示器'
            };
        });
        
        const getDisplaySize = () => {
            return currentDisplayInfo.value;
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

        // 包装 togglePanel 和 closePanel，同时通知主窗口
        const handleTogglePanel = async (panelId) => {
            // 先计算新的面板 ID（在切换之前）
            const currentPanelId = uiState.activePanel;
            const newPanelId = currentPanelId === panelId ? null : panelId;
            
            // 更新本地状态
            togglePanel(panelId);
            
            // 通知主窗口
            await notifyMainWindow(newPanelId);
        }
        
        const handleClosePanel = async () => {
            // 更新本地状态
            closePanel();
            
            // 通知主窗口
            await notifyMainWindow(null);
        }

        const btnStyle = (panelId) => {
            const isActive = uiState.activePanel === panelId
            return {
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'var(--btn-blue-bg)' : 'var(--rail-btn-bg)',
                color: isActive ? '#fff' : 'var(--rail-btn-text)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(22, 119, 255, 0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                margin: '0 auto' // 确保按钮在容器中居中
            }
        }

        const homeBtnStyle = () => {
            const isActive = uiState.activePanel === null
            return {
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'var(--btn-blue-bg)' : 'var(--rail-btn-bg)',
                color: isActive ? '#fff' : 'var(--rail-btn-text)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(22, 119, 255, 0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                margin: '0 auto' // 确保按钮在容器中居中
            }
        }

        const displayBtnStyle = () => {
            const isActive = uiState.showDisplay
            return {
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'var(--btn-blue-bg)' : 'var(--rail-btn-bg)',
                color: isActive ? '#fff' : 'var(--rail-btn-text)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isActive ? '0 4px 12px rgba(22, 119, 255, 0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
                margin: '0 auto' // 确保按钮在容器中居中
            }
        }

        const closeBrowserDisplayWindow = () => {
            if (browserDisplayWindow && !browserDisplayWindow.closed) {
                browserDisplayWindow.close()
            }
            browserDisplayWindow = null
            uiState.showDisplay = false
        }

        // 检查是否允许打开 display-2
        const isDisplay2Allowed = async () => {
            if (!settings.display.display2Mode) {
                settings.display.display2Mode = 'dev-only'; // 默认值
            }
            
            const mode = settings.display.display2Mode;
            
            // 模式 1: disabled - 所有情况下都不允许打开
            if (mode === 'disabled') {
                return false;
            }
            
            // 模式 2: enabled - 所有环境下都能打开
            if (mode === 'enabled') {
                return true;
            }
            
            // 模式 3: dev-only - 仅在浏览器和框架的开发者模式下打开
            if (mode === 'dev-only') {
                // 检查是否在 Electron 环境
                const isElectron = typeof window !== 'undefined' && window.electronAPI;
                
                if (isElectron) {
                    // Electron 环境：检查是否在开发者模式（未打包）
                    try {
                        const isPackaged = await window.electronAPI.isPackaged();
                        return !isPackaged; // 未打包 = 开发者模式
                    } catch (e) {
                        return false;
                    }
                } else {
                    // 浏览器环境：检查 URL 参数或开发者工具
                    // 简单判断：浏览器环境默认允许（视为开发模式）
                    return true;
                }
            }
            
            return false;
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
            const { w, h, displayId } = getDisplaySize();
            
            // 获取当前显示端配置以确定URL
            const currentDisplayConfig = settings?.display?.displays?.[displayId];
            let displayUrl = displayWindowUrl; // 默认使用主显示器URL
            
            if (currentDisplayConfig) {
                if (currentDisplayConfig.source === 'builtin') {
                    // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                    if (currentDisplayConfig.url) {
                        displayUrl = currentDisplayConfig.url;
                    } else if (currentDisplayConfig.id === 'display-1') {
                        displayUrl = displayWindowUrl; // 主显示器使用根目录的display_window.html
                    } else {
                        // 其他显示器使用各自文件夹中的display_window.html
                        try {
                            displayUrl = new URL(`../../displays/${currentDisplayConfig.id}/display_window.html`, import.meta.url).href;
                        } catch (error) {
                            displayUrl = `displays/${currentDisplayConfig.id}/display_window.html`;
                        }
                    }
                } else if (currentDisplayConfig.source === 'custom' || currentDisplayConfig.source === 'gitee') {
                    displayUrl = currentDisplayConfig.url || displayWindowUrl;
                }
            }
            
            const displayFeatures = `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`;
            const win = window.open(displayUrl, `metro-pids-display-${displayId}`, displayFeatures)
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

        const handleDisplayAction = async () => {
            // 获取当前要打开的显示端ID
            const { w, h, displayId } = getDisplaySize();
            
            // 检查 display-2 是否允许打开
            if (displayId === 'display-2') {
                const allowed = await isDisplay2Allowed();
                if (!allowed) {
                    const mode = settings.display.display2Mode || 'dev-only';
                    let message = '副显示器当前已禁用，无法打开';
                    if (mode === 'dev-only') {
                        message = '副显示器仅在开发者模式下可用，当前环境不允许打开';
                    }
                    showNotification('副显示器已禁用', message, {
                        tag: 'display-2-disabled',
                        urgency: 'normal'
                    });
                    return;
                }
            }
            
            // 确保显示端存在且已启用
            const targetDisplay = settings?.display?.displays?.[displayId];
            if (!targetDisplay) {
                console.warn('[LeftRail] 显示端不存在:', displayId);
                showNotification('显示端不存在', `显示端 "${displayId}" 不存在，无法打开`, {
                    tag: 'display-not-found',
                    urgency: 'normal'
                });
                return;
            }
            
            if (!targetDisplay.enabled) {
                showNotification('显示端已禁用', `显示端 "${targetDisplay.name}" 当前已禁用，无法打开`, {
                    tag: 'display-disabled',
                    urgency: 'normal'
                });
                return;
            }
            
            if (hasNativeDisplay) {
                try {
                    // 传递显示端ID给Electron API
                    window.electronAPI.openDisplay(w, h, displayId);
                } catch (e) {
                    try { 
                        window.electronAPI.openDisplay(w, h); 
                    } catch (e) {
                        console.error('[LeftRail] 打开显示端失败:', e);
                    }
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

        // 检查是否应该显示开发者按钮
        const shouldShowDevButton = ref(false);
        
        // 检查开发环境或从 localStorage 读取
        const checkDevButtonVisibility = async () => {
            try {
                console.log('[LeftRail] checkDevButtonVisibility: 开始检查...');
                
                let isPackaged = true; // 默认假设是打包环境
                
                // 检查是否是开发环境
                if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.isPackaged === 'function') {
                    console.log('[LeftRail] 调用 isPackaged API...');
                    isPackaged = await window.electronAPI.isPackaged();
                    console.log('[LeftRail] isPackaged 结果:', isPackaged);
                    
                    if (!isPackaged) {
                        // 开发环境，默认显示开发者按钮
                        shouldShowDevButton.value = true;
                        console.log('[LeftRail] ✅ 开发环境，显示开发者按钮');
                        return;
                    }
                } else {
                    // 如果 API 不可用，通过 URL 判断
                    if (typeof window !== 'undefined' && window.location) {
                        const href = window.location.href || '';
                        const isDevUrl = href.includes('localhost') || 
                                       href.includes('127.0.0.1') ||
                                       href.includes('5173') || // Vite 默认端口
                                       href.includes('5174'); // Vite 备用端口
                        if (isDevUrl) {
                            shouldShowDevButton.value = true;
                            console.log('[LeftRail] ✅ 检测到开发 URL，显示开发者按钮');
                            return;
                        }
                    }
                    console.log('[LeftRail] isPackaged API 不可用，假设为打包环境');
                }
                
                // 打包环境：完全隐藏开发者按钮
                // 打包环境中不应该显示开发者按钮，即使用户之前设置过标记
                if (isPackaged) {
                    shouldShowDevButton.value = false; // 打包环境强制隐藏
                    console.log('[LeftRail] 打包环境，强制隐藏开发者按钮（忽略 localStorage 中的标记）');
                    // 清除 localStorage 中的标记，确保不会意外显示
                    if (typeof window !== 'undefined' && window.localStorage) {
                        try {
                            localStorage.removeItem('metro_pids_dev_button_enabled');
                            console.log('[LeftRail] 已清除打包环境中的开发者按钮标记');
                        } catch (e) {
                            console.warn('[LeftRail] 清除 localStorage 标记失败:', e);
                        }
                    }
                }
                
                console.log('[LeftRail] checkDevButtonVisibility: 最终结果 shouldShowDevButton =', shouldShowDevButton.value);
            } catch (e) {
                console.error('[LeftRail] ❌ 检查开发者按钮可见性失败:', e);
                // 出错时默认隐藏（打包环境）
                shouldShowDevButton.value = false;
            }
        };
        
        // 监听 localStorage 变化，以便在快速点击5次后实时更新
        const setupLocalStorageListener = () => {
            if (typeof window === 'undefined' || !window.addEventListener) return;
            
            // 监听 storage 事件（跨标签页/窗口）
            window.addEventListener('storage', async (e) => {
                if (e.key === 'metro_pids_dev_button_enabled' && e.newValue === 'true') {
                    // 只有在打包环境中才响应这个事件（开发环境应该始终显示）
                    try {
                        let isPackaged = true;
                        if (window.electronAPI && typeof window.electronAPI.isPackaged === 'function') {
                            isPackaged = await window.electronAPI.isPackaged();
                        }
                        if (isPackaged) {
                            shouldShowDevButton.value = true;
                            console.log('[LeftRail] 通过 storage 事件检测到开发者按钮已启用（打包环境）');
                        }
                    } catch (err) {
                        console.error('[LeftRail] 检查打包状态失败:', err);
                    }
                }
            });
            
            // 定期检查（仅用于开发环境，打包环境不检查）
            const checkInterval = setInterval(async () => {
                if (typeof window !== 'undefined' && window.localStorage) {
                    // 先检查是否是打包环境
                    let isPackaged = true;
                    try {
                        if (window.electronAPI && typeof window.electronAPI.isPackaged === 'function') {
                            isPackaged = await window.electronAPI.isPackaged();
                        }
                    } catch (e) {
                        console.error('[LeftRail] 检查打包状态失败:', e);
                    }
                    
                    // 打包环境：强制隐藏，不检查 localStorage
                    if (isPackaged) {
                        if (shouldShowDevButton.value) {
                            shouldShowDevButton.value = false;
                            console.log('[LeftRail] 打包环境，强制隐藏开发者按钮');
                        }
                        // 清除可能存在的标记
                        if (localStorage.getItem('metro_pids_dev_button_enabled') === 'true') {
                            try {
                                localStorage.removeItem('metro_pids_dev_button_enabled');
                            } catch (e) {}
                        }
                    }
                    // 开发环境下，shouldShowDevButton 已经在 checkDevButtonVisibility 中设置为 true，不需要额外检查
                }
            }, 500); // 每500ms检查一次
            
            // 返回清理函数
            return () => {
                clearInterval(checkInterval);
            };
        };

        // 打开开发者窗口
        const openDevWindow = async () => {
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.openDevWindow) {
                try {
                    await window.electronAPI.openDevWindow();
                } catch (e) {
                    console.error('打开开发者窗口失败:', e);
                }
            } else {
                // 浏览器环境，使用弹窗
                const url = 'dev_window.html';
                window.open(url, '_blank', 'width=1000,height=700');
            }
        };

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
        let localStorageListenerCleanup = null;
        onMounted(async () => {
            // 检查是否应该显示开发者按钮
            console.log('[LeftRail] onMounted: 开始检查开发者按钮可见性...');
            console.log('[LeftRail] onMounted: window.electronAPI =', typeof window !== 'undefined' ? window.electronAPI : 'undefined');
            await checkDevButtonVisibility();
            console.log('[LeftRail] onMounted: shouldShowDevButton =', shouldShowDevButton.value);
            console.log('[LeftRail] onMounted: uiState.showDevButton =', uiState.showDevButton);
            console.log('[LeftRail] onMounted: 显示条件 =', shouldShowDevButton.value || uiState.showDevButton);
            
            // 设置 localStorage 监听器，以便在快速点击5次后实时更新
            localStorageListenerCleanup = setupLocalStorageListener();
            
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
            if (localStorageListenerCleanup) {
                localStorageListenerCleanup();
            }
        });

        return {
            uiState,
            togglePanel: handleTogglePanel,
            closePanel: handleClosePanel,
            btnStyle,
            homeBtnStyle,
            displayBtnStyle,
            handleDisplayAction,
            openGithub,
            hasUpdate,
            showReleaseNotes,
            releaseNotes,
            loadingNotes,
            openReleaseNotes,
            closeReleaseNotes,
            formatReleaseBody,
            openDevWindow,
            shouldShowDevButton,
            currentDisplayInfo
        }
    },
    template: `
    <div id="leftRail" class="left-rail-blur" style="position:relative; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:60px; padding-bottom:20px;">
      
      <!-- Top Section -->
      <div id="railInner" style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:16px; flex:1;">
        
        <button 
            class="ft-btn" 
            :style="homeBtnStyle()"
            @click="closePanel()" 
            title="主页"
        >
            <i class="fas fa-home" style="font-size:20px;"></i>
        </button>
        
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
            :title="'显示预览 - ' + currentDisplayInfo.displayName"
        >
            <i class="fas fa-desktop" style="font-size:20px;"></i>
        </button>
        
        <!-- 开发者按钮 -->
        <button 
            v-if="shouldShowDevButton"
            class="ft-btn" 
            :style="{ width: '48px', height: '48px', borderRadius: '12px', border: 'none', background: 'transparent', color: 'var(--muted)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'none', margin: '0 auto' }"
            @click="openDevWindow()" 
            title="开发者模式"
        >
            <i class="fas fa-code" style="font-size:20px;"></i>
        </button>
        
        <!-- third-party display button removed -->
      </div>

      <!-- Bottom Section -->
      <div style="width:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:12px; margin-top:auto;">
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
            :style="{ width: '48px', height: '48px', borderRadius: '12px', border: 'none', background: 'var(--rail-btn-bg)', color: 'var(--rail-btn-text)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }"
            @click="openGithub()"
            title="Github"
        >
            <i class="fab fa-github" style="font-size:20px;"></i>
        </button>
      </div>

    </div>
    `
}
