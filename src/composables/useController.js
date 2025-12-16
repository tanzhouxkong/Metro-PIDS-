import { usePidsState } from './usePidsState.js'
import { cloneDisplayState } from '../utils/displayStateSerializer.js'

export function useController() {
    const { state, bcPost } = usePidsState();

    function sync() {
        if (!state.store || !state.store.list) return;
        state.store.list[state.store.cur] = state.appData;
        localStorage.setItem('pids_global_store_v1', JSON.stringify(state.store));
        const payload = {
            t: 'SYNC',
            d: cloneDisplayState(state.appData),
            r: cloneDisplayState(state.rt)
        };
        bcPost(payload);
    }

    function getStep() {
        if (!state.appData) return 1;
        const meta = state.appData.meta;
        if (meta.mode === 'loop' && meta.dirType === 'inner') return -1;
        if (meta.mode === 'linear' && meta.dirType === 'down') return -1;
        return 1;
    }

    function getNextValidStControl(currentIdx, step) {
        if (!state.appData) return currentIdx;
        const stations = state.appData.stations || [];
        const len = stations.length;
        const dir = step > 0 ? 1 : -1;
        let nextIdx = currentIdx;

        // Determine Range (short-turn)
        const sIdx = (state.appData.meta.startIdx !== undefined && state.appData.meta.startIdx !== -1) ? parseInt(state.appData.meta.startIdx) : 0;
        const eIdx = (state.appData.meta.termIdx !== undefined && state.appData.meta.termIdx !== -1) ? parseInt(state.appData.meta.termIdx) : len - 1;
        const minIdx = Math.min(sIdx, eIdx);
        const maxIdx = Math.max(sIdx, eIdx);

        for (let i = 0; i < len; i++) {
            nextIdx += dir;

            if (state.appData.meta.mode === 'loop') {
                if (nextIdx >= len) nextIdx = 0;
                if (nextIdx < 0) nextIdx = len - 1;
            } else {
                if (nextIdx > maxIdx) return maxIdx;
                if (nextIdx < minIdx) return minIdx;
            }

            // Respect dock restriction: if station has dock set to 'up' or 'down',
            // only allow landing when direction matches. Treat missing or 'both' as allowed.
            const candidate = stations[nextIdx];
            const dirType = state.appData && state.appData.meta ? state.appData.meta.dirType : null;
            if (candidate) {
                if (candidate.dock && candidate.dock !== 'both') {
                    if (candidate.dock === 'up' && !(dirType === 'up' || dirType === 'outer')) {
                        // skip this candidate for current direction
                    } else if (candidate.dock === 'down' && !(dirType === 'down' || dirType === 'inner')) {
                        // skip this candidate for current direction
                    } else if (!candidate.skip) {
                        return nextIdx;
                    }
                } else {
                    if (!candidate.skip) return nextIdx;
                }
            }

            if (state.appData.meta.mode !== 'loop') {
                if (nextIdx === minIdx || nextIdx === maxIdx) return nextIdx;
            }
        }
        return nextIdx;
    }

    function move(delta) {
        const nextIdx = getNextValidStControl(state.rt.idx, delta);
        if (nextIdx === state.rt.idx) return;
        state.rt.idx = nextIdx;
        state.rt.state = 0;
        sync();
    }

    function jumpTo(idx) {
        state.rt.idx = idx;
        state.rt.state = 0;
        sync();
    }

    function setArr() {
        if (state.rt.state === 1) move(getStep());
        state.rt.state = 0;
        sync();
    }

    function setDep() {
        state.rt.state = 1;
        sync();
    }

    function next() {
        state.rt.state === 0 ? setDep() : setArr();
    }

    return {
        sync,
        move,
        jumpTo,
        setArr,
        setDep,
        next,
        getStep
    }
}
