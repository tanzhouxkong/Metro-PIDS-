import { ref } from 'vue'

// useAutoplay 可选传入 tick 回调，每次自动播放触发；未提供时尝试调用 window.next()
export function useAutoplay(tick, shouldStop) {
    const isPlaying = ref(false)
    const isPaused = ref(false)
    const nextIn = ref(0)
    let timer = null
    let countdownTimer = null
    let _intervalSec = 8
    let _nextTs = 0

    function scheduleNextFire() {
        const now = Date.now()
        const delay = Math.max(0, _nextTs - now)
        timer = setTimeout(async () => {
            if (isPaused.value) {
                // 暂停期间顺延下一次时间
                _nextTs = Date.now() + _intervalSec * 1000
                scheduleNextFire()
                return
            }
            try {
                if (typeof tick === 'function') tick();
                else if (typeof window !== 'undefined' && typeof window.next === 'function') window.next();
                // 每次触发后检查是否需要停止（如到达终点站）
                try {
                    if (typeof shouldStop === 'function' && shouldStop()) {
                        stop();
                        return;
                    }
                } catch (e2) {
                    console.error('Autoplay shouldStop error', e2);
                }
            } catch (e) {
                console.error('Autoplay next error', e)
            }
            _nextTs += _intervalSec * 1000
            scheduleNextFire()
        }, delay)
    }

    function start(intervalSec) {
        stop()
        _intervalSec = intervalSec || 8
        isPlaying.value = true
        isPaused.value = false
        _nextTs = Date.now() + _intervalSec * 1000
        nextIn.value = _intervalSec
        
        // 启动倒计时（按实际时间计算，减少 setInterval 漂移）
        countdownTimer = setInterval(() => {
            const remainMs = _nextTs - Date.now()
            nextIn.value = Math.max(0, Math.ceil(remainMs / 1000))
        }, 300)

        // 启动精准触发计时
        scheduleNextFire()
    }

    function stop() {
        if (timer) clearInterval(timer)
        if (countdownTimer) clearInterval(countdownTimer)
        timer = null
        countdownTimer = null
        isPlaying.value = false
        isPaused.value = false
        nextIn.value = 0
    }

    function togglePause() {
        if (!isPlaying.value) return
        isPaused.value = !isPaused.value
    }

    return {
        isPlaying,
        isPaused,
        nextIn,
        start,
        stop,
        togglePause
    }
}
