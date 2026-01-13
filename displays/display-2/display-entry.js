import { createApp } from 'vue'
import JinanDisplay from './JinanDisplay.js'

// 输出窗口尺寸信息（在渲染进程中可见）
console.log('========================================');
console.log('[Display-2] 显示器2初始化');
console.log('[Display-2] 期望尺寸: 1500 x 400');
console.log('[Display-2] 实际窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
console.log('[Display-2] 屏幕尺寸:', window.screen.width, 'x', window.screen.height);
console.log('[Display-2] 设备像素比:', window.devicePixelRatio);
console.log('========================================');

// 监听窗口尺寸变化
window.addEventListener('resize', () => {
  console.log('[Display-2] 窗口尺寸变化:', window.innerWidth, 'x', window.innerHeight);
});

// 延迟检查（等待窗口完全加载）
setTimeout(() => {
  console.log('[Display-2] 延迟检查 - 窗口尺寸:', window.innerWidth, 'x', window.innerHeight);
  if (window.innerWidth !== 1500 || window.innerHeight !== 400) {
    console.warn('[Display-2] ⚠️ 窗口尺寸不匹配！期望: 1500x400, 实际:', window.innerWidth + 'x' + window.innerHeight);
  } else {
    console.log('[Display-2] ✅ 窗口尺寸正确');
  }
}, 1000);

const app = createApp(JinanDisplay)
app.mount('#display-root')

