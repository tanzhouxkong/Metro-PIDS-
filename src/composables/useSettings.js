import { reactive, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'

const settings = reactive({ ...DEFAULT_SETTINGS })

export function useSettings() {
    
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pids_settings_v1') || 'null');
            if (s) {
                Object.assign(settings, s);
                // 确保嵌套对象在缺失时正确合并
                if (!settings.keys) settings.keys = { ...DEFAULT_SETTINGS.keys };
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay };
                if (!settings.display) settings.display = { ...DEFAULT_SETTINGS.display };
                if (settings.display && (settings.display.width === undefined || settings.display.height === undefined)) {
                    settings.display.width = settings.display.width || DEFAULT_SETTINGS.display.width;
                    settings.display.height = settings.display.height || DEFAULT_SETTINGS.display.height;
                }
                // 兼容旧数据，补 serviceMode
                if (settings.meta && settings.meta.serviceMode === undefined) settings.meta.serviceMode = 'normal';
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

        // 若有旧监听应移除（此处简化，假设单实例）
        
        if (mode === 'system') {
            if (window.matchMedia) {
                const mql = window.matchMedia('(prefers-color-scheme: dark)');
                setDark(mql.matches);
                setDarkVariant(darkVariant);
                // 注意：为简化未重新绑定系统主题变更监听
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

    // 初始化加载
    loadSettings();

    return {
        settings,
        loadSettings,
        saveSettings,
        applyThemeMode
    }
}
