import { useUIState } from '../composables/useUIState.js'
import { useAutoplay } from '../composables/useAutoplay.js'
import { useFileIO } from '../composables/useFileIO.js'
import { usePidsState } from '../composables/usePidsState.js'
import { useController } from '../composables/useController.js'
import { useSettings } from '../composables/useSettings.js'
import dialogService from '../utils/dialogService.js'

export default {
  name: 'SlidePanel',
  setup() {
    const { uiState, closePanel } = useUIState()
    const autoplay = useAutoplay()
    const { state: pidsState, sync: syncState } = usePidsState()
    const { sync } = useController()
    const fileIO = useFileIO(pidsState)
    const { settings, saveSettings } = useSettings()

    const showMsg = async (msg, title) => dialogService.alert(msg, title)
    const askUser = async (msg, title) => dialogService.confirm(msg, title)
    const promptUser = async (msg, defaultValue, title) => dialogService.prompt(msg, defaultValue, title)

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

    return {
      uiState,
      closePanel,
      ...autoplay,
      fileIO,
      pidsState,
      switchLine, newLine, delLine, saveCfg, clearShortTurn, applyShortTurn,
      settings, saveSettings, keyMapDisplay, recordKey, clearKey, resetKeys
    }
  },
  template: `
    <div v-if="uiState.activePanel" id="slideOverlay" style="position:fixed; left:0; top:32px; bottom:0; right:0; z-index:180;" @click.self="closePanel">
        <div id="slideBackdrop" style="position:absolute; left:0; top:0; right:0; bottom:0; background:transparent; z-index:170;" @click="closePanel"></div>
    </div>
    <div id="slidePanel" :style="{ transform: uiState.activePanel ? 'translateX(0)' : 'translateX(-420px)' }" style="position:fixed; left:72px; top:32px; bottom:0; width:420px; z-index:220; background:var(--card); box-shadow: var(--slide-panel-shadow, 6px 0 30px rgba(0,0,0,0.12)); transition: transform 0.32s; overflow:auto;">
      
      <!-- Panel 1: PIDS Console -->
      <div v-if="uiState.activePanel === 'panel-1'" class="panel-body" style="padding:24px 16px;">
        
        <!-- Header -->
        <div style="text-align:center; margin-bottom:24px;">
            <div style="font-size:24px; font-weight:800; color:var(--text); letter-spacing:1px;">PIDS 控制台</div>
            <div style="font-size:12px; font-weight:bold; color:var(--muted); opacity:0.7; margin-top:4px;">V2-Multi Stable</div>
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
            <div style="color:#FF4757; font-weight:bold; margin-bottom:12px; font-size:15px;">线路设置</div>
            
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
                    <input type="checkbox" :checked="isPlaying" @change="isPlaying ? stop() : start(8)" style="opacity:0; width:0; height:0;">
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

            <div>
                <label style="display:block; font-size:13px; font-weight:bold; color:var(--muted); margin-bottom:8px;">深色模式变体</label>
                <select v-model="settings.darkVariant" @change="saveSettings()" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--divider); background:var(--card); color:var(--text);">
                    <option value="soft">柔和 (Soft)</option>
                    <option value="deep">深邃 (Deep)</option>
                    <option value="oled">纯黑 (OLED)</option>
                </select>
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

      </div>

    </div>
  `
}
