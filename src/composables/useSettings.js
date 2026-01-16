import { reactive, watch } from 'vue'
import { DEFAULT_SETTINGS } from '../utils/defaults.js'

const settings = reactive({ ...DEFAULT_SETTINGS })
let systemThemeCleanup = null; // 存储系统主题监听的清理函数

export function useSettings() {
    
    function applyBlurSetting() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const enabled = settings.blurEnabled !== false;
        root.classList.toggle('blur-disabled', !enabled);
        // 尝试同步到原生窗口效果（如有暴露的 API）
        try {
            const effects = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.effects;
            if (effects) {
                if (typeof effects.setMainBlur === 'function') {
                    effects.setMainBlur(enabled);
                }
                if (typeof effects.setDialogBlur === 'function') {
                    effects.setDialogBlur(enabled);
                }
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
                                isSystem: true, // 系统显示器，不允许删除
                                description: '主要显示端，用于主要信息展示'
                            },
                            'display-2': {
                                id: 'display-2',
                                name: '高仿济南公交LCD屏幕',
                                source: 'builtin',
                                url: '',
                                width: 1500,
                                height: 400,
                                enabled: true,
                                isSystem: true, // 系统显示器，不允许删除
                                description: '辅助显示端，用于补充信息展示'
                            }
                        }
                    };
                }
                
                // 确保显示端存在且配置正确
                if (!settings.display.displays['display-1']) {
                    settings.display.displays['display-1'] = {
                        id: 'display-1',
                        name: '主显示器',
                        source: 'builtin',
                        url: '',
                        width: 1900,
                        height: 600,
                        enabled: true,
                        isSystem: true, // 系统显示器，不允许删除
                        description: '主要显示端，用于主要信息展示'
                    };
                }
                
                if (!settings.display.displays['display-2']) {
                    settings.display.displays['display-2'] = {
                        id: 'display-2',
                        name: '高仿济南公交LCD屏幕',
                        source: 'builtin',
                        url: '',
                        width: 1500,
                        height: 400,
                        enabled: true,
                        isSystem: true, // 系统显示器，不允许删除
                        description: '辅助显示端，用于补充信息展示'
                    };
                }
                
                // 确保显示端配置完整
                if (!settings.display.currentDisplayId) {
                    settings.display.currentDisplayId = Object.keys(settings.display.displays)[0] || 'display-1';
                }
                if (!settings.display.displays) {
                    settings.display.displays = { ...DEFAULT_SETTINGS.display.displays };
                }
                
                // 确保系统显示器的 isSystem 属性正确设置为 true
                // display-1 和 display-2 是系统显示器，不允许删除
                if (settings.display.displays['display-1']) {
                    settings.display.displays['display-1'].isSystem = true;
                }
                if (settings.display.displays['display-2']) {
                    settings.display.displays['display-2'].isSystem = true;
                }
                // 确保 display2Mode 存在
                if (settings.display.display2Mode === undefined) {
                    settings.display.display2Mode = DEFAULT_SETTINGS.display.display2Mode || 'dev-only';
                }
                // 确保 display2NextStationDuration 存在
                if (settings.display.display2NextStationDuration === undefined) {
                    settings.display.display2NextStationDuration = DEFAULT_SETTINGS.display.display2NextStationDuration || 10000;
                }
                
                // 兼容旧数据，补 serviceMode
                if (settings.meta && settings.meta.serviceMode === undefined) settings.meta.serviceMode = 'normal';
                
                // 兼容旧数据：补齐模糊开关
                if (settings.blurEnabled === undefined) settings.blurEnabled = DEFAULT_SETTINGS.blurEnabled;
                // 兼容旧数据：补齐线路名合并开关
                if (settings.lineNameMerge === undefined) settings.lineNameMerge = DEFAULT_SETTINGS.lineNameMerge;
                // 兼容旧数据：补齐 API 服务器开关
                if (settings.enableApiServer === undefined) settings.enableApiServer = DEFAULT_SETTINGS.enableApiServer;
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
        
        // 同步设置到主进程的 electron-store（如果可用）
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.syncSettings) {
            try {
                // 创建一个可序列化的副本，移除不可序列化的内容
                const serializableSettings = JSON.parse(JSON.stringify(settings));
                window.electronAPI.syncSettings(serializableSettings);
            } catch (e) {
                console.warn('[useSettings] 同步设置到主进程失败:', e);
            }
        }
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
        
        // 同步主题到 mica-electron（主窗口）
        function syncMicaTheme(isDark) {
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.mica) {
                try {
                    if (mode === 'system') {
                        // 系统模式：使用自动主题
                        if (typeof window.electronAPI.mica.setAutoTheme === 'function') {
                            window.electronAPI.mica.setAutoTheme();
                        }
                    } else if (isDark) {
                        // 深色模式
                        if (typeof window.electronAPI.mica.setDarkTheme === 'function') {
                            window.electronAPI.mica.setDarkTheme();
                        }
                    } else {
                        // 浅色模式
                        if (typeof window.electronAPI.mica.setLightTheme === 'function') {
                            window.electronAPI.mica.setLightTheme();
                        }
                    }
                } catch (e) {
                    console.warn('[useSettings] 同步主题到 mica-electron 失败:', e);
                }
            }
        }

        // 清理旧的系统主题监听
        if (systemThemeCleanup) {
            systemThemeCleanup();
            systemThemeCleanup = null;
        }
        
        if (mode === 'system') {
            if (window.matchMedia) {
                const mql = window.matchMedia('(prefers-color-scheme: dark)');
                const isDark = mql.matches;
                setDark(isDark);
                setDarkVariant(darkVariant);
                syncMicaTheme(isDark);
                
                // 监听系统主题变化
                const systemThemeListener = (e) => {
                    const isDarkNow = e.matches;
                    setDark(isDarkNow);
                    syncMicaTheme(isDarkNow);
                };
                
                if (mql.addEventListener) {
                    mql.addEventListener('change', systemThemeListener);
                    systemThemeCleanup = () => {
                        mql.removeEventListener('change', systemThemeListener);
                    };
                } else if (mql.addListener) {
                    // 兼容旧版 API
                    mql.addListener(systemThemeListener);
                    systemThemeCleanup = () => {
                        mql.removeListener(systemThemeListener);
                    };
                }
            } else {
                setDark(false);
                syncMicaTheme(false);
            }
        } else if (mode === 'dark') {
            setDark(true);
            setDarkVariant(darkVariant);
            syncMicaTheme(true);
        } else {
            setDark(false);
            syncMicaTheme(false);
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
