import WindowControls from './WindowControls.js'

export default {
    name: 'LineManagerTopbar',
    components: { WindowControls },
    setup() { 
        return {}; 
    },
    template: `
<<<<<<< HEAD
        <div class="titlebar" style="position:fixed; top:0; left:0; right:0; height:32px; display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:var(--rail-bg, rgba(255,255,255,0.65)); -webkit-app-region:drag; z-index:10000; border-bottom:1px solid var(--rail-border, rgba(0,0,0,0.1));">
            <div class="title-left" style="font-size:12px; font-weight:bold; color:var(--text, #333); display:flex; align-items:center; gap:8px;">
                <i class="fas fa-folder-open" style="color:var(--accent, #12b7f5);"></i> 
=======
        <div class="titlebar" style="position:fixed; top:0; left:0; right:0; height:32px; display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:rgba(255,255,255,0.65); -webkit-app-region:drag; z-index:10000; border-bottom:1px solid rgba(0,0,0,0.1);">
            <div class="title-left" style="font-size:12px; font-weight:bold; color:#333; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-folder-open" style="color:#12b7f5;"></i> 
>>>>>>> e74a48ee787cba03260e0ae757403bc6aaf5a055
                <span>线路管理器</span>
            </div>
            <div style="-webkit-app-region:no-drag; display:flex; align-items:center;">
                <WindowControls />
            </div>
        </div>
    `
}
