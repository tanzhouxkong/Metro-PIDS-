import { reactive } from 'vue'
import { useBroadcast } from './useBroadcast.js'
<<<<<<< HEAD
import { DEF, DEF_LINE_16, DEF_JINAN_BUS, DEF_JINAN_METRO_1, DEF_JINAN_METRO_2, DEF_JINAN_METRO_3, DEF_JINAN_METRO_4, DEF_JINAN_METRO_6, DEF_JINAN_METRO_8, DEF_JINAN_METRO_4_8, DEF_JINAN_YUNBA } from '../utils/defaults.js'
=======
<<<<<<< HEAD
<<<<<<< HEAD
import { DEF, DEF_LINE_16, DEF_JINAN_BUS, DEF_JINAN_METRO_1, DEF_JINAN_METRO_2, DEF_JINAN_METRO_3, DEF_JINAN_METRO_4, DEF_JINAN_METRO_6, DEF_JINAN_METRO_8, DEF_JINAN_METRO_4_8, DEF_JINAN_YUNBA } from '../utils/defaults.js'
=======
import { DEF, DEF_LINE_16 } from '../utils/defaults.js'
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
import { DEF, DEF_LINE_16 } from '../utils/defaults.js'
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055

const bcWrap = useBroadcast('metro_pids_v3');

const state = reactive({
  store: { cur: 0, list: [] },
  appData: null,
  rt: { idx: 0, state: 0 },
  isRec: false,
  recTimer: null,
  DEF: DEF,
  currentFilePath: null, // 当前打开的文件路径（包含子文件夹路径）
  lineNameToFilePath: {}, // 线路名称到文件路径的映射
  currentFolderId: 'default', // 当前活动的文件夹ID
  folders: [] // 文件夹列表
});

function loadSafe() {
    try {
        const saved = localStorage.getItem('pids_global_store_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.list && Array.isArray(parsed.list) && parsed.list.length > 0) {
                state.store = parsed;
            } else {
                throw new Error('Invalid store');
            }
        } else {
            throw new Error('No saved store');
        }
    } catch (e) {
        console.log('Initializing default data...');
        state.store = { 
            cur: 0, 
            list: [
                JSON.parse(JSON.stringify(DEF)),
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
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
<<<<<<< HEAD
=======
=======
                JSON.parse(JSON.stringify(DEF_LINE_16))
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
=======
                JSON.parse(JSON.stringify(DEF_LINE_16))
>>>>>>> 94bf6b56baffc7780e58c8bf5bfd1580152e6dfc
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
            ] 
        };
    }
    if (state.store.cur < 0 || state.store.cur >= state.store.list.length) state.store.cur = 0;
    state.appData = state.store.list[state.store.cur];
}

// 初始化加载
loadSafe();

export function usePidsState() {
  return { 
    state, 
    bcWrap,
    bcOn: bcWrap.onMessage,
    bcPost: bcWrap.post,
    loadSafe
  };
}
