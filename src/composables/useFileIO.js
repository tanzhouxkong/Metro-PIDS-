import dialogService from '../utils/dialogService.js'
import { showNotification } from '../utils/notificationService.js'

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
        
        // 清理线路名称（移除HTML标签）用于生成文件名
        const cleanLineName = cur.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        const expectedFileName = sanitizeFilename(cleanLineName) + '.json';
        
        // 调试信息
        console.log('[saveCurrentLine] 开始保存:', {
            lineName: cleanLineName,
            currentFilePath: state.currentFilePath,
            currentFolderId: state.currentFolderId,
            folders: state.folders
        });
        
        // 确定保存路径：优先使用 currentFilePath（如果它是完整路径）
        let filePath;
        
        // 获取当前文件夹路径（用于构建完整保存路径，作为后备方案）
        let currentFolderPath = null;
        if (state.currentFolderId && state.folders && Array.isArray(state.folders)) {
            const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
            if (currentFolder && currentFolder.path) {
                currentFolderPath = currentFolder.path;
            }
        }
        
        console.log('[saveCurrentLine] 文件夹信息:', {
            currentFolderPath,
            currentFolderId: state.currentFolderId
        });
        
        if (state.currentFilePath) {
            // 检查 currentFilePath 是否是完整路径（包含 / 或 \）
            const lastSlash = Math.max(state.currentFilePath.lastIndexOf('/'), state.currentFilePath.lastIndexOf('\\'));
            const isFullPath = lastSlash >= 0;
            
            // 检查是否是绝对路径
            const isAbsolute = state.currentFilePath.match(/^[A-Za-z]:[\\/]/) || state.currentFilePath.startsWith('/') || state.currentFilePath.startsWith('\\\\');
            
            console.log('[saveCurrentLine] currentFilePath 分析:', {
                currentFilePath: state.currentFilePath,
                isFullPath,
                isAbsolute,
                lastSlash
            });
            
            if (isFullPath && isAbsolute) {
                // currentFilePath 是绝对路径，直接使用（保持在同一文件夹）
                // 即使文件名可能不匹配，也使用原路径的文件夹
                const dir = state.currentFilePath.substring(0, lastSlash + 1);
                filePath = dir + expectedFileName;
                console.log('[saveCurrentLine] 使用绝对路径，构建 filePath:', filePath);
            } else if (isFullPath && !isAbsolute) {
                // currentFilePath 是相对路径（包含路径分隔符但不是绝对路径）
                // 这种情况不应该发生，但为了安全，使用当前文件夹路径
                if (currentFolderPath) {
                    const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                    filePath = normalizedPath + expectedFileName;
                    console.log('[saveCurrentLine] 相对路径，使用当前文件夹，构建 filePath:', filePath);
                } else {
                    filePath = expectedFileName;
                    console.log('[saveCurrentLine] 相对路径但无当前文件夹，使用文件名:', filePath);
                }
            } else {
                // currentFilePath 只有文件名，需要加上文件夹路径
                if (currentFolderPath) {
                    const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                    filePath = normalizedPath + expectedFileName;
                    console.log('[saveCurrentLine] 只有文件名，使用当前文件夹，构建 filePath:', filePath);
                } else {
                    // 没有当前文件夹路径，使用文件名（会保存到默认文件夹）
                    filePath = expectedFileName;
                    console.log('[saveCurrentLine] 只有文件名且无当前文件夹，使用文件名:', filePath);
                }
            }
        } else {
            // 如果没有 currentFilePath，使用当前文件夹路径
            if (currentFolderPath) {
                const separator = currentFolderPath.includes('\\') ? '\\' : '/';
                const normalizedPath = currentFolderPath.endsWith(separator) ? currentFolderPath : currentFolderPath + separator;
                filePath = normalizedPath + expectedFileName;
                console.log('[saveCurrentLine] 无 currentFilePath，使用当前文件夹，构建 filePath:', filePath);
            } else {
                // 如果找不到当前文件夹路径，使用线路名称生成新路径（会保存到默认文件夹）
                filePath = expectedFileName;
                console.log('[saveCurrentLine] 无 currentFilePath 且无当前文件夹，使用文件名:', filePath);
            }
        }
        
        if (window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.save === 'function') {
            try {
                const normalized = normalizeLine(JSON.parse(JSON.stringify(cur)));
                
                // 处理文件路径：如果 filePath 是完整路径，需要分离文件夹路径和文件名
                let saveFileName = filePath;
                let saveDir = null;
                
                const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
                if (lastSlash >= 0) {
                    // filePath 包含路径分隔符，可能是完整路径
                    // 检查是否是绝对路径（Windows: C:\ 或 \\，Unix: /）
                    const isAbsolute = filePath.match(/^[A-Za-z]:[\\/]/) || filePath.startsWith('/') || filePath.startsWith('\\\\');
                    
                    console.log('[saveCurrentLine] 路径分离分析:', {
                        filePath,
                        lastSlash,
                        isAbsolute
                    });
                    
                    if (isAbsolute) {
                        // 是绝对路径，需要分离文件夹路径和文件名
                        saveDir = filePath.substring(0, lastSlash);
                        saveFileName = filePath.substring(lastSlash + 1);
                        console.log('[saveCurrentLine] 绝对路径分离结果:', {
                            saveDir,
                            saveFileName
                        });
                    } else {
                        // 是相对路径，直接使用 filePath 作为 filename
                        saveFileName = filePath;
                        saveDir = null;
                        console.log('[saveCurrentLine] 相对路径，直接使用:', {
                            saveFileName,
                            saveDir
                        });
                    }
                } else {
                    console.log('[saveCurrentLine] 无路径分隔符，直接使用文件名:', saveFileName);
                }
                
                console.log('[saveCurrentLine] 调用保存接口，参数:', {
                    saveFileName,
                    saveDir,
                    lineName: cleanLineName
                });
                
                // 调用保存接口：如果 saveDir 存在，传文件夹路径；否则传 null（使用当前文件夹）
                const res = await window.electronAPI.lines.save(saveFileName, normalized, saveDir);
                
                console.log('[saveCurrentLine] 保存结果:', res);
                if (res && res.ok) {
                    // 更新当前文件路径为实际保存的路径
                    state.currentFilePath = res.path || filePath;
                    // 清理线路名称（移除HTML标签）用于显示
                    const cleanLineName = cur.meta.lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
                    // 使用 Electron / 系统通知，在右侧悬浮显示保存成功
                    showNotification(
                        '保存成功',
                        `线路 "${cleanLineName}" 已保存\n${res.path || filePath}`
                    );
                } else {
                    await showMsg('保存失败: ' + (res && res.error), '保存失败');
                }
            } catch (e) { 
                await showMsg('保存失败: ' + e.message, '保存失败');
            }
            return;
        }
        await showMsg('无法保存：未检测到宿主文件保存接口。请先使用"打开文件夹"选择一个线路文件夹，再保存。', '保存失败');
    }

    async function openLinesFolder() {
        if (!(window.electronAPI && window.electronAPI.lines)) {
            await showMsg('仅 Electron 环境支持打开保存目录');
            return;
        }
        
        // 优先使用当前线路的真实位置
        let folderPath = null;
        
        if (state.currentFilePath) {
            // 从 currentFilePath 提取文件夹路径
            const lastSlash = Math.max(state.currentFilePath.lastIndexOf('/'), state.currentFilePath.lastIndexOf('\\'));
            if (lastSlash >= 0) {
                // 检查是否是绝对路径
                const isAbsolute = state.currentFilePath.match(/^[A-Za-z]:[\\/]/) || state.currentFilePath.startsWith('/') || state.currentFilePath.startsWith('\\\\');
                if (isAbsolute) {
                    folderPath = state.currentFilePath.substring(0, lastSlash);
                }
            }
        }
        
        // 如果无法从 currentFilePath 获取，使用当前文件夹路径
        if (!folderPath && state.currentFolderId && state.folders && Array.isArray(state.folders)) {
            const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
            if (currentFolder && currentFolder.path) {
                folderPath = currentFolder.path;
            }
        }
        
        // 如果有文件夹路径，使用它；否则使用默认行为
        if (folderPath && window.electronAPI.lines.folders && window.electronAPI.lines.folders.open) {
            const res = await window.electronAPI.lines.folders.open(folderPath);
            if (!res || !res.ok) {
                await showMsg('打开失败: ' + (res && res.error || '未知错误'));
            }
        } else if (window.electronAPI.lines.openFolder) {
            // 后备方案：使用默认文件夹
            const res = await window.electronAPI.lines.openFolder();
            if (!res || !res.ok) {
                await showMsg('打开失败: ' + (res && res.error || '未知错误'));
            }
        } else {
            await showMsg('无法打开文件夹：未找到可用的文件夹打开接口');
        }
    }

    // 可选 dir 参数：指定从哪一个物理文件夹刷新线路
    // 不传时使用当前“活动文件夹”（与之前行为保持一致）
    async function refreshLinesFromFolder(silent = false, dir = null) {
        if (!(window.electronAPI && window.electronAPI.lines && typeof window.electronAPI.lines.list === 'function')) {
            if (!silent) await showMsg('仅 Electron 环境支持从线路文件夹刷新');
            return;
        }
        try {
            const items = await window.electronAPI.lines.list(dir || undefined);
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
            // 确定文件夹路径：优先使用传入的 dir，否则使用当前文件夹路径
            let folderPath = dir;
            if (!folderPath && state.currentFolderId && state.folders && Array.isArray(state.folders)) {
                const currentFolder = state.folders.find(f => f.id === state.currentFolderId);
                if (currentFolder && currentFolder.path) {
                    folderPath = currentFolder.path;
                }
            }
            // 构建完整路径的辅助函数
            const buildFullPath = (fileName) => {
                if (!fileName) return fileName;
                // 如果已经是完整路径（包含 / 或 \），直接返回
                if (fileName.includes('/') || fileName.includes('\\')) {
                    return fileName;
                }
                // 如果有文件夹路径，构建完整路径
                if (folderPath) {
                    const separator = folderPath.includes('\\') ? '\\' : '/';
                    const normalizedPath = folderPath.endsWith(separator) ? folderPath : folderPath + separator;
                    return normalizedPath + fileName;
                }
                // 否则返回文件名（会在保存时使用当前文件夹路径）
                return fileName;
            };
            for (const it of items) {
                try {
                    const res = await window.electronAPI.lines.read(it.name, dir || undefined);
                    if (res && res.ok && res.content) {
                        const d = res.content;
                        if (d && d.meta && Array.isArray(d.stations)) {
                            const normalized = normalizeLine(d);
                            detected.push(normalized);
                            // 保存线路名称到文件路径的映射（存储完整路径）
                            if (normalized.meta && normalized.meta.lineName) {
                                const fullPath = buildFullPath(it.name);
                                filePathMap.set(normalized.meta.lineName, fullPath);
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
                    console.log('[refreshLinesFromFolder] 设置 currentFilePath:', {
                        lineName: state.appData.meta.lineName,
                        filePath: state.currentFilePath,
                        folderPath: folderPath,
                        dir: dir
                    });
                } else {
                    // 如果没有找到路径，清空 currentFilePath，保存时会使用当前文件夹路径
                    state.currentFilePath = null;
                    console.log('[refreshLinesFromFolder] 未找到文件路径，清空 currentFilePath:', {
                        lineName: state.appData.meta.lineName
                    });
                }
            } else {
                state.currentFilePath = null;
                console.log('[refreshLinesFromFolder] 无 appData 或 lineName，清空 currentFilePath');
            }
            
            // 自动检测并应用短交路逻辑（如果首末站是暂缓车站）
            if (state.appData) {
                const { autoApplyShortTurnIfNeeded } = await import('../utils/displayWindowLogic.js');
                autoApplyShortTurnIfNeeded(state.appData);
            }
            
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
            // 清除本地存储
            localStorage.removeItem('pids_global_store_v1');
            
            // 重新加载默认线路数据（不重启应用）
            try {
                // 从预设线路文件夹重新加载线路列表
                await refreshLinesFromFolder(true);
                
                // 如果刷新后没有线路，尝试从默认常量初始化
                if (!state.store.list || state.store.list.length === 0) {
                    // 导入默认常量
                    const { DEF, DEF_LINE_16, DEF_JINAN_BUS, DEF_JINAN_METRO_1, DEF_JINAN_METRO_2, DEF_JINAN_METRO_3, DEF_JINAN_METRO_4, DEF_JINAN_METRO_6, DEF_JINAN_METRO_8, DEF_JINAN_METRO_4_8, DEF_JINAN_YUNBA } = await import('../utils/defaults.js');
                    // 重置 state
                    state.store.list = [
                        JSON.parse(JSON.stringify(DEF)),
                        JSON.parse(JSON.stringify(DEF_LINE_16)),
                        JSON.parse(JSON.stringify(DEF_JINAN_BUS)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_1)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_2)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_3)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_4)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_6)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_8)),
                        JSON.parse(JSON.stringify(DEF_JINAN_METRO_4_8)),
                        JSON.parse(JSON.stringify(DEF_JINAN_YUNBA))
                    ];
                    state.store.cur = 0;
                    state.appData = state.store.list[0] || null;
                }
                
                // 重置运行时状态
                state.rt = { idx: 0, state: 0 };
                state.currentFilePath = null;
                state.lineNameToFilePath = {};
                
                // 触发同步更新
                if (typeof window.sync === 'function') {
                    window.sync();
                }
                
                await showMsg('线路数据已重置为出厂设置');
            } catch (e) {
                console.error('重置数据失败:', e);
                await showMsg('重置数据失败: ' + (e && e.message));
            }
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
    // forceRestore: 当为 true 时，即使当前 state 为空也会从预设文件或默认常量写入
    async function initDefaultLines(forceRestore = false) {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            return; // 非 Electron 环境，跳过
        }
        
        try {
            // 固定写入到“默认”文件夹（物理路径为 userData/lines/默认）
            let targetDirPath = null;
            try {
                const foldersRes = await window.electronAPI.lines.folders.list();
                if (foldersRes && foldersRes.ok && Array.isArray(foldersRes.folders)) {
                    const def =
                        foldersRes.folders.find(f => f.id === 'default') ||
                        foldersRes.folders.find(f => f.name === '默认');
                    if (def && def.path) {
                        targetDirPath = def.path;
                    }
                }
            } catch (e) {
                console.warn('获取默认线路文件夹失败:', e);
            }
            // safety：如果没拿到路径，退回 null，让主进程按当前配置推断，但正常情况下会拿到默认文件夹路径
            
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
                '济南地铁4号线 - 济南地铁8号线 (贯通)': '济南地铁4号线 - 济南地铁8号线 (贯通).json',
                '高新云巴': '高新云巴.json',
                '济阳线': '济阳线.json'
            };
            const presetFilenames = Object.values(lineNameToFilename);
            
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
            
            // 其次从应用内置的 /preset-lines 目录读取（保持与打包资源一致）
            if (defaultLines.length === 0 || forceRestore) {
                for (const filename of presetFilenames) {
                    try {
                        const res = await fetch(`./preset-lines/${encodeURIComponent(filename)}`);
                        if (res && res.ok) {
                            const data = await res.json();
                            defaultLines.push({ data, filename });
                        }
                    } catch (e) {
                        console.warn(`读取预设线路文件 ${filename} 失败:`, e);
                    }
                }
            }
            
            // 如果从 state 和 preset-lines 中都没有获取到数据（例如极端情况），尝试从默认常量导入
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
                        { data: JSON.parse(JSON.stringify(DEF_JINAN_METRO_4_8)), filename: '济南地铁4号线 - 济南地铁8号线 (贯通).json' },
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
            
            // 保存所有预设线路到“默认”文件夹（仅当文件不存在或内容不同时）
            for (const { data, filename } of defaultLines) {
                try {
                    // 检查文件是否已存在（在默认文件夹中）
                    const existing = await window.electronAPI.lines.read(filename, targetDirPath);
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
                    
                    // 文件不存在或内容不同，保存到默认文件夹
                    const normalized = normalizeLine(JSON.parse(JSON.stringify(data)));
                    await window.electronAPI.lines.save(filename, normalized, targetDirPath);
                } catch (e) {
                    // 忽略单个文件的保存错误，继续处理下一个
                    console.warn(`初始化预设线路 ${filename} 失败:`, e);
                }
            }
        } catch (e) {
            console.warn('初始化预设线路文件失败:', e);
        }
    }

    // 让用户选择文件夹（用于保存新线路）
    async function selectFolderForSave() {
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            // 非 Electron 环境，返回默认文件夹
            return { id: 'default', path: null };
        }
        
        try {
            const res = await window.electronAPI.lines.folders.list();
            if (!res || !res.ok || !Array.isArray(res.folders) || res.folders.length === 0) {
                return { id: 'default', path: null };
            }
            
            // 过滤掉"默认"文件夹
            const folders = res.folders.filter(f => f.id !== 'default' && f.name !== '默认');
            
            // 如果没有其他文件夹，让用户创建新文件夹
            if (folders.length === 0) {
                // 显示创建新文件夹的对话框
                const dialogService = (await import('../utils/dialogService.js')).default;
                const folderName = await dialogService.prompt('当前没有可用的文件夹，请创建一个新文件夹用于保存贯通线路：', '新建文件夹', '创建文件夹');
                
                if (!folderName || !folderName.trim()) {
                    // 用户取消，返回 null（取消创建贯通线路）
                    return null;
                }
                
                // 创建新文件夹
                try {
                    const addRes = await window.electronAPI.lines.folders.add(folderName.trim());
                    if (addRes && addRes.ok) {
                        // 刷新文件夹列表
                        await loadFolders();

                        // 返回新创建的文件夹（使用 folderId 作为 id）
                        return { id: addRes.folderId, path: addRes.path };
                    } else {
                        if (addRes && addRes.error === 'cancelled') {
                            return null;
                        }
                        await showMsg('创建文件夹失败: ' + (addRes && addRes.error || '未知错误'), '错误');
                        return null;
                    }
                } catch (e) {
                    await showMsg('创建文件夹失败: ' + (e.message || e), '错误');
                    return null;
                }
            }
            
            // 如果只有一个文件夹，直接返回
            if (folders.length === 1) {
                return { id: folders[0].id, path: folders[0].path };
            }
            
            // 多个文件夹，显示选择对话框（类似显示端选择器）
            return new Promise((resolve) => {
                // 创建对话框
                const dialog = document.createElement('div');
                dialog.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);';
                
                const dialogContent = document.createElement('div');
                dialogContent.style.cssText = 'background:var(--card, #fff); border-radius:12px; width:90%; max-width:500px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;';
                
                // 标题栏
                const header = document.createElement('div');
                header.style.cssText = 'padding:20px; border-bottom:1px solid var(--divider, #e0e0e0); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;';
                header.innerHTML = `
                    <h3 style="margin:0; font-size:18px; font-weight:bold; color:var(--text, #333);">选择保存位置</h3>
                    <button id="closeBtn" style="background:none; border:none; color:var(--muted, #666); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;">&times;</button>
                `;
                
                // 文件夹列表
                const folderList = document.createElement('div');
                folderList.style.cssText = 'flex:1; overflow-y:auto; padding:12px; max-height:400px;';
                
                let selectedFolderId = null;
                
                folders.forEach((folder) => {
                    const folderCard = document.createElement('div');
                    folderCard.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; background:var(--card, #fff); border-radius:6px; border:2px solid var(--divider, #e0e0e0); cursor:pointer; transition:all 0.2s; user-select:none;';
                    
                    folderCard.innerHTML = `
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:14px; font-weight:bold; color:var(--text, #333); margin-bottom:4px;">
                                <i class="fas fa-folder" style="margin-right:8px; color:var(--accent, #12b7f5);"></i>
                                ${folder.name}
                            </div>
                            <div style="font-size:12px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${folder.path || ''}
                            </div>
                        </div>
                    `;
                    
                    // 点击选择
                    folderCard.addEventListener('click', () => {
                        selectedFolderId = folder.id;
                        // 高亮选中的卡片
                        folders.forEach((f) => {
                            const card = folderList.querySelector(`[data-folder-id="${f.id}"]`);
                            if (card) {
                                if (f.id === folder.id) {
                                    card.style.borderColor = '#FF9F43';
                                    card.style.background = 'rgba(255,159,67,0.1)';
                                    card.style.boxShadow = '0 2px 8px rgba(255,159,67,0.3)';
                                } else {
                                    card.style.borderColor = 'var(--divider, #e0e0e0)';
                                    card.style.background = 'var(--card, #fff)';
                                    card.style.boxShadow = 'none';
                                }
                            }
                        });
                    });
                    
                    // 悬停效果
                    folderCard.addEventListener('mouseenter', () => {
                        if (selectedFolderId !== folder.id) {
                            folderCard.style.background = 'var(--bg, #f5f5f5)';
                        }
                    });
                    folderCard.addEventListener('mouseleave', () => {
                        if (selectedFolderId !== folder.id) {
                            folderCard.style.background = 'var(--card, #fff)';
                        }
                    });
                    
                    folderCard.setAttribute('data-folder-id', folder.id);
                    folderList.appendChild(folderCard);
                });
                
                // 按钮栏
                const buttonBar = document.createElement('div');
                buttonBar.style.cssText = 'padding:16px 20px; border-top:1px solid var(--divider, #e0e0e0); display:flex; justify-content:flex-end; gap:12px; flex-shrink:0;';
                buttonBar.innerHTML = `
                    <button id="cancelBtn" style="padding:8px 20px; background:#fff; color:#333; border:1px solid #d9d9d9; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; min-width:60px;">取消</button>
                    <button id="confirmBtn" style="padding:8px 20px; background:#1677ff; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; font-weight:500; min-width:60px;">确定</button>
                `;
                
                // 组装对话框
                dialogContent.appendChild(header);
                dialogContent.appendChild(folderList);
                dialogContent.appendChild(buttonBar);
                dialog.appendChild(dialogContent);
                document.body.appendChild(dialog);
                
                // 事件处理
                const closeDialog = () => {
                    document.body.removeChild(dialog);
                };
                
                header.querySelector('#closeBtn').addEventListener('click', () => {
                    closeDialog();
                    resolve(null);
                });
                
                buttonBar.querySelector('#cancelBtn').addEventListener('click', () => {
                    closeDialog();
                    resolve(null);
                });
                
                buttonBar.querySelector('#confirmBtn').addEventListener('click', () => {
                    if (selectedFolderId) {
                        const selectedFolder = folders.find(f => f.id === selectedFolderId);
                        closeDialog();
                        resolve(selectedFolder ? { id: selectedFolder.id, path: selectedFolder.path } : null);
                    } else {
                        // 如果没有选择，提示用户
                        alert('请先选择一个文件夹');
                    }
                });
                
                // 点击背景关闭
                dialog.addEventListener('click', (e) => {
                    if (e.target === dialog) {
                        closeDialog();
                        resolve(null);
                    }
                });
            });
        } catch (e) {
            console.error('选择文件夹失败:', e);
            await showMsg('选择文件夹失败，将使用默认文件夹: ' + (e.message || e), '错误');
            return null;
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
        initDefaultLines,
        selectFolderForSave
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
        '济南地铁4号线 - 济南地铁8号线 (贯通).json': '济南地铁4号线 - 济南地铁8号线 (贯通)',
        '高新云巴.json': '高新云巴',
        '济阳线.json': '济阳线'
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
