export async function alert(msg, title) {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.dialog && typeof window.__ui.dialog.alert === 'function') {
      return await window.__ui.dialog.alert(msg, title);
    }
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.alert === 'function') {
      return await window.electronAPI.alert(msg);
    }
  } catch (e) {
    // 忽略异常
  }
  return new Promise((res)=>{ alert(String(msg)); res(true); });
}

export async function confirm(msg, title) {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.dialog && typeof window.__ui.dialog.confirm === 'function') {
      return await window.__ui.dialog.confirm(msg, title);
    }
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.confirm === 'function') {
      return await window.electronAPI.confirm(msg);
    }
  } catch (e) {
    // 忽略异常
  }
  return confirm(String(msg));
}

export async function prompt(msg, defaultValue, title) {
  try {
    if (typeof window !== 'undefined' && window.__ui && window.__ui.dialog && typeof window.__ui.dialog.prompt === 'function') {
      return await window.__ui.dialog.prompt(msg, defaultValue, title);
    }
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.prompt === 'function') {
      return await window.electronAPI.prompt(msg, defaultValue);
    }
  } catch (e) {
    // 忽略异常
  }
  return prompt(String(msg), defaultValue);
}

export default { alert, confirm, prompt };
