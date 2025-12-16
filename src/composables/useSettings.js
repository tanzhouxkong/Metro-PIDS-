import { reactive, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'

const settings = reactive({ ...DEFAULT_SETTINGS })

export function useSettings() {
    
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pids_settings_v1') || 'null');
            if (s) {
                Object.assign(settings, s);
                // Ensure nested objects are merged correctly if missing in saved data
                if (!settings.keys) settings.keys = { ...DEFAULT_SETTINGS.keys };
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay };
            }
        } catch (e) { 
            console.warn('Failed to load settings', e);
        }
        applyThemeMode();
    }

    function saveSettings() {
        localStorage.setItem('pids_settings_v1', JSON.stringify(settings));
        applyThemeMode();
    }

    function applyThemeMode() {
        const mode = settings.themeMode || 'system';
        const darkVariant = settings.darkVariant || 'soft';
        
        function setDark(on) { 
            if (on) document.documentElement.classList.add('dark'); 
            else document.documentElement.classList.remove('dark'); 
        }
        function setDarkVariant(v) { 
            document.documentElement.setAttribute('data-dark-variant', v || 'soft'); 
        }

        // Remove previous listener if exists (not implemented here for simplicity, assuming single instance)
        
        if (mode === 'system') {
            if (window.matchMedia) {
                const mql = window.matchMedia('(prefers-color-scheme: dark)');
                setDark(mql.matches);
                setDarkVariant(darkVariant);
                // Note: Dynamic system theme change listener is not re-attached here to avoid complexity
            } else {
                setDark(false);
            }
        } else if (mode === 'dark') {
            setDark(true);
            setDarkVariant(darkVariant);
        } else {
            setDark(false);
        }
    }

    // Initial load
    loadSettings();

    return {
        settings,
        loadSettings,
        saveSettings,
        applyThemeMode
    }
}
