import { ref, computed, watch, onMounted, nextTick, Teleport } from 'vue'
import LineManagerDialog from './LineManagerDialog.js'
import LineManagerTopbar from './LineManagerTopbar.js'

// 解析颜色标记（简化版，仅用于显示）
function parseColorMarkup(text) {
  if (!text || typeof text !== 'string') return text;
  const regex = /<([^>]+)>([^<]*)<\/>/g;
  let result = text;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const color = match[1].trim();
    const content = match[2];
    let colorValue = color;
    // 尝试解析颜色
    if (color.startsWith('#')) {
      colorValue = color;
    } else if (color.startsWith('rgb')) {
      colorValue = color;
    } else {
      // 颜色名称映射
      const colorMap = {
        red: '#ff4444', green: '#44ff44', blue: '#4444ff',
        yellow: '#ffff44', orange: '#ff8844', purple: '#8844ff',
        pink: '#ff44ff', cyan: '#44ffff', lime: '#88ff44'
      };
      colorValue = colorMap[color.toLowerCase()] || color;
    }
    result = result.replace(match[0], `<span style="color:${colorValue}">${content}</span>`);
  }
  return result;
}

export default {
  name: 'FolderLineManagerWindow',
  components: {
    LineManagerDialog,
    LineManagerTopbar
  },
  setup() {
    const folders = ref([]);
    const currentFolderId = ref('default');
    const currentLines = ref([]);
    const loading = ref(false);
    const selectedFolderId = ref(null);
    const selectedLine = ref(null); // 选中的线路
    const contextMenu = ref({ visible: false, x: 0, y: 0, folderId: null, folderName: null }); // 文件夹右键菜单状态
    const lineContextMenu = ref({ visible: false, x: 0, y: 0, line: null }); // 线路右键菜单状态
    const clipboard = ref({ type: null, line: null, sourceFolderId: null, sourceFolderPath: null }); // 剪贴板状态（用于复制/剪贴）
    const isSavingThroughLine = ref(false); // 是否正在保存贯通线路
    const pendingThroughLineInfo = ref(null); // 待保存的贯通线路信息

    // 获取首末站信息
    function getStationInfo(lineData) {
      if (!lineData || !lineData.stations || !Array.isArray(lineData.stations) || lineData.stations.length === 0) {
        return { first: '', last: '' };
      }
      const stations = lineData.stations;
      const firstSt = stations[0];
      const lastSt = stations[stations.length - 1];
      // 移除颜色标记获取纯文本
      const cleanName = (name) => {
        if (!name) return '';
        return String(name).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
      };
      return {
        first: cleanName(firstSt.name || ''),
        last: cleanName(lastSt.name || '')
      };
    }

    // 加载文件夹列表
    async function loadFolders() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        // 非 Electron 环境，使用默认文件夹
        folders.value = [{ id: 'default', name: '默认', path: '', isCurrent: true }];
        currentFolderId.value = 'default';
        selectedFolderId.value = 'default';
        // 尝试从 localStorage 加载线路列表
        try {
          const saved = localStorage.getItem('pids_global_store_v1');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.list && Array.isArray(parsed.list)) {
              currentLines.value = parsed.list.map((l, idx) => {
                const stationInfo = getStationInfo(l);
                // 识别贯通线路：需要满足以下条件之一：
                // 1. throughOperationEnabled 明确为 true
                // 2. throughLineSegments 存在且至少有2个元素（贯通线路至少需要2条线路）
                // 3. 线路名称中包含"(贯通)"或"（贯通）"字样（这是创建贯通线路时的命名规则）
                const lineName = l.meta?.lineName || '';
                const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）');
                const hasValidSegments = l.meta?.throughLineSegments && 
                                        Array.isArray(l.meta.throughLineSegments) && 
                                        l.meta.throughLineSegments.length >= 2;
                // 更严格的判断：必须满足 throughOperationEnabled === true 或者（有有效段且名称包含贯通）
                const isThroughLine = l.meta?.throughOperationEnabled === true || 
                                     (hasValidSegments && hasThroughInName);
                return {
                  name: l.meta?.lineName || '未命名线路',
                  filePath: '',
                  data: l,
                  index: idx,
                  themeColor: l.meta?.themeColor || '#5F27CD',
                  firstStation: stationInfo.first,
                  lastStation: stationInfo.last,
                  isThroughLine: isThroughLine
                };
              });
            }
          }
        } catch (e) {
          console.error('加载线路失败:', e);
        }
        return;
      }
      try {
        const res = await window.electronAPI.lines.folders.list();
        if (res && res.ok && res.folders) {
          folders.value = res.folders;
          currentFolderId.value = res.current || 'default';
          selectedFolderId.value = currentFolderId.value;
          // 加载当前文件夹的线路
          await loadLinesFromFolder(currentFolderId.value);
        }
      } catch (e) {
        console.error('加载文件夹列表失败:', e);
      }
    }

    // 从文件夹加载线路
    async function loadLinesFromFolder(folderId) {
      if (!(window.electronAPI && window.electronAPI.lines)) {
        return;
      }
      loading.value = true;
      try {
        // 获取文件夹信息
        const folder = folders.value.find(f => f.id === folderId);
        if (!folder) {
          console.error('文件夹不存在:', folderId);
          currentLines.value = [];
          return;
        }
        
        // 先切换文件夹（更新全局状态，用于其他功能）
        if (folderId !== currentFolderId.value) {
          const switchRes = await window.electronAPI.lines.folders.switch(folderId);
          if (switchRes && switchRes.ok) {
            currentFolderId.value = folderId;
            selectedFolderId.value = folderId;
          }
        }
        
        // 直接使用文件夹路径加载线路列表（不依赖全局状态）
        const items = await window.electronAPI.lines.list(folder.path);
        const lines = [];
        if (Array.isArray(items)) {
          for (const it of items) {
            try {
              // 读取文件时也使用文件夹路径
              const res = await window.electronAPI.lines.read(it.name, folder.path);
              if (res && res.ok && res.content) {
                const d = res.content;
                if (d && d.meta && Array.isArray(d.stations)) {
                  const stationInfo = getStationInfo(d);
                  // 识别贯通线路：需要满足以下条件之一：
                  // 1. throughOperationEnabled 明确为 true
                  // 2. throughLineSegments 存在且至少有2个元素（贯通线路至少需要2条线路）
                  // 3. 线路名称中包含"(贯通)"或"（贯通）"字样（这是创建贯通线路时的命名规则）
                  const lineName = d.meta.lineName || '';
                  const hasThroughInName = lineName.includes('(贯通)') || lineName.includes('（贯通）');
                  const hasValidSegments = d.meta.throughLineSegments && 
                                          Array.isArray(d.meta.throughLineSegments) && 
                                          d.meta.throughLineSegments.length >= 2;
                  // 更严格的判断：必须满足 throughOperationEnabled === true 或者（有有效段且名称包含贯通）
                  const isThroughLine = d.meta.throughOperationEnabled === true || 
                                       (hasValidSegments && hasThroughInName);
                  lines.push({
                    name: d.meta.lineName || '未命名线路',
                    filePath: it.name,
                    data: d,
                    themeColor: d.meta.themeColor || '#5F27CD',
                    firstStation: stationInfo.first,
                    lastStation: stationInfo.last,
                    isThroughLine: isThroughLine // 标记为贯通线路
                  });
                }
              }
            } catch (e) {
              console.warn('读取文件失败', it.name, e);
            }
          }
        }
        currentLines.value = lines;
        // 切换文件夹时清除选中状态
        selectedLine.value = null;
      } catch (e) {
        console.error('加载线路失败:', e);
        currentLines.value = [];
      } finally {
        loading.value = false;
      }
    }

    // 选择文件夹
    async function selectFolder(folderId) {
      if (folderId === selectedFolderId.value) return;
      
      // 在保存贯通线路模式下，不允许选择默认文件夹（直接阻止，不显示提示）
      if (isSavingThroughLine.value) {
        const folder = folders.value.find(f => f.id === folderId);
        if (folder && (folder.id === 'default' || folder.name === '默认')) {
          // 直接返回，不执行任何操作
          return;
        }
      }
      
      selectedFolderId.value = folderId;
      await loadLinesFromFolder(folderId);
    }

    // 切换线路选中状态
    function toggleLineSelection(line) {
      if (selectedLine.value && selectedLine.value.name === line.name) {
        selectedLine.value = null;
      } else {
        selectedLine.value = line;
      }
    }

    // 应用选中的线路
    async function applySelectedLine() {
      // 先快照一份，避免中途被清空导致读取 name 报错
      const line = selectedLine.value;
      if (!line || !line.name) {
        console.warn('[线路管理器] applySelectedLine: invalid selectedLine', line);
        return;
      }

      try {
        // 确保当前文件夹已切换并加载
        if (selectedFolderId.value !== currentFolderId.value) {
          await loadLinesFromFolder(selectedFolderId.value);
        }
        
        // 通过 IPC 通知主窗口切换线路（Electron 环境）
        if (window.electronAPI && window.electronAPI.switchLine) {
          // 获取贯通线路选择目标（如果有）
          const target = localStorage.getItem('throughOperationSelectorTarget');
          console.log('[线路管理器] applySelectedLine 调用 switchLine, lineName:', line.name, 'target:', target);
          const result = await window.electronAPI.switchLine(line.name);
          if (result && result.ok) {
            // 切换成功，关闭窗口
            if (window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
        } else {
          // 网页环境：通过 localStorage 和 postMessage 通知主窗口
          const lineName = line.name;
          const target = localStorage.getItem('throughOperationSelectorTarget');
          
          // 存储线路名称和目标到 localStorage，供主窗口读取
          localStorage.setItem('lineManagerSelectedLine', lineName);
          if (target) {
            localStorage.setItem('lineManagerSelectedTarget', target);
          } else {
            localStorage.removeItem('lineManagerSelectedTarget');
          }
          
          // 通过 postMessage 通知主窗口（如果窗口仍然打开）
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'switch-line-request',
              lineName: lineName,
              target: target
            }, '*');
          }
          
          // 触发 storage 事件（用于同源页面通信）
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'lineManagerSelectedLine',
            newValue: lineName
          }));
          
          // 关闭窗口
          window.close();
        }
      } catch (e) {
        console.error('切换线路失败:', e);
      }
    }

    // 添加文件夹
    async function addFolder() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      try {
        // 使用独立的对话框提示用户输入文件夹名称
        if (!window.__lineManagerDialog) {
          console.error('对话框组件未初始化');
          return;
        }
        const folderName = await window.__lineManagerDialog.prompt('请输入文件夹名称', '新建文件夹', '新建文件夹');
        if (!folderName || !folderName.trim()) {
          return; // 用户取消或输入为空
        }
        
        const trimmedName = folderName.trim();
        
        // 检查文件夹名称是否已存在
        const existingFolder = folders.value.find(f => f.name === trimmedName);
        if (existingFolder) {
          await window.__lineManagerDialog.alert(`文件夹名称"${trimmedName}"已存在，请使用其他名称`, '错误');
          return;
        }
        
        const res = await window.electronAPI.lines.folders.add(trimmedName);
        if (res && res.ok) {
          await loadFolders();
        } else if (res && res.error) {
          await window.__lineManagerDialog.alert(res.error || '添加文件夹失败', '错误');
        } else {
          // 如果返回结果但没有ok和error，也显示错误
          await window.__lineManagerDialog.alert('添加文件夹失败：未知错误', '错误');
        }
      } catch (e) {
        console.error('添加文件夹失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('添加文件夹失败：' + (e.message || e), '错误');
        }
      }
    }

    // 删除文件夹
    async function deleteFolder(folderId, folderName, folderPath) {
      if (folderId === 'default') {
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('不能删除默认文件夹', '提示');
        }
        return;
      }
      if (!window.__lineManagerDialog) return;
      const confirmed = await window.__lineManagerDialog.confirm(`确定要删除文件夹"${folderName}"吗？\n\n警告：删除后文件夹及其内部的所有文件将被永久删除，无法恢复！`, '删除文件夹');
      if (!confirmed) {
        return;
      }
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('Electron API 不可用', '错误');
        }
        return;
      }
      try {
        // 传递路径而不是ID，因为路径更稳定
        const res = await window.electronAPI.lines.folders.remove(folderPath || folderId);
        if (res && res.ok) {
          await loadFolders();
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('文件夹已删除', '成功');
          }
        } else {
          // 删除失败，显示错误信息并刷新文件夹列表
          const errorMsg = res && res.error ? res.error : '未知错误';
          console.error('删除文件夹失败:', res);
          // 刷新文件夹列表，确保与后端同步
          await loadFolders();
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert(`删除文件夹失败\n\n${errorMsg}`, '错误');
          }
        }
      } catch (e) {
        console.error('删除文件夹失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('删除文件夹失败：' + (e.message || e), '错误');
        }
      }
    }

    // 重命名文件夹
    async function renameFolder(folderId, currentName) {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      if (!window.__lineManagerDialog) return;
      const newName = await window.__lineManagerDialog.prompt('请输入新的文件夹名称', currentName, '重命名文件夹');
      if (newName && newName.trim() !== currentName) {
        try {
          const res = await window.electronAPI.lines.folders.rename(folderId, newName);
          if (res && res.ok) {
            await loadFolders();
          }
        } catch (e) {
          console.error('重命名文件夹失败:', e);
        }
      }
    }

    // 显示右键菜单
    function showContextMenu(event, folder) {
      event.preventDefault();
      event.stopPropagation();
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        folderId: folder.id,
        folderName: folder.name
      };
    }

    // 关闭右键菜单
    function closeContextMenu() {
      contextMenu.value.visible = false;
    }

    // 打开文件夹（在文件管理器中）
    async function openFolderInExplorer(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (!folder) return;
      
      if (window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders && window.electronAPI.lines.folders.open) {
        try {
          const res = await window.electronAPI.lines.folders.open(folder.path);
          if (!res || !res.ok) {
            if (window.__lineManagerDialog) {
              await window.__lineManagerDialog.alert(res && res.error ? res.error : '打开文件夹失败', '错误');
            }
          }
        } catch (e) {
          console.error('打开文件夹失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('打开文件夹失败：' + (e.message || e), '错误');
          }
        }
      }
    }

    // 处理右键菜单的重命名
    async function handleContextMenuRename(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (folder) {
        await renameFolder(folderId, folder.name);
      }
    }

    // 处理右键菜单的删除
    async function handleContextMenuDelete(folderId) {
      closeContextMenu();
      const folder = folders.value.find(f => f.id === folderId);
      if (folder) {
        await deleteFolder(folderId, folder.name, folder.path);
      }
    }

    // 显示线路右键菜单
    function showLineContextMenu(event, line) {
      event.preventDefault();
      event.stopPropagation();
      
      // 初始位置设置为点击位置
      lineContextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        line: line
      };
      
      // 使用 nextTick 在菜单渲染后调整位置，确保菜单不被裁剪
      nextTick(() => {
        const menuElement = document.querySelector('[data-line-context-menu]');
        if (menuElement) {
          const rect = menuElement.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          
          let x = event.clientX;
          let y = event.clientY;
          
          // 如果菜单会在右侧被截断，调整到左侧
          if (x + rect.width > viewportWidth) {
            x = event.clientX - rect.width;
            if (x < 0) x = Math.max(0, viewportWidth - rect.width - 10);
          }
          
          // 如果菜单会在底部被截断，调整到上方
          if (y + rect.height > viewportHeight) {
            y = event.clientY - rect.height;
            if (y < 0) y = Math.max(0, viewportHeight - rect.height - 10);
          }
          
          // 确保不会超出左边界
          if (x < 0) x = 10;
          
          // 更新位置
          lineContextMenu.value.x = x;
          lineContextMenu.value.y = y;
        }
      });
    }

    // 关闭线路右键菜单
    function closeLineContextMenu() {
      lineContextMenu.value.visible = false;
    }

    // 打开线路（在主窗口中切换到此线路）
    async function openLine(line) {
      closeLineContextMenu();
      if (!line) return;
      
      // Electron 环境
      if (window.electronAPI && window.electronAPI.switchLine) {
        try {
          // 获取贯通线路选择目标（如果有）
          const target = localStorage.getItem('throughOperationSelectorTarget');
          console.log('[线路管理器] openLine 调用 switchLine, lineName:', line.name, 'target:', target);
          const result = await window.electronAPI.switchLine(line.name);
          if (result && result.ok) {
            // 切换成功，关闭线路管理器窗口
            if (window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
        } catch (e) {
          console.error('打开线路失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('打开线路失败：' + (e.message || e), '错误');
          }
        }
      } else {
        // 网页环境：通过 localStorage 和 postMessage 通知主窗口
        const lineName = line.name;
        const target = localStorage.getItem('throughOperationSelectorTarget');
        
        // 存储线路名称和目标到 localStorage，供主窗口读取
        localStorage.setItem('lineManagerSelectedLine', lineName);
        if (target) {
          localStorage.setItem('lineManagerSelectedTarget', target);
        } else {
          localStorage.removeItem('lineManagerSelectedTarget');
        }
        
        // 通过 postMessage 通知主窗口（如果窗口仍然打开）
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'switch-line-request',
            lineName: lineName,
            target: target
          }, '*');
        }
        
        // 触发 storage 事件（用于同源页面通信）
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'lineManagerSelectedLine',
          newValue: lineName
        }));
        
        // 关闭窗口
        window.close();
      }
    }

    // 重命名线路
    async function renameLine(line) {
      closeLineContextMenu();
      if (!line || !window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;
      
      const currentName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, ''); // 移除颜色标记
      const newName = await window.__lineManagerDialog.prompt('请输入新的线路名称', currentName, '重命名线路');
      if (newName && newName.trim() !== currentName) {
        try {
          // 这里需要实现重命名逻辑
          // 由于线路是以文件名存储的，重命名需要保存文件并删除旧文件
          // 暂时提示用户使用主程序的重命名功能
          await window.__lineManagerDialog.alert('线路重命名功能需要在主程序中进行', '提示');
        } catch (e) {
          console.error('重命名线路失败:', e);
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('重命名线路失败：' + (e.message || e), '错误');
          }
        }
      }
    }

    // 复制线路
    async function copyLine(line) {
      closeLineContextMenu();
      const sourceFolderId = selectedFolderId.value || currentFolderId.value;
      const sourceFolder = folders.value.find(f => f.id === sourceFolderId);
      clipboard.value = { type: 'copy', line: line, sourceFolderId: sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null };
      if (window.__lineManagerDialog) {
        await window.__lineManagerDialog.alert('线路已复制', '提示');
      }
    }

    // 剪贴线路
    async function cutLine(line) {
      closeLineContextMenu();
      const sourceFolderId = selectedFolderId.value || currentFolderId.value;
      const sourceFolder = folders.value.find(f => f.id === sourceFolderId);
      clipboard.value = { type: 'cut', line: line, sourceFolderId: sourceFolderId, sourceFolderPath: sourceFolder ? sourceFolder.path : null };
      if (window.__lineManagerDialog) {
        await window.__lineManagerDialog.alert('线路已剪贴', '提示');
      }
    }

    // 新建线路
    async function createNewLine() {
      if (!window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;

        const folderId = selectedFolderId.value || currentFolderId.value;
      
      // 检查是否为默认文件夹
      if (folderId === 'default') {
        await window.__lineManagerDialog.alert('默认文件夹不允许创建线路', '提示');
        return;
      }

        const folder = folders.value.find(f => f.id === folderId);
        if (!folder) {
          await window.__lineManagerDialog.alert('请先选择一个文件夹', '提示');
          return;
        }

      const lineName = await window.__lineManagerDialog.prompt('请输入新线路名称 (例如: 3号线)', '新线路', '新建线路');
      if (!lineName || !lineName.trim()) {
        return; // 用户取消或输入为空
      }

      try {

        // 创建新线路的默认结构
        const newLine = {
          meta: {
            lineName: lineName.trim(),
            themeColor: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            mode: 'linear',
            dirType: 'up',
            serviceMode: 'normal',
            startIdx: -1,
            termIdx: -1,
            version: 1
          },
          stations: []
        };

        // 生成文件名（清理线路名称，移除颜色标记和特殊字符）
        const cleanName = lineName.trim().replace(/<[^>]+>([^<]*)<\/>/g, '$1').replace(/[<>:"/\\|?*]/g, '').trim();
        if (!cleanName) {
          await window.__lineManagerDialog.alert('线路名称无效', '错误');
          return;
        }
        const fileName = cleanName + '.json';

        // 保存到当前文件夹
        const saveRes = await window.electronAPI.lines.save(fileName, newLine, folder.path);
        if (saveRes && saveRes.ok) {
          // 重新加载当前文件夹的线路列表
          await loadLinesFromFolder(folderId);
          await window.__lineManagerDialog.alert('线路已创建', '成功');
        } else {
          await window.__lineManagerDialog.alert('创建线路失败：' + (saveRes && saveRes.error ? saveRes.error : '未知错误'), '错误');
        }
      } catch (e) {
        console.error('创建线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('创建线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 删除线路
    async function deleteLine(line) {
      closeLineContextMenu();
      if (!line || !window.electronAPI || !window.electronAPI.lines) return;
      if (!window.__lineManagerDialog) return;

      const folderId = selectedFolderId.value || currentFolderId.value;
      
      // 检查是否为默认文件夹
      if (folderId === 'default') {
        await window.__lineManagerDialog.alert('默认文件夹不允许删除线路', '提示');
        return;
      }

      const folder = folders.value.find(f => f.id === folderId);
      if (!folder) return;

      const lineName = line.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '').trim();
      const confirmed = await window.__lineManagerDialog.confirm(`确定要删除线路"${lineName}"吗？`, '删除线路');
      if (!confirmed) {
        return;
      }

      try {

        const deleteRes = await window.electronAPI.lines.delete(line.filePath, folder.path);
        if (deleteRes && deleteRes.ok) {
          // 重新加载当前文件夹的线路列表
          await loadLinesFromFolder(folderId);
          await window.__lineManagerDialog.alert('线路已删除', '成功');
        } else {
          await window.__lineManagerDialog.alert('删除线路失败：' + (deleteRes && deleteRes.error ? deleteRes.error : '未知错误'), '错误');
        }
      } catch (e) {
        console.error('删除线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('删除线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 粘贴线路
    async function pasteLine() {
      closeLineContextMenu();
      if (!clipboard.value.line || !window.electronAPI || !window.electronAPI.lines) return;
      
      try {
        const sourceLine = clipboard.value.line;
        const targetFolderId = selectedFolderId.value || currentFolderId.value;
        const targetFolder = folders.value.find(f => f.id === targetFolderId);
        if (!targetFolder) return;

        // 获取源文件夹信息
        const sourceFolderId = clipboard.value.sourceFolderId;
        const sourceFolderPath = clipboard.value.sourceFolderPath;
        if (!sourceFolderId || !sourceFolderPath) {
          await window.__lineManagerDialog.alert('无法确定源文件夹', '错误');
          return;
        }

        // 读取源线路文件
        const readRes = await window.electronAPI.lines.read(sourceLine.filePath, sourceFolderPath);
        if (!readRes || !readRes.ok || !readRes.content) {
          await window.__lineManagerDialog.alert('读取源线路文件失败', '错误');
          return;
        }

        // 生成目标文件名（使用线路名称作为文件名）
        const lineName = sourceLine.name.replace(/<[^>]+>/g, '').replace(/<\/>/g, '').trim();
        const targetFileName = lineName + '.json';

        // 保存到目标文件夹
        const saveRes = await window.electronAPI.lines.save(targetFileName, readRes.content, targetFolder.path);
        if (!saveRes || !saveRes.ok) {
          await window.__lineManagerDialog.alert('保存线路文件失败：' + (saveRes && saveRes.error ? saveRes.error : '未知错误'), '错误');
          return;
        }

        // 如果是剪贴，删除源文件
        if (clipboard.value.type === 'cut') {
          const deleteRes = await window.electronAPI.lines.delete(sourceLine.filePath, sourceFolderPath);
          if (!deleteRes || !deleteRes.ok) {
            console.warn('删除源文件失败:', deleteRes && deleteRes.error);
            // 即使删除失败，也认为粘贴成功
          }
        }

        // 记录操作类型
        const operationType = clipboard.value.type === 'cut' ? '移动' : '复制';

        // 重新加载当前文件夹的线路列表
        await loadLinesFromFolder(targetFolderId);

        // 如果是剪贴操作，还需要重新加载源文件夹
        if (clipboard.value.type === 'cut' && clipboard.value.sourceFolderId !== targetFolderId) {
          await loadLinesFromFolder(clipboard.value.sourceFolderId);
        }

        // 粘贴完成后清除剪贴板
        clipboard.value = { type: null, line: null, sourceFolderId: null, sourceFolderPath: null };

        await window.__lineManagerDialog.alert('线路已' + operationType + '成功', '成功');
      } catch (e) {
        console.error('粘贴线路失败:', e);
        if (window.__lineManagerDialog) {
          await window.__lineManagerDialog.alert('粘贴线路失败：' + (e.message || e), '错误');
        }
      }
    }

    // 关闭窗口
    async function closeWindow() {
      if (window.electronAPI && window.electronAPI.closeWindow) {
        await window.electronAPI.closeWindow();
      } else {
        window.close();
      }
    }

    // 检查是否有文件夹管理 API
    const hasFoldersAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders;
    });

    // 保存贯通线路
    async function saveThroughLine() {
      try {
        console.log('[线路管理器] saveThroughLine 开始执行');
        
        // 检查是否有待保存的贯通线路数据
        const pendingDataStr = localStorage.getItem('pendingThroughLineData');
        if (!pendingDataStr) {
          console.warn('[线路管理器] 未找到待保存的贯通线路数据');
          return;
        }
        
        const pendingData = JSON.parse(pendingDataStr);
        const { lineData, lineName, cleanLineName, validSegments } = pendingData;
        
        console.log('[线路管理器] 贯通线路信息:', { 
          lineName, 
          segmentCount: validSegments ? validSegments.length : 0,
          foldersCount: folders.value.length
        });
        
        // 设置保存模式状态
        isSavingThroughLine.value = true;
        pendingThroughLineInfo.value = {
          lineName: lineName,
          segmentCount: validSegments ? validSegments.length : 0
        };
        
        console.log('[线路管理器] 状态已设置, isSavingThroughLine:', isSavingThroughLine.value);
        
        // 等待状态更新
        await nextTick();
        
        // 检查是否有可用的文件夹（排除默认文件夹）
        const availableFolders = folders.value.filter(f => f.id !== 'default' && f.name !== '默认');
        
        console.log('[线路管理器] 可用文件夹数量:', availableFolders.length);
        
        if (availableFolders.length === 0) {
          // 没有其他文件夹，让用户创建新文件夹
          const folderName = await window.__lineManagerDialog.prompt(
            '当前没有可用的文件夹，请创建一个新文件夹用于保存贯通线路：',
            '新建文件夹',
            '创建文件夹'
          );
          
          if (!folderName || !folderName.trim()) {
            // 用户取消，通知主窗口
            isSavingThroughLine.value = false;
            pendingThroughLineInfo.value = null;
            localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: 'cancelled' }));
            if (window.electronAPI && window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
            return;
          }
          
          // 创建新文件夹
          const addRes = await window.electronAPI.lines.folders.add(folderName.trim());
          if (addRes && addRes.ok) {
            await loadFolders();
            // 使用新创建的文件夹
            const newFolder = folders.value.find(f => f.id === addRes.folderId);
            if (newFolder) {
              await doSaveThroughLine(lineData, cleanLineName, newFolder);
            } else {
              localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: '创建文件夹后未找到' }));
              if (window.electronAPI && window.electronAPI.closeWindow) {
                await window.electronAPI.closeWindow();
              }
            }
          } else {
            localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: addRes && addRes.error || '创建文件夹失败' }));
            if (window.electronAPI && window.electronAPI.closeWindow) {
              await window.electronAPI.closeWindow();
            }
          }
          return;
        }
        
        // 如果只有一个文件夹，等待一小段时间让横幅显示，然后直接使用
        if (availableFolders.length === 1) {
          await new Promise(resolve => setTimeout(resolve, 800)); // 让用户看到横幅
          await doSaveThroughLine(lineData, cleanLineName, availableFolders[0]);
          return;
        }
        
        // 多个文件夹，等待一小段时间让横幅显示，然后显示选择对话框
        await new Promise(resolve => setTimeout(resolve, 800)); // 让用户看到横幅
        const selectedFolder = await showFolderSelector(availableFolders, '请选择保存贯通线路的文件夹：', lineName);
        if (selectedFolder) {
          await doSaveThroughLine(lineData, cleanLineName, selectedFolder);
        } else {
          // 用户取消
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: 'cancelled' }));
          if (window.electronAPI && window.electronAPI.closeWindow) {
            await window.electronAPI.closeWindow();
          }
        }
      } catch (e) {
        console.error('保存贯通线路失败:', e);
        isSavingThroughLine.value = false;
        pendingThroughLineInfo.value = null;
        localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: e.message || e }));
        if (window.electronAPI && window.electronAPI.closeWindow) {
          await window.electronAPI.closeWindow();
        }
      }
    }
    
    // 执行保存贯通线路
    async function doSaveThroughLine(lineData, cleanLineName, folder) {
      try {
        // 检查是否是默认文件夹，如果是则拒绝保存
        if (folder.id === 'default' || folder.name === '默认') {
          if (window.__lineManagerDialog) {
            await window.__lineManagerDialog.alert('不允许保存到默认文件夹，请选择其他文件夹', '提示');
          }
          return;
        }
        
        const targetFileName = cleanLineName.replace(/[<>:"/\\|?*]/g, '').trim() + '.json';
        const saveRes = await window.electronAPI.lines.save(targetFileName, lineData, folder.path);
        
        if (saveRes && saveRes.ok) {
          // 保存成功
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          localStorage.setItem('throughLineSaveResult', JSON.stringify({
            success: true,
            folderId: folder.id,
            folderPath: folder.path,
            filePath: saveRes.path || (folder.path + (folder.path.includes('\\') ? '\\' : '/') + targetFileName)
          }));
          
          // 刷新当前文件夹的线路列表
          await loadLinesFromFolder(folder.id);
          
          // 不在这里显示提示，让主窗口显示系统通知
          // 关闭窗口（在保存结果写入 localStorage 之后）
          if (window.electronAPI && window.electronAPI.closeWindow) {
            // 等待一小段时间确保 localStorage 已写入
            await new Promise(resolve => setTimeout(resolve, 100));
            await window.electronAPI.closeWindow();
          }
        } else {
          isSavingThroughLine.value = false;
          pendingThroughLineInfo.value = null;
          localStorage.setItem('throughLineSaveResult', JSON.stringify({
            success: false,
            error: saveRes && saveRes.error || '保存失败'
          }));
          if (window.electronAPI && window.electronAPI.closeWindow) {
            await window.electronAPI.closeWindow();
          }
        }
      } catch (e) {
        console.error('执行保存失败:', e);
        localStorage.setItem('throughLineSaveResult', JSON.stringify({ success: false, error: e.message || e }));
        if (window.electronAPI && window.electronAPI.closeWindow) {
          await window.electronAPI.closeWindow();
        }
      }
    }
    
    // 显示文件夹选择器
    async function showFolderSelector(foldersList, title, lineName = '') {
      return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);';
        
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = 'background:var(--card, #fff); border-radius:12px; width:90%; max-width:500px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;';
        
        const header = document.createElement('div');
        header.style.cssText = 'padding:20px; border-bottom:1px solid var(--divider, #e0e0e0); display:flex; flex-direction:column; gap:12px; flex-shrink:0;';
        header.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:18px; font-weight:bold; color:var(--text, #333);">${title || '选择文件夹'}</h3>
            <button id="closeBtn" style="background:none; border:none; color:var(--muted, #666); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;">&times;</button>
          </div>
          ${lineName ? `
          <div style="padding:12px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-radius:8px; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(255,159,67,0.2);">
            <i class="fas fa-exchange-alt" style="font-size:20px; color:#fff;"></i>
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:bold; color:#fff; margin-bottom:4px;">保存贯通线路</div>
              <div style="font-size:12px; color:rgba(255,255,255,0.9);">线路名称: ${lineName}</div>
            </div>
          </div>
          ` : ''}
        `;
        
        const folderList = document.createElement('div');
        folderList.style.cssText = 'flex:1; overflow-y:auto; padding:12px; max-height:400px;';
        
        let selectedFolder = null;
        
        foldersList.forEach((folder) => {
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
          
          folderCard.addEventListener('click', () => {
            selectedFolder = folder;
            foldersList.forEach((f) => {
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
          
          folderCard.addEventListener('mouseenter', () => {
            if (selectedFolder?.id !== folder.id) {
              folderCard.style.background = 'var(--bg, #f5f5f5)';
            }
          });
          folderCard.addEventListener('mouseleave', () => {
            if (selectedFolder?.id !== folder.id) {
              folderCard.style.background = 'var(--card, #fff)';
            }
          });
          
          folderCard.setAttribute('data-folder-id', folder.id);
          folderList.appendChild(folderCard);
        });
        
        const buttonBar = document.createElement('div');
        buttonBar.style.cssText = 'padding:16px 20px; border-top:1px solid var(--divider, #e0e0e0); display:flex; justify-content:flex-end; gap:12px; flex-shrink:0;';
        buttonBar.innerHTML = `
          <button id="cancelBtn" style="padding:8px 20px; background:#fff; color:#333; border:1px solid #d9d9d9; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; min-width:60px;">取消</button>
          <button id="confirmBtn" style="padding:8px 20px; background:#1677ff; color:#fff; border:none; border-radius:4px; font-size:14px; cursor:pointer; transition:all 0.2s; font-weight:500; min-width:60px;">确定</button>
        `;
        
        dialogContent.appendChild(header);
        dialogContent.appendChild(folderList);
        dialogContent.appendChild(buttonBar);
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
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
          if (selectedFolder) {
            closeDialog();
            resolve(selectedFolder);
          } else {
            alert('请先选择一个文件夹');
          }
        });
        
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog) {
            closeDialog();
            resolve(null);
          }
        });
      });
    }

    // 手动保存贯通线路（用户点击按钮触发）
    async function handleSaveThroughLine() {
      await saveThroughLine();
    }
    
    // 检查是否是保存贯通线路模式
    async function checkSaveThroughLineMode() {
      const target = localStorage.getItem('throughOperationSelectorTarget');
      const pendingData = localStorage.getItem('pendingThroughLineData');
      
      if (target === 'save-through-line' && pendingData) {
        try {
          const pendingDataObj = JSON.parse(pendingData);
          const { lineName, validSegments } = pendingDataObj;
          
          // 设置保存模式状态（仅显示引导，不自动执行）
          isSavingThroughLine.value = true;
          pendingThroughLineInfo.value = {
            lineName: lineName,
            segmentCount: validSegments ? validSegments.length : 0
          };
          
          // 如果当前选中的是默认文件夹，自动切换到第一个非默认文件夹
          await nextTick();
          if (selectedFolderId.value === 'default' || 
              folders.value.find(f => f.id === selectedFolderId.value)?.name === '默认') {
            const firstNonDefaultFolder = folders.value.find(f => f.id !== 'default' && f.name !== '默认');
            if (firstNonDefaultFolder) {
              selectedFolderId.value = firstNonDefaultFolder.id;
              await loadLinesFromFolder(firstNonDefaultFolder.id);
            }
          }
        } catch (e) {
          console.error('解析待保存数据失败:', e);
        }
      }
    }

    // 组件挂载时加载数据
    onMounted(async () => {
      await loadFolders();
      
      // 检查是否是保存贯通线路模式（仅设置状态，不自动执行）
      await nextTick();
      await checkSaveThroughLineMode();
    });

    // 计算当前活动的文件夹ID
    const activeFolderId = computed(() => {
      return selectedFolderId.value ?? currentFolderId.value;
    });

    return {
      folders,
      currentFolderId,
      selectedFolderId,
      currentLines,
      loading,
      selectedLine,
      activeFolderId,
      isSavingThroughLine,
      pendingThroughLineInfo,
      selectFolder,
      toggleLineSelection,
      applySelectedLine,
      addFolder,
      deleteFolder,
      renameFolder,
      showContextMenu,
      closeContextMenu,
      openFolderInExplorer,
      handleContextMenuRename,
      handleContextMenuDelete,
      closeWindow,
      parseColorMarkup,
      hasFoldersAPI,
      getStationInfo,
      handleSaveThroughLine,
      contextMenu,
      lineContextMenu,
      showLineContextMenu,
      closeLineContextMenu,
      openLine,
      renameLine,
      copyLine,
      cutLine,
      pasteLine,
      deleteLine,
      createNewLine,
      clipboard
    };
  },
  components: {
    Teleport
  },
  template: `
    <div style="width:100vw; height:100vh; display:flex; flex-direction:column; background:transparent;">
      <LineManagerTopbar />
      <!-- 保存贯通线路引导横幅 -->
      <div v-if="isSavingThroughLine && pendingThroughLineInfo" style="padding:16px 20px; background:linear-gradient(135deg, #FF9F43 0%, #FFC371 100%); border-bottom:2px solid rgba(255,255,255,0.2); box-shadow:0 2px 8px rgba(255,159,67,0.3); display:flex; align-items:center; gap:16px; flex-shrink:0;">
        <div style="flex-shrink:0;">
          <i class="fas fa-exchange-alt" style="font-size:24px; color:#fff;"></i>
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:16px; font-weight:bold; color:#fff; margin-bottom:4px;">正在保存贯通线路</div>
          <div style="font-size:13px; color:rgba(255,255,255,0.95);">
            线路名称: <strong>{{ pendingThroughLineInfo.lineName }}</strong>
            <span v-if="pendingThroughLineInfo.segmentCount > 0" style="margin-left:12px;">
              线路段数: <strong>{{ pendingThroughLineInfo.segmentCount }}</strong>
            </span>
          </div>
          <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:6px; display:flex; align-items:center; gap:8px;">
            <i class="fas fa-info-circle"></i>
            <span>请点击右下角的"保存贯通线路"按钮，选择文件夹并保存</span>
          </div>
        </div>
      </div>
      <!-- Main Content (Two Column Layout - QQ Style) -->
      <div style="display:flex; flex:1; overflow:hidden; background:transparent;">
        <!-- Left Sidebar: Folders (类似QQ群列表) -->
        <div v-if="hasFoldersAPI && folders.length > 0" style="width:200px; border-right:1px solid var(--lm-sidebar-border, rgba(0, 0, 0, 0.08)); overflow-y:auto; background:var(--lm-sidebar-bg, rgba(255, 255, 255, 0.6)); flex-shrink:0;">
          <div style="padding:8px 0;">
            <div 
              v-for="folder in folders" 
              :key="folder.id"
              @click="isSavingThroughLine && (folder.id === 'default' || folder.name === '默认') ? null : selectFolder(folder.id)"
              @contextmenu.prevent="showContextMenu($event, folder)"
              :style="{
                padding: '10px 16px',
                cursor: (isSavingThroughLine && (folder.id === 'default' || folder.name === '默认')) ? 'not-allowed' : 'pointer',
                background: selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                borderLeft: selectedFolderId === folder.id ? '3px solid var(--accent, #12b7f5)' : '3px solid transparent',
                opacity: (isSavingThroughLine && (folder.id === 'default' || folder.name === '默认')) ? 0.5 : 1
              }"
              @mouseover="(e) => { if (!(isSavingThroughLine && (folder.id === 'default' || folder.name === '默认'))) { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'var(--lm-sidebar-item-hover, #f0f0f0)'; } }"
              @mouseout="(e) => { e.target.style.background = selectedFolderId === folder.id ? 'var(--lm-sidebar-item-active, #e8e8e8)' : 'transparent'; }"
              :title="(isSavingThroughLine && (folder.id === 'default' || folder.name === '默认')) ? '保存贯通线路时不允许选择默认文件夹' : ''"
            >
              <i class="fas fa-folder" :style="{fontSize:'16px', color: selectedFolderId === folder.id ? 'var(--accent, #12b7f5)' : 'var(--muted, #666)'}"></i>
              <div style="flex:1; min-width:0;">
                <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  {{ folder.name }}
                  <span v-if="isSavingThroughLine && (folder.id === 'default' || folder.name === '默认')" style="margin-left:6px; font-size:11px; color:var(--muted, #999);">(不可用)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Content: Lines (类似QQ文件列表) -->
        <div style="flex:1; background:var(--lm-content-bg, #fff); display:flex; flex-direction:column; overflow:hidden;">
          <!-- 显示当前选中的文件夹名称 -->
          <div v-if="hasFoldersAPI && folders.length > 0 && selectedFolderId" style="padding:12px 20px; background:var(--lm-header-bg, #f0f0f0); border-bottom:1px solid var(--lm-header-border, #e0e0e0); font-size:14px; font-weight:500; color:var(--muted, #666); flex-shrink:0;">
            <i class="fas fa-folder" style="margin-right:8px; color:var(--accent, #12b7f5);"></i>
            <span>{{ folders.find(f => f.id === selectedFolderId)?.name || '未选择文件夹' }}</span>
          </div>
          
          <div v-if="loading" style="display:flex; align-items:center; justify-content:center; flex:1; color:var(--muted, #999);">
            <div style="text-align:center;">
              <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
              <div>加载中...</div>
            </div>
          </div>
          <div v-else style="flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
            <!-- 列表头部 -->
            <div v-if="currentLines.length > 0" style="padding:12px 20px; background:var(--lm-list-header-bg, #fafafa); border-bottom:1px solid var(--lm-header-border, #e0e0e0); display:flex; align-items:center; font-size:13px; color:var(--muted, #666); font-weight:500; flex-shrink:0;">
              <div style="width:40px;"></div>
              <div style="width:200px;">线路名称</div>
              <div style="width:80px; text-align:center;">颜色</div>
              <div style="flex:1;">首末站</div>
            </div>
            
            <!-- 线路列表 -->
            <div style="flex:1; overflow-y:auto; padding:0; min-height:0;">
              <!-- 空状态 -->
              <div v-if="currentLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted, #999);">
                <div style="text-align:center;">
                  <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                  <div style="font-size:16px;">该文件夹中没有线路文件</div>
                </div>
              </div>
              
              <!-- 线路列表项 -->
              <div 
                v-for="(line, index) in currentLines" 
                :key="index"
                @contextmenu.prevent="showLineContextMenu($event, line)"
                :style="{
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: selectedLine && selectedLine.name === line.name ? 'var(--lm-list-item-active, #e8f4fd)' : 'transparent',
                  borderBottom: '1px solid var(--lm-header-border, #f0f0f0)',
                  transition: 'background 0.2s',
                  display: 'flex',
                  alignItems: 'center'
                }"
                @mouseover="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='var(--lm-list-item-hover, #f5f5f5)'; } }"
                @mouseout="(e) => { if (!selectedLine || selectedLine.name !== line.name) { e.currentTarget.style.background='transparent'; } }"
              >
                <!-- 复选框 -->
                <div style="width:40px; min-width:40px; display:flex; align-items:center; justify-content:center;" @click.stop="toggleLineSelection(line)">
                  <input 
                    type="checkbox" 
                    :checked="selectedLine && selectedLine.name === line.name"
                    @click.stop="toggleLineSelection(line)"
                    style="width:18px; height:18px; cursor:pointer;"
                  />
                </div>
                
                <!-- 线路名称 -->
                <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:10px;" @click="toggleLineSelection(line)">
                  <i :class="line.isThroughLine ? 'fas fa-exchange-alt' : 'fas fa-subway'" :style="{fontSize:'16px', color: line.isThroughLine ? '#FF9F43' : 'var(--muted, #999)'}"></i>
                  <div style="font-size:14px; font-weight:500; color:var(--text, #333); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:6px;" v-html="parseColorMarkup(line.name)">
                  </div>
                  <span v-if="line.isThroughLine" style="background:#FF9F43; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold; white-space:nowrap;">贯通</span>
                </div>
                
                <!-- 颜色 -->
                <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                  <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid var(--lm-header-border, #e0e0e0)', flexShrink:0}"></div>
                </div>
                
                <!-- 首末站 -->
                <div style="flex:1; min-width:0; font-size:13px; color:var(--muted, #666); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" @click="toggleLineSelection(line)">
                  <span v-if="line.firstStation && line.lastStation">{{ line.firstStation }} → {{ line.lastStation }}</span>
                  <span v-else style="color:var(--muted, #999);">-</span>
                </div>
              </div>
            </div>
            
            <!-- 底部操作栏 -->
            <div style="padding:12px 20px; background:var(--lm-bottom-bar-bg, rgba(250, 250, 250, 0.85)); border-top:1px solid var(--lm-bottom-bar-border, rgba(224, 224, 224, 0.5)); display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
              <!-- 左侧信息区域 -->
              <div style="display:flex; align-items:center; gap:16px; flex:1;">
                <button 
                  v-if="hasFoldersAPI"
                  @click="addFolder()" 
                  style="background:transparent; color:var(--muted, #666); border:1px solid var(--lm-header-border, #d0d0d0); padding:6px 14px; border-radius:4px; font-size:13px; font-weight:400; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;"
                  @mouseover="$event.target.style.background='var(--lm-list-item-hover, #f0f0f0)'; $event.target.style.borderColor='var(--lm-header-border, #bbb)'"
                  @mouseout="$event.target.style.background='transparent'; $event.target.style.borderColor='var(--lm-header-border, #d0d0d0)'"
                >
                  <i class="fas fa-plus" style="font-size:12px;"></i> 添加文件夹
                </button>
                
                <button 
                  @click="createNewLine()" 
                  :disabled="activeFolderId === 'default'"
                  :style="{
                    background: activeFolderId === 'default' ? 'var(--btn-gray-bg, #d9d9d9)' : 'var(--btn-blue-bg, #1677ff)',
                    color: 'var(--btn-text, #fff)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: activeFolderId === 'default' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                    opacity: activeFolderId === 'default' ? 0.6 : 1
                  }"
                  @mouseover="activeFolderId !== 'default' && ($event.target.style.background='#0958d9')"
                  @mouseout="activeFolderId !== 'default' && ($event.target.style.background='var(--btn-blue-bg, #1677ff)')"
                  :title="activeFolderId === 'default' ? '默认文件夹不允许创建线路' : '新建线路'"
                >
                  <i class="fas fa-plus" style="font-size:12px;"></i> 新建线路
                </button>
                
                <!-- 选中线路信息 -->
                <div v-if="selectedLine" style="display:flex; align-items:center; gap:8px; color:var(--muted, #666); font-size:13px;">
                  <i class="fas fa-check-circle" style="color:var(--accent, #12b7f5); font-size:14px;"></i>
                  <span>已选择：<strong style="color:var(--text, #333);">{{ selectedLine.name }}</strong></span>
                </div>
                <div v-else style="color:var(--muted, #999); font-size:13px;">
                  未选择线路
                </div>
              </div>
              
              <!-- 右侧操作按钮 -->
              <div style="display:flex; align-items:center; gap:12px;">
                <!-- 保存贯通线路按钮（仅在保存模式下显示） -->
                <button 
                  v-if="isSavingThroughLine"
                  @click="handleSaveThroughLine()"
                  :style="{
                    padding: '10px 24px',
                    background: 'var(--btn-orange-bg, #FF9F43)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(255, 159, 67, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }"
                  @mouseover="(e) => { e.target.style.background='#FF8C2E'; e.target.style.boxShadow='0 4px 12px rgba(255, 159, 67, 0.4)'; }"
                  @mouseout="(e) => { e.target.style.background='var(--btn-orange-bg, #FF9F43)'; e.target.style.boxShadow='0 2px 8px rgba(255, 159, 67, 0.3)'; }"
                >
                  <i class="fas fa-save" style="font-size:14px;"></i>
                  保存贯通线路
                </button>
                
                <!-- 普通模式：使用当前线路按钮 -->
                <button 
                  v-else
                  @click="applySelectedLine()"
                  :disabled="!selectedLine"
                  :style="{
                    padding: '10px 24px',
                    background: selectedLine ? 'var(--btn-blue-bg, #1677ff)' : 'var(--btn-gray-bg, #d9d9d9)',
                    color: 'var(--btn-text, #fff)',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: selectedLine ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    boxShadow: selectedLine ? '0 2px 8px rgba(22, 119, 255, 0.2)' : 'none',
                    opacity: selectedLine ? 1 : 0.6
                  }"
                  @mouseover="(e) => { if (selectedLine) { e.target.style.background='#0958d9'; e.target.style.boxShadow='0 4px 12px rgba(22, 119, 255, 0.3)'; } }"
                  @mouseout="(e) => { if (selectedLine) { e.target.style.background='var(--btn-blue-bg, #1677ff)'; e.target.style.boxShadow='0 2px 8px rgba(22, 119, 255, 0.2)'; } }"
                >
                  <i class="fas fa-check" style="margin-right:6px;"></i>
                  使用当前线路
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 独立的对话框组件 -->
      <LineManagerDialog />
      
      <!-- 右键菜单 -->
      <div 
        v-if="contextMenu.visible"
      @click.stop
      @contextmenu.prevent
      :style="{
        position: 'fixed',
        left: contextMenu.x + 'px',
        top: contextMenu.y + 'px',
        background: 'var(--lm-menu-bg, #fff)',
        border: '1px solid var(--lm-menu-border, #e0e0e0)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        minWidth: '120px',
        padding: '4px 0'
      }"
    >
      <div 
        @click="handleContextMenuRename(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div 
        @click="openFolderInExplorer(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        v-if="contextMenu.folderId !== 'default'"
        @click="handleContextMenuDelete(contextMenu.folderId)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      </div>
      
      <!-- 点击外部关闭右键菜单的遮罩 -->
      <div 
        v-if="contextMenu.visible"
      @click="closeContextMenu"
      style="position: fixed; inset: 0; z-index: 9999; background: transparent;"
      ></div>
      
      <!-- 线路右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        data-line-context-menu
        @click.stop
        @contextmenu.prevent
        :style="{
          position: 'fixed',
          left: lineContextMenu.x + 'px',
          top: lineContextMenu.y + 'px',
          background: 'var(--lm-menu-bg, #fff)',
          border: '1px solid var(--lm-menu-border, #e0e0e0)',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          minWidth: '120px',
          padding: '4px 0'
        }"
      >
      <div 
        @click="openLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-folder-open" style="font-size: 12px; color: var(--muted, #666);"></i>
        打开
      </div>
      <div 
        @click="renameLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666);"></i>
        重命名
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        @click="copyLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-copy" style="font-size: 12px; color: var(--muted, #666);"></i>
        复制
      </div>
      <div 
        @click="cutLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-cut" style="font-size: 12px; color: var(--muted, #666);"></i>
        剪贴
      </div>
      <div 
        @click="pasteLine()"
        :style="{
          padding: '8px 16px',
          cursor: clipboard.type ? 'pointer' : 'not-allowed',
          fontSize: '13px',
          color: clipboard.type ? 'var(--text, #333)' : 'var(--muted, #999)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 0.2s',
          opacity: clipboard.type ? 1 : 0.5
        }"
        @mouseover="clipboard.type && ($event.target.style.background='var(--lm-menu-item-hover, #f0f0f0)')"
        @mouseout="clipboard.type && ($event.target.style.background='transparent')"
      >
        <i class="fas fa-paste" :style="{fontSize: '12px', color: clipboard.type ? 'var(--muted, #666)' : 'var(--muted, #999)'}"></i>
        粘贴
      </div>
      <div style="height: 1px; background: var(--lm-menu-border, #e0e0e0); margin: 4px 0;"></div>
      <div 
        v-if="activeFolderId !== 'default'"
        @click="deleteLine(lineContextMenu.line)"
        style="padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 8px; transition: background 0.2s;"
        @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
        @mouseout="$event.target.style.background='transparent'"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444);"></i>
        删除
      </div>
      <div 
        v-else
        style="padding: 8px 16px; font-size: 13px; color: var(--muted, #999); display: flex; align-items: center; gap: 8px; opacity: 0.5; cursor: not-allowed;"
      >
        <i class="fas fa-trash" style="font-size: 12px; color: var(--muted, #999);"></i>
        删除（默认文件夹不允许删除）
      </div>
      </div>
      </Teleport>
      
      <!-- 点击外部关闭线路右键菜单的遮罩 - 使用 Teleport 传送到 body -->
      <Teleport to="body">
      <div 
        v-if="lineContextMenu.visible"
        @click="closeLineContextMenu"
        style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
      ></div>
    </Teleport>
    </div>
  `
}

