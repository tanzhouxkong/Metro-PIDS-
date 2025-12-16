import { reactive } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'

const uiState = reactive({
    activePanel: null, // 'panel-1', 'panel-2', etc.
    sidebarCollapsed: false,
    showDisplay: false
})

export function useUIState() {
    function togglePanel(panelId) {
        if (uiState.activePanel === panelId) {
            uiState.activePanel = null
        } else {
            uiState.activePanel = panelId
        }
    }
    
    function closePanel() {
        uiState.activePanel = null
    }

    function toggleDisplay() {
        uiState.showDisplay = !uiState.showDisplay
    }

    return {
        uiState,
        togglePanel,
        closePanel,
        toggleDisplay
    }
}
