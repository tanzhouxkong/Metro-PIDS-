import { reactive } from 'vue'
import { useBroadcast } from './useBroadcast.js'
import { DEF, DEF_LINE_16 } from '../utils/defaults.js'

const bcWrap = useBroadcast('metro_pids_v3');

const state = reactive({
  store: { cur: 0, list: [] },
  appData: null,
  rt: { idx: 0, state: 0 },
  isRec: false,
  recTimer: null,
  DEF: DEF
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
                JSON.parse(JSON.stringify(DEF_LINE_16))
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
