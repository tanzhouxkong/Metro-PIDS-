import dialogService from '../utils/dialogService.js'

/**
 * 清理文件名，移除不符合文件系统规则的字符
 * Windows 不允许的字符: < > : " / \ | ? * 以及控制字符
 * @param {string} filename - 原始文件名
 * @returns {string} - 清理后的文件名
 */
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') return 'untitled';
    
    // 先移除颜色标记（<color>文字</>），提取纯文本
    // 使用正则表达式匹配并提取标记内的文字
    let cleaned = filename.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
    
    // 移除 Windows 不允许的字符: < > : " / \ | ? *
    cleaned = cleaned.replace(/[<>:"/\\|?*]/g, '');
    
    // 移除控制字符（0x00-0x1F）和删除字符（0x7F）
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
    
    // 移除首尾空格和点号（Windows 不允许文件名以点号结尾）
    cleaned = cleaned.trim().replace(/\.+$/, '');
    
    // 移除连续的空格
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // 如果清理后为空，使用默认名称
    if (!cleaned || cleaned.length === 0) {
        cleaned = 'untitled';
    }
    
    // Windows 文件名长度限制（不包括扩展名）
    if (cleaned.length > 255) {
        cleaned = cleaned.substring(0, 255);
    }
    
    // 移除 Windows 保留名称（CON, PRN, AUX, NUL, COM1-9, LPT1-9）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(cleaned)) {
        cleaned = 'file_' + cleaned;
    }
    
    return cleaned;
}

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
        
        // 确定保存路径：如果有保存的文件路径，使用原路径；否则使用线路名称生成新路径
        let filePath;
        if (state.currentFilePath) {
            // 如果当前有保存的文件路径，使用该路径（保持在同一文件夹）
            filePath = state.currentFilePath;
        } else {
            // 否则使用线路名称生成新路径
            const sanitized = sanitizeFilename(cur.meta.lineName);
            filePath = sanitized + '.json';
        }
        
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.save === 'function') {
            try {
                const normalized = normalizeLine(JSON.parse(JSON.stringify(cur)));
                const res = await window.electronAPI.lines.save(filePath, normalized);
                if (res && res.ok) {
                    // 更新当前文件路径
                    state.currentFilePath = filePath;
                    await showMsg('线路已保存: ' + res.path);
                } else {
                    await showMsg('保存失败: ' + (res && res.error));
                }
            } catch (e) { await showMsg('保存失败: ' + e.message); }
            return;
        }
        await showMsg('无法保存：未检测到宿主文件保存接口。请先使用"打开文件夹"选择一个线路文件夹，再保存。');
    }

    async function openLinesFolder() {
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.openFolder === 'function') {
            const res = await window.electronAPI.lines.openFolder();
            if (!res || !res.ok) await showMsg('打开失败: ' + (res && res.error));
        } else {
            await showMsg('仅 Electron 环境支持打开保存目录');
        }
    }

    async function refreshLinesFromFolder(silent = false) {
        if (!(window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.list === 'function')) {
            if (!silent) await showMsg('仅 Electron 环境支持从线路文件夹刷新');
            return;
        }
        try {
            const items = await window.electronAPI.lines.list();
            if (!Array.isArray(items) || items.length === 0) {
                // 如果是切换文件夹后的静默刷新，不显示提示
                if (!silent) await showMsg('未发现已保存的线路文件');
                // 确保列表为空
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                return;
            }
            const detected = [];
            const filePathMap = new Map(); // 用于映射线路名称到文件路径
            for (const it of items) {
                try {
                    const res = await window.electronAPI.lines.read(it.name);
                    if (res && res.ok && res.content) {
                        const d = res.content;
                        if (d && d.meta && Array.isArray(d.stations)) {
                            const normalized = normalizeLine(d);
                            detected.push(normalized);
                            // 保存线路名称到文件路径的映射
                            if (normalized.meta && normalized.meta.lineName) {
                                filePathMap.set(normalized.meta.lineName, it.name);
                            }
                        }
                    }
                } catch (e) { console.warn('读取文件失败', it.name, e); }
            }

            if (detected.length === 0) {
                if (!silent) await showMsg('未检测到有效线路文件');
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                return;
            }
            
            // 如果是切换文件夹后的刷新，直接替换列表；否则合并
            if (silent) {
                // 切换文件夹：直接替换
                state.store.list = detected;
                state.store.cur = 0;
                state.appData = state.store.list[0] || null;
            } else {
                // 手动刷新：合并更新
                let added = 0, updated = 0;
                for (const it of detected) {
                    const idx = state.store.list.findIndex(s => s.meta && s.meta.lineName === (it.meta && it.meta.lineName));
                    if (idx >= 0) {
                        state.store.list[idx] = it; updated++; 
                    } else {
                        state.store.list.push(it); added++; 
                    }
                }
                if (state.store.cur < 0 || state.store.cur >= state.store.list.length) {
                    state.store.cur = Math.max(0, state.store.list.length - 1);
                }
                state.appData = state.store.list[state.store.cur] || null;
                await showMsg('刷新完成，新增: ' + added + '，更新: ' + updated);
            }
            
            state.rt = { idx: 0, state: 0 };
            
            // 更新线路名称到文件路径的映射
            filePathMap.forEach((filePath, lineName) => {
                state.lineNameToFilePath[lineName] = filePath;
            });
            
            // 更新当前文件的路径信息
            if (state.appData && state.appData.meta && state.appData.meta.lineName) {
                const filePath = state.lineNameToFilePath[state.appData.meta.lineName];
                if (filePath) {
                    state.currentFilePath = filePath;
                }
            }
<<<<<<< HEAD
            
=======
<<<<<<< HEAD
            
=======
            state.store.cur = Math.max(0, state.store.list.length - 1);
            state.appData = state.store.list[state.store.cur];
            state.rt = { idx: 0, state: 0 };
<<<<<<< HEAD
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
            // 若可用则触发同步，否则依赖响应式更新
            if (typeof window.sync === 'function') window.sync();
        } catch (e) {
            console.error(e);
            if (!silent) await showMsg('刷新失败: ' + (e && e.message));
        }
    }

    // 多文件夹管理函数
    async function loadFolders() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.list();
            if (res && res.ok && res.folders) {
                state.folders = res.folders;
                state.currentFolderId = res.current || 'default';
            }
        } catch (e) {
            console.error('加载文件夹列表失败:', e);
        }
    }

    async function switchFolder(folderId) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持文件夹切换');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.switch(folderId);
            if (res && res.ok) {
                state.currentFolderId = folderId;
                // 切换文件夹后，清空当前线路列表并重新加载
                state.store.list = [];
                state.store.cur = 0;
                state.appData = null;
                // 刷新线路列表（从新文件夹加载，静默模式不显示提示）
                await refreshLinesFromFolder(true);
                // 不显示提示，避免频繁切换时弹出太多提示
            } else {
                await showMsg('切换文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('切换文件夹失败: ' + e.message);
        }
    }

    async function addFolder() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持添加文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.add();
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                await showMsg('已添加文件夹: ' + res.name);
            } else {
                if (res && res.error === 'cancelled') {
                    // 用户取消，不显示错误
                    return;
                }
                await showMsg('添加文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('添加文件夹失败: ' + e.message);
        }
    }

    async function removeFolder(folderId) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持删除文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.remove(folderId);
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                // 如果删除的是当前文件夹，切换后会刷新线路列表
                await refreshLinesFromFolder();
                await showMsg('已删除文件夹');
            } else {
                await showMsg('删除文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('删除文件夹失败: ' + e.message);
        }
    }

    async function renameFolder(folderId, newName) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            await showMsg('仅 Electron 环境支持重命名文件夹');
            return;
        }
        try {
            const res = await window.electronAPI.lines.folders.rename(folderId, newName);
            if (res && res.ok) {
                // 刷新文件夹列表
                await loadFolders();
                await showMsg('已重命名文件夹');
            } else {
                await showMsg('重命名文件夹失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('重命名文件夹失败: ' + e.message);
        }
    }

    async function resetData() {
        if (await askUser("【警告】这将清空所有线路数据并恢复出厂设置，确定吗？")) {
            // 先强制恢复所有预设线路文件
            try {
                await initDefaultLines(true);
            } catch (e) {
                console.warn('恢复预设线路文件失败:', e);
            }
            // 清除本地存储并重新加载
            localStorage.removeItem('pids_global_store_v1');
            location.reload();
        }
    }

    // 计算数据的 MD5 哈希值（用于比较线路是否相同）
    // 使用 Electron IPC 调用主进程的 Node.js crypto 模块
    async function calculateMD5(data) {
        if (!(window.electronAPI && window.electronAPI.utils && window.electronAPI.utils.calculateMD5)) {
            throw new Error('Electron API 不可用');
        }
        
        try {
            const result = await window.electronAPI.utils.calculateMD5(data);
            if (result && result.ok && result.hash) {
                return result.hash;
            } else {
                throw new Error(result && result.error ? result.error : '计算哈希失败');
            }
        } catch (e) {
            console.error('计算 MD5 哈希失败:', e);
            throw e;
        }
    }
    
    // 比较两个线路数据是否相同（使用 MD5 哈希）
    async function compareLines(line1, line2) {
        try {
            const hash1 = await calculateMD5(line1);
            const hash2 = await calculateMD5(line2);
            return hash1 === hash2;
        } catch (e) {
            console.warn('比较线路数据失败:', e);
            return false;
        }
    }

    // 初始化预设线路文件（仅在文件不存在时创建，或文件内容不同时更新）
    async function initDefaultLines() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            return; // 非 Electron 环境，跳过
        }
        
        try {
            // 使用"预设"文件夹（如果不存在则使用"默认"）
            let presetFolderId = null;
            const folders = await window.electronAPI.lines.folders.list();
            if (folders && folders.ok && folders.folders) {
                // 优先查找"预设"文件夹
                const presetFolder = folders.folders.find(f => f.name === '预设');
                // 如果找到了预设文件夹，使用它；否则使用"默认"文件夹
                presetFolderId = presetFolder ? presetFolder.id : (folders.folders.find(f => f.name === '默认' || f.id === 'default')?.id || 'default');
            } else {
                presetFolderId = 'default';
            }
            
            // 从 state.store.list 或默认常量获取预设线路数据
            const defaultLines = [];
            const lineNameToFilename = {
                '上海地铁2号线': '上海地铁2号线.json',
                '上海地铁16号线': '上海地铁16号线.json',
                'K101': 'K101.json',
                '济南地铁1号线': '济南地铁1号线.json',
                '济南地铁2号线': '济南地铁2号线.json',
                '济南地铁3号线': '济南地铁3号线.json',
                '济南地铁4号线': '济南地铁4号线.json',
                '济南地铁6号线': '济南地铁6号线.json',
                '济南地铁8号线': '济南地铁8号线.json',
                '济南地铁4、8号线贯通车': '济南地铁4、8号线贯通车.json',
                '高新云巴': '高新云巴.json'
            };
            
            // 优先从 state.store.list 获取（如果可用）
            if (state && state.store && state.store.list && state.store.list.length > 0) {
                // 从 store.list 中提取预设线路
                for (const line of state.store.list) {
                    if (line && line.meta && line.meta.lineName) {
                        // 移除颜色标记获取纯线路名称
                        const cleanName = line.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                        const filename = lineNameToFilename[cleanName] || lineNameToFilename[line.meta.lineName];
                        if (filename) {
                            defaultLines.push({ data: line, filename });
                        }
                    }
                }
            }
            
            // 如果从 state 中没有获取到数据（例如重置数据时 state 可能还未初始化），尝试从默认常量导入
            if (defaultLines.length === 0 && forceRestore) {
                try {
                    // 动态导入默认线路常量（避免循环依赖）
                    const { DEF, DEF_LINE_16, DEF_JINAN_BUS, DEF_JINAN_METRO_1, DEF_JINAN_METRO_2, DEF_JINAN_METRO_3, DEF_JINAN_METRO_4, DEF_JINAN_METRO_6, DEF_JINAN_METRO_8, DEF_JINAN_METRO_4_8, DEF_JINAN_YUNBA } = await import('../utils/defaults.js');
                    defaultLines.push(
                        { data: JSON.parse(JSON.stringify(DEF)), filename: '上海地铁2号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_LINE_16)), filename: '上海地铁16号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_BUS)), filename: 'K101.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_1)), filename: '济南地铁1号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_2)), filename: '济南地铁2号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_3)), filename: '济南地铁3号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_4)), filename: '济南地铁4号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_6)), filename: '济南地铁6号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_8)), filename: '济南地铁8号线.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_4_8)), filename: '济南地铁4、8号线贯通车.json' },
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_YUNBA)), filename: '高新云巴.json' }
                    );
                } catch (e) {
                    console.warn('从默认常量导入预设线路失败:', e);
                }
            }
            
            // 如果没有获取到任何数据，跳过初始化
            if (defaultLines.length === 0) {
                return;
            }
            
            // 获取预设文件夹的路径
            let presetFolderPath = null;
            if (presetFolderId) {
                const folderList = await window.electronAPI.lines.folders.list();
                if (folderList && folderList.ok && folderList.folders) {
                    const presetFolder = folderList.folders.find(f => f.id === presetFolderId);
                    if (presetFolder && presetFolder.path) {
                        presetFolderPath = presetFolder.path;
                    }
                }
            }
            
            // 保存所有预设线路到预设文件夹（仅当文件不存在或内容不同时）
            for (const { data, filename } of defaultLines) {
                try {
                    // 检查文件是否已存在（在预设文件夹中）
                    const existing = await window.electronAPI.lines.read(filename, presetFolderPath || presetFolderId);
                    if (existing && existing.ok && existing.content) {
                        // 文件已存在，比较内容是否相同
                        const normalized = normalizeLine(JSON.parse(JSON.stringify(data)));
                        const isSame = await compareLines(existing.content, normalized);
                        if (isSame) {
                            // 内容相同，跳过
                            continue;
                        }
                        // 内容不同，继续保存（更新文件）
                    }
                    
                    // 文件不存在或内容不同，保存到预设文件夹
                    const normalized = normalizeLine(JSON.parse(JSON.stringify(data)));
                    await window.electronAPI.lines.save(filename, normalized, presetFolderPath || presetFolderId);
                } catch (e) {
                    // 忽略单个文件的保存错误，继续处理下一个
                    console.warn(`初始化预设线路 ${filename} 失败:`, e);
                }
            }
        } catch (e) {
            console.warn('初始化预设线路文件失败:', e);
        }
    }

    return {
        saveCurrentLine,
        openLinesFolder,
        refreshLinesFromFolder,
        resetData,
        loadFolders,
        switchFolder,
        addFolder,
        removeFolder,
        renameFolder,
        initDefaultLines
    }
}

