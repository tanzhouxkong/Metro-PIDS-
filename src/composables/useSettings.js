import { reactive, watch } from 'vue'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'

const settings = reactive({ ...DEFAULT_SETTINGS })

export function useSettings() {
    
    function applyBlurSetting() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const enabled = settings.blurEnabled !== false;
        root.classList.toggle('blur-disabled', !enabled);
        // 尝试同步到原生窗口效果（如有暴露的 API）
        try {
            const blurApi = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.effects && window.electronAPI.effects.setDialogBlur;
            if (typeof blurApi === 'function') {
                blurApi(enabled);
            }
        } catch (e) {
            // 忽略同步失败
        }
    }

    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem('pids_settings_v1') || 'null');
            if (s) {
                Object.assign(settings, s);
                // 确保嵌套对象在缺失时正确合并
                if (!settings.keys) settings.keys = { ...DEFAULT_SETTINGS.keys };
                if (!settings.autoplay) settings.autoplay = { ...DEFAULT_SETTINGS.autoplay };
                if (!settings.display) settings.display = { ...DEFAULT_SETTINGS.display };
                
                // 兼容旧的显示端配置格式
                if (settings.display && !settings.display.displays) {
                    // 将旧格式转换为新格式，包含主显示器和副显示器
                    const oldDisplay = { ...settings.display };
                    settings.display = {
                        currentDisplayId: 'display-1',
                        displays: {
                            'display-1': {
                                id: 'display-1',
                                name: '主显示器',
                                source: oldDisplay.source || 'builtin',
                                url: oldDisplay.url || '',
                                width: oldDisplay.width || 1900,
                                height: oldDisplay.height || 600,
                                enabled: true,
                                isSystem: true,
                                description: '主要显示端，用于主要信息展示'
                            },
                            'display-2': {
                                id: 'display-2',
                                name: '副显示器',
                                source: 'builtin',
                                url: '',
                                width: 1920,
                                height: 1080,
                                enabled: true,
                                isSystem: true,
                                description: '辅助显示端，用于补充信息展示'
                            }
                        }
                    };
                }
                
                // 确保系统显示器存在且配置正确
                if (!settings.display.displays['display-1']) {
                    settings.display.displays['display-1'] = {
                        id: 'display-1',
                        name: '主显示器',
                        source: 'builtin',
                        url: '',
                        width: 1900,
                        height: 600,
                        enabled: true,
                        isSystem: true,
                        description: '主要显示端，用于主要信息展示'
                    };
                }
                
                if (!settings.display.displays['display-2']) {
                    settings.display.displays['display-2'] = {
                        id: 'display-2',
                        name: '副显示器',
                        source: 'builtin',
                        url: '',
                        width: 1920,
                        height: 1080,
                        enabled: true,
                        isSystem: true,
                        description: '辅助显示端，用于补充信息展示'
                    };
                }
                
                // 确保系统显示器的 isSystem 标记
                if (settings.display.displays['display-1']) {
                    settings.display.displays['display-1'].isSystem = true;
                }
                if (settings.display.displays['display-2']) {
                    settings.display.displays['display-2'].isSystem = true;
                }
                
                // 确保显示端配置完整
                if (!settings.display.currentDisplayId) {
                    settings.display.currentDisplayId = Object.keys(settings.display.displays)[0] || 'display-1';
                }
                if (!settings.display.displays) {
                    settings.display.displays = { ...DEFAULT_SETTINGS.display.displays };
                }
                // 确保 display2Mode 存在
                if (settings.display.display2Mode === undefined) {
                    settings.display.display2Mode = DEFAULT_SETTINGS.display.display2Mode || 'dev-only';
                }
                
                // 兼容旧数据，补 serviceMode
                if (settings.meta && settings.meta.serviceMode === undefined) settings.meta.serviceMode = 'normal';
                
                // 兼容旧数据：补齐模糊开关
                if (settings.blurEnabled === undefined) settings.blurEnabled = DEFAULT_SETTINGS.blurEnabled;
            }
        } catch (e) { 
            console.warn('Failed to load settings', e);
        }
        applyThemeMode();
        applyBlurSetting();
    }

    function saveSettings() {
        localStorage.setItem('pids_settings_v1', JSON.stringify(settings));
        applyThemeMode();
        applyBlurSetting();
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
        applyThemeMode,
        applyBlurSetting
    }
}
