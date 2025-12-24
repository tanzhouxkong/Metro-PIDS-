export default {
  name: 'UnifiedDialogs',
  data() { return { visible: false, title: '', msg: '', inputVal: '', type: 'alert', resolve: null } },
  methods: {
    applyDialogBlur(state) {
      if (typeof window === 'undefined') return;
      const blurApi = window.electronAPI && window.electronAPI.effects && window.electronAPI.effects.setDialogBlur;
      if (typeof blurApi === 'function') blurApi(!!state);
    },
    closeDialog(result) {
      const resolver = this.resolve;
      this.resolve = null;
      this.visible = false;
      this.applyDialogBlur(false);
      if (resolver) resolver(result);
    },
    alert(msg, title) { this.title = title || '提示'; this.msg = msg || ''; this.type = 'alert'; this.applyDialogBlur(true); this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    confirm(msg, title) { this.title = title || '确认'; this.msg = msg || ''; this.type = 'confirm'; this.applyDialogBlur(true); this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    prompt(msg, defaultValue, title) { this.title = title || '输入'; this.msg = msg || ''; this.inputVal = defaultValue || ''; this.type = 'prompt'; this.applyDialogBlur(true); this.visible = true; return new Promise((res)=>{ this.resolve = res; }) },
    methodsBridge(action, msg, a2, a3) {
      // 提供给 window 桥的实例方法调用；不可用则直接调用
      if (action === 'alert') return this.alert(msg, a2);
      if (action === 'confirm') return this.confirm(msg, a2);
      if (action === 'prompt') return this.prompt(msg, a2, a3);
      return Promise.resolve();
    }
  },
  mounted() {
    try {
      window.__ui = window.__ui || {};
      window.__ui.dialog = {
        alert: (m,t)=> this.methodsBridge('alert', m, t),
        confirm: (m,t)=> this.methodsBridge('confirm', m, t),
        prompt: (m,d,t)=> this.methodsBridge('prompt', m, d, t)
      };
    } catch(e){}
  },
  template: `
    <div v-if="visible" id="unified-dialogs" style="position:fixed; inset:0; align-items:center; justify-content:center; z-index:10000; display:flex;">
      <div id="ud-backdrop" style="position:absolute; inset:0; background:rgba(0,0,0,0.45); backdrop-filter: blur(18px);" @click="type !== 'alert' && closeDialog(type==='confirm'?false:null)"></div>
      <div id="ud-box" style="position:relative; background:var(--card); padding:24px; border-radius:12px; width:420px; max-width:90%; box-shadow:0 8px 28px rgba(0,0,0,0.3); border:1px solid var(--card-border);">
        <div id="ud-title" style="font-weight:800; font-size:18px; margin-bottom:12px; color:var(--text);">{{ title }}</div>
        <div id="ud-msg" style="margin-bottom:20px; color:var(--text); font-size:14px; line-height:1.5; white-space:pre-wrap;">{{ msg }}</div>
        <input v-if="type==='prompt'" v-model="inputVal" id="ud-input" style="width:100%; padding:10px; margin-bottom:20px; border:1px solid var(--divider); border-radius:6px; background:var(--bg); color:var(--text);" @keyup.enter="closeDialog(inputVal)" />
        <div style="display:flex; gap:12px; justify-content:flex-end;">
          <button class="btn" style="background:var(--btn-gray-bg); color:var(--btn-gray-text);" v-if="type!=='alert'" @click="closeDialog(type==='confirm'?false:null)">取消</button>
          <button class="btn" style="background:var(--accent); color:white;" @click="closeDialog(type==='prompt'?inputVal:true)">确定</button>
        </div>
      </div>
    </div>
  `
}
