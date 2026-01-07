import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import dialogService from '../utils/dialogService.js'
import { showNotification } from '../utils/notificationService.js'
import { applyThroughOperation as mergeThroughLines } from '../utils/throughOperation.js'
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive, toRefs } from 'vue'
import ColorPicker from './ColorPicker.js'

export default {
  name: 'SlidePanel',
  components: { ColorPicker },
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

    // 检查是否有 Electron API
    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    });
    
    // 颜色选择器
    const showColorPicker = ref(false);
    const colorPickerInitialColor = ref('#000000');
    
    // 打开颜色选择器
    function openColorPicker() {
      colorPickerInitialColor.value = pidsState.appData.meta.themeColor || '#000000';
      showColorPicker.value = true;
    }
    
    // 确认颜色选择
    function onColorConfirm(color) {
      pidsState.appData.meta.themeColor = color;
      saveCfg();
    }
    
    // 取色功能：打开颜色选择器弹窗
    function pickColor() {
      openColorPicker();
    }

    // 兼容旧数据，补齐 serviceMode
    if (!pidsState.appData.meta.serviceMode) pidsState.appData.meta.serviceMode = 'normal';
    
    // 初始化贯通线路设置字段
    // 兼容旧版本：如果存在 lineALineName 和 lineBLineName，转换为新格式
    if (pidsState.appData.meta.throughLineSegments === undefined) {
        if (pidsState.appData.meta.lineALineName && pidsState.appData.meta.lineBLineName) {
            // 迁移旧数据到新格式
            pidsState.appData.meta.throughLineSegments = [
                { lineName: pidsState.appData.meta.lineALineName, throughStationName: '' },
                { lineName: pidsState.appData.meta.lineBLineName, throughStationName: '' }
            ];
        } else {
            // 默认创建两个空的线路段
            pidsState.appData.meta.throughLineSegments = [
                { lineName: '', throughStationName: '' },
                { lineName: '', throughStationName: '' }
            ];
        }
    }
    if (pidsState.appData.meta.throughDirection === undefined) pidsState.appData.meta.throughDirection = '';
    if (pidsState.appData.meta.throughOperationEnabled === undefined) pidsState.appData.meta.throughOperationEnabled = false;
    
    // 兼容旧版本字段（保留用于向后兼容）
    if (pidsState.appData.meta.lineALineName === undefined) pidsState.appData.meta.lineALineName = '';
    if (pidsState.appData.meta.lineBLineName === undefined) pidsState.appData.meta.lineBLineName = '';
    if (pidsState.appData.meta.throughStationIdx === undefined) pidsState.appData.meta.throughStationIdx = -1;

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
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null; // 如果没有找到路径，清空
            }
        }
        sync();
    }

    // 通过线路名称切换线路
    async function switchLineByName(lineName) {
        // 先刷新线路列表
        await fileIO.refreshLinesFromFolder(true);
        
        // 查找线路（移除颜色标记后比较）
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        const cleanRequestName = cleanName(lineName);
        
        const idx = pidsState.store.list.findIndex(l => {
            if (!l.meta || !l.meta.lineName) return false;
            const cleanLineName = cleanName(l.meta.lineName);
            return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
        });
        
        if (idx >= 0) {
            switchLine(idx);
        }
    }

    async function newLine() {
        const name = await promptUser('请输入新线路名称 (例如: 3号线)', '新线路');
        if (!name) return;
        const newL = JSON.parse(JSON.stringify(pidsState.DEF));
        newL.meta.lineName = name;
        newL.meta.themeColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        if (!newL.meta.serviceMode) newL.meta.serviceMode = 'normal';
        // 清空站点列表
        newL.stations = [];
        pidsState.store.list.push(newL);
        switchLine(pidsState.store.list.length - 1);
    }

    async function delLine() {
        if (pidsState.store.list.length <= 1) { await showMsg('至少保留一条线路！'); return; }
        if (!await askUser('确定要删除当前线路 "' + pidsState.appData.meta.lineName + '" 吗？\n删除后无法恢复！')) return;
        const deletedLineName = pidsState.appData.meta.lineName;
        pidsState.store.list.splice(pidsState.store.cur, 1);
        pidsState.store.cur = 0;
        pidsState.appData = pidsState.store.list[0];
        pidsState.rt = { idx: 0, state: 0 };
        // 清理删除的线路的路径信息
        if (deletedLineName && pidsState.lineNameToFilePath[deletedLineName]) {
            delete pidsState.lineNameToFilePath[deletedLineName];
        }
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null;
            }
        } else {
            pidsState.currentFilePath = null;
        }
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

    // 贯通线路设置（支持多条线路）
    const throughLineSegments = ref([]); // 线路段数组，每个元素包含 { lineName, throughStationName }
    const lineStationsMap = ref({}); // 存储每个线路的站点列表 { lineName: stations[] }
    const lineSelectorTarget = ref(null); // 当前选择的线路段索引
    
    // 兼容旧版本：保留这些变量用于向后兼容
    const lineAStations = ref([]);
    const lineBStations = ref([]);
    
    // 打开线路管理器选择线路
    async function openLineManagerForThroughOperation(target) {
        lineSelectorTarget.value = target;
        // 通过 IPC 传递目标信息（在 Electron 环境中）
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager(target);
        } else {
            // 非 Electron 环境，使用 localStorage
            localStorage.setItem('throughOperationSelectorTarget', target);
            await openLineManagerWindow();
        }
    }
    
    // 处理从线路管理器返回的线路选择
    async function handleLineSelectedForThroughOperation(lineName, targetFromIPC) {
        const meta = pidsState.appData.meta || {};
        // 优先使用 IPC 传递的 target，否则使用本地存储的
        const target = targetFromIPC || lineSelectorTarget.value || localStorage.getItem('throughOperationSelectorTarget');
        
        console.log('[贯通线路] handleLineSelectedForThroughOperation:', lineName, 'target:', target, 'targetFromIPC:', targetFromIPC, 'lineSelectorTarget.value:', lineSelectorTarget.value);
        
        if (!lineName) {
            console.warn('[贯通线路] 线路名称为空');
            return;
        }
        
        // 兼容旧版本：如果 target 是 'lineA' 或 'lineB'，转换为新格式
        if (target === 'lineA' || target === 'lineB') {
            if (target === 'lineA') {
                meta.lineALineName = lineName;
            } else {
                meta.lineBLineName = lineName;
            }
            // 更新到新格式
            if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
                meta.throughLineSegments = [];
            }
            let segmentIndex = -1;
            if (target === 'lineA' && meta.throughLineSegments.length === 0) {
                meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                segmentIndex = 0;
            } else if (target === 'lineB' && meta.throughLineSegments.length === 1) {
                meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                segmentIndex = 1;
            } else if (target === 'lineA') {
                meta.throughLineSegments[0].lineName = lineName;
                segmentIndex = 0;
            } else if (target === 'lineB') {
                if (meta.throughLineSegments.length < 2) {
                    meta.throughLineSegments.push({ lineName: lineName, throughStationName: '' });
                    segmentIndex = meta.throughLineSegments.length - 1;
                } else {
                    meta.throughLineSegments[1].lineName = lineName;
                    segmentIndex = 1;
                }
            }
            // 加载该线路的站点列表
            if (segmentIndex >= 0) {
                await loadLineStations(lineName, segmentIndex);
            }
        } else if (typeof target === 'number' || (target && target.startsWith('segment-'))) {
            // 新格式：target 是线路段索引
            // 确保 throughLineSegments 数组存在
            if (!meta.throughLineSegments) {
                meta.throughLineSegments = [];
            }
            const segmentIndex = typeof target === 'number' ? target : parseInt(target.replace('segment-', ''));
            if (segmentIndex >= 0) {
                // 确保数组足够长
                while (meta.throughLineSegments.length <= segmentIndex) {
                    meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
                }
                meta.throughLineSegments[segmentIndex].lineName = lineName;
                // 加载该线路的站点列表
                await loadLineStations(lineName, segmentIndex);
            }
        } else {
            console.warn('[贯通线路] 无效的 target:', target);
            return;
        }
        
        // 同步更新响应式数据
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        // 清除临时存储
        lineSelectorTarget.value = null;
        localStorage.removeItem('throughOperationSelectorTarget');
        
        // 立即保存配置，确保设置被持久化
        saveCfg();
        
        // 等待一下确保站点列表已更新，然后自动检测贯通站点
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        // 再次保存，确保贯通站点也被保存
        saveCfg();
        
        // 再次同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        console.log('[贯通线路] 设置完成，线路段数:', meta.throughLineSegments?.length || 0);
    }
    
    // 加载线路的站点列表
    async function loadLineStations(lineName, segmentIndex) {
        if (!lineName) {
            lineStationsMap.value[segmentIndex] = [];
            return;
        }
        
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const line = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(lineName) || l.meta?.lineName === lineName;
        });
        
        if (line && line.stations) {
            lineStationsMap.value[segmentIndex] = line.stations;
        } else {
            // 如果没找到，尝试刷新一次
            await fileIO.refreshLinesFromFolder(true);
            const lineAfterRefresh = pidsState.store.list.find(l => {
                return cleanName(l.meta?.lineName) === cleanName(lineName) || l.meta?.lineName === lineName;
            });
            if (lineAfterRefresh && lineAfterRefresh.stations) {
                lineStationsMap.value[segmentIndex] = lineAfterRefresh.stations;
            } else {
                lineStationsMap.value[segmentIndex] = [];
            }
        }
    }
    
    // 当线路A改变时，更新站点列表
    async function onLineAChanged() {
        const meta = pidsState.appData.meta || {};
        if (!meta.lineALineName) {
            lineAStations.value = [];
            return;
        }
        
        // 直接从现有线路列表中查找，避免刷新导致数据丢失
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const lineA = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(meta.lineALineName) || l.meta?.lineName === meta.lineALineName;
        });
        
        if (lineA && lineA.stations) {
            lineAStations.value = lineA.stations;
        } else {
            // 如果没找到，尝试刷新一次（但保存贯通设置）
            const savedLineALineName = meta.lineALineName;
            const savedLineBLineName = meta.lineBLineName;
            const savedThroughStationIdx = meta.throughStationIdx;
            const savedThroughDirection = meta.throughDirection;
            
            await fileIO.refreshLinesFromFolder(true);
            
            // 恢复贯通线路设置
            if (pidsState.appData && pidsState.appData.meta) {
                pidsState.appData.meta.lineALineName = savedLineALineName;
                pidsState.appData.meta.lineBLineName = savedLineBLineName;
                if (savedThroughStationIdx !== undefined) pidsState.appData.meta.throughStationIdx = savedThroughStationIdx;
                if (savedThroughDirection !== undefined) pidsState.appData.meta.throughDirection = savedThroughDirection;
            }
            
            // 再次查找
            const lineAAfterRefresh = pidsState.store.list.find(l => {
                return cleanName(l.meta?.lineName) === cleanName(savedLineALineName) || l.meta?.lineName === savedLineALineName;
            });
            
            if (lineAAfterRefresh && lineAAfterRefresh.stations) {
                lineAStations.value = lineAAfterRefresh.stations;
            } else {
                lineAStations.value = [];
            }
        }
    }
    
    // 当线路B改变时，更新站点列表
    async function onLineBChanged() {
        const meta = pidsState.appData.meta || {};
        if (!meta.lineBLineName) {
            lineBStations.value = [];
            return;
        }
        
        // 直接从现有线路列表中查找，避免刷新导致数据丢失
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        
        const lineB = pidsState.store.list.find(l => {
            return cleanName(l.meta?.lineName) === cleanName(meta.lineBLineName) || l.meta?.lineName === meta.lineBLineName;
        });
        
        if (lineB && lineB.stations) {
            lineBStations.value = lineB.stations;
        } else {
            // 如果没找到，尝试刷新一次（但保存贯通设置）
            const savedLineALineName = meta.lineALineName;
            const savedLineBLineName = meta.lineBLineName;
            const savedThroughStationIdx = meta.throughStationIdx;
            const savedThroughDirection = meta.throughDirection;
            
            await fileIO.refreshLinesFromFolder(true);
            
            // 恢复贯通线路设置
            if (pidsState.appData && pidsState.appData.meta) {
                pidsState.appData.meta.lineALineName = savedLineALineName;
                pidsState.appData.meta.lineBLineName = savedLineBLineName;
                if (savedThroughStationIdx !== undefined) pidsState.appData.meta.throughStationIdx = savedThroughStationIdx;
                if (savedThroughDirection !== undefined) pidsState.appData.meta.throughDirection = savedThroughDirection;
            }
            
            // 再次查找
            const lineBAfterRefresh = pidsState.store.list.find(l => {
                return cleanName(l.meta?.lineName) === cleanName(savedLineBLineName) || l.meta?.lineName === savedLineBLineName;
            });
            
            if (lineBAfterRefresh && lineBAfterRefresh.stations) {
                lineBStations.value = lineBAfterRefresh.stations;
            } else {
                lineBStations.value = [];
            }
        }
    }
    
    // 自动检测并设置贯通站点（查找A、B线路中重名的站点，在当前线路中查找）
    function autoDetectThroughStation() {
        const meta = pidsState.appData.meta || {};
        
        // 检查线路A和线路B是否都已选择
        if (!meta.lineALineName || !meta.lineBLineName) {
            throughStationIdx.value = -1;
            meta.throughStationIdx = -1;
            return;
        }
        
        if (lineAStations.value.length === 0 || lineBStations.value.length === 0) {
            throughStationIdx.value = -1;
            meta.throughStationIdx = -1;
            return;
        }
        
        // 清理站点名称（移除颜色标记）
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        // 找出线路A和线路B中重复的站点名称
        const lineANames = new Set();
        lineAStations.value.forEach((st) => {
            const cleanName = cleanStationName(st.name);
            if (cleanName) {
                lineANames.add(cleanName);
            }
        });
        
        const lineBNames = new Set();
        lineBStations.value.forEach((st) => {
            const cleanName = cleanStationName(st.name);
            if (cleanName) {
                lineBNames.add(cleanName);
            }
        });
        
        // 找出同时存在于A和B线路的站点名称
        const commonNames = new Set();
        lineANames.forEach(name => {
            if (lineBNames.has(name)) {
                commonNames.add(name);
            }
        });
        
        // 调试信息
        console.log('[贯通站点检测] 线路A:', meta.lineALineName, '站点数:', lineAStations.value.length);
        console.log('[贯通站点检测] 线路B:', meta.lineBLineName, '站点数:', lineBStations.value.length);
        console.log('[贯通站点检测] 共同站点名称:', Array.from(commonNames));
        
        // 在线路A中查找第一个共同站点作为贯通站点
        // 注意：贯通站点索引应该在线路A或线路B中查找，不需要依赖当前线路
        // 我们使用线路A中的索引作为参考，合并时会自动转换为合并后的索引
        for (let idx = 0; idx < lineAStations.value.length; idx++) {
            const st = lineAStations.value[idx];
            const cleanName = cleanStationName(st.name);
            if (commonNames.has(cleanName)) {
                console.log('[贯通站点检测] ✓ 找到贯通站点:', cleanName, '在线路A中的索引:', idx);
                // 设置贯通站点索引（这里是在线路A中的索引，合并时会自动处理）
                // 为了兼容性，我们也可以尝试在当前线路中查找（如果当前线路是线路A或线路B）
                const currentLineName = cleanStationName(pidsState.appData.meta?.lineName || '');
                const cleanLineAName = cleanStationName(meta.lineALineName);
                const cleanLineBName = cleanStationName(meta.lineBLineName);
                const isCurrentLineA = currentLineName === cleanLineAName;
                const isCurrentLineB = currentLineName === cleanLineBName;
                
                if (isCurrentLineA || isCurrentLineB) {
                    // 如果当前线路是线路A或线路B，在当前线路中查找对应的索引
                    const currentStations = pidsState.appData.stations || [];
                    for (let currentIdx = 0; currentIdx < currentStations.length; currentIdx++) {
                        const currentSt = currentStations[currentIdx];
                        const currentCleanName = cleanStationName(currentSt.name);
                        if (currentCleanName === cleanName) {
                            console.log('[贯通站点检测] ✓ 在当前线路中找到贯通站点，索引:', currentIdx);
                            throughStationIdx.value = currentIdx;
                            meta.throughStationIdx = currentIdx;
                            return;
                        }
                    }
                }
                
                // 如果当前线路不是线路A或线路B，或者在当前线路中找不到，使用线路A中的索引
                // 注意：这个索引会在合并时被转换为合并后的索引
                console.log('[贯通站点检测] ✓ 使用线路A中的索引:', idx, '(合并时会自动转换)');
                throughStationIdx.value = idx;
                meta.throughStationIdx = idx;
                // 同时保存线路A中的索引，以便合并时使用
                meta.throughStationIdxInLineA = idx;
                return;
            }
        }
        
        // 如果没找到，清除设置
        console.log('[贯通站点检测] ✗ 未找到匹配的贯通站点');
        throughStationIdx.value = -1;
        meta.throughStationIdx = -1;
    }
    
    // 自动检测并设置贯通站点（支持多条线路）
    function autoDetectThroughStations() {
        const meta = pidsState.appData.meta || {};
        const segments = meta.throughLineSegments || [];
        
        if (segments.length < 2) {
            console.log('[贯通站点检测] 线路段数量不足，至少需要2段');
            return;
        }
        
        // 清理站点名称（移除颜色标记）
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        // 为每相邻的两段线路检测贯通站点
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            if (!currentSegment.lineName || !nextSegment.lineName) {
                continue;
            }
            
            const currentStations = lineStationsMap.value[i] || [];
            const nextStations = lineStationsMap.value[i + 1] || [];
            
            if (currentStations.length === 0 || nextStations.length === 0) {
                console.log(`[贯通站点检测] 段${i + 1}或段${i + 2}的站点列表为空`);
                continue;
            }
            
            // 找出两段线路中重复的站点名称
            const currentNames = new Set();
            currentStations.forEach((st) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName) {
                    currentNames.add(cleanName);
                }
            });
            
            const nextNames = new Set();
            nextStations.forEach((st) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName) {
                    nextNames.add(cleanName);
                }
            });
            
            // 找出共同站点（记录站点名称和索引）
            const commonStations = [];
            currentStations.forEach((st, currentIdx) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName && nextNames.has(cleanName)) {
                    // 在当前段和下一段中都查找这个站点
                    const nextIdx = nextStations.findIndex((nextSt) => cleanStationName(nextSt.name) === cleanName);
                    if (nextIdx >= 0) {
                        commonStations.push({
                            name: cleanName,
                            currentIdx: currentIdx,  // 在当前段中的索引
                            nextIdx: nextIdx         // 在下一段中的索引
                        });
                    }
                }
            });
            
            if (commonStations.length > 0) {
                if (commonStations.length === 1) {
                    // 如果只有一个共同站点，自动选择
                    const throughStationName = commonStations[0].name;
                    currentSegment.throughStationName = throughStationName;
                    currentSegment.candidateThroughStations = undefined; // 清除候选列表
                    console.log(`[贯通站点检测] ✓ 段${i + 1}和段${i + 2}的贯通站点: ${throughStationName} (唯一共同站点)`);
                } else {
                    // 如果有多个共同站点，保存候选列表，不自动选择，让用户手动选择
                    currentSegment.candidateThroughStations = commonStations.map(s => s.name);
                    // 如果没有已选择的贯通站点，使用第一个作为默认值
                    if (!currentSegment.throughStationName || !currentSegment.candidateThroughStations.includes(currentSegment.throughStationName)) {
                        currentSegment.throughStationName = commonStations[0].name;
                    }
                    console.log(`[贯通站点检测] ⚠ 段${i + 1}和段${i + 2}找到${commonStations.length}个共同站点，请手动选择:`, currentSegment.candidateThroughStations);
                }
            } else {
                console.warn(`[贯通站点检测] ✗ 段${i + 1}和段${i + 2}未找到共同站点`);
                currentSegment.throughStationName = '';
                currentSegment.candidateThroughStations = undefined; // 清除候选列表
            }
        }
        
        // 最后一段不需要贯通站点
        if (segments.length > 0) {
            segments[segments.length - 1].throughStationName = '';
            segments[segments.length - 1].candidateThroughStations = undefined;
        }
        
        // 保存配置
        saveCfg();
    }
    
    // 清理站点名称（移除颜色标记）的辅助函数
    function cleanStationName(name) {
        if (!name) return '';
        return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
    }
    
    // 初始化时加载已保存的线路段
    async function initThroughOperationLines() {
        const meta = pidsState.appData.meta || {};
        
        // 兼容旧版本：如果存在 lineALineName 和 lineBLineName，转换为新格式
        if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
            if (meta.lineALineName && meta.lineBLineName) {
                meta.throughLineSegments = [
                    { lineName: meta.lineALineName, throughStationName: '' },
                    { lineName: meta.lineBLineName, throughStationName: '' }
                ];
            } else {
                // 默认创建两个空的线路段
                meta.throughLineSegments = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
            }
        }
        
        // 确保至少有两个线路段
        while (meta.throughLineSegments.length < 2) {
            meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        // 加载每个线路段的站点列表
        for (let i = 0; i < throughLineSegments.value.length; i++) {
            const segment = throughLineSegments.value[i];
            if (segment.lineName) {
                await loadLineStations(segment.lineName, i);
            }
        }
        
        // 等待站点列表加载完成
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 自动检测贯通站点
        autoDetectThroughStations();
        
        // 同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    // 添加线路段
    function addThroughLineSegment() {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments) {
            meta.throughLineSegments = [];
        }
        meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        throughLineSegments.value = meta.throughLineSegments;
        saveCfg();
    }
    
    // 删除线路段
    async function removeThroughLineSegment(index) {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments || index < 0 || index >= meta.throughLineSegments.length) {
            return;
        }
        
        if (meta.throughLineSegments.length <= 2) {
            await showMsg('至少需要保留2条线路');
            return;
        }
        
        meta.throughLineSegments.splice(index, 1);
        // 同步更新响应式数据
        throughLineSegments.value = [...meta.throughLineSegments];
        
        // 清除对应的站点列表
        delete lineStationsMap.value[index];
        // 重新索引站点列表
        const newMap = {};
        Object.keys(lineStationsMap.value).forEach(key => {
            const keyNum = parseInt(key);
            if (keyNum > index) {
                newMap[keyNum - 1] = lineStationsMap.value[key];
            } else if (keyNum < index) {
                newMap[keyNum] = lineStationsMap.value[key];
            }
        });
        lineStationsMap.value = newMap;
        
        // 重新检测贯通站点
        await new Promise(resolve => setTimeout(resolve, 100));
        autoDetectThroughStations();
        // 同步更新响应式数据（贯通站点检测后可能更新了 throughStationName）
        throughLineSegments.value = [...meta.throughLineSegments];
        saveCfg();
    }
    
    // 打开线路管理器选择指定段的线路
    async function openLineManagerForSegment(segmentIndex) {
        lineSelectorTarget.value = segmentIndex;
        const target = `segment-${segmentIndex}`;
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager(target);
        } else {
            localStorage.setItem('throughOperationSelectorTarget', target);
            await openLineManagerWindow();
        }
    }
    
    async function applyThroughOperation() {
        const meta = pidsState.appData.meta || {};
        const throughDirection = meta.throughDirection;
        const segments = meta.throughLineSegments || [];
        
        // 检查是否有足够的线路段
        if (!segments || segments.length < 2) {
            await showMsg('至少需要选择2条线路才能进行贯通');
            return;
        }
        
        // 检查所有线路段是否都已选择线路
        for (let i = 0; i < segments.length; i++) {
            if (!segments[i].lineName) {
                await showMsg(`请选择第${i + 1}段线路`);
                return;
            }
        }
        
        // 检查贯通站点是否都已检测到（除了最后一段）
        for (let i = 0; i < segments.length - 1; i++) {
            if (!segments[i].throughStationName) {
                await showMsg(`第${i + 1}段和第${i + 2}段之间未找到贯通站点，请确保这两条线路有重名站点`);
                return;
            }
        }
        
        if (!throughDirection) {
            await showMsg('请选择贯通方向');
            return;
        }
        
        try {
            // 获取所有线路列表
            const storeList = pidsState.store?.list || [];
            if (!storeList || storeList.length === 0) {
                await showMsg('无法获取线路列表，请刷新线路数据');
                return;
            }
            
            // 合并多条线路（创建一个新的合并线路）
            console.log('[贯通线路] 在控制面板中创建合并线路，线路段数:', segments.length);
            const mergedData = mergeThroughLines(pidsState.appData, storeList, {
                throughLineSegments: segments,
                throughDirection: throughDirection
            });
            
            if (!mergedData || !mergedData.stations || mergedData.stations.length === 0) {
                await showMsg('合并线路失败，请检查线路数据');
                return;
            }
            
            // 设置合并线路的名称和元数据
            const lineNames = segments.map(s => s.lineName).join(' - ');
            const mergedLineName = `${lineNames} (贯通)`;
            mergedData.meta.lineName = mergedLineName;
            mergedData.meta.throughOperationEnabled = true;
            mergedData.meta.throughLineSegments = segments;
            mergedData.meta.throughDirection = throughDirection;
            
            // 将合并后的线路添加到线路列表中
            pidsState.store.list.push(mergedData);
            
            // 切换到新创建的合并线路
            const newLineIndex = pidsState.store.list.length - 1;
            // 使用 nextTick 确保数据更新后再切换
            await nextTick();
            switchLine(newLineIndex);
            
            // 再次等待，确保切换完成
            await nextTick();
            
            // 重置当前索引为0
            pidsState.rt.idx = 0;
            pidsState.rt.state = 0;
            
            // 保存配置
            saveCfg();
            
            // 同步到显示端
            sync();
            
            const directionText = throughDirection === 'up' ? '上行' : (throughDirection === 'down' ? '下行' : (throughDirection === 'outer' ? '外环' : '内环'));
            const throughStations = segments.slice(0, -1).map(s => s.throughStationName).filter(s => s).join('、');
            
            console.log('[贯通线路] 合并完成，站点数:', mergedData.stations.length);
            await showMsg(`贯通线路已创建！\n线路名称: ${mergedLineName}\n线路段数: ${segments.length}\n贯通站点: ${throughStations || '无'}\n贯通方向: ${directionText}\n合并后站点数: ${mergedData.stations.length}\n\n已自动切换到新创建的贯通线路`);
        } catch (error) {
            console.error('[贯通线路] 合并失败:', error);
            await showMsg('合并线路时发生错误: ' + (error.message || error));
        }
    }

    async function clearThroughOperation() {
        if (await askUser('确定要清除贯通线路设置吗？\n注意：这将清除贯通线路配置，但不会删除已创建的贯通线路。')) {
            try {
                const meta = pidsState.appData.meta || {};
                meta.lineALineName = '';
                meta.lineBLineName = '';
                meta.throughStationIdx = -1;
                meta.throughDirection = '';
                meta.throughOperationEnabled = false;
                lineALineName.value = '';
                lineBLineName.value = '';
                lineAStations.value = [];
                lineBStations.value = [];
                throughStationIdx.value = -1;
                
                saveCfg();
                
                await showMsg('贯通线路设置已清除');
            } catch (error) {
                console.error('[贯通线路] 清除失败:', error);
                await showMsg('清除贯通线路设置时发生错误: ' + (error.message || error));
            }
        }
    }

    // 短交路预设管理
    const shortTurnPresets = ref([]);
    
    async function loadShortTurnPresets() {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            return;
        }
        try {
            const currentLineName = pidsState.appData?.meta?.lineName || null;
            const presets = await window.electronAPI.shortturns.list(currentLineName);
            shortTurnPresets.value = Array.isArray(presets) ? presets : [];
        } catch (e) {
            console.error('加载短交路预设失败:', e);
            shortTurnPresets.value = [];
        }
    }

    async function saveShortTurnPreset() {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持保存短交路预设');
            return;
        }
        const startIdx = pidsState.appData.meta.startIdx;
        const termIdx = pidsState.appData.meta.termIdx;
        if (startIdx === -1 || termIdx === -1) {
            await showMsg('请先设置短交路的起点和终点');
            return;
        }
        const presetName = await promptUser('请输入预设名称', '短交路预设');
        if (!presetName) return;
        try {
            const presetData = {
                lineName: pidsState.appData.meta.lineName,
                startIdx: startIdx,
                termIdx: termIdx,
                startStationName: pidsState.appData.stations[startIdx]?.name || '',
                termStationName: pidsState.appData.stations[termIdx]?.name || '',
                createdAt: new Date().toISOString()
            };
            const res = await window.electronAPI.shortturns.save(presetName, presetData);
            if (res && res.ok) {
                await showMsg('预设已保存');
                await loadShortTurnPresets();
            } else {
                await showMsg('保存失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('保存失败: ' + e.message);
        }
    }

    async function loadShortTurnPreset(presetName) {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持加载短交路预设');
            return;
        }
        try {
            const res = await window.electronAPI.shortturns.read(presetName);
            if (res && res.ok && res.content) {
                const preset = res.content;
                // 验证当前线路名称是否匹配
                if (preset.lineName && preset.lineName !== pidsState.appData.meta.lineName) {
                    if (!(await askUser(`此预设属于线路"${preset.lineName}"，当前线路是"${pidsState.appData.meta.lineName}"，是否继续加载？`))) {
                        return;
                    }
                }
                // 验证索引有效性
                const stationCount = pidsState.appData.stations?.length || 0;
                if (preset.startIdx < 0 || preset.startIdx >= stationCount || preset.termIdx < 0 || preset.termIdx >= stationCount) {
                    await showMsg('预设的站点索引超出当前线路范围，无法加载');
                    return;
                }
                pidsState.appData.meta.startIdx = preset.startIdx;
                pidsState.appData.meta.termIdx = preset.termIdx;
                saveCfg();
                await showMsg(`已加载预设: ${presetName}\n起点: ${preset.startStationName || pidsState.appData.stations[preset.startIdx]?.name}\n终点: ${preset.termStationName || pidsState.appData.stations[preset.termIdx]?.name}`);
            } else {
                await showMsg('加载失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('加载失败: ' + e.message);
        }
    }

    async function deleteShortTurnPreset(presetName) {
        if (!window.electronAPI || !window.electronAPI.shortturns) {
            await showMsg('仅 Electron 环境支持删除短交路预设');
            return;
        }
        if (!(await askUser(`确定要删除预设"${presetName}"吗？`))) {
            return;
        }
        try {
            const res = await window.electronAPI.shortturns.delete(presetName);
            if (res && res.ok) {
                await showMsg('预设已删除');
                await loadShortTurnPresets();
            } else {
                await showMsg('删除失败: ' + (res && res.error));
            }
        } catch (e) {
            await showMsg('删除失败: ' + e.message);
        }
    }

    // 监听线路切换，自动加载预设列表
    watch(() => pidsState.appData?.meta?.lineName, async () => {
        if (window.electronAPI && window.electronAPI.shortturns) {
            await loadShortTurnPresets();
        }
    }, { immediate: true });

    // 监听分辨率缩放变化
    let lastDevicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    let scaleCheckInterval = null;

    function checkScaleChange() {
        if (typeof window === 'undefined') return;
        const currentRatio = window.devicePixelRatio || 1;
        if (Math.abs(currentRatio - lastDevicePixelRatio) > 0.01) {
            // 缩放发生变化
            const scalePercent = Math.round(currentRatio * 100);
            showNotification('系统分辨率缩放已更改', `当前缩放比例：${scalePercent}%，显示效果可能受到影响`, {
                tag: 'scale-changed',
                urgency: 'normal'
            });
            lastDevicePixelRatio = currentRatio;
        }
    }

    // 处理线路切换请求（统一处理 Electron 和网页环境）
    async function handleSwitchLineRequest(lineName, target) {
        // 检查是否是为贯通线路选择（优先使用传递的 target，否则使用 localStorage）
        const throughTarget = target || lineSelectorTarget.value || localStorage.getItem('throughOperationSelectorTarget');
        console.log('[线路切换] 收到线路切换请求:', lineName, 'target:', throughTarget);
        
        // 检查是否是为贯通线路选择（支持旧格式 'lineA'/'lineB' 和新格式 'segment-0'/'segment-1' 或数字）
        const isThroughOperation = throughTarget === 'lineA' || 
                                   throughTarget === 'lineB' || 
                                   (typeof throughTarget === 'number') ||
                                   (throughTarget && throughTarget.startsWith('segment-'));
        
        if (isThroughOperation) {
            console.log('[贯通线路] 处理贯通线路选择');
            await handleLineSelectedForThroughOperation(lineName, throughTarget);
            // 重要：处理完贯通线路选择后，不要切换当前显示的线路
            return; // 提前返回，避免执行 switchLineByName
        } else {
            console.log('[线路切换] 处理普通线路切换');
            await switchLineByName(lineName);
        }
    }

    // 存储清理函数（用于网页环境的事件监听器）
    let cleanupWebListeners = null;

    // 监听来自线路管理器的线路切换请求
    onMounted(async () => {
        // Electron 环境：通过 IPC 监听
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onSwitchLineRequest) {
            try {
                window.electronAPI.onSwitchLineRequest(async (lineName, target) => {
                    await handleSwitchLineRequest(lineName, target);
                });
            } catch (e) {
                console.warn('无法设置线路切换监听:', e);
            }
        }
        
        // 网页环境：监听 postMessage 和 storage 事件
        if (typeof window !== 'undefined' && (!window.electronAPI || !window.electronAPI.onSwitchLineRequest)) {
            // 监听 postMessage（来自线路管理器窗口）
            const messageHandler = async (event) => {
                // 安全检查：只接受来自同源的消息
                if (event.data && event.data.type === 'switch-line-request') {
                    const { lineName, target } = event.data;
                    await handleSwitchLineRequest(lineName, target);
                }
            };
            window.addEventListener('message', messageHandler);
            
            // 监听 storage 事件（用于同源页面通信）
            const storageHandler = async (event) => {
                if (event.key === 'lineManagerSelectedLine' && event.newValue) {
                    const lineName = event.newValue;
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    await handleSwitchLineRequest(lineName, target);
                    // 清理 localStorage
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            };
            window.addEventListener('storage', storageHandler);
            
            // 定期检查 localStorage（作为备用方案，因为 storage 事件可能在某些情况下不触发）
            const checkInterval = setInterval(() => {
                const lineName = localStorage.getItem('lineManagerSelectedLine');
                if (lineName) {
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    handleSwitchLineRequest(lineName, target);
                    // 清理 localStorage
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            }, 500);
            
            // 保存清理函数
            cleanupWebListeners = () => {
                window.removeEventListener('message', messageHandler);
                window.removeEventListener('storage', storageHandler);
                clearInterval(checkInterval);
            };
        }
        
        // 初始化预设线路文件（仅在首次启动时）
        try {
            await fileIO.initDefaultLines();
        } catch (e) {
            console.warn('初始化预设线路失败:', e);
        }

        // 启动分辨率缩放监听（每5秒检查一次）
        if (typeof window !== 'undefined') {
            lastDevicePixelRatio = window.devicePixelRatio || 1;
            scaleCheckInterval = setInterval(checkScaleChange, 5000);
        }
        
        // 初始化贯通线路设置
        initThroughOperationLines();
    });

    // 打开线路管理器
    async function openLineManagerWindow() {
        if (window.electronAPI && window.electronAPI.openLineManager) {
            await window.electronAPI.openLineManager();
        } else {
            // 浏览器环境，使用弹窗
            const url = 'line_manager_window.html';
            window.open(url, '_blank', 'width=900,height=600');
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
    const updateState = ref({ checking: false, available: false, downloading: false, downloaded: false, progress: 0, info: null, error: null, isLatest: false });
    
    // 检查更新点击计数（用于连续点击五次触发特殊功能）
    const updateCheckClickCount = ref(0);
    const updateCheckClickTimer = ref(null);

        const version = ref('未知');
        (async () => {
            try {
                if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getAppVersion) {
                    const r = await window.electronAPI.getAppVersion();
                    if (r && r.ok && r.version) version.value = r.version;
                }
            } catch (e) {}
        })();

        // 配置主进程日志监听（用于调试）
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                window.electronAPI.onMainConsoleLog && window.electronAPI.onMainConsoleLog((msg) => {
                    console.log('[MAIN]', msg);
                });
                window.electronAPI.onMainConsoleError && window.electronAPI.onMainConsoleError((msg) => {
                    console.error('[MAIN]', msg);
                });
            } catch (e) {
                console.warn('无法设置主进程日志监听:', e);
            }
        }
        
        // 配置更新事件监听（仅在 Electron 环境）
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                window.electronAPI.onUpdateAvailable((info) => {
                    updateState.value.checking = false;
                    updateState.value.available = true;
                    updateState.value.downloaded = false;
                    updateState.value.info = info || null;
                    // 不再自动弹出对话框，由用户手动点击下载
                    // 发送通知
                    const version = info?.version || '新版本';
                    showNotification('更新可用', `发现新版本 ${version}，请点击检查更新按钮下载`, {
                        tag: 'update-available',
                        urgency: 'normal'
                    });
                });

                window.electronAPI.onUpdateNotAvailable((info) => {
                    updateState.value.checking = false;
                    updateState.value.isLatest = true; // 标记为最新版本
                    const currentVersion = version.value || '未知';
                    console.log('[SlidePanel] 收到 update-not-available 事件', info);
                    // 不显示弹窗，只在界面上显示状态（避免频繁弹窗干扰用户）
                });

                window.electronAPI.onUpdateError((err) => {
                    updateState.value.checking = false;
                    updateState.value.downloading = false;
                    const errorMsg = String(err);
                    updateState.value.error = errorMsg;
                    console.error('[SlidePanel] 收到更新错误事件:', err);
                    
                    // 对于校验和错误，提供更友好的提示
                    let userFriendlyMsg = errorMsg;
                    if (errorMsg.includes('checksum') || errorMsg.includes('sha512')) {
                        userFriendlyMsg = '文件校验失败，可能是下载的文件损坏。\n\n建议：\n1. 检查网络连接\n2. 重新尝试下载\n3. 如果问题持续，请从GitHub手动下载';
                    }
                    
                    showMsg('更新错误：' + userFriendlyMsg);
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
                    // 发送通知
                    const version = info?.version || '新版本';
                    showNotification('更新下载完成', `版本 ${version} 已下载完成，点击"重启应用"即可完成更新，无需走安装流程`, {
                        tag: 'update-downloaded',
                        urgency: 'normal'
                    });
                });
            } catch (e) {
                // 可忽略监听安装异常
            }
        }

        async function checkForUpdateClicked() {
            // 处理连续点击五次的功能
            updateCheckClickCount.value++;
            
            // 清除之前的计时器
            if (updateCheckClickTimer.value) {
                clearTimeout(updateCheckClickTimer.value);
            }
            
            // 如果连续点击五次，显示开发者按钮
            if (updateCheckClickCount.value >= 5) {
                updateCheckClickCount.value = 0;
                uiState.showDevButton = true;
                // 将开发者按钮状态保存到 localStorage，以便侧边栏 BrowserView 也能读取
                try {
                    localStorage.setItem('metro_pids_dev_button_enabled', 'true');
                } catch (e) {
                    console.warn('无法保存开发者按钮状态到 localStorage:', e);
                }
                showNotification('开发者模式', '开发者按钮已显示在侧边栏', {
                    tag: 'dev-button-enabled',
                    urgency: 'normal'
                });
                return;
            }
            
            // 2秒内如果没有再次点击，重置计数
            updateCheckClickTimer.value = setTimeout(() => {
                updateCheckClickCount.value = 0;
            }, 2000);
            
            if (typeof window === 'undefined' || !window.electronAPI) {
                showMsg('当前不是 Electron 环境，无法检查更新');
                return;
            }
            updateState.value.checking = true;
            updateState.value.available = false;
            updateState.value.downloaded = false;
            updateState.value.error = null; // 清除之前的错误
            updateState.value.isLatest = false; // 清除之前的"已是最新"状态
            
            console.log('[SlidePanel] 开始检查更新...');
            
            try {
                const r = await window.electronAPI.checkForUpdates();
                console.log('[SlidePanel] checkForUpdates 返回:', r);
                
                if (!r || !r.ok) {
                    updateState.value.checking = false;
                    const errorMsg = (r && r.error) ? r.error : '未知错误';
                    updateState.value.error = errorMsg;
                    console.error('[SlidePanel] 检查更新失败:', errorMsg);
                    showMsg('检查更新失败：' + errorMsg);
                } else {
                    console.log('[SlidePanel] 检查更新请求已发送，等待事件响应...');
                    // 不在这里设置 checking = false，等待事件响应
                }
            } catch (e) {
                updateState.value.checking = false;
                const errorMsg = String(e);
                updateState.value.error = errorMsg;
                console.error('[SlidePanel] 检查更新异常:', e);
                showMsg('检查更新失败：' + errorMsg);
            }
        }

    async function downloadUpdateNow() {
        if (!window.electronAPI) return;
        updateState.value.downloading = true;
        updateState.value.downloaded = false;
        updateState.value.error = null; // 清除之前的错误
        
        try {
            const r = await window.electronAPI.downloadUpdate();
            if (!r || !r.ok) {
                updateState.value.downloading = false;
                const errorMsg = r && r.error ? r.error : '未知错误';
                updateState.value.error = errorMsg;
                
                    // 对于校验和错误，提供更友好的提示
                    let userFriendlyMsg = errorMsg;
                    const attempts = r.attempts || 1;
                    const isChecksumError = errorMsg.includes('checksum') || errorMsg.includes('sha512') || r.isChecksumError;
                    
                    if (isChecksumError) {
                        if (attempts >= 3) {
                            userFriendlyMsg = `文件校验失败，已自动重试 ${attempts} 次。\n\n可能原因：\n1. 网络不稳定导致下载文件损坏\n2. 代理服务器干扰下载\n3. GitHub Releases 的校验和信息可能有误\n\n建议：\n1. 检查网络连接或尝试关闭VPN/代理\n2. 点击"清除缓存并重新下载"手动重试\n3. 点击"从GitHub手动下载"按钮手动下载安装包`;
                        } else {
                            userFriendlyMsg = `文件校验失败，已重试 ${attempts} 次。系统会自动重试...`;
                        }
                    }
                    
                    // 只有在不是自动重试中时才显示错误消息
                    if (attempts >= 3 || !isChecksumError) {
                        showMsg('下载失败：' + userFriendlyMsg);
                    }
            }
        } catch (e) {
            updateState.value.downloading = false;
            const errorMsg = String(e);
            updateState.value.error = errorMsg;
            showMsg('下载失败：' + errorMsg);
        }
    }

    async function clearCacheAndRedownload() {
        if (!window.electronAPI) return;
        if (!window.electronAPI.clearCacheAndDownload) {
            // 如果没有清除缓存功能，回退到普通下载
            return downloadUpdateNow();
        }
        
        updateState.value.downloading = true;
        updateState.value.downloaded = false;
        updateState.value.error = null;
        
        try {
            const r = await window.electronAPI.clearCacheAndDownload();
            if (!r || !r.ok) {
                updateState.value.downloading = false;
                const errorMsg = r && r.error ? r.error : '未知错误';
                updateState.value.error = errorMsg;
                showMsg('重新下载失败：' + errorMsg);
            }
        } catch (e) {
            updateState.value.downloading = false;
            const errorMsg = String(e);
            updateState.value.error = errorMsg;
            showMsg('重新下载失败：' + errorMsg);
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

    async function openGitHubReleases() {
        const url = 'https://github.com/tanzhouxkong/Metro-PIDS-/releases';
        try {
            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
                const res = await window.electronAPI.openExternal(url);
                if (!res || (res.ok === false)) {
                    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) { console.warn('Failed to open external URL', e); }
                }
            } else {
                try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e) { console.warn('Failed to open external URL', e); }
            }
        } catch (e) {
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch(e2) { console.warn('Failed to open external URL', e2); }
        }
    }

    // 显示端/第三方相关辅助（展示预览已移除）

    // 自动播放包装：先锁定界面并提示
    // 确保显示端已开启；若未开启则尝试按设置分辨率拉起
    async function ensureDisplayOpen() {
        try {
            // Electron 原生窗口
            if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function') {
                const currentDisplayConfig = currentDisplay.value;
                
                // 检查 display-2 是否允许打开
                if (currentDisplayConfig.id === 'display-2') {
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
                        return false;
                    }
                }
                
                const dw = currentDisplayConfig.width || 1900;
                const dh = currentDisplayConfig.height || 600;
                const displayId = currentDisplayConfig.id || 'display-1';
                await window.electronAPI.openDisplay(dw, dh, displayId);
                return true;
            }
        } catch (e) {}

        // 浏览器弹窗
        try {
            const currentDisplayConfig = currentDisplay.value;
            
            // 检查 display-2 是否允许打开
            if (currentDisplayConfig.id === 'display-2') {
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
                    return false;
                }
            }
            
            const hasPopup = window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed;
            let url = '';
            if (currentDisplayConfig.source === 'builtin') {
                // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                if (currentDisplayConfig.url) {
                    url = currentDisplayConfig.url;
                } else if (currentDisplayConfig.id === 'display-1') {
                    url = 'display_window.html';
                } else {
                    url = `displays/${currentDisplayConfig.id}/display_window.html`;
                }
            } else if (currentDisplayConfig.source === 'gitee') {
                url = currentDisplayConfig.url || '';
            } else {
                url = currentDisplayConfig.url || '';
            }
            if (!hasPopup && url) {
                const w = window.open(url, `_blank_${currentDisplayConfig.id}`, `width=${currentDisplayConfig.width},height=${currentDisplayConfig.height}`);
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
        // 发送自动播放结束通知
        showNotification('自动播放已停止', '自动播放已结束，控制面板已解锁', {
            tag: 'autoplay-stopped',
            urgency: 'low'
        });
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

        // 更新日志相关
        const showReleaseNotes = ref(false);
        const releaseNotes = ref([]);
        const loadingNotes = ref(false);

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

        // 显示端管理相关方法
        const currentDisplay = computed(() => {
            return settings.display.displays[settings.display.currentDisplayId] || settings.display.displays[Object.keys(settings.display.displays)[0]];
        });

        // 创建本地响应式状态来确保UI更新
        const displayState = reactive({
            currentDisplayId: settings.display.currentDisplayId,
            displays: settings.display.displays
        });

        // 监听设置变化，同步到本地状态
        watch(() => settings.display.currentDisplayId, (newId) => {
            console.log('[SlidePanel] 监听到 currentDisplayId 变化:', displayState.currentDisplayId, '->', newId);
            displayState.currentDisplayId = newId;
        }, { immediate: true });

        watch(() => settings.display.displays, (newDisplays) => {
            console.log('[SlidePanel] 监听到 displays 变化');
            displayState.displays = { ...newDisplays }; // 创建新对象确保响应性
        }, { deep: true, immediate: true });

        // 当前显示端ID的响应式引用（用于确保模板更新）
        const currentDisplayId = computed(() => {
            console.log('[SlidePanel] currentDisplayId computed:', displayState.currentDisplayId);
            return displayState.currentDisplayId;
        });

        // 拖拽相关状态
        const draggedDisplayId = ref(null);
        const dragOverDisplayId = ref(null);

        // 检查是否允许打开 display-2
        async function isDisplay2Allowed() {
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

        // 点击卡片切换显示端
        async function selectDisplay(displayId) {
            console.log('[SlidePanel] 点击切换显示端到:', displayId);
            
            // 检查 display-2 是否允许打开
            if (displayId === 'display-2') {
                const allowed = await isDisplay2Allowed();
                if (!allowed) {
                    const mode = settings.display.display2Mode || 'dev-only';
                    let message = '副显示器当前已禁用，无法切换';
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
            const targetDisplay = settings.display.displays[displayId];
            if (!targetDisplay) {
                console.warn('[SlidePanel] 显示端不存在:', displayId);
                return;
            }
            
            if (!targetDisplay.enabled) {
                showNotification('显示端已禁用', `显示端 "${targetDisplay.name}" 当前已禁用，无法切换`, {
                    tag: 'display-disabled',
                    urgency: 'normal'
                });
                return;
            }
            
            // 强制更新状态，确保响应性
            const oldDisplayId = settings.display.currentDisplayId;
            
            // 使用 nextTick 确保状态更新和UI刷新的正确顺序
            nextTick(() => {
                // 同时更新设置和本地状态
                settings.display.currentDisplayId = displayId;
                displayState.currentDisplayId = displayId;
                
                // 强制触发响应性更新
                Object.assign(displayState, {
                    currentDisplayId: displayId,
                    displays: { ...settings.display.displays }
                });
                
                saveSettings();
                
                // 处理显示窗口切换
                handleDisplayWindowSwitch();
                
                // 显示切换成功的提示
                const displayName = targetDisplay.name || displayId;
                console.log('[SlidePanel] 显示端切换完成:', oldDisplayId, '->', displayId);
                
                showNotification('显示端已切换', `当前活动显示端：${displayName}`, {
                    tag: 'display-switched',
                    urgency: 'normal'
                });
            });
        }

        // 处理显示窗口切换
        function handleDisplayWindowSwitch() {
            // 如果有显示窗口正在运行，需要通知更新或重新打开
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.switchDisplay) {
                // Electron 环境：通知主进程切换显示端
                try {
                    const currentDisplayConfig = currentDisplay.value;
                    window.electronAPI.switchDisplay(
                        currentDisplayConfig.id,
                        currentDisplayConfig.width || 1900,
                        currentDisplayConfig.height || 600
                    );
                } catch (e) {
                    console.warn('切换显示端失败:', e);
                }
            } else if (typeof window !== 'undefined') {
                // 浏览器环境：如果有弹窗显示窗口，关闭并重新打开
                if (window.__metro_pids_display_popup && !window.__metro_pids_display_popup.closed) {
                    try {
                        window.__metro_pids_display_popup.close();
                        window.__metro_pids_display_popup = null;
                        window.__metro_pids_display_popup_ready = false;
                        
                        // 短暂延迟后重新打开新的显示端
                        setTimeout(() => {
                            if (uiState.showDisplay) {
                                // 重新打开显示窗口
                                const currentDisplayConfig = currentDisplay.value;
                                let url = '';
                                
                                if (currentDisplayConfig.source === 'builtin') {
                                    // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                                    if (currentDisplayConfig.url) {
                                        url = currentDisplayConfig.url;
                                    } else if (currentDisplayConfig.id === 'display-1') {
                                        url = 'display_window.html';
                                    } else {
                                        url = `displays/${currentDisplayConfig.id}/display_window.html`;
                                    }
                                } else if (currentDisplayConfig.source === 'gitee') {
                                    url = currentDisplayConfig.url || '';
                                } else {
                                    url = currentDisplayConfig.url || '';
                                }
                                
                                if (url) {
                                    const w = currentDisplayConfig.width || 1900;
                                    const h = currentDisplayConfig.height || 600;
                                    const newWin = window.open(url, `_blank_${currentDisplayConfig.id}`, `width=${w},height=${h}`);
                                    if (newWin) {
                                        window.__metro_pids_display_popup = newWin;
                                        window.__metro_pids_display_popup_ready = false;
                                    }
                                }
                            }
                        }, 100);
                    } catch (e) {
                        console.warn('重新打开显示窗口失败:', e);
                    }
                }
            }
        }

        // 拖拽开始
        function handleDragStart(event, displayId) {
            draggedDisplayId.value = displayId;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', displayId);
            
            // 添加拖拽样式
            event.target.style.opacity = '0.5';
        }

        // 拖拽结束
        function handleDragEnd(event) {
            event.target.style.opacity = '1';
            draggedDisplayId.value = null;
            dragOverDisplayId.value = null;
        }

        // 拖拽进入
        function handleDragEnter(event, displayId) {
            event.preventDefault();
            if (draggedDisplayId.value && draggedDisplayId.value !== displayId) {
                dragOverDisplayId.value = displayId;
            }
        }

        // 拖拽离开
        function handleDragLeave(event) {
            // 只有当鼠标真正离开元素时才清除高亮
            if (!event.currentTarget.contains(event.relatedTarget)) {
                dragOverDisplayId.value = null;
            }
        }

        // 拖拽悬停
        function handleDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }

        // 拖拽放置
        function handleDrop(event, targetDisplayId) {
            event.preventDefault();
            
            const sourceDisplayId = draggedDisplayId.value;
            if (!sourceDisplayId || sourceDisplayId === targetDisplayId) {
                return;
            }

            // 重新排序显示端
            reorderDisplays(sourceDisplayId, targetDisplayId);
            
            draggedDisplayId.value = null;
            dragOverDisplayId.value = null;
        }

        // 重新排序显示端
        function reorderDisplays(sourceId, targetId) {
            const displays = settings.display.displays;
            const displayIds = Object.keys(displays);
            
            const sourceIndex = displayIds.indexOf(sourceId);
            const targetIndex = displayIds.indexOf(targetId);
            
            if (sourceIndex === -1 || targetIndex === -1) return;
            
            // 创建新的显示端对象，按新顺序排列
            const newDisplays = {};
            const reorderedIds = [...displayIds];
            
            // 移动元素到新位置
            reorderedIds.splice(sourceIndex, 1);
            reorderedIds.splice(targetIndex, 0, sourceId);
            
            // 重建显示端对象
            reorderedIds.forEach(id => {
                newDisplays[id] = displays[id];
            });
            
            // 同时更新设置和本地状态
            settings.display.displays = newDisplays;
            displayState.displays = { ...newDisplays }; // 创建新对象确保响应性
            
            saveSettings();
            
            console.log('[SlidePanel] 显示端排序已更新:', sourceId, '->', targetId);
            
            showNotification('显示端排序已更新', `已将 "${displays[sourceId].name}" 移动到新位置`, {
                tag: 'display-reordered',
                urgency: 'normal'
            });
        }

        // 添加新显示端
        async function addNewDisplay() {
            const name = await promptUser('请输入显示端名称', `显示端 ${Object.keys(settings.display.displays).length + 1}`);
            if (!name) return;

            const newId = `display-${Date.now()}`;
            const newDisplay = {
                id: newId,
                name: name,
                source: 'builtin',
                url: '',
                width: 1900,
                height: 600,
                enabled: true,
                isSystem: false, // 用户添加的显示端不是系统显示器
                description: '用户自定义显示端'
            };
            
            // 使用 nextTick 确保状态更新的正确顺序
            await nextTick();
            
            // 同时更新设置和本地状态
            settings.display.displays[newId] = newDisplay;
            displayState.displays = { ...settings.display.displays }; // 创建新对象确保响应性
            
            settings.display.currentDisplayId = newId;
            displayState.currentDisplayId = newId;
            
            saveSettings();
            
            console.log('[SlidePanel] 新显示端已添加:', newId, newDisplay);
            await showMsg(`显示端 "${name}" 已添加并设为当前活动显示端`);
        }

        // 编辑显示端
        async function editDisplay(displayId) {
            const display = settings.display.displays[displayId];
            if (!display) return;
            
            // 检查是否为系统显示器
            if (display.isSystem) {
                await showMsg('系统显示器不允许编辑配置');
                return;
            }

            // 创建编辑对话框的内容
            const editForm = `
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block; margin-bottom:4px; font-weight:bold;">显示端名称:</label>
                        <input id="displayName" type="text" value="${display.name}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:4px; font-weight:bold;">显示端类型:</label>
                        <select id="displaySource" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
                            <option value="builtin" ${display.source === 'builtin' ? 'selected' : ''}>本地显示器</option>
                            <option value="custom" ${display.source === 'custom' ? 'selected' : ''}>自定义URL</option>
                            <option value="gitee" ${display.source === 'gitee' ? 'selected' : ''}>Gitee页面</option>
                        </select>
                    </div>
                    <div id="fileContainer" style="display:${display.source === 'builtin' ? 'block' : 'none'};">
                        <label style="display:block; margin-bottom:4px; font-weight:bold;">本地网页文件:</label>
                        <div style="display:flex; gap:8px;">
                            <input id="displayFile" type="text" value="${display.url || ''}" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px;" placeholder="请选择本地HTML文件" readonly>
                            <button id="selectFileBtn" type="button" style="padding:8px 16px; background:#4A90E2; color:white; border:none; border-radius:4px; cursor:pointer; white-space:nowrap;">选择文件</button>
                        </div>
                    </div>
                    <div id="urlContainer" style="display:${display.source !== 'builtin' ? 'block' : 'none'};">
                        <label style="display:block; margin-bottom:4px; font-weight:bold;">URL地址:</label>
                        <input id="displayUrl" type="text" value="${display.url || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;" placeholder="请输入显示端URL">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:4px; font-weight:bold;">描述 (可选):</label>
                        <input id="displayDescription" type="text" value="${display.description || ''}" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;" placeholder="请输入显示端描述">
                    </div>
                </div>
            `;

            // 使用自定义对话框
            const result = await new Promise((resolve) => {
                const dialog = document.createElement('div');
                dialog.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:30000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);';
                
                dialog.innerHTML = `
                    <div style="background:var(--card); border-radius:12px; padding:24px; max-width:500px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                        <h3 style="margin:0 0 20px 0; font-size:18px; font-weight:bold; color:var(--text);">编辑显示端 - ${display.name}</h3>
                        ${editForm}
                        <div style="display:flex; gap:12px; margin-top:20px; justify-content:flex-end;">
                            <button id="cancelBtn" style="background:#95a5a6; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer;">取消</button>
                            <button id="saveBtn" style="background:#2ED573; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer;">保存</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(dialog);

                // 添加事件监听器：当显示端类型改变时，动态显示/隐藏URL输入框和文件选择器
                const displaySourceSelect = dialog.querySelector('#displaySource');
                const urlContainer = dialog.querySelector('#urlContainer');
                const fileContainer = dialog.querySelector('#fileContainer');
                const displayFileInput = dialog.querySelector('#displayFile');
                const selectFileBtn = dialog.querySelector('#selectFileBtn');
                
                if (displaySourceSelect && urlContainer && fileContainer) {
                    displaySourceSelect.addEventListener('change', function() {
                        if (this.value === 'builtin') {
                            urlContainer.style.display = 'none';
                            fileContainer.style.display = 'block';
                        } else {
                            urlContainer.style.display = 'block';
                            fileContainer.style.display = 'none';
                        }
                    });
                }
                
                // 添加文件选择按钮事件
                if (selectFileBtn && displayFileInput) {
                    selectFileBtn.addEventListener('click', async () => {
                        try {
                            // 在Electron环境中使用文件选择对话框
                            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.showOpenDialog) {
                                const result = await window.electronAPI.showOpenDialog({
                                    filters: [
                                        { name: 'HTML文件', extensions: ['html', 'htm'] },
                                        { name: '所有文件', extensions: ['*'] }
                                    ],
                                    properties: ['openFile']
                                });
                                if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
                                    displayFileInput.value = result.filePaths[0];
                                }
                            } else {
                                // 在浏览器环境中使用input file
                                const fileInput = document.createElement('input');
                                fileInput.type = 'file';
                                fileInput.accept = '.html,.htm';
                                fileInput.onchange = (e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        // 在浏览器中，使用file://协议
                                        displayFileInput.value = file.name;
                                        // 注意：浏览器中无法直接获取完整路径，只能获取文件名
                                        // 实际使用时需要通过URL.createObjectURL创建临时URL
                                    }
                                };
                                fileInput.click();
                            }
                        } catch (error) {
                            console.error('选择文件失败:', error);
                            alert('选择文件失败: ' + error.message);
                        }
                    });
                }

                dialog.querySelector('#cancelBtn').onclick = () => {
                    document.body.removeChild(dialog);
                    resolve(null);
                };

                dialog.querySelector('#saveBtn').onclick = () => {
                    const name = dialog.querySelector('#displayName').value.trim();
                    const source = dialog.querySelector('#displaySource').value;
                    let url = '';
                    if (source === 'builtin') {
                        url = dialog.querySelector('#displayFile').value.trim();
                        if (!url) {
                            alert('请选择本地网页文件');
                        return;
                    }
                    } else {
                        url = dialog.querySelector('#displayUrl').value.trim();
                        if (!url) {
                        alert('请输入URL地址');
                        return;
                    }
                    }
                    const description = dialog.querySelector('#displayDescription').value.trim();

                    if (!name) {
                        alert('请输入显示端名称');
                        return;
                    }

                    document.body.removeChild(dialog);
                    resolve({ name, source, url, description });
                };

                // 点击背景关闭
                dialog.onclick = (e) => {
                    if (e.target === dialog) {
                        document.body.removeChild(dialog);
                        resolve(null);
                    }
                };
            });

            if (result) {
                display.name = result.name;
                display.source = result.source;
                display.url = result.url;
                // width 和 height 保持不变，不更新
                display.description = result.description;
                
                // 强制更新显示端状态确保响应性
                displayState.displays = { ...settings.display.displays };
                
                saveSettings();
                
                console.log('[SlidePanel] 显示端已更新:', displayId, result);
                await showMsg(`显示端 "${result.name}" 已更新`);
            }
        }

        // 切换显示端启用状态
        function toggleDisplayEnabled(displayId) {
            const display = settings.display.displays[displayId];
            if (display) {
                display.enabled = !display.enabled;
                
                // 强制更新显示端状态确保响应性
                displayState.displays = { ...settings.display.displays };
                
                saveSettings();
                
                console.log('[SlidePanel] 显示端启用状态已切换:', displayId, display.enabled);
                
                const statusText = display.enabled ? '已启用' : '已禁用';
                showNotification('显示端状态已更新', `${display.name} ${statusText}`, {
                    tag: 'display-status-changed',
                    urgency: 'normal'
                });
            }
        }

        // 删除显示端
        async function deleteDisplay(displayId) {
            const display = settings.display.displays[displayId];
            if (!display) return;
            
            // 检查是否为系统显示器
            if (display.isSystem) {
                await showMsg('系统显示器不允许删除');
                return;
            }

            if (!(await askUser(`确定要删除显示端 "${display.name}" 吗？`))) return;

            // 使用 nextTick 确保状态更新的正确顺序
            await nextTick();

            // 同时从设置和本地状态中删除
            delete settings.display.displays[displayId];
            
            // 创建新的显示端对象确保响应性
            displayState.displays = { ...settings.display.displays };
            
            // 如果删除的是当前显示端，切换到第一个可用的显示端
            if (settings.display.currentDisplayId === displayId) {
                const remainingIds = Object.keys(settings.display.displays);
                if (remainingIds.length > 0) {
                    settings.display.currentDisplayId = remainingIds[0];
                    displayState.currentDisplayId = remainingIds[0];
                    console.log('[SlidePanel] 删除当前显示端，切换到:', remainingIds[0]);
                }
            }

            saveSettings();
            
            console.log('[SlidePanel] 显示端已删除:', displayId);
            await showMsg(`显示端 "${display.name}" 已删除`);
        }

        // 打开所有启用的显示端
        async function openAllDisplays() {
            const enabledDisplays = Object.values(settings.display.displays).filter(d => d.enabled);
            
            if (enabledDisplays.length === 0) {
                await showMsg('没有启用的显示端');
                return;
            }

            let openedCount = 0;
            let skippedCount = 0;
            
            for (const display of enabledDisplays) {
                try {
                    // 检查 display-2 是否允许打开
                    if (display.id === 'display-2') {
                        const allowed = await isDisplay2Allowed();
                        if (!allowed) {
                            skippedCount++;
                            continue; // 跳过不允许打开的 display-2
                        }
                    }
                    
                    if (display.source === 'builtin') {
                        // Electron 原生窗口
                        if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openDisplay === 'function') {
                            await window.electronAPI.openDisplay(display.width, display.height, display.id);
                            openedCount++;
                        } else {
                            // 浏览器弹窗
                            let url;
                            // 如果配置了本地文件路径，使用该路径；否则使用默认路径
                            if (display.url) {
                                url = display.url;
                            } else if (display.id === 'display-1') {
                                url = 'display_window.html';
                            } else {
                                url = `displays/${display.id}/display_window.html`;
                            }
                            const popup = window.open(url, `display_${display.id}`, `width=${display.width},height=${display.height}`);
                            if (popup) {
                                openedCount++;
                            }
                        }
                    } else {
                        // 自定义URL或Gitee页面
                        const url = display.source === 'gitee' ? display.url : display.url;
                        if (url) {
                            const popup = window.open(url, `display_${display.id}`, `width=${display.width},height=${display.height}`);
                            if (popup) {
                                openedCount++;
                            }
                        }
                    }
                } catch (e) {
                    console.error(`打开显示端 ${display.name} 失败:`, e);
                }
            }

            let message = `已尝试打开 ${openedCount} 个显示端`;
            if (skippedCount > 0) {
                message += `，已跳过 ${skippedCount} 个显示端（不符合显示条件）`;
            }
            await showMsg(message);
        }

        // 关闭所有显示端
        async function closeAllDisplays() {
            try {
                // 发送关闭命令到所有显示端
                if (pidsState && pidsState.bcWrap && typeof pidsState.bcWrap.post === 'function') {
                    pidsState.bcWrap.post({ t: 'CMD_UI', cmd: 'winClose' });
                }
                
                // 同时通过 postMessage 发送
                if (typeof window !== 'undefined' && window.postMessage) {
                    window.postMessage({ t: 'CMD_UI', cmd: 'winClose' }, '*');
                }

                await showMsg('已发送关闭命令到所有显示端');
            } catch (e) {
                console.error('关闭显示端失败:', e);
                await showMsg('关闭显示端时发生错误');
            }
        }

        // 清理分辨率缩放监听
        onUnmounted(() => {
            if (scaleCheckInterval) {
                clearInterval(scaleCheckInterval);
                scaleCheckInterval = null;
            }
            // 清理网页环境的事件监听器
            if (cleanupWebListeners) {
                cleanupWebListeners();
                cleanupWebListeners = null;
            }
        });

        return {
            uiState,
            closePanel,
            ...autoplay,
            isPlaying, isPaused, nextIn, start, stop, togglePause,
            fileIO,
            pidsState,
            switchLine, switchLineByName, newLine, delLine, saveCfg, clearShortTurn, applyShortTurn,
            applyThroughOperation, clearThroughOperation,
            openLineManagerForThroughOperation, openLineManagerForSegment,
            throughLineSegments, addThroughLineSegment, removeThroughLineSegment,
            cleanStationName,
            settings, saveSettings, keyMapDisplay, recordKey, clearKey, resetKeys,
            updateState, checkForUpdateClicked, downloadUpdateNow, clearCacheAndRedownload, installDownloadedUpdate, skipThisVersion, openGitHubReleases,
            version, hasElectronAPI, pickColor, openColorPicker,
            showColorPicker, colorPickerInitialColor, onColorConfirm,
            startWithLock, stopWithUnlock, startRecordingWithCheck,
            changeServiceMode, serviceModeLabel,
            showReleaseNotes, releaseNotes, loadingNotes, openReleaseNotes, closeReleaseNotes, formatReleaseBody,
            shortTurnPresets, loadShortTurnPresets, saveShortTurnPreset, loadShortTurnPreset, deleteShortTurnPreset,
            openLineManagerWindow,
            // 显示端管理方法
            currentDisplay, currentDisplayId, displayState, selectDisplay, 
            draggedDisplayId, dragOverDisplayId,
            handleDragStart, handleDragEnd, handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
            addNewDisplay, editDisplay, toggleDisplayEnabled, deleteDisplay, openAllDisplays, closeAllDisplays
        };
    },
  template: `
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
    <div id="slidePanel" style="flex:1; display:flex; flex-direction:column; overflow:auto; background:transparent;">
      
      <!-- Panel 1: PIDS Console -->
      <div v-if="uiState.activePanel === 'panel-1'" class="panel-body" style="padding:24px 16px;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
            <div style="text-align:left;">
                <div style="font-size:24px; font-weight:800; color:var(--text); letter-spacing:1px;">PIDS 控制台</div>
                <div style="font-size:12px; font-weight:bold; color:var(--muted); opacity:0.7; margin-top:4px;">V2-Multi Stable</div>
            </div>
        </div>
        
        <!-- Content -->
        <div style="display:flex; flex-direction:column; gap:20px;">
            <!-- Folder & Line Management -->
            <div class="card" style="border-left: 6px solid #FF9F43; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#FF9F43; font-weight:bold; margin-bottom:12px; font-size:15px;">线路管理器</div>
            
            <!-- 当前线路显示 -->
            <div style="margin-bottom:12px; padding:12px; background:var(--card); border-radius:8px; border:2px solid var(--divider);">
                <div style="font-size:14px; color:var(--muted); margin-bottom:4px;">当前线路</div>
                <div style="font-size:18px; font-weight:bold; color:var(--text);">{{ pidsState.appData?.meta?.lineName || '未选择' }}</div>
            </div>
            
            <!-- 线路管理器按钮 -->
            <div style="display:flex; gap:12px; margin-bottom:12px;">
                <button class="btn" style="flex:1; background:#FF9F43; color:white; border:none; border-radius:6px; padding:12px; font-weight:bold; font-size:14px;" @click="openLineManagerWindow()">
                    <i class="fas fa-folder-open"></i> 打开管理器
                </button>
            </div>
            
            <!-- 线路存储操作按钮 -->
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
            
            <!-- 重置数据按钮 -->
            <button class="btn" style="width:100%; background:#FF6B6B; color:white; padding:10px; border-radius:6px; border:none; font-weight:bold;" @click="fileIO.resetData()">
                <i class="fas fa-trash-alt"></i> 重置数据
            </button>
        </div>

          </div>
          
          <!-- Autoplay Control -->
          <div class="card" style="border-left: 6px solid #1E90FF; border-radius:12px; padding:16px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
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
      </div>

      <!-- Panel 4: Settings -->
      <div v-if="uiState.activePanel === 'panel-4'" class="panel-body" style="padding:24px 16px; overflow-y:auto;">
        
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
                <select v-model="settings.themeMode" @change="saveSettings()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);">
                    <option value="system">跟随系统 (System)</option>
                    <option value="light">浅色 (Light)</option>
                    <option value="dark">深色 (Dark)</option>
                </select>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span style="color:var(--text); font-size:14px;">高斯模糊</span>
                <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                    <input type="checkbox" v-model="settings.blurEnabled" @change="saveSettings()" style="opacity:0; width:0; height:0;">
                    <span :style="{
                        position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0, 
                        backgroundColor: settings.blurEnabled ? 'var(--accent)' : '#ccc', 
                        transition:'.4s', borderRadius:'24px'
                    }"></span>
                    <span :style="{
                        position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px', 
                        backgroundColor:'white', transition:'.4s', borderRadius:'50%',
                        transform: settings.blurEnabled ? 'translateX(20px)' : 'translateX(0)'
                    }"></span>
                </label>
            </div>

            <!-- 深色模式变体 已移除 -->
        </div>

        <!-- Display Management -->
        <div class="card" style="border-left: 6px solid #FF9F43; border-radius:12px; padding:16px; margin-bottom:20px; background:var(--bg); box-shadow:0 2px 12px rgba(0,0,0,0.05);">
            <div style="color:#FF9F43; font-weight:bold; margin-bottom:16px; font-size:15px;">显示端管理 (Display Management)</div>
            
            <!-- 显示端列表标题和添加按钮 -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="font-size:14px; font-weight:bold; color:var(--text);">显示端列表</div>
                <button @click="addNewDisplay()" class="btn" style="background:#2ED573; color:white; padding:6px 12px; border-radius:6px; border:none; font-size:12px;">
                    <i class="fas fa-plus"></i> 添加显示端
                </button>
            </div>
            
            <!-- 拖拽提示 -->
            <div style="font-size:12px; color:var(--muted); margin-bottom:12px; padding:8px; background:var(--card); border-radius:6px; border:1px dashed var(--divider);">
                <i class="fas fa-info-circle"></i> 点击卡片切换显示端，拖拽卡片可调整顺序
            </div>
            
            <!-- 显示端卡片列表 -->
            <div style="max-height:400px; overflow-y:auto; border:1px solid var(--divider); border-radius:6px; padding:8px; margin-bottom:16px;">
                <div v-for="(display, id) in displayState.displays" :key="id" 
                     :draggable="true"
                     @dragstart="handleDragStart($event, id)"
                     @dragend="handleDragEnd($event)"
                     @dragenter="handleDragEnter($event, id)"
                     @dragleave="handleDragLeave($event)"
                     @dragover="handleDragOver($event)"
                     @drop="handleDrop($event, id)"
                     @click="selectDisplay(id)"
                     :style="[
                         !display.enabled ? 'opacity: 0.5; cursor: not-allowed; background: #f5f5f5;' : '',
                         id === displayState.currentDisplayId ? 'border-color: #FF9F43; background: rgba(255,159,67,0.1); box-shadow: 0 2px 8px rgba(255,159,67,0.3);' : '',
                         dragOverDisplayId === id ? 'border-color: #4A90E2; background: rgba(74,144,226,0.1); transform: translateY(-2px);' : '',
                         draggedDisplayId === id ? 'opacity: 0.5;' : '',
                         'display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; background:var(--card); border-radius:6px; border:2px solid var(--divider); cursor:pointer; transition:all 0.2s; user-select:none;'
                     ]">
                    
                    <!-- 拖拽手柄 -->
                    <div style="color:var(--muted); margin-right:8px; cursor:grab;" 
                         @mousedown="$event.stopPropagation()">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    
                    <!-- 显示端信息 -->
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:14px; font-weight:bold; color:var(--text); margin-bottom:4px;">
                            {{ display.name }}
                            <span v-if="display.isSystem" style="color:#4A90E2; font-size:12px; margin-left:8px;">
                                <i class="fas fa-shield-alt"></i> 系统
                            </span>
                            <span v-if="id === displayState.currentDisplayId" style="color:#FF9F43; font-size:12px; margin-left:8px;">
                                <i class="fas fa-star"></i> 当前
                            </span>
                        </div>
                        <div style="font-size:12px; color:var(--muted);">
                            {{ display.source === 'builtin' ? '本地显示器' : display.source === 'custom' ? '自定义URL' : 'Gitee页面' }}
                            <span v-if="!display.enabled" style="color:#FF6B6B; margin-left:8px;">
                                <i class="fas fa-pause"></i> 已禁用
                            </span>
                        </div>
                        <div v-if="display.description" style="font-size:11px; color:var(--muted); margin-top:2px;">
                            {{ display.description }}
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div style="display:flex; gap:4px; margin-left:8px;" @click="$event.stopPropagation()">
                        <!-- 系统显示器显示锁定图标 -->
                        <button v-if="display.isSystem" 
                                style="padding:6px 8px; border-radius:4px; border:none; background:#95A5A6; color:white; font-size:11px; cursor:not-allowed;" 
                                disabled title="系统显示器不可编辑">
                            <i class="fas fa-lock"></i>
                        </button>
                        
                        <!-- 非系统显示器显示编辑按钮 -->
                        <button v-else 
                                @click="editDisplay(id)" 
                                style="padding:6px 8px; border-radius:4px; border:none; background:#4A90E2; color:white; font-size:11px;" 
                                title="编辑显示端">
                            <i class="fas fa-edit"></i>
                        </button>
                        
                        <!-- 启用/禁用按钮 -->
                        <button @click="toggleDisplayEnabled(id)" 
                                :style="display.enabled ? 'padding:6px 8px; border-radius:4px; border:none; background:#FF9F43; color:white; font-size:11px;' : 'padding:6px 8px; border-radius:4px; border:none; background:#95A5A6; color:white; font-size:11px;'" 
                                :title="display.enabled ? '禁用显示端' : '启用显示端'">
                            <i :class="display.enabled ? 'fas fa-pause' : 'fas fa-play'"></i>
                        </button>
                        
                        <!-- 删除按钮（仅非系统显示器） -->
                        <button v-if="!display.isSystem" 
                                @click="deleteDisplay(id)" 
                                style="padding:6px 8px; border-radius:4px; border:none; background:#FF6B6B; color:white; font-size:11px;" 
                                title="删除显示端">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 批量操作 -->
            <div style="display:flex; gap:10px;">
                <button @click="openAllDisplays()" class="btn" style="flex:1; background:#2ED573; color:white; padding:10px; border-radius:6px; border:none; font-weight:bold;">
                    <i class="fas fa-window-restore"></i> 打开所有显示端
                </button>
                <button @click="closeAllDisplays()" class="btn" style="flex:1; background:#FF6B6B; color:white; padding:10px; border-radius:6px; border:none; font-weight:bold;">
                    <i class="fas fa-times-circle"></i> 关闭所有显示端
                </button>
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
                            style="width:100px; text-align:center; cursor:pointer; font-family:monospace; font-weight:bold; padding:6px 10px; border-radius:6px; border:1px solid var(--divider); background:var(--input-bg); color:var(--accent);"
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
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <button class="btn" style="flex:0 0 auto; background:#2d98da; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="checkForUpdateClicked()">检查更新</button>
                <button class="btn" style="flex:0 0 auto; background:#95a5a6; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="openReleaseNotes()">
                    <i class="fas fa-list-alt"></i> 查看日志
                </button>
                <div v-if="updateState.checking" style="font-size:12px; color:var(--muted);">检查中...</div>
                <div v-else-if="updateState.error" style="font-size:12px; color:#e74c3c;">错误：{{ updateState.error }}</div>
                <div v-else-if="updateState.isLatest" style="font-size:12px; color:#2ed573;">✓ 当前已是最新版本</div>
                <div v-else-if="updateState.available && !updateState.downloading && !updateState.downloaded" style="font-size:12px; color:#4b7bec;">发现新版本 {{ (updateState.info && updateState.info.version) ? updateState.info.version : '' }}</div>
                <div v-else-if="updateState.downloaded" style="font-size:12px; color:#2ed573;">更新已准备就绪，重启即可完成</div>
                <div v-else-if="updateState.downloading" style="font-size:12px; color:var(--muted);">
                    下载中 {{ updateState.progress }}%
                    <span v-if="updateState.error && (updateState.error.includes('checksum') || updateState.error.includes('sha512'))" style="color:#ffa502; margin-left:8px;">
                        <i class="fas fa-sync-alt" style="animation:spin 1s linear infinite;"></i> 自动重试中...
                    </span>
                </div>
            </div>
            <div v-if="updateState.available && !updateState.downloaded" style="display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
                <button class="btn" style="background:#3867d6; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="downloadUpdateNow()" :disabled="updateState.downloading">
                    <i class="fas fa-download"></i> 下载更新
                </button>
                <button v-if="updateState.error && (updateState.error.includes('checksum') || updateState.error.includes('sha512'))" class="btn" style="background:#ffa502; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="clearCacheAndRedownload()" :disabled="updateState.downloading">
                    <i class="fas fa-redo"></i> 清除缓存并重新下载
                </button>
                <button class="btn" style="background:#2ecc71; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="openGitHubReleases()" title="如果自动下载失败，可以从GitHub手动下载">
                    <i class="fab fa-github"></i> 从GitHub手动下载
                </button>
                <button class="btn" style="background:#95a5a6; color:white; padding:8px 12px; border-radius:6px; border:none;" @click="skipThisVersion()" :disabled="updateState.downloading">
                    <i class="fas fa-times"></i> 跳过此版本
                </button>
            </div>
            <div v-if="updateState.downloaded" style="margin-bottom:10px;">
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                <button class="btn" style="background:#20bf6b; color:white; padding:8px 12px; border-radius:6px; border:none; font-weight:bold;" @click="installDownloadedUpdate()">
                        <i class="fas fa-redo"></i> 重启应用完成更新
                </button>
                </div>
                <div style="font-size:11px; color:var(--muted); line-height:1.4; padding:6px 8px; background:rgba(32,191,107,0.1); border-radius:4px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    更新已准备就绪，点击按钮重启应用即可自动完成更新，无需走安装流程。
                </div>
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

    </div>

    <!-- Color Picker Dialog -->
    <ColorPicker 
      v-model="showColorPicker" 
      :initial-color="colorPickerInitialColor"
      @confirm="onColorConfirm"
    />


    <!-- Release Notes Dialog -->
    <div v-if="showReleaseNotes" style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);" @click.self="closeReleaseNotes">
        <div style="background:var(--card); border-radius:12px; padding:24px; max-width:800px; max-height:80vh; width:90%; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="margin:0; font-size:20px; font-weight:bold; color:var(--text);">更新日志</h2>
                <button @click="closeReleaseNotes" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;" @mouseover="$event.target.style.background='var(--bg)'" @mouseout="$event.target.style.background='none'">&times;</button>
            </div>
            <div style="flex:1; overflow-y:auto; padding-right:8px;">
                <div v-if="loadingNotes" style="text-align:center; padding:40px; color:var(--muted);">加载中...</div>
                <div v-else-if="releaseNotes.length === 0" style="text-align:center; padding:40px; color:var(--muted);">暂无更新日志</div>
                <div v-else style="display:flex; flex-direction:column; gap:24px;">
                    <div v-for="(release, index) in releaseNotes" :key="index" style="border-bottom:1px solid var(--divider); padding-bottom:20px;" :style="index === releaseNotes.length - 1 ? 'border-bottom:none;' : ''">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div>
                                <h3 style="margin:0; font-size:18px; font-weight:bold; color:var(--text);">{{ release.name || release.tag_name }}</h3>
                                <div style="font-size:12px; color:var(--muted); margin-top:4px;">{{ new Date(release.published_at).toLocaleDateString('zh-CN') }}</div>
                            </div>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <span v-if="release.prerelease" style="background:#ffa502; color:white; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;">预发布</span>
                                <span v-if="release.draft" style="background:#95a5a6; color:white; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;">草稿</span>
                                <a :href="release.html_url" target="_blank" style="color:var(--btn-blue-bg); text-decoration:none; font-size:12px;">查看详情 →</a>
                            </div>
                        </div>
                        <div style="color:var(--text); line-height:1.6; white-space:pre-wrap; font-size:14px;" v-html="formatReleaseBody(release.body, release)"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `
}

