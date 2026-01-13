import { ref, computed, watch, onMounted } from 'vue'

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
  name: 'FolderLineManager',
  props: {
    modelValue: {
      type: Boolean,
      default: false
    },
    pidsState: {
      type: Object,
      required: true
    },
    fileIO: {
      type: Object,
      required: true
    },
    onSwitchLine: {
      type: Function,
      required: true
    }
  },
  emits: ['update:modelValue', 'switchLine'],
  setup(props, { emit }) {
    const showDialog = computed({
      get: () => props.modelValue,
      set: (val) => emit('update:modelValue', val)
    });

    const folders = ref([]);
    const currentFolderId = ref('default');
    const currentLines = ref([]);
    const loading = ref(false);
    const selectedFolderId = ref(null);

    // 加载文件夹列表
    async function loadFolders() {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        // 非 Electron 环境，使用默认文件夹
        folders.value = [{ id: 'default', name: '默认', path: '', isCurrent: true }];
        currentFolderId.value = 'default';
        selectedFolderId.value = 'default';
        // 尝试从 pidsState 加载线路列表
        if (props.pidsState && props.pidsState.store && props.pidsState.store.list) {
          currentLines.value = props.pidsState.store.list.map((l, idx) => ({
            name: l.meta?.lineName || '未命名线路',
            filePath: '',
            data: l,
            index: idx
          }));
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

    // 从文件夹加载线路
    async function loadLinesFromFolder(folderId) {
      if (!(window.electronAPI && window.electronAPI.lines)) {
        // 非 Electron 环境，使用 pidsState 中的线路列表
        if (props.pidsState && props.pidsState.store && props.pidsState.store.list) {
          currentLines.value = props.pidsState.store.list.map((l, idx) => {
            const stationInfo = getStationInfo(l);
            return {
              name: l.meta?.lineName || '未命名线路',
              filePath: '',
              data: l,
              index: idx,
              themeColor: l.meta?.themeColor || '#5F27CD',
              firstStation: stationInfo.first,
              lastStation: stationInfo.last
            };
          });
        }
        return;
      }
      loading.value = true;
      try {
        // 先切换文件夹
        if (folderId !== currentFolderId.value) {
          const switchRes = await window.electronAPI.lines.folders.switch(folderId);
          if (switchRes && switchRes.ok) {
            currentFolderId.value = folderId;
            selectedFolderId.value = folderId;
          }
        }
        
        // 加载线路列表
        const items = await window.electronAPI.lines.list();
        const lines = [];
        if (Array.isArray(items)) {
          for (const it of items) {
            try {
              const res = await window.electronAPI.lines.read(it.name);
              if (res && res.ok && res.content) {
                const d = res.content;
                if (d && d.meta && Array.isArray(d.stations)) {
                  const stationInfo = getStationInfo(d);
                  lines.push({
                    name: d.meta.lineName || '未命名线路',
                    filePath: it.name,
                    data: d,
                    themeColor: d.meta.themeColor || '#5F27CD',
                    firstStation: stationInfo.first,
                    lastStation: stationInfo.last
                  });
                }
              }
            } catch (e) {
              console.warn('读取文件失败', it.name, e);
            }
          }
        }
        currentLines.value = lines;
      } catch (e) {
        console.error('加载线路失败:', e);
      } finally {
        loading.value = false;
      }
    }

    // 选择文件夹
    async function selectFolder(folderId) {
      if (folderId === selectedFolderId.value) return;
      selectedFolderId.value = folderId;
      await loadLinesFromFolder(folderId);
    }

    // 选择线路
    async function selectLine(line) {
      try {
        if (!line) {
          console.warn('selectLine: line is null/undefined');
          return;
        }
        if (!line.name) {
          console.warn('selectLine: line.name is empty', line);
          return;
        }
        // 确保当前文件夹已切换并加载
        if (selectedFolderId.value !== currentFolderId.value) {
          await loadLinesFromFolder(selectedFolderId.value);
        }
        
        // 刷新全局线路列表以包含当前文件夹的线路
        if (props.fileIO && props.fileIO.refreshLinesFromFolder) {
          await props.fileIO.refreshLinesFromFolder(true);
        }
        
        const selectedName = String(line.name);
        // 找到线路在当前列表中的索引
        const idx = props.pidsState.store.list.findIndex(l => {
          if (!l || !l.meta || !l.meta.lineName) return false;
          // 移除颜色标记后比较
          const cleanLineName = String(l.meta.lineName).replace(/<[^>]+>([^<]*)<\/>/g, '$1');
          const cleanSelectedName = selectedName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
          return cleanLineName === cleanSelectedName || l.meta.lineName === selectedName;
        });
        
        if (idx >= 0) {
          // 调用父组件的switchLine函数
          if (typeof props.onSwitchLine === 'function') {
            props.onSwitchLine(idx);
          }
          emit('switchLine', idx);
          showDialog.value = false;
        } else {
          console.warn('线路未找到:', selectedName);
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
        const res = await window.electronAPI.lines.folders.add();
        if (res && res.ok) {
          await loadFolders();
        }
      } catch (e) {
        console.error('添加文件夹失败:', e);
      }
    }

    // 删除文件夹
    async function deleteFolder(folderId, folderName) {
      if (folderId === 'default') return;
      if (!confirm(`确定要删除文件夹"${folderName}"吗？删除后文件夹配置将被移除，但文件本身不会被删除。`)) {
        return;
      }
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      try {
        const res = await window.electronAPI.lines.folders.remove(folderId);
        if (res && res.ok) {
          await loadFolders();
        }
      } catch (e) {
        console.error('删除文件夹失败:', e);
      }
    }

    // 重命名文件夹
    async function renameFolder(folderId, currentName) {
      if (!(window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders)) {
        return;
      }
      const newName = prompt('请输入新的文件夹名称', currentName);
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

    // 打开文件夹
    async function openFolder() {
      if (props.fileIO && props.fileIO.openLinesFolder) {
        await props.fileIO.openLinesFolder();
      }
    }

    // 检查是否有文件夹管理 API
    const hasFoldersAPI = computed(() => {
      return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders;
    });

    // 监听弹窗打开
    watch(showDialog, (val) => {
      if (val) {
        loadFolders();
      }
    });

    return {
      showDialog,
      folders,
      currentFolderId,
      selectedFolderId,
      currentLines,
      loading,
      selectFolder,
      selectLine,
      addFolder,
      deleteFolder,
      renameFolder,
      openFolder,
      parseColorMarkup,
      hasFoldersAPI,
      getStationInfo
    };
  },
  template: `
    <div v-if="showDialog" style="position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:20000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);" @click.self="showDialog = false">
      <div style="background:var(--card); border-radius:12px; width:90%; max-width:900px; height:80vh; max-height:700px; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.3); overflow:hidden;" @click.stop>
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--divider); flex-shrink:0;">
          <h2 style="margin:0; font-size:20px; font-weight:bold; color:var(--text);">文件夹与线路管理</h2>
          <button @click="showDialog = false" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:24px; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:6px; transition:background 0.2s;" @mouseover="$event.target.style.background='var(--bg)'" @mouseout="$event.target.style.background='none'">&times;</button>
        </div>

        <!-- Toolbar -->
        <div style="display:flex; gap:8px; padding:12px 20px; border-bottom:1px solid var(--divider); flex-shrink:0; background:var(--bg);">
          <button @click="addFolder()" class="btn" style="background:#5F27CD; color:white; border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:bold;">
            <i class="fas fa-plus"></i> 添加文件夹
          </button>
          <button @click="openFolder()" class="btn" style="background:#747D8C; color:white; border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:bold;">
            <i class="fas fa-folder-open"></i> 打开文件夹
          </button>
        </div>

        <!-- Main Content (Two Column Layout) -->
        <div style="display:flex; flex:1; overflow:hidden;">
          <!-- Left Sidebar: Folders (仅在 Electron 且有多文件夹时显示) -->
          <div v-if="window.electronAPI && window.electronAPI.lines && window.electronAPI.lines.folders && folders.length > 1" style="width:240px; border-right:1px solid var(--divider); overflow-y:auto; background:var(--bg); flex-shrink:0;">
            <div style="padding:8px;">
              <div 
                v-for="folder in folders" 
                :key="folder.id"
                @click="selectFolder(folder.id)"
                :style="{
                  padding: '12px 16px',
                  marginBottom: '4px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedFolderId === folder.id ? 'var(--accent)' : 'transparent',
                  color: selectedFolderId === folder.id ? 'white' : 'var(--text)',
                  fontWeight: selectedFolderId === folder.id ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }"
                @mouseover="$event.target.style.background = selectedFolderId === folder.id ? 'var(--accent)' : 'var(--card)'"
                @mouseout="$event.target.style.background = selectedFolderId === folder.id ? 'var(--accent)' : 'transparent'"
              >
                <i class="fas fa-folder" style="font-size:16px;"></i>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ folder.name }}</div>
                  <div style="font-size:11px; opacity:0.7; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ folder.path }}</div>
                </div>
                <div v-if="folder.id !== 'default'" style="display:flex; gap:4px;">
                  <button 
                    @click.stop="renameFolder(folder.id, folder.name)"
                    style="background:none; border:none; color:inherit; cursor:pointer; padding:4px; border-radius:4px; opacity:0.7;"
                    @mouseover="$event.target.style.opacity='1'; $event.target.style.background='rgba(0,0,0,0.1)'"
                    @mouseout="$event.target.style.opacity='0.7'; $event.target.style.background='none'"
                    title="重命名"
                  >
                    <i class="fas fa-edit" style="font-size:12px;"></i>
                  </button>
                  <button 
                    v-if="!folder.isCurrent"
                    @click.stop="deleteFolder(folder.id, folder.name)"
                    style="background:none; border:none; color:inherit; cursor:pointer; padding:4px; border-radius:4px; opacity:0.7;"
                    @mouseover="$event.target.style.opacity='1'; $event.target.style.background='rgba(0,0,0,0.1)'"
                    @mouseout="$event.target.style.opacity='0.7'; $event.target.style.background='none'"
                    title="删除"
                  >
                    <i class="fas fa-trash" style="font-size:12px;"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Content: Lines -->
          <div style="flex:1; overflow-y:auto; background:var(--card);">
            <div v-if="loading" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
              <div style="text-align:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:32px; margin-bottom:16px;"></i>
                <div>加载中...</div>
              </div>
            </div>
            <div v-else-if="currentLines.length === 0" style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted);">
              <div style="text-align:center;">
                <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
                <div style="font-size:16px;">该文件夹中没有线路文件</div>
              </div>
            </div>
            <div v-else style="flex:1; overflow-y:auto;">
              <!-- 列表头部 -->
              <div style="padding:12px 20px; background:#fafafa; border-bottom:1px solid #e0e0e0; display:flex; align-items:center; font-size:13px; color:#666; font-weight:500;">
                <div style="width:200px;">线路名称</div>
                <div style="width:80px; text-align:center;">颜色</div>
                <div style="flex:1;">首末站</div>
              </div>
              
              <!-- 线路列表 -->
              <div style="padding:0;">
                <div 
                  v-for="(line, index) in currentLines" 
                  :key="index"
                  @click="selectLine(line)"
                  :style="{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    background: 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center'
                  }"
                  @mouseover="$event.target.style.background='#f5f5f5'"
                  @mouseout="$event.target.style.background='transparent'"
                >
                  <!-- 线路名称 -->
                  <div style="width:200px; min-width:200px; display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-subway" style="font-size:16px; color:#999;"></i>
                    <div style="font-size:14px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" v-html="parseColorMarkup(line.name)"></div>
                  </div>
                  
                  <!-- 颜色 -->
                  <div style="width:80px; min-width:80px; display:flex; justify-content:center;">
                    <div :style="{width:'24px', height:'24px', borderRadius:'4px', background:line.themeColor || '#5F27CD', border:'1px solid #e0e0e0', flexShrink:0}"></div>
                  </div>
                  
                  <!-- 首末站 -->
                  <div style="flex:1; min-width:0; font-size:13px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    <span v-if="line.firstStation && line.lastStation">{{ line.firstStation }} → {{ line.lastStation }}</span>
                    <span v-else style="color:#999;">-</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

