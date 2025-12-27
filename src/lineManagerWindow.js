import { createApp } from 'vue'
import FolderLineManagerWindow from './components/FolderLineManagerWindow.js'
import LineManagerTopbar from './components/LineManagerTopbar.js'
import LineManagerDialog from './components/LineManagerDialog.js'

<<<<<<< HEAD
// 应用主题模式（从localStorage读取设置）
function applyThemeMode() {
    try {
        const settingsStr = localStorage.getItem('pids_settings_v1');
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            const mode = settings.themeMode || 'system';
            const darkVariant = settings.darkVariant || 'soft';
            
            function setDark(on) {
                if (on) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }
            function setDarkVariant(v) {
                document.documentElement.setAttribute('data-dark-variant', v || 'soft');
            }
            
            if (mode === 'system') {
                if (window.matchMedia) {
                    const mql = window.matchMedia('(prefers-color-scheme: dark)');
                    setDark(mql.matches);
                    setDarkVariant(darkVariant);
                    // 监听系统主题变化
                    mql.addEventListener('change', (e) => {
                        setDark(e.matches);
                    });
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
    } catch (e) {
        console.warn('应用主题模式失败:', e);
    }
}

// 初始化时应用主题
applyThemeMode();

=======
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
const app = createApp(FolderLineManagerWindow)
// 全局注册组件以确保可用
app.component('LineManagerTopbar', LineManagerTopbar)
app.component('LineManagerDialog', LineManagerDialog)
app.mount('#app')

