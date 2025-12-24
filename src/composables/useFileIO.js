import dialogService from '../utils/dialogService.js'

export function useFileIO(state) {
    
    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)

    function normalizeLine(line) {
        if (!line || !line.meta) return line;
        if (!Array.isArray(line.stations)) line.stations = [];
        line.stations = line.stations.map(s => {
            if (typeof s !== 'object' || s === null) s = { name: String(s || ''), en: '', xfer: [] };
            if (!('door' in s)) s.door = 'left';
            if (!('skip' in s)) s.skip = false;
            if (!('dock' in s)) s.dock = 'both';
            if (!('xfer' in s) || !Array.isArray(s.xfer)) s.xfer = [];
            if (!('en' in s)) s.en = '';
            if (!('name' in s)) s.name = '';
            // 添加折返位置和大站停靠的默认值
            if (!('turnback' in s)) s.turnback = false;
            if (!('expressStop' in s)) s.expressStop = false;
            return s;
        });
        if (!line.meta.lineName) line.meta.lineName = '线路';
        if (!('startIdx' in line.meta)) line.meta.startIdx = -1;
        if (!('termIdx' in line.meta)) line.meta.termIdx = -1;
        // 确保 serviceMode 存在
        if (!('serviceMode' in line.meta)) line.meta.serviceMode = 'normal';
        return line;
    }

    async function saveCurrentLine() {
        if (!state || !state.store || !state.store.list) return;
        const cur = state.store.list[state.store.cur];
        if (!cur || !cur.meta || !cur.meta.lineName) {
            await showMsg('当前线路数据无效，无法保存');
            return;
        }
        const filename = cur.meta.lineName + '.json';
        
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.save === 'function') {
            try {
                const normalized = normalizeLine(JSON.parse(JSON.stringify(cur)));
                const res = await window.electronAPI.lines.save(filename, normalized);
                if (res && res.ok) {
                    await showMsg('线路已保存: ' + res.path);
                } else {
                    await showMsg('保存失败: ' + (res && res.error));
                }
            } catch (e) { await showMsg('保存失败: ' + e.message); }
            return;
        }
        await showMsg('无法保存：未检测到宿主文件保存接口。请先使用“打开文件夹”选择一个线路文件夹，再保存。');
    }

    async function openLinesFolder() {
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.openFolder === 'function') {
            const res = await window.electronAPI.lines.openFolder();
            if (!res || !res.ok) await showMsg('打开失败: ' + (res && res.error));
        } else {
            await showMsg('仅 Electron 环境支持打开保存目录');
        }
    }

    async function refreshLinesFromFolder() {
        if (!(window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.list === 'function')) {
            await showMsg('仅 Electron 环境支持从线路文件夹刷新');
            return;
        }
        try {
            const items = await window.electronAPI.lines.list();
            if (!Array.isArray(items) || items.length === 0) {
                await showMsg('未发现已保存的线路文件');
                return;
            }
            const detected = [];
            for (const it of items) {
                try {
                    const res = await window.electronAPI.lines.read(it.name);
                    if (res && res.ok && res.content) {
                        const d = res.content;
                        if (d && d.meta && Array.isArray(d.stations)) {
                            detected.push(normalizeLine(d));
                        }
                    }
                } catch (e) { console.warn('读取文件失败', it.name, e); }
            }

            if (detected.length === 0) {
                await showMsg('未检测到有效线路文件');
                return;
            }
            
            let added = 0, updated = 0;
            for (const it of detected) {
                const idx = state.store.list.findIndex(s => s.meta && s.meta.lineName === (it.meta && it.meta.lineName));
                if (idx >= 0) {
                    state.store.list[idx] = it; updated++; 
                } else {
                    state.store.list.push(it); added++; 
                }
            }
            state.store.cur = Math.max(0, state.store.list.length - 1);
            state.appData = state.store.list[state.store.cur];
            state.rt = { idx: 0, state: 0 };
            // 若可用则触发同步，否则依赖响应式更新
            if (typeof window.sync === 'function') window.sync();
            await showMsg('刷新完成，新增: ' + added + '，更新: ' + updated);
        } catch (e) {
            console.error(e);
            await showMsg('刷新失败: ' + (e && e.message));
        }
    }

    async function resetData() {
        if (await askUser("【警告】这将清空所有线路数据并恢复出厂设置，确定吗？")) {
            localStorage.removeItem('pids_global_store_v1');
            location.reload();
        }
    }

    return {
        saveCurrentLine,
        openLinesFolder,
        refreshLinesFromFolder,
        resetData
    }
}
