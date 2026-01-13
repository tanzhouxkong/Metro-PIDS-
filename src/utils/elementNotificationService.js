/**
 * Element UI 通知服务
 * 使用 Element Plus 的 Notification 组件显示悬浮通知
 */

// 获取 Element Plus 的 Notification 组件
function getElNotification() {
  if (typeof window === 'undefined') {
    return null;
  }
  
  // 尝试多种可能的全局对象名称
  if (window.ElementPlus && window.ElementPlus.ElNotification) {
    return window.ElementPlus.ElNotification;
  }
  if (window.ElNotification) {
    return window.ElNotification;
  }
  if (window.ElementPlus && window.ElementPlus.Notification) {
    return window.ElementPlus.Notification;
  }
  
  return null;
}

/**
 * 显示成功通知
 * @param {string} message - 通知消息
 * @param {string} title - 通知标题（可选）
 * @param {Object} options - 额外选项
 */
export function showSuccessNotification(message, title = '提示', options = {}) {
  const ElNotification = getElNotification();
  
  if (!ElNotification) {
    console.warn('Element Plus 未加载，无法显示通知');
    // 降级到 alert
    alert(`${title}\n${message}`);
    return;
  }
  
  ElNotification({
    title: title,
    message: message,
    type: 'success',
    duration: 3000,
    position: 'top-right',
    ...options
  });
}

/**
 * 显示错误通知
 * @param {string} message - 通知消息
 * @param {string} title - 通知标题（可选）
 * @param {Object} options - 额外选项
 */
export function showErrorNotification(message, title = '错误', options = {}) {
  const ElNotification = getElNotification();
  
  if (!ElNotification) {
    console.warn('Element Plus 未加载，无法显示通知');
    // 降级到 alert
    alert(`${title}\n${message}`);
    return;
  }
  
  ElNotification({
    title: title,
    message: message,
    type: 'error',
    duration: 4000,
    position: 'top-right',
    ...options
  });
}

/**
 * 显示警告通知
 * @param {string} message - 通知消息
 * @param {string} title - 通知标题（可选）
 * @param {Object} options - 额外选项
 */
export function showWarningNotification(message, title = '警告', options = {}) {
  const ElNotification = getElNotification();
  
  if (!ElNotification) {
    console.warn('Element Plus 未加载，无法显示通知');
    // 降级到 alert
    alert(`${title}\n${message}`);
    return;
  }
  
  ElNotification({
    title: title,
    message: message,
    type: 'warning',
    duration: 3000,
    position: 'top-right',
    ...options
  });
}

/**
 * 显示信息通知
 * @param {string} message - 通知消息
 * @param {string} title - 通知标题（可选）
 * @param {Object} options - 额外选项
 */
export function showInfoNotification(message, title = '提示', options = {}) {
  const ElNotification = getElNotification();
  
  if (!ElNotification) {
    console.warn('Element Plus 未加载，无法显示通知');
    // 降级到 alert
    alert(`${title}\n${message}`);
    return;
  }
  
  ElNotification({
    title: title,
    message: message,
    type: 'info',
    duration: 3000,
    position: 'top-right',
    ...options
  });
}

