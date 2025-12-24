import { ref, computed } from 'vue'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useFileIO } from '../composables/useFileIO.js'
import StationEditor from './StationEditor.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'AdminApp',
  components: { StationEditor },
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
            state.appData.stations.push(data)
        } else {
            state.appData.stations[editingIndex.value] = data
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
            console.log('[AdminApp] saveStation - editor closed');
        }
    }

    async function deleteStation(index) {
        const ok = await dialogService.confirm('确定删除该站点吗？', '确认');

        if (ok) {
            state.appData.stations.splice(index, 1)
            if (state.rt.idx >= state.appData.stations.length) state.rt.idx = 0
            sync()
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

        return {
            state,
            next, move, setArr, setDep, jumpTo,
            showEditor, editingStation, editingIndex, isNewStation,
            openEditor, saveStation, deleteStation,
            currentStation, routeInfo, statusDesc, serviceModeLabel,
            onDragStart, onDragOver, onDrop, onDragEnter, onDragEnd, onDragLeave, draggingIndex, dragOverIndex, listRef
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
                <div style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:var(--card); border:1px solid var(--divider); border-radius:8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
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
            <button class="btn b-org" style="padding:6px 16px; box-shadow: 0 6px 18px rgba(0,0,0,0.08);" @click="openEditor(-1)"><i class="fas fa-plus"></i> 新建站点</button>
        </div>

        <!-- Station List -->
        <div class="card" style="flex:1; display:flex; flex-direction:column; overflow:hidden; padding:0; border-left: 6px solid #FF9F43; border-radius:12px;">
            <div class="st-list" ref="listRef" style="flex:1; overflow-y:auto; padding:10px;" @dragover="onDragOver($event)">
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
                        background: (i === state.rt.idx) ? 'rgba(22, 119, 255, 0.08)' : ((i === dragOverIndex) ? 'var(--bg)' : ''),
                        borderLeft: (i === state.rt.idx) ? '4px solid var(--btn-blue-bg)' : '4px solid transparent'
                     }"
                     draggable="true"
                     @dragstart="onDragStart($event, i)"
                     @dragenter="onDragEnter($event, i)"
                     @dragleave="onDragLeave"
                     @dragend="onDragEnd"
                     @drop="onDrop($event, i)"
                     @click="jumpTo(i)">
                    <div class="item-txt" style="display:flex; align-items:center; gap:8px;">
                        <div class="drag-handle" style="color:var(--muted); cursor:grab; padding-right:8px;"><i class="fas fa-bars"></i></div>
                        <span style="font-weight:bold; color:var(--muted); width:30px;">[{{i+1}}]</span>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:bold;">{{ st.name }} <span style="font-weight:normal; font-size:12px; color:var(--muted); margin-left:4px;">{{ st.en }}</span></span>
                            <div v-if="st.xfer && st.xfer.length" style="display:flex; gap:4px; margin-top:2px;">
                                <span v-for="(x, xi) in st.xfer" :key="xi" class="badge" :style="{background: x.color, color:'#fff', padding:'1px 4px', borderRadius:'2px', fontSize:'10px'}">{{ x.line }}</span>
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
                    <div class="item-act" style="display:flex; gap:8px;">
                        <button class="btn b-blue" style="width:28px; height:28px; padding:0; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 6px 18px rgba(0,0,0,0.08);" @click.stop="openEditor(i)"><i class="fas fa-pencil-alt" style="font-size:12px;"></i></button>
                        <button class="btn b-red" style="width:28px; height:28px; padding:0; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 6px 18px rgba(0,0,0,0.08);" @click.stop="deleteStation(i)"><i class="fas fa-times" style="font-size:12px;"></i></button>
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
    </div>
  `
}
