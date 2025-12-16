import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

export function useAutoplay() {
    const isPlaying = ref(false)
    const isPaused = ref(false)
    const nextIn = ref(0)
    let timer = null
    let countdownTimer = null
    let _intervalSec = 8

    function start(intervalSec) {
        stop()
        _intervalSec = intervalSec || 8
        isPlaying.value = true
        isPaused.value = false
        nextIn.value = _intervalSec
        
        // Start countdown
        countdownTimer = setInterval(() => {
            if (!isPaused.value && nextIn.value > 0) {
                nextIn.value--
            }
        }, 1000)

        // Start action timer
        timer = setInterval(() => {
            if (!isPaused.value) {
                try {
                    if (typeof window.next === 'function') window.next()
                    nextIn.value = _intervalSec
                } catch (e) {
                    console.error('Autoplay next error', e)
                }
            }
        }, _intervalSec * 1000)
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
