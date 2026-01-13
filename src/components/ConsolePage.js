import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import dialogService from '../utils/dialogService.js'
import { applyThroughOperation as mergeThroughLines } from '../utils/throughOperation.js'
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import ColorPicker from './ColorPicker.js'

export default {
  name: 'ConsolePage',
  components: { ColorPicker },
  setup() {
    const { state: pidsState, sync: syncState } = usePidsState()
    const { next: controllerNext, sync, getStep } = useController()
    const fileIO = useFileIO(pidsState)
    const { settings, saveSettings } = useSettings()
    
    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)
    const promptUser = async (msg, defaultValue, title) => dialogService.prompt(msg, defaultValue, title)
    
    // 检查是否有 Electron API
    const hasElectronAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.startColorPick;
    });
    
    // Mica Electron 测试相关
    const micaInfo = ref({
      isWindows11: false,
      isWindows10: false,
      currentEffect: null,
      currentTheme: 'auto',
      backgroundColor: '#00000000'
    });
    
    const micaTestLogs = ref([]);
    
    // 添加日志
    const addMicaLog = (message, type = 'info') => {
      const timestamp = new Date().toLocaleTimeString();
      micaTestLogs.value.unshift({
        timestamp,
        message,
        type
      });
      // 只保留最近 50 条日志
      if (micaTestLogs.value.length > 50) {
        micaTestLogs.value = micaTestLogs.value.slice(0, 50);
      }
    };
    
    // 获取 Mica 信息
    const getMicaInfo = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const info = await window.electronAPI.mica.getInfo();
        micaInfo.value = {
          ...micaInfo.value,
          ...info
        };
        addMicaLog(`获取 Mica 信息成功: ${JSON.stringify(info)}`, 'success');
      } catch (e) {
        addMicaLog(`获取 Mica 信息失败: ${e.message}`, 'error');
      }
    };
    
    // 设置 Mica 效果
    const setMicaEffect = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setMicaEffect();
        if (result && result.ok) {
          micaInfo.value.currentEffect = 'mica';
          addMicaLog('✅ 已设置 Mica 效果', 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置 Mica 效果失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置 Mica 效果失败: ${e.message}`, 'error');
      }
    };
    
    // 设置 Acrylic 效果
    const setAcrylicEffect = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setAcrylic();
        if (result && result.ok) {
          micaInfo.value.currentEffect = 'acrylic';
          addMicaLog('✅ 已设置 Acrylic 效果', 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置 Acrylic 效果失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置 Acrylic 效果失败: ${e.message}`, 'error');
      }
    };
    
    // 设置主题
    const setMicaTheme = async (theme) => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        let result;
        if (theme === 'light') {
          result = await window.electronAPI.mica.setLightTheme();
        } else if (theme === 'dark') {
          result = await window.electronAPI.mica.setDarkTheme();
        } else {
          result = await window.electronAPI.mica.setAutoTheme();
        }
        if (result && result.ok) {
          micaInfo.value.currentTheme = theme;
          addMicaLog(`✅ 已设置主题: ${theme}`, 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置主题失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置主题失败: ${e.message}`, 'error');
      }
    };
    
    // 设置窗口背景色
    const setBackgroundColor = async (color) => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setBackgroundColor(color);
        if (result && result.ok) {
          micaInfo.value.backgroundColor = color;
          addMicaLog(`✅ 已设置背景色: ${color}`, 'success');
          await getMicaInfo();
        } else {
          addMicaLog(`设置背景色失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置背景色失败: ${e.message}`, 'error');
      }
    };
    
    // 设置圆角
    const setRoundedCorner = async () => {
      if (!window.electronAPI || !window.electronAPI.mica) {
        addMicaLog('Mica Electron API 不可用', 'error');
        return;
      }
      try {
        const result = await window.electronAPI.mica.setRoundedCorner();
        if (result && result.ok) {
          addMicaLog('✅ 已设置窗口圆角', 'success');
        } else {
          addMicaLog(`设置圆角失败: ${result?.error || '未知错误'}`, 'error');
        }
      } catch (e) {
        addMicaLog(`设置圆角失败: ${e.message}`, 'error');
      }
    };
    
    // 清除日志
    const clearMicaLogs = () => {
      micaTestLogs.value = [];
      addMicaLog('日志已清除', 'info');
    };
    
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
    // 兼容旧数据，补齐线路名合并开关
    if (pidsState.appData.meta.lineNameMerge === undefined) pidsState.appData.meta.lineNameMerge = false;
    // 初始化显示全部站点选项
    if (pidsState.appData.meta.showAllStations === undefined) {
        pidsState.appData.meta.showAllStations = false;
    }
    
    // 初始化贯通线路设置字段
    if (pidsState.appData.meta.throughLineSegments === undefined) {
        if (pidsState.appData.meta.lineALineName && pidsState.appData.meta.lineBLineName) {
            pidsState.appData.meta.throughLineSegments = [
                { lineName: pidsState.appData.meta.lineALineName, throughStationName: '' },
                { lineName: pidsState.appData.meta.lineBLineName, throughStationName: '' }
            ];
        } else {
            pidsState.appData.meta.throughLineSegments = [
                { lineName: '', throughStationName: '' },
                { lineName: '', throughStationName: '' }
            ];
        }
    }
    
    // 贯通线路设置
    const throughLineSegments = ref([]);
    const lineStationsMap = ref({});
    const lineSelectorTarget = ref(null);
    
    // 初始化throughLineSegments响应式数据
    throughLineSegments.value = [...(pidsState.appData.meta.throughLineSegments || [])];
    
    function changeServiceMode(mode) {
        const meta = pidsState.appData.meta || {};
        meta.serviceMode = mode;
        if (mode === 'direct' && pidsState.appData.stations && pidsState.appData.stations.length > 0) {
            meta.startIdx = 0;
            meta.termIdx = pidsState.appData.stations.length - 1;
        }
        saveCfg();
    }
    
    function saveCfg() {
        // 归一化布尔值，避免字符串 "true"/"false" 影响显示端判断
        if (pidsState?.appData?.meta) {
            pidsState.appData.meta.lineNameMerge = !!pidsState.appData.meta.lineNameMerge;
        }
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
    
    // 自动检测并设置贯通站点
    function autoDetectThroughStations() {
        const meta = pidsState.appData.meta || {};
        const segments = meta.throughLineSegments || [];
        
        // 如果线路段数量不足，静默返回（这是正常状态，不需要日志）
        if (segments.length < 2) {
            return;
        }
        
        const cleanStationName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
        };
        
        for (let i = 0; i < segments.length - 1; i++) {
            const currentSegment = segments[i];
            const nextSegment = segments[i + 1];
            
            if (!currentSegment.lineName || !nextSegment.lineName) {
                continue;
            }
            
            const currentStations = lineStationsMap.value[i] || [];
            const nextStations = lineStationsMap.value[i + 1] || [];
            
            if (currentStations.length === 0 || nextStations.length === 0) {
                continue;
            }
            
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
            
            const commonStations = [];
            currentStations.forEach((st, currentIdx) => {
                const cleanName = cleanStationName(st.name);
                if (cleanName && nextNames.has(cleanName)) {
                    const nextIdx = nextStations.findIndex((nextSt) => cleanStationName(nextSt.name) === cleanName);
                    if (nextIdx >= 0) {
                        commonStations.push({
                            name: cleanName,
                            currentIdx: currentIdx,
                            nextIdx: nextIdx
                        });
                    }
                }
            });
            
            if (commonStations.length > 0) {
                if (commonStations.length === 1) {
                    const throughStationName = commonStations[0].name;
                    currentSegment.throughStationName = throughStationName;
                    currentSegment.candidateThroughStations = undefined;
                    console.log(`[贯通站点检测] ✓ 段${i + 1}和段${i + 2}的贯通站点: ${throughStationName}`);
                } else {
                    currentSegment.candidateThroughStations = commonStations.map(s => s.name);
                    if (!currentSegment.throughStationName || !currentSegment.candidateThroughStations.includes(currentSegment.throughStationName)) {
                        currentSegment.throughStationName = commonStations[0].name;
                    }
                    console.log(`[贯通站点检测] ⚠ 段${i + 1}和段${i + 2}找到${commonStations.length}个共同站点`);
                }
            } else {
                currentSegment.throughStationName = '';
                currentSegment.candidateThroughStations = undefined;
            }
        }
        
        if (segments.length > 0) {
            segments[segments.length - 1].throughStationName = '';
            segments[segments.length - 1].candidateThroughStations = undefined;
        }
        
        saveCfg();
    }
    
    // 处理从线路管理器返回的线路选择
    async function handleLineSelectedForThroughOperation(lineName, targetFromIPC) {
        const meta = pidsState.appData.meta || {};
        const target = targetFromIPC || lineSelectorTarget.value || localStorage.getItem('throughOperationSelectorTarget');
        
        if (!lineName) {
            return;
        }
        
        if (typeof target === 'number' || (target && target.startsWith('segment-'))) {
            if (!meta.throughLineSegments) {
                meta.throughLineSegments = [];
            }
            const segmentIndex = typeof target === 'number' ? target : parseInt(target.replace('segment-', ''));
            if (segmentIndex >= 0) {
                while (meta.throughLineSegments.length <= segmentIndex) {
                    meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
                }
                meta.throughLineSegments[segmentIndex].lineName = lineName;
                await loadLineStations(lineName, segmentIndex);
            }
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        lineSelectorTarget.value = null;
        localStorage.removeItem('throughOperationSelectorTarget');
        saveCfg();
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        saveCfg();
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    // 初始化时加载已保存的线路段
    async function initThroughOperationLines() {
        const meta = pidsState.appData.meta || {};
        
        if (!meta.throughLineSegments || meta.throughLineSegments.length === 0) {
            if (meta.lineALineName && meta.lineBLineName) {
                meta.throughLineSegments = [
                    { lineName: meta.lineALineName, throughStationName: '' },
                    { lineName: meta.lineBLineName, throughStationName: '' }
                ];
            } else {
                meta.throughLineSegments = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
            }
        }
        
        while (meta.throughLineSegments.length < 2) {
            meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        }
        
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
        
        for (let i = 0; i < throughLineSegments.value.length; i++) {
            const segment = throughLineSegments.value[i];
            if (segment.lineName) {
                await loadLineStations(segment.lineName, i);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        autoDetectThroughStations();
        throughLineSegments.value = [...(meta.throughLineSegments || [])];
    }
    
    function addThroughLineSegment() {
        const meta = pidsState.appData.meta || {};
        if (!meta.throughLineSegments) {
            meta.throughLineSegments = [];
        }
        meta.throughLineSegments.push({ lineName: '', throughStationName: '' });
        throughLineSegments.value = meta.throughLineSegments;
        saveCfg();
    }
    
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
        throughLineSegments.value = [...meta.throughLineSegments];
        
        delete lineStationsMap.value[index];
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
        
        await new Promise(resolve => setTimeout(resolve, 100));
        autoDetectThroughStations();
        throughLineSegments.value = [...meta.throughLineSegments];
        saveCfg();
    }
    
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
        const segments = meta.throughLineSegments || [];
        
        // 只处理连续的有线路名称的段（从第一段开始，连续的有线路名称的段）
        const validSegments = [];
        for (let i = 0; i < segments.length; i++) {
            if (segments[i] && segments[i].lineName && segments[i].lineName.trim()) {
                validSegments.push(segments[i]);
            } else {
                // 遇到空段就停止（只处理连续的段）
                break;
            }
        }
        
        if (validSegments.length < 2) {
            await showMsg('至少需要选择2条线路才能进行贯通');
            return;
        }
        
        // 检查每两段之间的贯通站点
        for (let i = 0; i < validSegments.length - 1; i++) {
            if (!validSegments[i].throughStationName || !validSegments[i].throughStationName.trim()) {
                await showMsg(`第${i + 1}段和第${i + 2}段之间未找到贯通站点`);
                return;
            }
        }
        
        try {
            const storeList = pidsState.store?.list || [];
            if (!storeList || storeList.length === 0) {
                await showMsg('无法获取线路列表，请刷新线路数据');
                return;
            }
            
            const mergedData = mergeThroughLines(pidsState.appData, storeList, {
                throughLineSegments: validSegments
            });
            
            if (!mergedData || !mergedData.stations || mergedData.stations.length === 0) {
                await showMsg('合并线路失败，请检查线路数据');
                return;
            }
            
            const lineNames = validSegments.map(s => s.lineName).join(' - ');
            const mergedLineName = `${lineNames} (贯通)`;
            mergedData.meta.lineName = mergedLineName;
            mergedData.meta.throughOperationEnabled = true;
            mergedData.meta.throughLineSegments = validSegments;
            
            pidsState.store.list.push(mergedData);
            const newLineIndex = pidsState.store.list.length - 1;
            await nextTick();
            
            pidsState.store.cur = newLineIndex;
            pidsState.appData = pidsState.store.list[newLineIndex];
            pidsState.rt.idx = 0;
            pidsState.rt.state = 0;
            
            // 清除线路名称到文件路径的映射（如果存在）
            const cleanLineName = mergedLineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1').trim();
            if (pidsState.lineNameToFilePath && pidsState.lineNameToFilePath[cleanLineName]) {
                delete pidsState.lineNameToFilePath[cleanLineName];
            }
            
            // 清除线路管理器选择目标（避免影响后续线路切换）
            lineSelectorTarget.value = null;
            localStorage.removeItem('throughOperationSelectorTarget');
            
            // 创建一个纯 JSON 可序列化的对象（移除不可序列化的内容，如函数、循环引用等）
            let serializableData;
            try {
                serializableData = JSON.parse(JSON.stringify(mergedData));
            } catch (e) {
                console.error('[贯通线路] 序列化失败:', e);
                await showMsg('序列化线路数据失败: ' + (e.message || e), '错误');
                // 回滚
                pidsState.store.list.pop();
                if (pidsState.store.cur >= pidsState.store.list.length) {
                    pidsState.store.cur = Math.max(0, pidsState.store.list.length - 1);
                }
                if (pidsState.store.list.length > 0) {
                    pidsState.appData = pidsState.store.list[pidsState.store.cur];
                }
                return;
            }
            
            // 将贯通线路数据存储到 localStorage，供线路管理器读取
            localStorage.setItem('pendingThroughLineData', JSON.stringify({
                lineData: serializableData,
                lineName: mergedLineName,
                cleanLineName: cleanLineName,
                validSegments: validSegments
            }));
            
            // 设置保存模式标记（必须在打开窗口之前设置）
            localStorage.setItem('throughOperationSelectorTarget', 'save-through-line');
            
            // 打开线路管理器窗口，让用户选择保存位置
            if (window.electronAPI && window.electronAPI.openLineManager) {
                await window.electronAPI.openLineManager('save-through-line');
            } else {
                await openLineManagerWindow();
            }
            
            // 监听保存完成事件
            const checkSaveResult = setInterval(async () => {
                const saveResult = localStorage.getItem('throughLineSaveResult');
                if (saveResult) {
                    clearInterval(checkSaveResult);
                    localStorage.removeItem('throughLineSaveResult');
                    localStorage.removeItem('pendingThroughLineData');
                    
                    const result = JSON.parse(saveResult);
                    if (result.success) {
                        // 保存成功，更新状态
                        pidsState.currentFolderId = result.folderId;
                        pidsState.currentFilePath = result.filePath;
                        
                        // 刷新线路列表（从保存的文件夹）
                        if (result.folderPath) {
                            await fileIO.refreshLinesFromFolder(true, result.folderPath);
                        }
                        
                        // 获取文件夹名称用于显示
                        const folderName = pidsState.folders.find(f => f.id === result.folderId)?.name || result.folderId;
                        const folderInfo = `\n保存位置: ${folderName}`;
                        
                        saveCfg();
                        sync();
                        
                        const throughStations = validSegments.slice(0, -1).map(s => s.throughStationName).filter(s => s).join('、');
                        
                        // 等待线路管理器窗口完全关闭后再显示通知（确保通知在线路管理器保存完成后弹出）
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // 使用系统通知显示成功消息
                        const { showNotification } = await import('../utils/notificationService.js');
                        const notificationMessage = `贯通线路已创建并保存！\n线路名称: ${mergedLineName}\n线路段数: ${validSegments.length}\n贯通站点: ${throughStations || '无'}\n合并后站点数: ${mergedData.stations.length}${folderInfo}\n\n已自动切换到新创建的贯通线路`;
                        showNotification('贯通线路保存成功', notificationMessage);
                    } else {
                        // 保存失败或被取消，回滚
                        pidsState.store.list.pop();
                        if (pidsState.store.cur >= pidsState.store.list.length) {
                            pidsState.store.cur = Math.max(0, pidsState.store.list.length - 1);
                        }
                        if (pidsState.store.list.length > 0) {
                            pidsState.appData = pidsState.store.list[pidsState.store.cur];
                        }
                        if (result.error && result.error !== 'cancelled') {
                            await showMsg('保存贯通线路失败: ' + result.error, '错误');
                        } else {
                            await showMsg('已取消创建贯通线路', '提示');
                        }
                    }
                }
            }, 500);
            
            // 30秒后清除监听（防止内存泄漏）
            setTimeout(() => {
                clearInterval(checkSaveResult);
            }, 30000);
        } catch (error) {
            console.error('[贯通线路] 合并失败:', error);
            await showMsg('合并线路时发生错误: ' + (error.message || error));
        }
    }
    
    async function clearThroughOperation() {
        if (await askUser('确定要清除贯通线路设置吗？\n注意：这将清除贯通线路配置，但不会删除已创建的贯通线路。')) {
            try {
                const meta = pidsState.appData.meta || {};
                // 清除旧的贯通线路字段
                meta.lineALineName = '';
                meta.lineBLineName = '';
                meta.throughStationIdx = -1;
                meta.throughOperationEnabled = false;
                // 清除新的贯通线路段配置
                delete meta.throughLineSegments;
                // 清除自定义颜色范围（贯通线路特有）
                delete meta.customColorRanges;
                // 重置响应式数据
                throughLineSegments.value = [
                    { lineName: '', throughStationName: '' },
                    { lineName: '', throughStationName: '' }
                ];
                // 清除线路管理器选择目标（避免影响正常切换线路）
                lineSelectorTarget.value = null;
                localStorage.removeItem('throughOperationSelectorTarget');
                // 同步状态到store
                if (pidsState.store && pidsState.store.list && pidsState.store.cur >= 0) {
                    pidsState.store.list[pidsState.store.cur] = pidsState.appData;
                }
                saveCfg();
                sync();
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
                if (preset.lineName && preset.lineName !== pidsState.appData.meta.lineName) {
                    if (!(await askUser(`此预设属于线路"${preset.lineName}"，当前线路是"${pidsState.appData.meta.lineName}"，是否继续加载？`))) {
                        return;
                    }
                }
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
    
    // 切换线路
    function switchLine(idx) {
        if (idx < 0 || idx >= pidsState.store.list.length) return;
        pidsState.store.cur = idx;
        pidsState.appData = pidsState.store.list[idx];
        pidsState.rt.idx = 0;
        pidsState.rt.state = 0;
        // 更新当前文件的路径信息
        if (pidsState.appData && pidsState.appData.meta && pidsState.appData.meta.lineName) {
            const filePath = pidsState.lineNameToFilePath[pidsState.appData.meta.lineName];
            if (filePath) {
                pidsState.currentFilePath = filePath;
            } else {
                pidsState.currentFilePath = null; // 如果没有找到路径，清空
            }
        } else {
            pidsState.currentFilePath = null;
        }
        saveCfg();
        sync();
    }
    
    // 通过线路名称切换线路
    async function switchLineByName(lineName) {
        console.log('[ConsolePage] switchLineByName 被调用, lineName:', lineName);
        // 先刷新“当前文件夹”的线路列表
        await fileIO.refreshLinesFromFolder(true);
        
        // 查找线路（移除颜色标记后比较）
        const cleanName = (name) => {
            if (!name) return '';
            return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
        };
        const cleanRequestName = cleanName(lineName);
        
        let idx = pidsState.store.list.findIndex(l => {
            if (!l.meta || !l.meta.lineName) return false;
            const cleanLineName = cleanName(l.meta.lineName);
            return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
        });
        
        console.log('[ConsolePage] switchLineByName 查找结果, idx:', idx, '线路列表长度:', pidsState.store.list.length);
        if (idx >= 0) {
            switchLine(idx);
            console.log('[ConsolePage] switchLineByName 切换成功, 切换到索引:', idx);
            return;
        }
        
        console.warn('[ConsolePage] switchLineByName 在当前文件夹未找到线路:', lineName, '，尝试在其他文件夹中查找');
        
        // -------------------------
        // 兜底方案：在所有线路文件夹中查找该线路
        // 解决“线路文件不在当前文件夹里就无法切换”的问题
        // -------------------------
        if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
            console.warn('[ConsolePage] Electron 文件夹 API 不可用，无法在其他文件夹中查找线路');
            return;
        }
        
        try {
            const foldersRes = await window.electronAPI.lines.folders.list();
            if (!(foldersRes && foldersRes.ok && Array.isArray(foldersRes.folders))) {
                console.warn('[ConsolePage] 获取线路文件夹列表失败或为空:', foldersRes);
                return;
            }
            
            const folders = foldersRes.folders;
            let foundFolderId = null;
            let foundFolderPath = null;
            
            for (const folder of folders) {
                if (!folder || !folder.path || !folder.id) continue;
                
                try {
                    const items = await window.electronAPI.lines.list(folder.path);
                    if (!Array.isArray(items) || items.length === 0) continue;
                    
                    for (const it of items) {
                        try {
                            const res = await window.electronAPI.lines.read(it.name, folder.path);
                            if (!(res && res.ok && res.content)) continue;
                            
                            const d = res.content;
                            if (!d || !d.meta || !d.meta.lineName) continue;
                            
                            const cleanLineName = cleanName(d.meta.lineName);
                            if (cleanLineName === cleanRequestName || d.meta.lineName === lineName) {
                                foundFolderId = folder.id;
                                foundFolderPath = folder.path;
                                console.log('[ConsolePage] 在其他文件夹中找到了匹配线路:', d.meta.lineName, 'folderId:', folder.id, 'path:', folder.path);
                            }
                        } catch (e) {
                            console.warn('[ConsolePage] 读取线路文件失败', it && it.name, e);
                        }
                        
                        if (foundFolderId) break;
                    }
                } catch (e) {
                    console.warn('[ConsolePage] 列出文件夹内线路失败，folder.path =', folder.path, e);
                }
                
                if (foundFolderId) break;
            }
            
            if (!foundFolderId || !foundFolderPath) {
                console.warn('[ConsolePage] 在所有文件夹中都没有找到线路:', lineName);
                return;
            }
            
            // 找到了所在文件夹：更新当前文件夹ID，然后刷新线路列表
            // 更新全局的 currentFolderId，确保后续保存时使用正确的文件夹
            if (foundFolderId) {
                pidsState.currentFolderId = foundFolderId;
            }
            // 直接从该物理路径刷新线路列表，然后再用原有逻辑切换
            // 不再依赖主进程的"当前文件夹"配置，避免出现"文件夹不存在"等问题
            await fileIO.refreshLinesFromFolder(true, foundFolderPath);
            idx = pidsState.store.list.findIndex(l => {
                if (!l.meta || !l.meta.lineName) return false;
                const cleanLineName = cleanName(l.meta.lineName);
                return cleanLineName === cleanRequestName || l.meta.lineName === lineName;
            });
            
            console.log('[ConsolePage] switchLineByName 兜底查找结果, idx:', idx, '线路列表长度:', pidsState.store.list.length);
            if (idx >= 0) {
                switchLine(idx);
                console.log('[ConsolePage] switchLineByName 兜底切换成功, 切换到索引:', idx);
        } else {
                console.warn('[ConsolePage] 即使在找到的文件夹中刷新后仍未找到线路:', lineName);
            }
        } catch (e) {
            console.warn('[ConsolePage] 在所有文件夹中查找线路时发生异常:', e);
        }
    }
    
    // 处理线路切换请求
    async function handleSwitchLineRequest(lineName, target) {
        console.log('[ConsolePage] handleSwitchLineRequest 被调用, lineName:', lineName, 'target:', target);
        const throughTarget = target || lineSelectorTarget.value || localStorage.getItem('throughOperationSelectorTarget');
        console.log('[ConsolePage] handleSwitchLineRequest throughTarget:', throughTarget, 'lineSelectorTarget.value:', lineSelectorTarget.value, 'localStorage:', localStorage.getItem('throughOperationSelectorTarget'));
        
        const isThroughOperation = throughTarget === 'lineA' || 
                                   throughTarget === 'lineB' || 
                                   (typeof throughTarget === 'number') ||
                                   (throughTarget && throughTarget.startsWith('segment-'));
        
        console.log('[ConsolePage] handleSwitchLineRequest isThroughOperation:', isThroughOperation);
        
        if (isThroughOperation) {
            console.log('[ConsolePage] handleSwitchLineRequest 处理贯通线路选择');
            await handleLineSelectedForThroughOperation(lineName, throughTarget);
            return;
        } else {
            console.log('[ConsolePage] handleSwitchLineRequest 处理普通线路切换');
            await switchLineByName(lineName);
        }
    }
    
    // 监听来自线路管理器的线路切换请求
    onMounted(async () => {
        // 初始化 Mica 信息
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.mica) {
            await getMicaInfo();
            addMicaLog('Mica Electron 测试模块已加载', 'info');
        } else {
            addMicaLog('Mica Electron API 不可用（可能不在 Electron 环境）', 'warning');
        }
        
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onSwitchLineRequest) {
            try {
                window.electronAPI.onSwitchLineRequest(async (lineName, target) => {
                    await handleSwitchLineRequest(lineName, target);
                });
            } catch (e) {
                console.warn('无法设置线路切换监听:', e);
            }
        }
        
        if (typeof window !== 'undefined' && (!window.electronAPI || !window.electronAPI.onSwitchLineRequest)) {
            const messageHandler = async (event) => {
                if (event.data && event.data.type === 'switch-line-request') {
                    const { lineName, target } = event.data;
                    await handleSwitchLineRequest(lineName, target);
                }
            };
            window.addEventListener('message', messageHandler);
            
            const storageHandler = async (event) => {
                if (event.key === 'lineManagerSelectedLine' && event.newValue) {
                    const lineName = event.newValue;
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    await handleSwitchLineRequest(lineName, target);
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            };
            window.addEventListener('storage', storageHandler);
            
            const checkInterval = setInterval(() => {
                const lineName = localStorage.getItem('lineManagerSelectedLine');
                if (lineName) {
                    const target = localStorage.getItem('lineManagerSelectedTarget');
                    handleSwitchLineRequest(lineName, target);
                    localStorage.removeItem('lineManagerSelectedLine');
                    localStorage.removeItem('lineManagerSelectedTarget');
                }
            }, 500);
        }
        
        try {
            await fileIO.initDefaultLines();
        } catch (e) {
            console.warn('初始化预设线路失败:', e);
        }
        
        initThroughOperationLines();
    });
    
    // 监听线路切换，自动加载预设列表
    watch(() => pidsState.appData?.meta?.lineName, async () => {
        if (window.electronAPI && window.electronAPI.shortturns) {
            await loadShortTurnPresets();
        }
    }, { immediate: true });

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

    // 自动播放控制函数
    function startWithLock(interval) {
        start(interval);
    }

    function stopWithUnlock() {
        stop();
    }

    // 打开线路管理器窗口
    function openLineManagerWindow() {
        if (window.electronAPI && window.electronAPI.openLineManager) {
            window.electronAPI.openLineManager();
        } else {
            // 如果没有 Electron API，可以打开一个新窗口或显示提示
            alert('线路管理器功能需要 Electron 环境');
        }
    }

    return {
        pidsState,
        fileIO,
        isPlaying,
        isPaused,
        nextIn,
        startWithLock,
        stopWithUnlock,
        togglePause,
        openLineManagerWindow,
        saveCfg,
        changeServiceMode,
        hasElectronAPI,
        pickColor,
        showColorPicker,
        colorPickerInitialColor,
        onColorConfirm,
        clearShortTurn,
        applyShortTurn,
        shortTurnPresets,
        loadShortTurnPresets,
        saveShortTurnPreset,
        loadShortTurnPreset,
        deleteShortTurnPreset,
        throughLineSegments,
        addThroughLineSegment,
        removeThroughLineSegment,
        openLineManagerForSegment,
        clearThroughOperation,
        applyThroughOperation,
        // Mica Electron 测试
        micaInfo,
        micaTestLogs,
        getMicaInfo,
        setMicaEffect,
        setAcrylicEffect,
        setMicaTheme,
        setBackgroundColor,
        setRoundedCorner,
        clearMicaLogs
    }
  },
  template: `
    <div style="flex:1; display:flex; flex-direction:column; overflow:auto; background:var(--bg); padding:24px 16px;">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
          <div style="text-align:left;">
              <div style="font-size:24px; font-weight:800; color:var(--text); letter-spacing:1px;">PIDS 控制台</div>
              <div style="font-size:12px; font-weight:bold; color:var(--muted); opacity:0.7; margin-top:4px;">V2-Multi Stable</div>
          </div>
      </div>
      
      <!-- Content -->
      <div style="display:flex; flex-direction:column;">
          <!-- Folder & Line Management -->
          <div class="card" style="border-left: 6px solid #FF9F43; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05); margin-bottom:28px;">
          <div style="color:#FF9F43; font-weight:bold; margin-bottom:12px; font-size:15px;">线路管理器</div>
          
          <!-- 当前线路显示 -->
          <div style="margin-bottom:12px; padding:12px; background:rgba(255, 255, 255, 0.15); border-radius:8px; border:2px solid var(--divider);">
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
          
        <!-- Service Mode Settings -->
        <div class="card" style="border-left: 6px solid #FF4757; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05); margin-bottom:28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="color:#FF4757; font-weight:bold; font-size:15px;">运营模式</div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12px; color:var(--muted);">当前模式</span>
                    <div style="display:flex; gap:6px;">
                        <span v-if="pidsState.appData.meta.serviceMode==='express'" style="padding:4px 8px; border-radius:4px; border:1px solid #ffa502; color:#ffa502; font-weight:bold; background:rgba(255,165,2,0.12);">大站车</span>
                        <span v-else-if="pidsState.appData.meta.serviceMode==='direct'" style="padding:4px 8px; border-radius:4px; border:1px solid #ff4757; color:#ff4757; font-weight:bold; background:rgba(255,71,87,0.12);">直达</span>
                        <span v-else style="padding:4px 8px; border-radius:4px; border:1px solid var(--divider); color:var(--text); font-weight:bold; background:var(--input-bg);">普通</span>
                    </div>
                </div>
            </div>
            
            <input v-model="pidsState.appData.meta.lineName" placeholder="线路名称" @input="saveCfg()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); margin-bottom:12px; background:var(--input-bg); color:var(--text);">
            
            <!-- 线路名合并开关（控制台） -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; font-size:13px; color:var(--text);">
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-weight:bold;">线路名合并</span>
                <span style="font-size:12px; color:var(--muted);">显示端左侧按多段线路名拼接展示</span>
              </div>
              <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                <input type="checkbox" v-model="pidsState.appData.meta.lineNameMerge" @change="saveCfg()" style="opacity:0; width:0; height:0;">
                <span :style="{
                    position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0,
                    backgroundColor: pidsState.appData.meta.lineNameMerge ? 'var(--accent)' : '#ccc',
                    transition:'.3s', borderRadius:'24px'
                }"></span>
                <span :style="{
                    position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px',
                    backgroundColor:'white', transition:'.3s', borderRadius:'50%',
                    transform: pidsState.appData.meta.lineNameMerge ? 'translateX(20px)' : 'translateX(0)'
                }"></span>
              </label>
            </div>
            
            <!-- 显示全部站点开关 -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; font-size:13px; color:var(--text);">
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-weight:bold;">显示全部站点</span>
                <span style="font-size:12px; color:var(--muted);">启用后，所有站点都会显示在屏幕上，使用 flexbox 布局均匀分布</span>
              </div>
              <label style="position:relative; display:inline-block; width:44px; height:24px; margin:0;">
                <input type="checkbox" v-model="pidsState.appData.meta.showAllStations" @change="saveCfg()" style="opacity:0; width:0; height:0;">
                <span :style="{
                    position:'absolute', cursor:'pointer', top:0, left:0, right:0, bottom:0,
                    backgroundColor: pidsState.appData.meta.showAllStations ? 'var(--accent)' : '#ccc',
                    transition:'.3s', borderRadius:'24px'
                }"></span>
                <span :style="{
                    position:'absolute', content:'', height:'18px', width:'18px', left:'3px', bottom:'3px',
                    backgroundColor:'white', transition:'.3s', borderRadius:'50%',
                    transform: pidsState.appData.meta.showAllStations ? 'translateX(20px)' : 'translateX(0)'
                }"></span>
              </label>
            </div>
            
            <div style="display:flex; gap:12px; margin-bottom:12px;">
                <div style="position:relative; width:60px; height:42px;">
                    <input 
                        v-if="!hasElectronAPI"
                        type="color" 
                        v-model="pidsState.appData.meta.themeColor" 
                        style="position:absolute; top:0; left:0; width:100%; height:100%; padding:0; margin:0; border:none; border-radius:6px; cursor:pointer; opacity:0; z-index:2;" 
                        title="主题色" 
                        @input="saveCfg()"
                    >
                    <div 
                        :style="{position:'absolute', top:0, left:0, width:'100%', height:'100%', borderRadius:'6px', border:'2px solid var(--divider)', backgroundColor:pidsState.appData.meta.themeColor || '#00b894', pointerEvents:hasElectronAPI ? 'auto' : 'none', zIndex:1, cursor:'pointer'}"
                        title="主题色"
                        @click="pickColor"
                    ></div>
                </div>
                <select v-model="pidsState.appData.meta.mode" @change="saveCfg()" style="flex:1; padding:10px; border-radius:6px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);">
                    <option value="loop">环线 (Loop)</option>
                    <option value="linear">单线 (Linear)</option>
                </select>
            </div>
            
            <select v-model="pidsState.appData.meta.dirType" @change="saveCfg()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); margin-bottom:16px; background:var(--input-bg); color:var(--text);">
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
                        background: pidsState.appData.meta.serviceMode==='normal' ? 'var(--btn-blue-bg)' : 'var(--input-bg)',
                        color: pidsState.appData.meta.serviceMode==='normal' ? '#fff' : 'var(--text)',
                        boxShadow: pidsState.appData.meta.serviceMode==='normal' ? '0 4px 12px rgba(22,119,255,0.25)' : 'none',
                        fontWeight:'bold',
                        minWidth:'92px'
                    }" @click="changeServiceMode('normal')">普通</button>
                    <button class="btn" :style="{
                        padding:'10px 14px',
                        borderRadius:'10px',
                        border:'1px solid var(--divider)',
                        background: pidsState.appData.meta.serviceMode==='express' ? '#ffa502' : 'var(--input-bg)',
                        color: pidsState.appData.meta.serviceMode==='express' ? '#fff' : 'var(--text)',
                        boxShadow: pidsState.appData.meta.serviceMode==='express' ? '0 4px 12px rgba(255,165,2,0.25)' : 'none',
                        fontWeight:'bold',
                        minWidth:'92px'
                    }" @click="changeServiceMode('express')">大站车</button>
                    <button class="btn" :style="{
                        padding:'10px 14px',
                        borderRadius:'10px',
                        border:'1px solid var(--divider)',
                        background: pidsState.appData.meta.serviceMode==='direct' ? '#ff4757' : 'var(--input-bg)',
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
        </div>
        
        <!-- Short Turn Settings -->
        <template v-if="!pidsState.appData?.meta?.autoShortTurn">
        <div class="card" style="border-left: 6px solid #5F27CD; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05); margin-bottom:28px;">
            <div style="color:#5F27CD; font-weight:bold; margin-bottom:12px; font-size:15px;">短交路</div>
            
            <div style="display:grid; grid-template-columns: 40px 1fr; gap:12px; align-items:center; margin-bottom:12px;">
                <label style="color:var(--muted);">起点</label>
                <select v-model="pidsState.appData.meta.startIdx" style="padding:8px; border-radius:6px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);">
                    <option :value="-1">无</option>
                    <option v-for="(s,i) in pidsState.appData.stations" :key="'s'+i" :value="i">[{{i+1}}] {{s.name}}</option>
                </select>
            </div>
            
            <div style="display:grid; grid-template-columns: 40px 1fr; gap:12px; align-items:center; margin-bottom:16px;">
                <label style="color:var(--muted);">终点</label>
                <select v-model="pidsState.appData.meta.termIdx" style="padding:8px; border-radius:6px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text);">
                     <option :value="-1">无</option>
                     <option v-for="(s,i) in pidsState.appData.stations" :key="'e'+i" :value="i">[{{i+1}}] {{s.name}}</option>
                </select>
            </div>
            
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:16px;">
                <button @click="clearShortTurn()" class="btn" style="background:#CED6E0; color:#2F3542; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">清除</button>
                <button @click="applyShortTurn()" class="btn" style="background:#5F27CD; color:white; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">应用</button>
            </div>

            <!-- 短交路预设管理 -->
            <div style="font-size:13px; color:var(--muted); margin-bottom:12px; font-weight:bold;">预设管理</div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
                <button @click="saveShortTurnPreset()" class="btn" style="flex:1; background:#5F27CD; color:white; border:none; padding:8px; border-radius:6px; font-size:13px;">
                    <i class="fas fa-save"></i> 保存预设
                </button>
                <button @click="loadShortTurnPresets()" class="btn" style="flex:1; background:#00D2D3; color:white; border:none; padding:8px; border-radius:6px; font-size:13px;">
                    <i class="fas fa-sync-alt"></i> 刷新
                </button>
            </div>
            <div v-if="shortTurnPresets.length > 0" style="max-height:200px; overflow-y:auto; border:1px solid var(--divider); border-radius:6px; padding:8px; margin-bottom:12px;">
                <div v-for="preset in shortTurnPresets" :key="preset.name" style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:4px; background:var(--input-bg); border-radius:4px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:bold; color:var(--text); margin-bottom:2px;">{{ preset.name }}</div>
                        <div style="font-size:11px; color:var(--muted);">
                            {{ preset.startStationName || ('站点' + (preset.startIdx + 1)) }} → {{ preset.termStationName || ('站点' + (preset.termIdx + 1)) }}
                        </div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button @click="loadShortTurnPreset(preset.name)" class="btn" style="background:#2ED573; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px;" title="加载">
                            <i class="fas fa-download"></i>
                        </button>
                        <button @click="deleteShortTurnPreset(preset.name)" class="btn" style="background:#FF6B6B; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px;" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div v-else style="padding:12px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:6px; margin-bottom:12px;">
                暂无预设，点击"保存预设"保存当前短交路设置
            </div>
        </div>
        </template>

        <!-- Through Line Settings -->
        <div class="card" style="border-left: 6px solid #9B59B6; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05); margin-bottom:28px;">
            <div style="color:#9B59B6; font-weight:bold; margin-bottom:12px; font-size:15px;">贯通线路</div>
            
            <div style="background:var(--input-bg); border:1px solid var(--divider); border-radius:8px; padding:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <div style="font-size:12px; font-weight:bold; color:var(--text);">线路段列表</div>
                    <button @click="addThroughLineSegment()" class="btn" style="background:#2ED573; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer;" title="添加线路段">
                        <i class="fas fa-plus"></i> 添加
                    </button>
                </div>
                
                <div v-if="throughLineSegments.length === 0" style="padding:12px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--divider); border-radius:4px; margin-bottom:8px;">
                    暂无线路段，点击"添加"添加第一条线路
                </div>
                
                <div v-for="(segment, index) in throughLineSegments" :key="index" style="margin-bottom:12px; padding:10px; background:var(--bg); border:1px solid var(--divider); border-radius:6px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                        <div style="min-width:60px; font-size:12px; font-weight:bold; color:var(--text);">
                            {{ '线路' + String.fromCharCode('A'.charCodeAt(0) + index) }}
                        </div>
                        <div style="flex:1; padding:6px 12px; border-radius:4px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text); font-size:12px; min-height:28px; display:flex; align-items:center;">
                            {{ segment.lineName || '未选择' }}
                        </div>
                        <button @click="openLineManagerForSegment(index)" class="btn" style="background:#9B59B6; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer; white-space:nowrap;" title="从线路管理器选择">
                            <i class="fas fa-folder-open"></i> 选择
                        </button>
                        <button v-if="throughLineSegments.length > 2" @click="removeThroughLineSegment(index)" class="btn" style="background:#FF6B6B; color:white; border:none; padding:6px 10px; border-radius:4px; font-size:12px; cursor:pointer;" title="删除此段">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    <div v-if="index < throughLineSegments.length - 1" style="display:grid; grid-template-columns: 60px 1fr; gap:8px; align-items:center; margin-top:8px;">
                        <label style="color:var(--muted); font-size:11px;">贯通站点</label>
                        <select 
                            v-if="segment.candidateThroughStations && segment.candidateThroughStations.length > 1"
                            v-model="segment.throughStationName" 
                            @change="saveCfg()"
                            style="padding:6px 12px; border-radius:4px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text); font-size:11px; min-height:24px;">
                            <option value="">请选择贯通站点</option>
                            <option v-for="stationName in segment.candidateThroughStations" :key="stationName" :value="stationName">
                                {{ stationName }}
                            </option>
                        </select>
                        <div v-else style="padding:6px 12px; border-radius:4px; border:1px solid var(--divider); background:var(--input-bg); color:var(--text); font-size:11px; min-height:24px; display:flex; align-items:center;">
                            {{ segment.throughStationName || '未检测到' }}
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button @click="clearThroughOperation()" class="btn" style="background:#CED6E0; color:#2F3542; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">清除</button>
                <button @click="applyThroughOperation()" class="btn" style="background:#9B59B6; color:white; border:none; padding:6px 16px; border-radius:4px; font-size:13px;">应用</button>
            </div>
        </div>
        
        <!-- Autoplay Control -->
        <div class="card" style="border-left: 6px solid #1E90FF; border-radius:12px; padding:16px; background:rgba(255, 255, 255, 0.1); box-shadow:0 2px 12px rgba(0,0,0,0.05); margin-bottom:28px;">
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
    
    <!-- Color Picker Dialog -->
    <ColorPicker 
      v-model="showColorPicker" 
      :initial-color="colorPickerInitialColor"
      @confirm="onColorConfirm"
    />
  `
}

