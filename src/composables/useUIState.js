import { reactive } from 'vue'

const uiState = reactive({
    activePanel: null, // 当前激活面板标识（如 'panel-1', 'panel-2'）
    sidebarCollapsed: false,
    showDisplay: false,
    autoLocked: false
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
