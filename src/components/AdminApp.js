import { ref, computed, nextTick } from 'vue'
import { Teleport } from 'vue'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useFileIO } from '../composables/useFileIO.js'
import StationEditor from './StationEditor.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'AdminApp',
  components: { StationEditor, Teleport },
  setup() {
    const { state } = usePidsState()
    const { sync, next, move, setArr, setDep, jumpTo, getStep } = useController()
    
    const showEditor = ref(false)
    const editingStation = ref({})
    const editingIndex = ref(-1)
    const isNewStation = ref(false)
    const draggingIndex = ref(-1)
    const dragOverIndex = ref(-1)
    const listRef = ref(null)
    
    // 右键菜单状态
    const stationContextMenu = ref({ visible: false, x: 0, y: 0, station: null, index: -1 })
    
    // 剪贴板状态（用于复制/剪贴站点）
    const clipboard = ref({ type: null, station: null, index: -1 })

    function onDragStart(e, index) {
        draggingIndex.value = index
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.dropEffect = 'move'
        // Firefox 兼容处理
        e.dataTransfer.setData('text/plain', index)
    }

    function onDragEnter(e, index) {
        if (index !== draggingIndex.value) {
            dragOverIndex.value = index
        }
    }

    function onDragLeave() {
        dragOverIndex.value = -1
    }

    function onDragEnd() {
        draggingIndex.value = -1
        dragOverIndex.value = -1
    }

    function onDragOver(e) {
        e.preventDefault()
        if (listRef.value) {
            const el = listRef.value
            const rect = el.getBoundingClientRect()
            const threshold = 60
            if (e.clientY < rect.top + threshold) {
                el.scrollTop -= 10
            } else if (e.clientY > rect.bottom - threshold) {
                el.scrollTop += 10
            }
        }
    }
    
    function onDrop(e, index) {
        e.preventDefault()
        const from = draggingIndex.value
        const to = index
        
        draggingIndex.value = -1
        dragOverIndex.value = -1

        if (from === -1 || from === to) return
        
        const stations = state.appData.stations
        const currentStation = stations[state.rt.idx] // 记录当前站对象
        
        // 移动元素
        const item = stations.splice(from, 1)[0]
        stations.splice(to, 0, item)
        
        // 根据活动站的新位置恢复索引
        const newIdx = stations.indexOf(currentStation)
        if (newIdx !== -1) state.rt.idx = newIdx
        
        sync()
    }

    function openEditor(index) {
        if (index === -1) {
            // 新增站点
            editingStation.value = { name: '', en: '', skip: false, door: 'left', dock: 'both', xfer: [], expressStop: false }
            editingIndex.value = -1
            isNewStation.value = true
        } else {
            // 编辑已有站点
            editingStation.value = JSON.parse(JSON.stringify(state.appData.stations[index]))
            editingIndex.value = index
            isNewStation.value = false
        }
        showEditor.value = true
    }

    const fileIO = useFileIO(state)

    async function saveStation(data) {
        if (editingIndex.value === -1) {
            // 如果 editingIndex 是 -1，说明是从"新建站点"按钮调用的，添加到末尾
            state.appData.stations.push(data)
        } else if (editingIndex.value >= 0 && editingIndex.value < state.appData.stations.length) {
            // 如果 editingIndex 是有效索引，说明是编辑已有站点
            state.appData.stations[editingIndex.value] = data
        } else {
            // 如果 editingIndex 超出范围，说明是从右键菜单"新建"调用的，插入到指定位置
            const insertIndex = editingIndex.value >= state.appData.stations.length 
                ? state.appData.stations.length 
                : editingIndex.value
            state.appData.stations.splice(insertIndex, 0, data)
            // 更新当前索引
            if (state.rt.idx >= insertIndex) {
                state.rt.idx++
            }
        }
        try {
            console.log('[AdminApp] saveStation - calling sync with', data);
            sync()
            // 若在 Electron 环境则尝试落盘
            try {
                await fileIO.saveCurrentLine()
            } catch (e) {
                console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
            }
        } catch (e) {
            console.error('[AdminApp] sync failed in saveStation', e);
        } finally {
            showEditor.value = false
            editingIndex.value = -1
            console.log('[AdminApp] saveStation - editor closed');
        }
    }

    async function deleteStation(index) {
        const ok = await dialogService.confirm('确定删除该站点吗？', '确认');

        if (ok) {
            state.appData.stations.splice(index, 1)
            if (state.rt.idx >= state.appData.stations.length) state.rt.idx = 0
            sync()
            // 保存到文件
            try {
                await fileIO.saveCurrentLine()
            } catch (e) {
                console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
            }
        }
    }
    
    // 显示站点右键菜单
    function showStationContextMenu(event, station, index) {
        event.preventDefault()
        event.stopPropagation()
        
        stationContextMenu.value = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            station: station,
            index: index
        }
        
        // 使用 nextTick 在菜单渲染后调整位置，确保菜单不被裁剪
        nextTick(() => {
            const menuElement = document.querySelector('[data-station-context-menu]')
            if (menuElement) {
                const rect = menuElement.getBoundingClientRect()
                const viewportWidth = window.innerWidth
                const viewportHeight = window.innerHeight
                
                let x = event.clientX
                let y = event.clientY
                
                // 如果菜单会在右侧被截断，调整到左侧
                if (x + rect.width > viewportWidth) {
                    x = event.clientX - rect.width
                }
                
                // 如果菜单会在底部被截断，调整到上方
                if (y + rect.height > viewportHeight) {
                    y = event.clientY - rect.height
                }
                
                // 确保不会超出左边界
                if (x < 0) x = 10
                
                // 确保不会超出上边界
                if (y < 0) y = 10
                
                // 更新位置
                stationContextMenu.value.x = x
                stationContextMenu.value.y = y
            }
        })
    }
    
    // 关闭站点右键菜单
    function closeStationContextMenu() {
        stationContextMenu.value.visible = false
    }
    
    // 新建站点（从右键菜单）
    function newStationFromMenu() {
        const targetIndex = stationContextMenu.value.index >= 0 
            ? stationContextMenu.value.index + 1 
            : state.appData.stations.length
        closeStationContextMenu()
        // 设置插入位置
        editingIndex.value = targetIndex
        editingStation.value = { name: '', en: '', skip: false, door: 'left', dock: 'both', xfer: [], expressStop: false }
        isNewStation.value = true
        showEditor.value = true
    }
    
    // 复制站点
    function copyStation() {
        closeStationContextMenu()
        const index = stationContextMenu.value.index
        if (index >= 0 && state.appData.stations[index]) {
            clipboard.value = {
                type: 'copy',
                station: JSON.parse(JSON.stringify(state.appData.stations[index])),
                index: index
            }
        }
    }
    
    // 剪切站点
    function cutStation() {
        closeStationContextMenu()
        const index = stationContextMenu.value.index
        if (index >= 0 && state.appData.stations[index]) {
            clipboard.value = {
                type: 'cut',
                station: JSON.parse(JSON.stringify(state.appData.stations[index])),
                index: index
            }
        }
    }
    
    // 粘贴站点
    async function pasteStation() {
        closeStationContextMenu()
        if (!clipboard.value.station) return
        
        const targetIndex = stationContextMenu.value.index >= 0 
            ? stationContextMenu.value.index + 1 
            : state.appData.stations.length
        
        // 如果是剪切操作，需要先处理源站点
        if (clipboard.value.type === 'cut') {
            const sourceIndex = clipboard.value.index
            
            // 如果源索引和目标索引相同，不执行操作
            if (sourceIndex === targetIndex - 1) {
                clipboard.value = { type: null, station: null, index: -1 }
                return
            }
            
            // 先删除源站点
            state.appData.stations.splice(sourceIndex, 1)
            
            // 调整目标索引（如果目标在源之后，需要减1）
            const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
            
            // 插入站点到目标位置
            state.appData.stations.splice(adjustedTargetIndex, 0, JSON.parse(JSON.stringify(clipboard.value.station)))
            
            // 更新当前索引
            const currentIdx = state.rt.idx
            if (sourceIndex < currentIdx && adjustedTargetIndex > currentIdx) {
                // 源在当前位置之前，目标在当前位置之后，索引-1
                state.rt.idx--
            } else if (sourceIndex > currentIdx && adjustedTargetIndex <= currentIdx) {
                // 源在当前位置之后，目标在当前位置之前或相同，索引+1
                state.rt.idx++
            } else if (sourceIndex === currentIdx) {
                // 源就是当前位置，移动到目标位置
                state.rt.idx = adjustedTargetIndex
            }
        } else {
            // 复制操作，直接插入
            state.appData.stations.splice(targetIndex, 0, JSON.parse(JSON.stringify(clipboard.value.station)))
            
            // 更新当前索引
            if (state.rt.idx >= targetIndex) {
                state.rt.idx++
            }
        }
        
        sync()
        
        // 保存到文件
        try {
            await fileIO.saveCurrentLine()
        } catch (e) {
            console.warn('[AdminApp] fileIO.saveCurrentLine failed', e)
        }
        
        // 如果是剪切操作，清除剪贴板
        if (clipboard.value.type === 'cut') {
            clipboard.value = { type: null, station: null, index: -1 }
        }
    }
    
    // 编辑站点（从右键菜单）
    function editStationFromMenu() {
        const index = stationContextMenu.value.index
        if (index >= 0) {
            closeStationContextMenu()
            openEditor(index)
        }
    }
    
    // 删除站点（从右键菜单）
    async function deleteStationFromMenu() {
        const index = stationContextMenu.value.index
        if (index >= 0) {
            closeStationContextMenu()
            await deleteStation(index)
        }
    }

    // 头部信息的计算属性
    const currentStation = computed(() => {
        if (!state.appData || !state.appData.stations) return {}
        return state.appData.stations[state.rt.idx] || {}
    })

    const routeInfo = computed(() => {
        if (!state.appData || !state.appData.stations) return ''
        const s = state.appData.stations
        if (s.length < 2) return ''
        return `${s[0].name} → ${s[s.length-1].name}`
    })

    const statusDesc = computed(() => {
        if (!state.appData) return ''
        const prevIdx = state.rt.idx - getStep()
        const prevName = (state.appData.stations[prevIdx]) ? state.appData.stations[prevIdx].name : '始发'
        return `${prevName} → ${currentStation.value.name || ''}`
    })

    const serviceModeLabel = computed(() => {
        const mode = (state.appData.meta && state.appData.meta.serviceMode) ? state.appData.meta.serviceMode : 'normal';
        if (mode === 'express') return '大站车';
        if (mode === 'direct') return '直达';
        return '普通';
    })

    // 检查是否到达终点站的辅助函数
    function isAtTerminal() {
        if (!state.appData || !state.appData.stations || state.appData.stations.length === 0) return false;
        const meta = state.appData.meta || {};
        const stations = state.appData.stations;
        const len = stations.length;
        const currentIdx = state.rt.idx;
        
        // 环线模式没有终点站
        if (meta.mode === 'loop') return false;
        
        // 计算短交路可运行区间
        const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
        const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : len - 1;
        const minIdx = Math.min(sIdx, eIdx);
        const maxIdx = Math.max(sIdx, eIdx);
        
        // 判断方向
        const step = getStep();
        const terminalIdx = step > 0 ? maxIdx : minIdx;
        
        // 检查是否在终点站
        return currentIdx === terminalIdx;
    }

    // 包装 next 函数，添加终点站检查
    async function handleNext() {
        // 检查是否在终点站
        if (isAtTerminal()) {
            // 如果在终点站，无论什么状态，提示用户已到达终点站
            await dialogService.alert('已到达终点站', '提示');
            return;
        }
        
        // 否则正常执行 next 操作
        next();
    }

        return {
            state,
            next: handleNext, move, setArr, setDep, jumpTo,
            showEditor, editingStation, editingIndex, isNewStation,
            openEditor, saveStation, deleteStation,
            currentStation, routeInfo, statusDesc, serviceModeLabel,
            onDragStart, onDragOver, onDrop, onDragEnter, onDragEnd, onDragLeave, draggingIndex, dragOverIndex, listRef,
            stationContextMenu, clipboard,
            showStationContextMenu, closeStationContextMenu,
            newStationFromMenu, copyStation, cutStation, pasteStation,
            editStationFromMenu, deleteStationFromMenu
        }
  },
  template: `
    <div id="admin-app-vue" style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; padding:20px; gap:20px; background:var(--bg);">
        
        <!-- Header Info Card -->
        <div class="card" style="padding:20px; display:flex; flex-direction:column; gap:10px; border-left: 6px solid #1E90FF; border-radius:12px;">
            <div style="display:flex; justify-content:flex-start; align-items:center;">
                <div style="font-size:12px; color:var(--muted);">{{ routeInfo }}</div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:28px; font-weight:800; color:var(--text);">{{ currentStation.name }}</div>
                <div class="badge" :style="{ background: (state.rt.state === 0 ? '#27c93f' : '#ff5f56'), padding: '6px 16px', borderRadius: '16px', fontSize: '14px', color: '#fff', fontWeight: '700', boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }">
                    {{ state.rt.state === 0 ? '进站' : '出站' }}
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                <div style="font-size:14px; color:var(--btn-red-bg); font-weight:bold;">{{ statusDesc }}</div>
                <div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(255, 255, 255, 0.1); border:1px solid var(--divider); border-radius:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                    <span style="font-size:11px; color:var(--muted); font-weight:500;">运营模式</span>
                    <span :style="{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#fff',
                        fontWeight: 'bold',
                        background: serviceModeLabel === '大站车' ? '#ffa502' : (serviceModeLabel === '直达' ? '#ff4757' : 'var(--btn-blue-bg)'),
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }">
                        {{ serviceModeLabel }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Controls -->
        <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px;">
            <button class="btn b-gray" style="height:48px; font-size:14px;" @click="move(-1)"><i class="fas fa-chevron-left"></i> 上一站</button>
            <button class="btn b-org" style="height:48px; font-size:14px;" @click="setArr()"><i class="fas fa-sign-in-alt"></i> 进站</button>
            <button class="btn b-blue" style="height:48px; font-size:14px;" @click="setDep()"><i class="fas fa-sign-out-alt"></i> 出站</button>
            <button class="btn b-gray" style="height:48px; font-size:14px;" @click="move(1)">下一站 <i class="fas fa-chevron-right"></i></button>
            <button class="btn b-red" style="height:48px; font-size:14px;" @click="next()"><i class="fas fa-step-forward"></i> 下一步</button>
        </div>

        <!-- Station List Header -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:bold; color:var(--btn-red-bg);">站点管理</div>
            <div style="font-size:12px; color:var(--muted); display:flex; align-items:center; gap:8px;">
                <i class="fas fa-info-circle" style="font-size:11px;"></i>
                <span>拖拽站点条可改变顺序，右键站点可进行编辑、删除、复制、剪切、粘贴操作，右键空白处可新建站点</span>
            </div>
        </div>

        <!-- Station List -->
        <div class="card" style="flex:1; display:flex; flex-direction:column; overflow:hidden; padding:0; border-left: 6px solid #FF9F43; border-radius:12px;">
            <div class="st-list" ref="listRef" style="flex:1; overflow-y:auto; padding:10px;" @dragover="onDragOver($event)" @contextmenu.prevent="showStationContextMenu($event, null, -1)">
                <div v-if="state.appData && state.appData.stations" 
                     v-for="(st, i) in state.appData.stations" 
                     :key="i" 
                     class="item" 
                     :class="{ active: i === state.rt.idx }"
                     :style="{
                        padding: '12px',
                        borderBottom: '1px solid var(--divider)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'default',
                        transition: 'background 0.2s, border-color 0.2s',
                        opacity: i === draggingIndex ? 0.5 : 1,
                        borderTop: (i === dragOverIndex && i < draggingIndex) ? '2px solid var(--accent)' : '',
                        borderBottom: (i === dragOverIndex && i > draggingIndex) ? '2px solid var(--accent)' : '1px solid var(--divider)',
                        background: (i === state.rt.idx) ? 'rgba(22, 119, 255, 0.08)' : ((i === dragOverIndex) ? 'rgba(255, 255, 255, 0.05)' : 'transparent'),
                        borderLeft: (i === state.rt.idx) ? '4px solid var(--btn-blue-bg)' : '4px solid transparent'
                     }"
                     draggable="true"
                     @dragstart="onDragStart($event, i)"
                     @dragenter="onDragEnter($event, i)"
                     @dragleave="onDragLeave"
                     @dragend="onDragEnd"
                     @drop="onDrop($event, i)"
                     @click="jumpTo(i)"
                     @contextmenu.prevent="showStationContextMenu($event, st, i)">
                    <div class="item-txt" style="display:flex; align-items:center; gap:8px;">
                        <div class="drag-handle" style="color:var(--muted); cursor:grab; padding-right:8px;"><i class="fas fa-bars"></i></div>
                        <span style="font-weight:bold; color:var(--muted); width:30px;">[{{i+1}}]</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold;">{{ st.name }} <span style="font-weight:normal; font-size:12px; color:var(--muted); margin-left:4px;">{{ st.en }}</span></span>
                            <div v-if="st.xfer && st.xfer.length" style="display:flex; gap:4px; margin-top:2px;">
                                <span v-for="(x, xi) in st.xfer" :key="xi" class="badge" :style="{
                                    background: x.suspended ? '#ccc' : x.color, 
                                    color: x.suspended ? '#666' : '#fff', 
                                    padding:'1px 4px', 
                                    borderRadius:'2px', 
                                    fontSize:'10px',
                                    border: x.suspended ? '1px solid #999' : 'none',
                                    display: (x.suspended || x.exitTransfer) ? 'inline-flex' : 'inline',
                                    alignItems: 'center',
                                    gap: '2px'
                                }">
                                    {{ x.line }}
                                    <span v-if="x.suspended" style="font-size:8px; background:#999; color:#fff; padding:0 2px; border-radius:2px; margin-left:2px;">暂缓</span>
                                    <span v-else-if="x.exitTransfer" style="font-size:8px; background:rgba(0,0,0,0.4); color:#fff; padding:0 2px; border-radius:2px; margin-left:2px; font-weight:bold;">出站</span>
                                </span>
                            </div>
                            <!-- 双向上行下行站台停靠-->
                            <div style="margin-top:6px; display:flex; gap:6px; align-items:center;">
                                <span v-if="st.dock && st.dock === 'up'" class="badge" style="background:#3498db; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">仅上行</span>
                                <span v-if="st.dock && st.dock === 'down'" class="badge" style="background:#2ecc71; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">仅下行</span>
                                <span v-if="st.expressStop !== false" class="badge" style="background:#ffa502; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px;">大站停靠</span>
                                <!-- 不显示 '两向' 标签于控制面板 -->
                            </div>
                        </div>
                        <span v-if="st.skip" class="badge" style="background:var(--btn-org-bg); font-size:10px; padding:2px 4px; border-radius:2px;">暂缓</span>
                    </div>
                </div>
            </div>
        </div>

        <StationEditor 
            v-model="showEditor" 
            :station="editingStation" 
            :is-new="isNewStation"
            @save="saveStation" 
        />
        
        <!-- 站点右键菜单 - 使用 Teleport 传送到 body，允许溢出窗口 -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                data-station-context-menu
                @click.stop
                @contextmenu.prevent
                :style="{
                    position: 'fixed',
                    left: stationContextMenu.x + 'px',
                    top: stationContextMenu.y + 'px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(224, 224, 224, 0.8)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    zIndex: 9999,
                    minWidth: '140px',
                    padding: '6px 0'
                }"
            >
                <div 
                    @click="newStationFromMenu()"
                    style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s;"
                    @mouseover="$event.target.style.background='rgba(0,0,0,0.05)'"
                    @mouseout="$event.target.style.background='transparent'"
                >
                    <i class="fas fa-plus" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                    新建
                </div>
                <div v-if="stationContextMenu.index >= 0" style="height: 1px; background: rgba(224, 224, 224, 0.5); margin: 4px 0;"></div>
                <div 
                    v-if="stationContextMenu.index >= 0"
                    @click="editStationFromMenu()"
                    style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s;"
                    @mouseover="$event.target.style.background='rgba(0,0,0,0.05)'"
                    @mouseout="$event.target.style.background='transparent'"
                >
                    <i class="fas fa-edit" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                    编辑
                </div>
                <div v-if="stationContextMenu.index >= 0" style="height: 1px; background: rgba(224, 224, 224, 0.5); margin: 4px 0;"></div>
                <div 
                    v-if="stationContextMenu.index >= 0"
                    @click="copyStation()"
                    style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s;"
                    @mouseover="$event.target.style.background='rgba(0,0,0,0.05)'"
                    @mouseout="$event.target.style.background='transparent'"
                >
                    <i class="fas fa-copy" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                    复制
                </div>
                <div 
                    v-if="stationContextMenu.index >= 0"
                    @click="cutStation()"
                    style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--text, #333); display: flex; align-items: center; gap: 10px; transition: background 0.2s;"
                    @mouseover="$event.target.style.background='rgba(0,0,0,0.05)'"
                    @mouseout="$event.target.style.background='transparent'"
                >
                    <i class="fas fa-cut" style="font-size: 12px; color: var(--muted, #666); width: 16px;"></i>
                    剪切
                </div>
                <div 
                    @click="pasteStation()"
                    :style="{
                        padding: '10px 16px',
                        cursor: clipboard.station ? 'pointer' : 'not-allowed',
                        fontSize: '13px',
                        color: clipboard.station ? 'var(--text, #333)' : 'var(--muted, #999)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'background 0.2s',
                        opacity: clipboard.station ? 1 : 0.5
                    }"
                    @mouseover="clipboard.station && ($event.target.style.background='rgba(0,0,0,0.05)')"
                    @mouseout="clipboard.station && ($event.target.style.background='transparent')"
                >
                    <i class="fas fa-paste" :style="{fontSize: '12px', color: clipboard.station ? 'var(--muted, #666)' : 'var(--muted, #999)', width: '16px'}"></i>
                    粘贴
                </div>
                <div v-if="stationContextMenu.index >= 0" style="height: 1px; background: rgba(224, 224, 224, 0.5); margin: 4px 0;"></div>
                <div 
                    v-if="stationContextMenu.index >= 0"
                    @click="deleteStationFromMenu()"
                    style="padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--btn-red-bg, #ff4444); display: flex; align-items: center; gap: 10px; transition: background 0.2s;"
                    @mouseover="$event.target.style.background='rgba(255, 68, 68, 0.1)'"
                    @mouseout="$event.target.style.background='transparent'"
                >
                    <i class="fas fa-trash" style="font-size: 12px; color: var(--btn-red-bg, #ff4444); width: 16px;"></i>
                    删除
                </div>
            </div>
        </Teleport>
        
        <!-- 点击外部关闭站点右键菜单的遮罩 - 使用 Teleport 传送到 body -->
        <Teleport to="body">
            <div 
                v-if="stationContextMenu.visible"
                @click="closeStationContextMenu"
                style="position: fixed; inset: 0; z-index: 9998; background: transparent;"
            ></div>
        </Teleport>
    </div>
  `
}
