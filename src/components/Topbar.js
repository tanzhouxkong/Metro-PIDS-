export default {
    name: 'Topbar',
        components: { WindowControls: (await import('./WindowControls.js')).default },
        setup() { return {}; },
        template: `
                                <div class="titlebar" style="position:fixed; top:0; left:0; right:0; height:32px; display:flex; align-items:center; justify-content:space-between; padding:6px 12px; background:var(--rail-bg); -webkit-app-region:drag; z-index:10000;">
                                                <div class="title-left" style="font-size:12px; font-weight:bold; color:black; display:flex; align-items:center; gap:8px;">
                                                                 <i class="fas fa-subway"></i> Metro PIDS Control
                                                </div>
                                                <div style="-webkit-app-region:no-drag; display:flex; align-items:center;">
                                                        <WindowControls />
                                                </div>
                                </div>
        `
} 