/**
 * 预设线路云控管理（增删查改）
 * 用于管理预设线路的云端同步
 */
export function managePresetLinesWithCloud(state, cloudLines) {
    const showMsg = async (msg, title) => dialogService.alert(msg, title);
    const askUser = async (msg, title) => dialogService.confirm(msg, title);
    
    // 预设线路文件名映射
    const presetLineFileMap = {
        '上海地铁2号线.json': '上海地铁2号线',
        '上海地铁16号线.json': '上海地铁16号线',
        'K101.json': 'K101',
        '济南地铁1号线.json': '济南地铁1号线',
        '济南地铁2号线.json': '济南地铁2号线',
        '济南地铁3号线.json': '济南地铁3号线',
        '济南地铁4号线.json': '济南地铁4号线',
        '济南地铁6号线.json': '济南地铁6号线',
        '济南地铁8号线.json': '济南地铁8号线',
        '济南地铁4、8号线贯通车.json': '济南地铁4、8号线贯通车',
        '高新云巴.json': '高新云巴'
    };
    
    /**
     * 从云端获取预设线路并同步到本地
     */
    async function syncPresetLinesFromCloud() {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        try {
            // 获取云端预设线路列表
            const listResult = await cloudLines.listCloudLines();
            if (!listResult.ok) {
                await showMsg(`获取云端线路列表失败: ${listResult.error}`, '错误');
                return listResult;
            }
            
            const cloudLinesList = listResult.lines || [];
            if (cloudLinesList.length === 0) {
                await showMsg('云端没有预设线路', '提示');
                return { ok: true, synced: 0 };
            }
            
            // 获取预设文件夹ID（用于保存文件）
            let presetFolderId = null;
            let presetFolderPath = null;
            if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders) {
                try {
                    const folders = await window.electronAPI.lines.folders.list();
                    if (folders && folders.ok && folders.folders) {
                        // 优先查找"预设"文件夹
                        const presetFolder = folders.folders.find(f => f.name === '预设');
                        presetFolderId = presetFolder ? presetFolder.id : (folders.folders.find(f => f.name === '默认' || f.id === 'default')?.id || 'default');
                        presetFolderPath = presetFolder ? presetFolder.path : (folders.folders.find(f => f.name === '默认' || f.id === 'default')?.path || null);
                    } else {
                        presetFolderId = 'default';
                    }
                } catch (e) {
                    console.warn('获取预设文件夹失败:', e);
                    presetFolderId = 'default';
                }
            }
            
            // 同步每条线路到本地
            let syncedCount = 0;
            let failedCount = 0;
            
            for (const cloudLine of cloudLinesList) {
                try {
                    const lineName = cloudLine.meta?.lineName;
                    if (!lineName) continue;
                    
                    // 移除颜色标记获取纯线路名称
                    const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                    
                    // 检查是否是预设线路
                    const isPreset = Object.values(presetLineFileMap).includes(cleanLineName) ||
                                    Object.keys(presetLineFileMap).some(filename => 
                                        presetLineFileMap[filename] === cleanLineName
                                    );
                    
                    if (!isPreset) continue; // 跳过非预设线路
                    
                    // 同步到本地（使用清理后的线路名称）
                    const syncResult = await cloudLines.syncCloudLineToLocal(cleanLineName);
                    if (syncResult.ok) {
                        // 同步成功后，将文件保存到预设文件夹（带 MD5 验证）
                        if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.save && presetFolderId) {
                            try {
                                // 根据线路名称获取文件名
                                const filename = Object.keys(presetLineFileMap).find(f => presetLineFileMap[f] === cleanLineName);
                                if (filename && cloudLine) {
                                    // 规范化云端线路数据
                                    const normalized = normalizeLine(JSON.parse(JSON.stringify(cloudLine)));
                                    
                                    // 检查本地文件是否已存在
                                    const existing = await window.electronAPI.lines.read(filename, presetFolderPath || presetFolderId);
                                    if (existing && existing.ok && existing.content) {
                                        // 使用 MD5 比较文件内容，如果相同则跳过保存
                                        const isSame = await compareLines(existing.content, normalized);
                                        if (isSame) {
                                            console.log(`线路 ${cleanLineName} 文件已存在且内容相同，跳过保存`);
                                        } else {
                                            // 内容不同，保存更新后的文件
                                            await window.electronAPI.lines.save(filename, normalized, presetFolderPath || presetFolderId);
                                            console.log(`线路 ${cleanLineName} 文件已更新`);
                                        }
                                    } else {
                                        // 文件不存在，直接保存
                                        await window.electronAPI.lines.save(filename, normalized, presetFolderPath || presetFolderId);
                                        console.log(`线路 ${cleanLineName} 文件已创建`);
                                    }
                                }
                            } catch (e) {
                                console.warn(`保存线路文件 ${cleanLineName} 失败:`, e);
                                // 文件保存失败不影响同步成功计数
                            }
                        }
                        syncedCount++;
                    } else {
                        failedCount++;
                        console.warn(`同步线路 ${lineName} 失败:`, syncResult.error);
                    }
                } catch (e) {
                    failedCount++;
                    console.error(`处理云端线路失败:`, e);
                }
            }
            
            await showMsg(`同步完成: 成功 ${syncedCount} 条，失败 ${failedCount} 条`, '同步结果');
            return { ok: true, synced: syncedCount, failed: failedCount };
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`同步失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 将本地预设线路上传到云端
     * @param {string} lineName - 线路名称（可选，默认使用当前线路）
     */
    async function uploadPresetLineToCloud(lineName = null) {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        try {
            let lineData = null;
            
            // 如果指定了线路名称，查找该线路
            if (lineName && state && state.store && state.store.list) {
                lineData = state.store.list.find(l => 
                    l.meta && (l.meta.lineName === lineName || 
                              l.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1') === lineName)
                );
            } else if (state && state.store && state.store.list) {
                // 否则使用当前选中的线路
                const cur = state.store.list[state.store.cur];
                if (cur) {
                    lineData = cur;
                    lineName = cur.meta?.lineName;
                }
            }
            
            if (!lineData) {
                await showMsg('未找到要上传的线路数据', '错误');
                return { ok: false, error: '未找到线路数据' };
            }
            
            // 检查是否是预设线路
            const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
            const isPreset = Object.values(presetLineFileMap).includes(cleanLineName) ||
                            Object.keys(presetLineFileMap).some(filename => 
                                presetLineFileMap[filename] === cleanLineName
                            );
            
            if (!isPreset && !await askUser('该线路不是预设线路，确定要上传到云端吗？', '确认上传')) {
                return { ok: false, error: '用户取消' };
            }
            
            // 上传到云端
            const uploadResult = await cloudLines.uploadLocalLineToCloud(lineData);
            if (uploadResult.ok) {
                await showMsg(`线路 "${cleanLineName}" 已上传到云端`, '成功');
                return uploadResult;
            } else {
                await showMsg(`上传失败: ${uploadResult.error}`, '错误');
                return uploadResult;
            }
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`上传失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 从云端删除预设线路
     * @param {string} lineName - 线路名称
     */
    async function deletePresetLineFromCloud(lineName) {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化' };
        }
        
        const cleanLineName = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        
        if (!await askUser(`确定要从云端删除线路 "${cleanLineName}" 吗？`, '确认删除')) {
            return { ok: false, error: '用户取消' };
        }
        
        try {
            const deleteResult = await cloudLines.deleteCloudLine(cleanLineName);
            if (deleteResult.ok) {
                await showMsg(`线路 "${cleanLineName}" 已从云端删除`, '成功');
                return deleteResult;
            } else {
                await showMsg(`删除失败: ${deleteResult.error}`, '错误');
                return deleteResult;
            }
        } catch (e) {
            const errorMsg = e.message || String(e);
            await showMsg(`删除失败: ${errorMsg}`, '错误');
            return { ok: false, error: errorMsg };
        }
    }
    
    /**
     * 从云端获取预设线路列表
     */
    async function listPresetLinesFromCloud() {
        if (!cloudLines) {
            await showMsg('云控功能未初始化', '错误');
            return { ok: false, error: '云控功能未初始化', lines: [] };
        }
        
        try {
            const listResult = await cloudLines.listCloudLines();
            if (listResult.ok) {
                // 过滤出预设线路
                const presetLines = listResult.lines.filter(line => {
                    const lineName = line.meta?.lineName?.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
                    return Object.values(presetLineFileMap).includes(lineName);
                });
                return { ok: true, lines: presetLines };
            }
            return listResult;
        } catch (e) {
            const errorMsg = e.message || String(e);
            return { ok: false, error: errorMsg, lines: [] };
        }
    }
    
    return {
        syncPresetLinesFromCloud,
        uploadPresetLineToCloud,
        deletePresetLineFromCloud,
        listPresetLinesFromCloud
    };
}
