import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import dialogService from '../utils/dialogService.js'
import { ref, computed } from 'vue'

export default {
  name: 'SlidePanel',
  setup() {
    const { uiState, closePanel } = useUIState()
        const { state: pidsState, sync: syncState } = usePidsState()
        const { next: controllerNext, sync, getStep } = useController()

        // shouldStop：到达终点站时停止自动播放
        function shouldStop() {
            try {
                if (!pidsState || !pidsState.appData) return false;
                const meta = pidsState.appData.meta || {};
                const idx = (pidsState.rt && typeof pidsState.rt.idx === 'number') ? pidsState.rt.idx : 0;
                // 计算单线/短交路可行索引范围
                const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
                const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : (pidsState.appData.stations ? pidsState.appData.stations.length - 1 : 0);
                const minIdx = Math.min(sIdx, eIdx);
                const maxIdx = Math.max(sIdx, eIdx);

                // 环线模式不自动停止
                if (meta.mode === 'loop') return false;

                // 根据 getStep 判定方向（>0 向后，<0 向前）
                const step = (typeof getStep === 'function') ? getStep() : 1;
                const terminalIdx = step > 0 ? maxIdx : minIdx;

                // 仅当当前索引抵达方向终点且处于到站态(rt.state===0)才停止，避免刚启动即停
                const rtState = pidsState.rt && (typeof pidsState.rt.state === 'number') ? pidsState.rt.state : 0;
                if (idx === terminalIdx && rtState === 0) return true;
            } catch (e) {
                console.error('shouldStop error', e);
            }
            return false;
        }

        const autoplay = useAutoplay(controllerNext, shouldStop)
        const { isPlaying, isPaused, nextIn, start, stop, togglePause } = autoplay
    const fileIO = useFileIO(pidsState)
    const { settings, saveSettings } = useSettings()

    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)
    const promptUser = async (msg, defaultValue, title) => dialogService.prompt(msg, defaultValue, title)

    // 兼容旧数据，补齐 serviceMode
    if (!pidsState.appData.meta.serviceMode) pidsState.appData.meta.serviceMode = 'normal';

    function changeServiceMode(mode) {
        const meta = pidsState.appData.meta || {};
        meta.serviceMode = mode;
        // 直达车：强制起终点为首尾
        if (mode === 'direct' && pidsState.appData.stations && pidsState.appData.stations.length > 0) {
            meta.startIdx = 0;
            meta.termIdx = pidsState.appData.stations.length - 1;
        }
        saveCfg();
    }

    const serviceModeLabel = computed(() => {
        const mode = (pidsState.appData.meta && pidsState.appData.meta.serviceMode) ? pidsState.appData.meta.serviceMode : 'normal';
        if (mode === 'express') return '大站车';
        if (mode === 'direct') return '直达';
        return '普通';
    });

    function switchLine(idx) {
        pidsState.store.cur = parseInt(idx);
        pidsState.appData = pidsState.store.list[pidsState.store.cur];
        pidsState.rt = { idx: 0, state: 0 };
        sync();
    }

    async function newLine() {
        const name = await promptUser('请输入新线路名称 (例如: 3号线)', '新线路');
        if (!name) return;
        const newL = JSON.parse(JSON.stringify(pidsState.DEF));
        newL.meta.lineName = name;
        newL.meta.themeColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        if (!newL.meta.serviceMode) newL.meta.serviceMode = 'normal';
        pidsState.store.list.push(newL);
        switchLine(pidsState.store.list.length - 1);
    }

    async function delLine() {
        if (pidsState.store.list.length <= 1) { await showMsg('至少保留一条线路！'); return; }
        if (!await askUser('确定要删除当前线路 "' + pidsState.appData.meta.lineName + '" 吗？\n删除后无法恢复！')) return;
        pidsState.store.list.splice(pidsState.store.cur, 1);
        pidsState.store.cur = 0;
        pidsState.appData = pidsState.store.list[0];
        pidsState.rt = { idx: 0, state: 0 };
        sync();
    }

    function saveCfg() {
        sync();
    }

    async function applyShortTurn() {
        saveCfg();
        const startName = pidsState.appData.meta.startIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.startIdx].name : '无';
        const termName = pidsState.appData.meta.termIdx >= 0 ? pidsState.appData.stations[pidsState.appData.meta.termIdx].name : '无';
        await showMsg(`短交路设置已应用！\n起点: ${startName}\n终点: ${termName}`);
    }

    async function clearShortTurn() {
        if (await askUser('确定要清除短交路设置吗？')) {
            pidsState.appData.meta.startIdx = -1;
            pidsState.appData.meta.termIdx = -1;
            saveCfg();
        }
    }

    const keyMapDisplay = {
        arrdep: { label: '进站/离站 (Next State)' },
        prev: { label: '上一站 (Prev Station)' },
        next: { label: '下一站 (Next Station)' }
    };

    function recordKey(keyName, event) {
        event.preventDefault();
        event.stopPropagation();
        settings.keys[keyName] = event.code;
        saveSettings();
        event.target.blur();
    }

    function clearKey(keyName) {
        settings.keys[keyName] = '';
        saveSettings();
    }

    async function resetKeys() {
        if(await askUser('确定要重置所有快捷键吗？')) {
             settings.keys = { arrdep: 'Enter', prev: 'ArrowLeft', next: 'ArrowRight' };
             saveSettings();
        }
    }

        // 更新模块状态（检查中/可用/下载中/已下载）
    const updateState = ref({ checking: false, available: false, downloading: false, downloaded: false, progress: 0, info: null });

        const version = ref('未知');
        (async () => {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getAppVersion) {
                    const r = await window.electronAPI.getAppVersion();
                    if (r && r.ok && r.version) version.value = r.version;
                }
            } catch (e) {}
        })();

        // 配置更新事件监听（仅在 Electron 环境）
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                window.electronAPI.onUpdateAvailable((info) => {
                    updateState.value.checking = false;
                    updateState.value.available = true;
                    updateState.value.downloaded = false;
                    updateState.value.info = info || null;
                    // 不再自动弹出对话框，由用户手动点击下载
                });

                window.electronAPI.onUpdateNotAvailable(() => {
                    updateState.value.checking = false;
                    showMsg('当前已是最新版本');
                });

                window.electronAPI.onUpdateError((err) => {
                    updateState.value.checking = false;
                    showMsg('更新错误：' + String(err));
                });

                window.electronAPI.onUpdateProgress((p) => {
                    try {
                        if (p && p.percent) updateState.value.progress = Math.round(p.percent);
                        else if (p && p.transferred && p.total) updateState.value.progress = Math.round((p.transferred / p.total) * 100);
                        updateState.value.downloaded = false;
                    } catch (e) {}
                });

                window.electronAPI.onUpdateDownloaded((info) => {
                    updateState.value.downloading = false;
                    updateState.value.progress = 100;
                    updateState.value.downloaded = true;
                    updateState.value.info = info || updateState.value.info;
                    // 不再自动弹出对话框，由用户手动点击安装
                });
            } catch (e) {
                // 可忽略监听安装异常
            }
        }

        async function checkForUpdateClicked() {
            if (typeof window === 'undefined' || !window.electronAPI) {
                showMsg('当前不是 Electron 环境，无法检查更新');
                return;
            }
            updateState.value.checking = true;
            updateState.value.available = false;
        updateState.value.downloaded = false;
            try {
                const r = await window.electronAPI.checkForUpdates();
                if (!r || !r.ok) {
                    updateState.value.checking = false;
                    showMsg('检查更新失败：' + (r && r.error ? r.error : '未知'));
                }
            } catch (e) {
                updateState.value.checking = false;
                showMsg('检查更新出错：' + String(e));
            }
        }

    async function downloadUpdateNow() {
        if (!window.electronAPI) return;
        updateState.value.downloading = true;
        updateState.value.downloaded = false;
        const r = await window.electronAPI.downloadUpdate();
        if (!r || !r.ok) {
            updateState.value.downloading = false;
            showMsg('下载失败：' + (r && r.error ? r.error : '未知错误'));
        }
    }

    async function installDownloadedUpdate() {
        if (!window.electronAPI) return;
        updateState.value.downloading = false;
        await window.electronAPI.installUpdate();
    }

    async function skipThisVersion() {
        if (!window.electronAPI || !updateState.value.info) return;
        const version = updateState.value.info.version;
        if (version) {
            const r = await window.electronAPI.skipVersion(version);
            if (r && r.ok) {
                updateState.value.available = false;
                updateState.value.downloaded = false;
                showMsg('已跳过此版本，下次有更高版本时会再次提示');
            } else {
                showMsg('跳过版本失败：' + (r && r.error ? r.error : '未知错误'));
            }
        }
    }

    // 显示端/第三方相关辅助（展示预览已移除）

    // 自动播放包装：先锁定界面并提示
    // 确保显示端已开启；若未开启则尝试按设置分辨率拉起
    async function ensureDisplayOpen() {
        try {
            // Electron 原生窗口
            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function') {
                const dw = (settings.display && settings.display.width) ? Number(settings.display.width) : 1900;
                const dh = (settings.display && settings.display.height) ? Number(settings.display.height) : 600;
                await window.electronAPI.openDisplay(dw, dh);
                return true;
            }
        } catch (e) {}

        // 浏览器弹窗
        try {
            const hasPopup = window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed;
            let url = '';
            if (settings.display.source === 'builtin') url = 'display_window.html';
            else if (settings.display.source === 'gitee') url = settings.display.url || '';
            else url = settings.display.url || '';
            if (!hasPopup && url) {
                const w = window.open(url, '_blank');
                if (w) {
                    window.__metro_pids_display_popup = w;
                    window.__metro_pids_display_popup_ready = false;
                    try { await waitForPopupReady(w, 3000); } catch (e) {}
                    return true;
                }
            }
            return hasPopup;
        } catch (e) {
            return false;
        }
    }

    async function startWithLock(intervalSec = 8) {
        if (uiState.autoLocked) return;
        const ok = await askUser('开启自动播放将锁定控制面板，期间请不要操作控制界面，是否继续？');
        if (!ok) return;
        uiState.autoLocked = true;
        try {
            // 确保显示端已打开并绑定
            await ensureDisplayOpen();

            // 发送初次同步，确保显示端状态最新
            try { sync(); } catch(e){}

            start(intervalSec);
        } catch (e) {
            uiState.autoLocked = false;
            throw e;
        }
    }

    // 等待弹窗加载：同源可监听 load/readyState，跨域无法读 document 时退回短延时
    function waitForPopupReady(winRef, timeoutMs = 2000) {
        return new Promise((resolve, reject) => {
            if (!winRef) return reject(new Error('no window'));
            let done = false;
            const cleanup = () => { done = true; try { if (winRef && winRef.removeEventListener) winRef.removeEventListener('load', onLoad); } catch(e){} };
            const onLoad = () => {
                try { window.__metro_pids_display_popup_ready = true; } catch (e) {}
                cleanup();
                resolve(true);
            };
            try {
                // 同源情况下尝试绑定 load 事件
                if (winRef.addEventListener) {
                    winRef.addEventListener('load', onLoad, { once: true });
                }
                // 同源情况下轮询 readyState
                let elapsed = 0;
                const step = 100;
                const poll = setInterval(() => {
                    try {
                        if (done) { clearInterval(poll); return; }
                        if (!winRef || winRef.closed) { clearInterval(poll); cleanup(); return reject(new Error('closed')); }
                        let rs = null;
                        try { rs = winRef.document && winRef.document.readyState; } catch (e) { rs = null; }
                        if (rs === 'complete' || rs === 'interactive') {
                            try { window.__metro_pids_display_popup_ready = true; } catch (e) {}
                            clearInterval(poll); cleanup(); return resolve(true);
                        }
                        elapsed += step;
                        if (elapsed >= timeoutMs) {
                            clearInterval(poll);
                            // 超时则标记未就绪但继续
                            try { window.__metro_pids_display_popup_ready = false; } catch (e) {}
                            return resolve(false);
                        }
                    } catch (e) {
                        clearInterval(poll);
                        // 跨域则直接走回退
                        try { window.__metro_pids_display_popup_ready = false; } catch (ee) {}
                        return resolve(false);
                    }
                }, step);
            } catch (e) {
                try { window.__metro_pids_display_popup_ready = false; } catch (ee) {}
                return resolve(false);
            }
        });
    }

    function stopWithUnlock() {
        try { stop(); } catch (e) {}
        uiState.autoLocked = false;
    }

    // 录制前先检查是否已连接显示端
    async function startRecordingWithCheck(bps = 800000, timeoutMs = 1500) {
        try {
            const hasBroadcast = !!(pidsState && pidsState.bcWrap && typeof pidsState.bcWrap.post === 'function');
            // 快速检测：若无广播包装，改用 postMessage 询问弹窗
            let responded = false;

            const onResp = (data) => {
                if (!data) return;
                if (data.t === 'SYNC' || data.t === 'REC_STARTED' || data.t === 'REC_ACK') {
                    responded = true;
                }
            };

            // 若有 BroadcastChannel 包装则监听其消息
            if (hasBroadcast) {
                try {
                    pidsState.bcWrap.onMessage((msg) => onResp(msg));
                } catch (e) {}
            }

            // 同时监听 window message
            const winHandler = (ev) => { try { onResp(ev.data); } catch(e){} };
            if (typeof window !== 'undefined') window.addEventListener('message', winHandler);

            // 发送 REQ 请求显示端回应
            try {
                if (hasBroadcast) pidsState.bcWrap.post({ t: 'REQ' });
                else if (typeof window !== 'undefined' && window.postMessage) window.postMessage({ t: 'REQ' }, '*');
            } catch (e) {}

            // 等待短暂超时
            await new Promise((res) => setTimeout(res, timeoutMs));

            // 清理监听
            try { if (hasBroadcast) {/* wrapper listener will naturally persist; not removing here for simplicity */} } catch(e){}
            if (typeof window !== 'undefined') window.removeEventListener('message', winHandler);

            if (!responded) {
                await showMsg('未检测到已打开的显示端，录制无法启动。请先打开显示端或确认显示端已连接。');
                return false;
            }

            // 发送 REC_START
            try {
                if (hasBroadcast) pidsState.bcWrap.post({ t: 'REC_START', bps });
                else if (typeof window !== 'undefined' && window.postMessage) window.postMessage({ t: 'REC_START', bps }, '*');
            } catch (e) {}

            // 更新本地状态标记
            try { pidsState.isRec = true; } catch (e) {}
            await showMsg('已向显示端发送录制开始命令');
            return true;
        } catch (e) {
            console.error('startRecordingWithCheck error', e);
            await showMsg('启动录制时发生错误：' + String(e));
            return false;
        }
    }

        return {
            uiState,
            closePanel,
            ...autoplay,
            isPlaying, isPaused, nextIn, start, stop, togglePause,
            fileIO,
            pidsState,
            switchLine, newLine, delLine, saveCfg, clearShortTurn, applyShortTurn,
            settings, saveSettings, keyMapDisplay, recordKey, clearKey, resetKeys,
            updateState, checkForUpdateClicked, downloadUpdateNow, installDownloadedUpdate, skipThisVersion,
            version,
            startWithLock, stopWithUnlock, startRecordingWithCheck,
            changeServiceMode, serviceModeLabel
        }
    },
  template: `
    <div v-if="uiState.activePanel" id="slideOverlay" style="position:fixed; left:0; top:32px; bottom:0; right:0; z-index:180;" @click.self="closePanel">
        <div id="slideBackdrop" style="position:absolute; left:0; top:0; right:0; bottom:0; background:transparent; z-index:170;" @click="closePanel"></div>
    </div>

    <!-- Global auto-play lock overlay (covers entire app) -->
    <div v-if="uiState.autoLocked" style="position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; flex-direction:column; color:var(--card-foreground, #fff); padding:20px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: backdrop-filter .24s ease, background .24s ease;">
        <div style="font-size:20px; font-weight:800; margin-bottom:10px;">自动播放进行中 — 整个应用已锁定</div>
        <div style="font-size:14px; opacity:0.95; margin-bottom:18px; text-align:center; max-width:680px;">为避免干扰演示，请勿操作控制面板或其他窗口内容。若需停止自动播放，请使用下面的按钮。</div>
        <div style="display:flex; gap:10px;">
            <button class="btn" v-if="!isPaused" style="background:#ffa502; color:white; border:none; padding:10px 14px; border-radius:6px; font-weight:bold;" @click="togglePause()">暂停</button>
            <button class="btn" v-else style="background:#1e90ff; color:white; border:none; padding:10px 14px; border-radius:6px; font-weight:bold;" @click="togglePause()">继续</button>
            <button class="btn" style="background:#ff6b6b; color:white; border:none; padding:10px 14px; border-radius:6px; font-weight:bold;" @click="stopWithUnlock()">停止自动播放</button>
        </div>
    </div>
    <div id="slidePanel" :style="{ transform: uiState.activePanel ? 'translateX(0)' : 'translateX(-420px)' }" style="position:fixed; left:72px; top:32px; bottom:0; width:420px; z-index:220; background:var(--card); box-shadow: var(--slide-panel-shadow, 6px 0 30px rgba(0,0,0,0.12)); transition: transform 0.32s; overflow:auto;">
      
      
      <!-- Panel 1: PIDS Console -->
      <div v-if="uiState.activePanel === 'panel-1'" class="panel-body" style="padding:24px 16px;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
            <div style="text-align:left;">
                <div style="font-size:24px; font-weight:800; color:var(--text); letter-spacing:1px;">PIDS 控制台</div>
                <div style="font-size:12px; font-weight:bold; color:var(--muted); opacity:0.7; margin-top:4px;">V2-Multi Stable</div>
            </div>
        </div>
        
        <!-- Multi-Line Management -->
        <div class="card" style="border-left: 6px solid #FF9F43; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#FF9F43; font-weight:bold; margin-bottom:12px; font-size:15px;">多线路切换 (Multi-Line)</div>
            <select :value="pidsState.store.cur" @change="switchLine($event.target.value)" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); margin-bottom:16px; font-weight:bold; color:var(--text); background:var(--card);">
                <option v-for="(l, i) in pidsState.store.list" :key="i" :value="i">[{{i+1}}] {{ l.meta.lineName }}</option>
            </select>
            <div style="display:flex; gap:12px;">
                <button class="btn" style="flex:1; background:#FF9F43; color:white; border:none; border-radius:6px; padding:10px; font-weight:bold;" @click="newLine()"><i class="fas fa-plus"></i> 新建</button>
                <button class="btn" style="flex:1; background:#FF6B6B; color:white; border:none; border-radius:6px; padding:10px; font-weight:bold;" @click="delLine()"><i class="fas fa-trash"></i> 删除</button>
            </div>
        </div>

        <!-- Line Settings -->
        <div class="card" style="border-left: 6px solid #FF4757; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="color:#FF4757; font-weight:bold; font-size:15px;">线路设置</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:var(--muted);">运营模式</span>
                    <div style="display:flex; gap:6px;">
                        <span v-if="pidsState.appData.meta.serviceMode==='express'" style="padding:4px 8px; border-radius:4px; border:1px solid #ffa502; color:#ffa502; font-weight:bold; background:rgba(255,165,2,0.12);">大站车</span>
                        <span v-else-if="pidsState.appData.meta.serviceMode==='direct'" style="padding:4px 8px; border-radius:4px; border:1px solid #ff4757; color:#ff4757; font-weight:bold; background:rgba(255,71,87,0.12);">直达</span>
                        <span v-else style="padding:4px 8px; border-radius:4px; border:1px solid var(--divider); color:var(--text); font-weight:bold; background:var(--card);">普通</span>
                    </div>
                </div>
            </div>
            
            <input v-model="pidsState.appData.meta.lineName" placeholder="线路名称" @input="saveCfg()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); margin-bottom:12px; background:var(--card); color:var(--text);">
            
            <div style="display:flex; gap:12px; margin-bottom:12px;">
                <input type="color" v-model="pidsState.appData.meta.themeColor" style="height:42px; width:60px; padding:0; border:none; border-radius:6px; cursor:pointer;" title="主题色" @input="saveCfg()">
                <select v-model="pidsState.appData.meta.mode" @change="saveCfg()" style="flex:1; padding:10px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--text);">
                    <option value="loop">环线 (Loop)</option>
                    <option value="linear">单线 (Linear)</option>
                </select>
            </div>
            
            <select v-model="pidsState.appData.meta.dirType" @change="saveCfg()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); margin-bottom:20px; background:var(--card); color:var(--text);">
                <template v-if="pidsState.appData.meta.mode === 'loop'">
                    <option value="outer">外环 (逆时针)</option>
                    <option value="inner">内环 (顺时针)</option>
                </template>
                <template v-else>
                    <option value="up">上行 ({{ pidsState.appData.stations[0]?.name }} -> {{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }})</option>
                    <option value="down">下行 ({{ pidsState.appData.stations[pidsState.appData.stations.length-1]?.name }} -> {{ pidsState.appData.stations[0]?.name }})</option>
                </template>
            </select>

            <div style="margin-bottom:16px;">
                <div style="font-size:13px; font-weight:bold; color:var(--muted); margin-bottom:8px;">运营模式</div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn" :style="{
                        padding:'10px 14px',
                        borderRadius:'10px',
                        border:'1px solid var(--divider)',
                        background: pidsState.appData.meta.serviceMode==='normal' ? 'var(--btn-blue-bg)' : 'var(--card)',
                        color: pidsState.appData.meta.serviceMode==='normal' ? '#fff' : 'var(--text)',
                        boxShadow: pidsState.appData.meta.serviceMode==='normal' ? '0 4px 12px rgba(22,119,255,0.25)' : 'none',
                        fontWeight:'bold',
                        minWidth:'92px'
                    }" @click="changeServiceMode('normal')">普通</button>
                    <button class="btn" :style="{
                        padding:'10px 14px',
                        borderRadius:'10px',
                        border:'1px solid var(--divider)',
                        background: pidsState.appData.meta.serviceMode==='express' ? '#ffa502' : 'var(--card)',
                        color: pidsState.appData.meta.serviceMode==='express' ? '#fff' : 'var(--text)',
                        boxShadow: pidsState.appData.meta.serviceMode==='express' ? '0 4px 12px rgba(255,165,2,0.25)' : 'none',
                        fontWeight:'bold',
                        minWidth:'92px'
                    }" @click="changeServiceMode('express')">大站车</button>
                    <button class="btn" :style="{
                        padding:'10px 14px',
                        borderRadius:'10px',
                        border:'1px solid var(--divider)',
                        background: pidsState.appData.meta.serviceMode==='direct' ? '#ff4757' : 'var(--card)',
                        color: pidsState.appData.meta.serviceMode==='direct' ? '#fff' : 'var(--text)',
                        boxShadow: pidsState.appData.meta.serviceMode==='direct' ? '0 4px 12px rgba(255,71,87,0.25)' : 'none',
                        fontWeight:'bold',
                        minWidth:'92px'
                    }" @click="changeServiceMode('direct')">直达</button>
                </div>
                <div style="font-size:12px; color:var(--muted); margin-top:8px; line-height:1.5;">
                    普通：全停；大站车：首末及换乘站停；直达：仅首末站。
                </div>
            </div>

            <!-- Short Turn Settings -->
            <div style="font-size:13px; color:var(--muted); margin-bottom:12px; font-weight:bold;">短交路设置</div>
            
            <div style="display:grid; grid-template-columns: 40px 1fr; gap:12px; align-items:center; margin-bottom:12px;">
                <label style="color:var(--muted);">起点</label>
                <select v-model="pidsState.appData.meta.startIdx" style="padding:8px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--text);">
                    <option :value="-1">无</option>
                    <option v-for="(s,i) in pidsState.appData.stations" :key="'s'+i" :value="i">[{{i+1}}] {{s.name}}</option>
                </select>
            </div>
            
            <div style="display:grid; grid-template-columns: 40px 1fr; gap:12px; align-items:center; margin-bottom:16px;">
                <label style="color:var(--muted);">终点</label>
                <select v-model="pidsState.appData.meta.termIdx" style="padding:8px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--text);">
                     <option :value="-1">无</option>
                     <option v-for="(s,i) in pidsState.appData.stations" :key="'e'+i" :value="i">[{{i+1}}] {{s.name}}</option>
                </select>
            </div>
            
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button @click="clearShortTurn()" class="btn" style="background:#CED6E0; color:#2F3542; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">清除</button>
                <button @click="applyShortTurn()" class="btn" style="background:#FF4757; color:white; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">应用</button>
            </div>
        </div>

        <!-- File Storage -->
        <div class="card" style="border-left: 6px solid #747D8C; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#747D8C; font-weight:bold; margin-bottom:12px; font-size:15px;">线路存储设置</div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button class="btn" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 4px; background:#DFE4EA; color:#2F3542; border:none; border-radius:6px; font-size:12px; gap:6px;" @click="fileIO.refreshLinesFromFolder()">
                    <i class="fas fa-sync-alt" style="font-size:14px;"></i> 刷新线路
                </button>
                <button class="btn" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 4px; background:#DFE4EA; color:#2F3542; border:none; border-radius:6px; font-size:12px; gap:6px;" @click="fileIO.openLinesFolder()">
                    <i class="fas fa-folder-open" style="font-size:14px;"></i> 打开文件夹
                </button>
                <button class="btn" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px 4px; background:#DFE4EA; color:#2F3542; border:none; border-radius:6px; font-size:12px; gap:6px;" @click="fileIO.saveCurrentLine()">
                    <i class="fas fa-save" style="font-size:14px;"></i> 保存当前线路
                </button>
            </div>
            <button class="btn" style="width:100%; background:#FF6B6B; color:white; padding:10px; border-radius:6px; border:none; font-weight:bold;" @click="fileIO.resetData()">
                <i class="fas fa-trash-alt"></i> 重置数据
            </button>
        </div>

        <!-- Autoplay Control -->
        <div class="card" style="border-left: 6px solid #1E90FF; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#1E90FF; font-weight:bold; margin-bottom:12px; font-size:15px;">自动播放</div>
            
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <span style="color:var(--text);">自动播放</span>
                <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                    <input type="checkbox" :checked="isPlaying" @change="isPlaying ? stopWithUnlock() : startWithLock(8)" style="opacity:0; width:0; height:0;">
                    <span :style="{
                        position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0, 
                        backgroundColor: isPlaying ? 'var(--accent)' : '#ccc', 
                        transition:'.4s', borderRadius:'24px'
                    }"></span>
                    <span :style="{
                        position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px', 
                        backgroundColor:'white', transition:'.4s', borderRadius:'50%',
                        transform: isPlaying ? 'translateX(20px)' : 'translateX(0)'
                    }"></span>
                </label>
            </div>
            
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="color:var(--muted); font-size:14px;">启用间隔:</span>
                <input type="number" :value="8" style="width:80px; padding:6px; border-radius:4px; border:1px solid var(--divider); text-align:center;">
                <span v-if="isPlaying" style="font-size:12px; color:var(--muted);">({{ nextIn }}s)</span>
            </div>
        </div>

      </div>

      <!-- Panel 4: Settings -->
      <div v-if="uiState.activePanel === 'panel-4'" class="panel-body" style="padding:24px 16px;">
        
        <!-- Header -->
        <div style="text-align:center; margin-bottom:24px;">
            <div style="font-size:24px; font-weight:800; color:var(--text); letter-spacing:1px;">设置</div>
            <div style="font-size:12px; font-weight:bold; color:var(--muted); opacity:0.7; margin-top:4px;">Preferences</div>
        </div>
        
        <!-- Theme Settings -->
        <div class="card" style="border-left: 6px solid #2ED573; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#2ED573; font-weight:bold; margin-bottom:16px; font-size:15px;">外观 (Appearance)</div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; color:var(--muted); margin-bottom:8px;">主题模式</label>
                <select v-model="settings.themeMode" @change="saveSettings()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--text);">
                    <option value="system">跟随系统 (System)</option>
                    <option value="light">浅色 (Light)</option>
                    <option value="dark">深色 (Dark)</option>
                </select>
            </div>

            <!-- 深色模式变体 已移除 -->
        </div>

        <!-- Service Mode Quick Switch -->
        <div class="card" style="border-left: 6px solid #ff9f43; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#ff9f43; font-weight:bold; margin-bottom:12px; font-size:15px;">运营模式</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn" :class="{active: pidsState.appData.meta.serviceMode==='normal'}" style="padding:10px 12px; border-radius:6px; border:1px solid var(--divider); background: pidsState.appData.meta.serviceMode==='normal' ? 'var(--btn-blue-bg)' : 'var(--card)'; color: pidsState.appData.meta.serviceMode==='normal' ? '#fff' : 'var(--text)';" @click="changeServiceMode('normal')">普通</button>
                <button class="btn" :class="{active: pidsState.appData.meta.serviceMode==='express'}" style="padding:10px 12px; border-radius:6px; border:1px solid var(--divider); background: pidsState.appData.meta.serviceMode==='express' ? '#ffa502' : 'var(--card)'; color: pidsState.appData.meta.serviceMode==='express' ? '#fff' : 'var(--text)';" @click="changeServiceMode('express')">大站车</button>
                <button class="btn" :class="{active: pidsState.appData.meta.serviceMode==='direct'}" style="padding:10px 12px; border-radius:6px; border:1px solid var(--divider); background: pidsState.appData.meta.serviceMode==='direct' ? '#ff4757' : 'var(--card)'; color: pidsState.appData.meta.serviceMode==='direct' ? '#fff' : 'var(--text)';" @click="changeServiceMode('direct')">直达</button>
            </div>
            <div style="font-size:12px; color:var(--muted); margin-top:10px; line-height:1.5;">
                普通：全停<br/>
                大站车：仅停首末站与换乘站<br/>
                直达：仅停首末站
            </div>
        </div>

        <!-- Keybindings -->
        <div class="card" style="border-left: 6px solid #1E90FF; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#1E90FF; font-weight:bold; margin-bottom:16px; font-size:15px;">快捷键 (Keybindings)</div>
            
            <div style="display:flex; flex-direction:column; gap:12px;">
                <div v-for="(val, key) in keyMapDisplay" :key="key" style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px dashed var(--divider);">
                    <span style="font-size:14px; color:var(--text);">{{ val.label }}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input 
                            :value="settings.keys[key]" 
                            @keydown="recordKey(key, $event)"
                            readonly
                            placeholder="按下按键..."
                            style="width:100px; text-align:center; cursor:pointer; font-family:monospace; font-weight:bold; padding:6px 10px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--accent);"
                        >
                        <button @click="clearKey(key)" class="btn" style="padding:6px 10px; background:var(--btn-gray-bg); color:var(--text);" title="清除快捷键"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            </div>
            
            <div style="margin-top:16px; font-size:12px; color:var(--muted); background:rgba(0,0,0,0.03); padding:8px; border-radius:6px; margin-bottom:12px;">
                <i class="fas fa-info-circle"></i> 点击输入框并按下键盘按键以修改快捷键。
            </div>

            <button class="btn" style="width:100%; background:var(--btn-red-bg); color:white; padding:10px; border-radius:6px; border:none; font-weight:bold;" @click="resetKeys()">
                <i class="fas fa-undo"></i> 重置所有快捷键
            </button>
        </div>

        <!-- Version & Update -->
        <div class="card" style="border-left: 6px solid #4b7bec; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#4b7bec; font-weight:bold; margin-bottom:12px; font-size:15px;">版本与更新</div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="font-size:14px; color:var(--text);">当前版本</div>
                <div style="font-weight:bold; color:var(--muted);">{{ version }}</div>
            </div>
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;">
                <button class="btn" style="flex:0 0 auto; background:#2d98da; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="checkForUpdateClicked()">检查更新</button>
                <div v-if="updateState.checking" style="font-size:12px; color:var(--muted);">检查中...</div>
                <div v-else-if="updateState.available && !updateState.downloading && !updateState.downloaded" style="font-size:12px; color:#4b7bec;">发现新版本 {{ (updateState.info && updateState.info.version) ? updateState.info.version : '' }}</div>
                <div v-else-if="updateState.downloaded" style="font-size:12px; color:#2ed573;">更新包已下载</div>
                <div v-else-if="updateState.downloading" style="font-size:12px; color:var(--muted);">下载中 {{ updateState.progress }}%</div>
            </div>
            <div v-if="updateState.available && !updateState.downloaded" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <button class="btn" style="background:#3867d6; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="downloadUpdateNow()" :disabled="updateState.downloading">
                    <i class="fas fa-download"></i> 下载更新
                </button>
                <button class="btn" style="background:#95a5a6; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="skipThisVersion()" :disabled="updateState.downloading">
                    <i class="fas fa-times"></i> 跳过此版本
                </button>
            </div>
            <div v-if="updateState.downloaded" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
                <button class="btn" style="background:#20bf6b; color:white; padding:8px 12px; border-radius:6px; border:none; font-weight:bold;" @click="installDownloadedUpdate()">
                    <i class="fas fa-check-circle"></i> 立即安装并重启
                </button>
            </div>
            <div v-if="updateState.downloading" style="margin-top:10px;">
                <div style="width:100%; height:12px; background:rgba(0,0,0,0.08); border-radius:6px; overflow:hidden; margin-bottom:6px;">
                    <div :style="{ width: updateState.progress + '%', height:'100%', background:'linear-gradient(90deg, #4b7bec 0%, #2d98da 100%)', transition:'width .3s ease', boxShadow:'0 0 10px rgba(75,123,236,0.3)' }"></div>
                </div>
                <div style="text-align:center; font-size:12px; color:var(--muted);">
                    下载进度: {{ updateState.progress }}% 
                    <span v-if="updateState.info && updateState.info.version">(版本 {{ updateState.info.version }})</span>
                </div>
            </div>
        </div>

      </div>

      <!-- Panel 5 removed: third-party display integration hidden -->

    </div>
  `
}
