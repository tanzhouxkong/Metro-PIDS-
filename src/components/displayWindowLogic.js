// 判断站点是否因运营模式被跳过
/**
 * 解析颜色标记文本，将 <color>文字</> 转换为带颜色的HTML
 * 支持颜色名称、十六进制、RGB格式
 * @param {string} text - 包含颜色标记的文本
 * @returns {string} - 转换后的HTML字符串
 */
function parseColorMarkup(text) {
  if (!text || typeof text !== 'string') return text;
  
  // 匹配 <color>文字</> 格式，支持颜色名称、十六进制、RGB
  // 正则表达式：<([^>]+)>([^<]*)</>
  const regex = /<([^>]+)>([^<]*)<\/>/g;
  
  let result = text;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const colorValue = match[1].trim();
    const content = match[2];
    const fullMatch = match[0];
    
    // 验证颜色值是否有效
    let isValidColor = false;
    let cssColor = '';
    
    // 检查是否是有效的颜色名称（常见颜色）
    const colorNames = {
      'red': 'red', 'blue': 'blue', 'green': 'green', 'yellow': 'yellow',
      'orange': 'orange', 'purple': 'purple', 'pink': 'pink', 'black': 'black',
      'white': 'white', 'gray': 'gray', 'grey': 'grey', 'brown': 'brown',
      'cyan': 'cyan', 'magenta': 'magenta', 'lime': 'lime', 'navy': 'navy',
      'olive': 'olive', 'teal': 'teal', 'aqua': 'aqua', 'silver': 'silver',
      'maroon': 'maroon', 'fuchsia': 'fuchsia'
    };
    
    if (colorNames[colorValue.toLowerCase()]) {
      isValidColor = true;
      cssColor = colorNames[colorValue.toLowerCase()];
    }
    // 检查是否是十六进制颜色 (#fff, #ffffff, #FFF, #FFFFFF)
    else if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorValue)) {
      isValidColor = true;
      cssColor = colorValue;
    }
    // 检查是否是RGB格式 (rgb(255,0,0) 或 rgba(255,0,0,1))
    else if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(colorValue)) {
      isValidColor = true;
      cssColor = colorValue;
    }
    
    if (isValidColor) {
      // 转义HTML特殊字符
      const escapedContent = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      
      const coloredSpan = `<span style="color: ${cssColor};">${escapedContent}</span>`;
      result = result.replace(fullMatch, coloredSpan);
    }
  }
  
  return result;
}

function isSkippedByService(st, idx, len, meta) {
  if (!st) return true;
  if (st.skip) return true;
  const mode = (meta && meta.serviceMode) || 'normal';
  const expressKeep = st.expressStop !== undefined ? !!st.expressStop : false; // 默认不保留停靠，需要明确设置
  const isEnd = idx === 0 || idx === len - 1;
  if (mode === 'direct') {
    return !isEnd;
  }
  if (mode === 'express') {
    if (isEnd) return false;
    // 大站车模式下：只有明确设置 expressStop 为 true 的站点才停靠
    return !expressKeep;
  }
  return false;
}
const SCALER_W = 1900;
const SCALER_H = 600;
const DISPLAY_SNAPSHOT_KEY = 'metro_pids_display_snapshot';

const displayStyleSheet = `
#display-titlebar.custom-titlebar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 35px;
  width: 100%;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  padding-left: 12px;
  font-size: 14px;
  user-select: none;
  -webkit-app-region: drag;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
#display-titlebar.custom-titlebar [role="controls"] { 
  -webkit-app-region: no-drag; 
}

/* MacOS 适配：标题居中显示 */
#display-titlebar.custom-titlebar.darwin {
  justify-content: center;
}

/* Linux 适配：隐藏自定义标题栏 */
#display-titlebar.custom-titlebar.linux {
  display: none;
}

#display-app {
    --theme: #00b894;
    --font: "Microsoft YaHei", sans-serif;
    --gold: #ffaa00;
    --dark: #2d3436;
    --contrast-color: #fff;
    width: 100vw;
    height: 100vh;
    font-family: var(--font);
    display: flex;
    justify-content: center;
    align-items: center;
    background: #090d12;
    /* 确保在高DPI下正确显示 */
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
#display-statusbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  display: flex;
  align-items: center;
  background: rgba(0,0,0,0.02);
  z-index: 9998;
}
#display-statusbar-inner {
  width: 100%;
  max-width: 1900px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  padding: 0 20px;
}
#display-statusbar { pointer-events: none; }
#display-statusbar .win-btn {
  width:56px; height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text); background:transparent; border-radius:4px;
}
#display-statusbar .win-btn.close { color: var(--win-close-color, #ff4d4d); }
/* controls container visibility helper */
#display-window-controls { transition: opacity 160ms ease, transform 160ms ease; opacity: 0; transform: translateY(-6px); pointer-events: none; }
#display-window-controls.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
#display-app *,
#display-app *::before,
#display-app *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    user-select: none;
    outline: none;
}
#display-app #scaler {
    width: 1900px;
    height: 600px;
    background: #fff;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: none;
    transform-origin: center center;
    /* 确保在高DPI下渲染清晰 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
#display-app .header {
  height: 100px;
  margin-top: 34px; /* push header below custom titlebar */
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 4px solid #ccc;
  background: var(--theme);
  flex-shrink: 0;
}
#display-app .h-left {
  width: 25%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding-left: 20px;
  border-right: none;
}
#display-app .logo-area {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-right: 20px;
}
#display-app .logo-icon {
    font-size: 30px;
    color: var(--contrast-color);
    margin-bottom: 2px;
}
#display-app .logo-txt {
    font-size: 20px;
    font-weight: 900;
    color: var(--contrast-color);
    line-height: 1;
}
#display-app .logo-en {
    font-size: 10px;
    font-weight: bold;
    color: var(--contrast-color);
    letter-spacing: 1px;
}
#display-app .line-info {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    padding-right: 20px;
}
#display-app .line-badge {
    font-size: 36px;
    font-weight: 900;
    color: var(--contrast-color);
    line-height: 1;
    overflow: hidden;
    white-space: nowrap;
    max-width: 100%;
}
#display-app .h-next {
    width: 35%;
    background: #fff;
    color: #000;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-left: 30px;
    position: relative;
    border: 3px solid #fff;
    box-shadow: 0 5px 20px rgba(0,0,0,0.4);
    margin: 10px 0;
    height: 80px;
    border-radius: 8px;
    padding-right: 30px;
    z-index: 10;
}
#display-app .h-next .lbl {
    font-size: 36px;
    font-weight: bold;
    line-height: 1.2;
    text-align: left;
    flex-shrink: 0;
    color: #000;
}
#display-app .h-next .lbl .en {
    font-size: 12px;
    font-weight: normal;
    opacity: 0.9;
    display: block;
    color: #666;
}
#display-app .h-next .val {
    font-size: 36px;
    font-weight: 900;
    line-height: 1.1;
    margin-top: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
    flex-grow: 1;
    color: #000;
}
#display-app .h-next .val .en {
    font-size: 16px;
    font-weight: bold;
    opacity: 0.9;
    display: block;
    color: #666;
}
#display-app .h-door {
    display: none;
}
#display-app .h-term {
    width: 40%;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    padding-right: 30px;
    padding-left: 50px;
    color: var(--contrast-color);
}
#display-app .h-term .lbl {
    font-size: 24px;
    font-weight: bold;
    line-height: 1.2;
    text-align: right;
    margin-right: 15px;
    color: var(--contrast-color);
}
#display-app .h-term .lbl .en {
    font-size: 12px;
    font-weight: normal;
    display: block;
    color: var(--contrast-color);
    opacity: 0.8;
}
#display-app .h-term .val {
    font-size: 36px;
    font-weight: 900;
    line-height: 1;
    color: var(--contrast-color);
}
#display-app .h-term .val .en {
    font-size: 14px;
    font-weight: bold;
    display: block;
    color: var(--contrast-color);
    opacity: 0.8;
}
#display-app .route-arrows {
    display: flex;
    gap: 20px;
    margin: 0 40px;
}
#display-app .route-arrows i {
    font-size: 28px;
    color: var(--contrast-color);
    opacity: 0.3;
    animation: r-arrow-anim 1.5s infinite;
}
#display-app .route-arrows .a1 { animation-delay: 0s; }
#display-app .route-arrows .a2 { animation-delay: 0.25s; }
#display-app .route-arrows .a3 { animation-delay: 0.5s; }
#display-app .map-arrow { color: #fff; }
#display-app .map-arrow-current { color: #f1c40f; }
#display-app .track-arrow { color: #fff; }
#display-app .track-arrow-current { color: #f1c40f; }
#display-app .segment-arrow { color: #fff; }
#display-app .segment-arrow-default { color: #fff; }
#display-app .segment-arrow-current { 
    animation: arrow-white-yellow-blink 2s infinite;
}
#display-app .ring-arrow { color: #fff; }
#display-app .ring-arrow-default { color: #fff; }
#display-app .ring-arrow-current { 
    animation: arrow-white-yellow-blink 2s infinite;
}
@keyframes arrow-white-yellow-blink {
    0%, 100% { color: #fff; }
    50% { color: var(--arrow-blink-accent-color, #f1c40f); }
}
#display-app .a1,
#display-app .a2,
#display-app .a3 {
    animation: r-arrow-anim 1.5s infinite;
}
#display-app .a1 { animation-delay: 0s; }
#display-app .a2 { animation-delay: 0.25s; }
#display-app .a3 { animation-delay: 0.5s; }
@keyframes r-arrow-anim {
    0%, 100% { opacity: 0.3; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.3); }
}

@keyframes pulse-yellow {
    0% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0.7); transform: scale(1); }
    50% { box-shadow: 0 0 20px 0 rgba(241, 196, 15, 0.6); transform: scale(1.2); }
    100% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0); transform: scale(1); }
}
@keyframes pulse-yellow-centered {
    0% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0.7); transform: translate(-50%, -50%) scale(1); }
    50% { box-shadow: 0 0 20px 0 rgba(241, 196, 15, 0.6); transform: translate(-50%, -50%) scale(1.2); }
    100% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0); transform: translate(-50%, -50%) scale(1); }
}
@keyframes spin-inner { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes spin-outer { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }
#display-app .marquee-box {
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    display: block;
    max-width: 100%;
}
#display-app .marquee-content {
    display: inline-block;
    white-space: nowrap;
}
#display-app .marquee-content.scrolling {
    animation: marquee-scroll 8s linear infinite;
    padding-right: 50px;
}
@keyframes marquee-scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
}
#display-app .btm-map {
    flex: 1;
    width: 100%;
    background: #fff;
    position: relative;
    overflow: hidden;
    scrollbar-width: none;
    display: flex;
    align-items: center;
    padding-bottom: 100px;
}
#display-app .btm-map::-webkit-scrollbar { display: none; }
#display-app .node { position: absolute; z-index: 10; transition: left 0.5s, top 0.5s; }
#display-app .node .dot {
    width: 24px;
    height: 24px;
    background: #fff;
    border: 4px solid var(--theme);
    border-radius: 50%;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    transition: 0.3s;
    z-index: 2;
}
#display-app .node .n-txt {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    background: none;
    color: #333;
    text-shadow: none;
    padding: 5px 0;
    text-align: center;
    font-weight: bold;
    transition: 0.3s;
    min-width: 140px;
    z-index: 1;
    font-size: 18px;
}
#display-app .node .n-txt .en {
    font-size: 12px;
    font-weight: normal;
    color: #666;
    margin-top: 2px;
}
#display-app .node .n-txt .x-tag {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    margin: 1px;
    color: #fff;
    vertical-align: middle;
}
#display-app .map-l {
    padding-left: 0;
    overflow-x: auto;
    align-items: center;
}
#display-app .l-box {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
    overflow: visible;
}
#display-app .l-node {
    width: 110px;
    height: 100%;
    flex-shrink: 0;
    position: relative;
    z-index: 5;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: visible;
}
#display-app .track-double {
    position: absolute;
    left: 0;
    width: 100%;
    top: 50%;
    transform: translateY(-50%);
    height: 18px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    z-index: 0;
}
#display-app {
  /* variables to keep track marker size and gap consistent */
  --dot-inner-size: 30px;
  --dot-border: 5px;
  --dot-gap: 14px; /* gap between dot edge and text */
}

#display-app .l-node .dot {
  position: relative;
  width: var(--dot-inner-size);
  height: var(--dot-inner-size);
  background: #fff;
  border: var(--dot-border) solid var(--theme);
  border-radius: 50%;
  z-index: 10;
  margin: 0;
  transition: 0.3s;
}
#display-app .l-node .info-top {
  position: absolute;
  bottom: 50%;
  left: 50%;
  /* shift up from center by half dot + border + further reduced gap to bring closer to track */
  transform: translate(-50%, calc(-1 * (calc(var(--dot-inner-size) / 2) + var(--dot-border) + var(--dot-gap) - 10px)));
  transform-origin: center bottom;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  width: 110px;
  max-width: 110px;
  overflow: hidden;
  z-index: 5;
}
#display-app .l-node .info-top .x-tag {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 3px;
    color: #fff;
    font-weight: bold;
    white-space: nowrap;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
#display-app .l-node .info-top .x-tag.suspended {
    background: #f0f0f0 !important;
    color: #999 !important;
    border: 1px solid #ccc;
    box-shadow: none;
    display: flex;
    align-items: center;
    gap: 2px;
}
#display-app .l-node .info-top .x-tag.suspended .sub {
    font-size: 9px;
    background: #999;
    color: #fff;
    padding: 0 2px;
    border-radius: 2px;
    margin-left: 2px;
}
#display-app .l-node .info-btm {
  position: absolute;
  top: 50%;
  left: 50%;
  /* shift down from center by half dot + border + gap to align with track */
  transform: translate(-50%, calc((calc(var(--dot-inner-size) / 2) + var(--dot-border) + var(--dot-gap))));
  margin-top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 5;
  writing-mode: vertical-rl;
  box-sizing: content-box;
  position: absolute;
}
#display-app .l-node .info-btm .name {
  font-size: 26px;
  font-weight: bold;
  color: #333;
  letter-spacing: 2px;
  margin: 0;
  margin-bottom: -5px;
  line-height: 1;
  white-space: nowrap;
  transition: 0.3s;
}
#display-app .l-node .info-btm .en {
  font-size: 16px;
  color: #666;
  font-weight: normal;
  writing-mode: vertical-rl;
  text-orientation: sideways;
  margin: 0;
  transition: 0.3s;
}
#display-app .l-node .info-top .defer {
    font-size: 11px;
    background: #95a5a6;
    color: #fff;
    padding: 2px 5px;
    border-radius: 3px;
    font-weight: bold;
    white-space: nowrap;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
#display-app .l-node.passed .dot { background: #fff; border-color: #ccc; }
#display-app .l-node.passed .name { color: #999; }
#display-app .l-node.passed .en { color: #ccc; }
#display-app .map-r {
    display: flex;
    justify-content: center;
    align-items: center;
}
#display-app .arr {
    position: absolute;
    top: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 32px;
    z-index: 15;
    filter: drop-shadow(0 0 5px rgba(241, 196, 15, 0.8));
}
#display-app #rec-tip {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #fff;
    color: red;
    padding: 5px 15px;
    border-radius: 20px;
    font-weight: bold;
    animation: blink 1s infinite;
    display: none;
    z-index: 9999;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.5} }
#display-app #arrival-screen {
    width: 100%;
    flex: 1;
    display: none;
    flex-direction: column;
    background: #fff;
    font-family: "Microsoft YaHei", sans-serif;
    overflow: hidden;
}
#display-app .as-body {
    flex: 1;
    display: flex;
    background: #fff;
    padding: 0;
    gap: 0;
    overflow: hidden;
}
#display-app .as-panel-left {
  width: 35%;
  display: flex;
  flex-direction: column;
  padding: 80px 16px; /* increase top padding to lower left block */
  justify-content: center;
}
#display-app .as-door-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  width: 100%;
  box-sizing: border-box;
  padding: 48px 0; /* increase vertical padding so icon/text shift down */
}
#display-app .as-door-graphic {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
}
#display-app .as-door-img {
    font-size: 120px;
    color: var(--theme);
    filter: drop-shadow(0 5px 15px rgba(0,0,0,0.2));
    animation: pulse-door 2s infinite;
    z-index: 2;
  margin-top: 6px;
}
#display-app .door-arrow {
    font-size: 80px;
    color: #ddd;
    opacity: 0.3;
    transition: 0.3s;
    margin: 0 20px;
}
#display-app .door-arrow.active {
    color: var(--theme);
    opacity: 1;
}
#display-app .door-arrow.l-arrow.active { animation: arrow-move-left 2s infinite; }
#display-app .door-arrow.r-arrow.active { animation: arrow-move-right 2s infinite; }
@keyframes arrow-move-left { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-20px); } }
@keyframes arrow-move-right { 0%,100% { transform: translateX(0); } 50% { transform: translateX(20px); } }
@keyframes pulse-door { 0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
}
#display-app #watermark {
    position: fixed;
    bottom: 8px;
    right: 8px;
    z-index: 10000;
    font-size: 11px;
    color: rgba(0, 0, 0, 0.3);
    font-family: "Microsoft YaHei", sans-serif;
    pointer-events: none;
    user-select: none;
    background: rgba(255, 255, 255, 0.6);
    padding: 4px 8px;
    border-radius: 4px;
    backdrop-filter: blur(2px);
    line-height: 1.4;
    display: flex;
    flex-direction: row;
    gap: 12px;
    align-items: center;
}
#display-app #watermark > div {
    white-space: nowrap;
}
#display-app #display-warning {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10001;
    background: rgba(255, 87, 34, 0.95);
    color: #fff;
    padding: 20px 40px;
    border-radius: 8px;
    font-family: "Microsoft YaHei", sans-serif;
    font-size: 18px;
    font-weight: bold;
    display: none;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    user-select: none;
}
#display-app #display-warning.show {
    display: flex;
}
#display-app #display-warning .warning-icon {
    font-size: 24px;
}
#display-app #display-warning .warning-text {
    white-space: nowrap;
}
#display-app .as-door-text {
    text-align: center;
    margin-top: 22px; /* extra space between icon and text */
}
#display-app .as-door-t-cn {
    font-size: 42px;
    font-weight: bold;
    margin-bottom: 5px;
    color: #333;
}
#display-app .as-door-t-en {
    font-size: 18px;
    color: #666;
}
#display-app .as-car-area {
    height: 150px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
#display-app .as-car-diag {
    display: flex;
    gap: 2px;
    margin-top: 10px;
}
#display-app .as-car {
    width: 60px;
    height: 40px;
    border: 2px solid #999;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: bold;
    color: #666;
    font-size: 18px;
}
#display-app .as-car-exits {
    display: flex;
    gap: 2px;
    margin-bottom: 5px;
    width: 100%;
    justify-content: center;
}
#display-app .as-exit-tag {
    background: #f39c12;
    color: #fff;
    font-size: 12px;
    padding: 2px 5px;
    border-radius: 2px;
    position: relative;
    top: 0px;
    margin: 0 10px;
}
#display-app .as-panel-right {
  flex: 1;
  padding: 8px 40px 0; /* reduce top padding to lift content */
  display: flex;
  align-items: flex-start;
  overflow: hidden;
  position: relative;
}
#display-app .as-map-track {
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 18px;
    background: none;
    border-top: 5px solid var(--theme);
    border-bottom: 5px solid var(--theme);
    transform: translateY(-50%);
    z-index: 0;
}
#display-app .as-map-nodes {
    display: flex;
    align-items: center;
    width: 100%;
    z-index: 1;
    justify-content: space-around;
}
#display-app #arrival-screen .l-node {
    width: 160px;
}
#display-app #arrival-screen .l-node .info-btm {
    writing-mode: horizontal-tb;
    margin-top: 15px;
    width: 100%;
}
#display-app #arrival-screen .l-node .info-btm .name {
    margin-bottom: 5px;
    font-size: 22px;
    white-space: normal;
    text-align: center;
}
#display-app #arrival-screen .l-node .info-btm .en {
    writing-mode: horizontal-tb;
    text-orientation: mixed;
    font-size: 14px;
    text-align: center;
    white-space: normal;
    line-height: 1.1;
}
#display-app .as-m-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    min-width: 100px;
}
#display-app .as-m-dot {
    width: 30px;
    height: 30px;
    background: #fff;
    border: 5px solid #005bac;
    border-radius: 50%;
    margin: 20px 0;
    z-index: 2;
    transition: 0.3s;
}
#display-app .as-m-node.past .as-m-dot {
    background: #ccc;
    border-color: #999;
}
#display-app .as-m-node.curr .as-m-dot {
    width: 50px;
    height: 50px;
    background: #fff;
    border: 5px solid #f39c12;
    box-shadow: 0 0 15px #f39c12;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
}
#display-app .as-m-node.curr .as-m-dot::after {
    content: "\f239";
    font-family: "Font Awesome 6 Free";
    font-weight: 900;
    color: #f39c12;
    font-size: 24px;
}
#display-app .as-m-name {
    font-size: 20px;
    font-weight: bold;
    color: #333;
    text-align: center;
}
#display-app .as-m-en {
    font-size: 12px;
    color: #999;
    text-align: center;
}
#display-app .as-m-node.past .as-m-name { color: #999; }
#display-app .as-xfer-row {
  position: absolute;
  top: -12px;
  display: flex;
  gap: 3px;
}
#display-app .as-xfer-badge {
    background: #f39c12;
    color: #fff;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
}
`;

function injectDisplayStyles() {
  const existing = document.getElementById('display-window-styles');
  if (existing) {
    try {
      existing.textContent = displayStyleSheet;
      return;
    } catch (e) {
      existing.remove();
    }
  }
  const style = document.createElement('style');
  style.id = 'display-window-styles';
  style.textContent = displayStyleSheet;
  document.head.appendChild(style);
}

function normalizeKeyNameGlobal(name) {
  if (!name) return name;
  const s = String(name);
  if (s === 'NumpadEnter') return 'Enter';
  if (s === ' ' || s.toLowerCase() === 'spacebar') return 'Space';
  if (/^space$/i.test(s)) return 'Space';
  if (/^[a-zA-Z]$/.test(s)) return 'Key' + s.toUpperCase();
  return s;
}

function getContrastColor(hex) {
  if (!hex) return '#fff';
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#fff';
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#000' : '#fff';
}

// 计算颜色的相对亮度（用于对比度计算）
function getLuminance(hex) {
  if (!hex) return 0;
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;
  const rgb = [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  const [r, g, b] = rgb.map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 计算两个颜色的对比度比率
function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getNextValidSt(currentIdx, step, appData) {
  if (!appData) return currentIdx;
  const stations = appData.stations || [];
  const len = stations.length;
  if (!len) return currentIdx;
  const dir = step > 0 ? 1 : -1;
  let nextIdx = currentIdx;
  const meta = appData.meta || {};
  const sIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
  const eIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : len - 1;
  const minIdx = Math.min(sIdx, eIdx);
  const maxIdx = Math.max(sIdx, eIdx);
  for (let i = 0; i < len; i++) {
    nextIdx += dir;
    if (meta.mode === 'loop') {
      if (nextIdx >= len) nextIdx = 0;
      if (nextIdx < 0) nextIdx = len - 1;
    } else {
      if (nextIdx > maxIdx) return maxIdx;
      if (nextIdx < minIdx) return minIdx;
    }
    const candidate = stations[nextIdx];
    if (!candidate) continue;
    
    // 遵守站台 dock 限制：仅方向匹配才允许上下客；缺省或 both 则放行
    const dirType = appData && appData.meta ? appData.meta.dirType : null;
    if (candidate.dock && candidate.dock !== 'both') {
      if (candidate.dock === 'up' && !(dirType === 'up' || dirType === 'outer')) {
        continue;
      }
      if (candidate.dock === 'down' && !(dirType === 'down' || dirType === 'inner')) {
        continue;
      }
    }
    
    // 如果站点被跳过（暂缓或运营模式），跳过该站点
    if (isSkippedByService(candidate, nextIdx, len, appData.meta)) {
      continue;
    }
    
    // 站点未被跳过，可以停靠
    return nextIdx;
  }
  return nextIdx;
}

function mkNode(st, i, mode, appData, rtState) {
  const node = document.createElement('div');
  node.className = mode === 'loop' ? 'node' : 'l-node';
  let isPassed = false;
  let isCurr = false;
  const state = rtState.state;
  const dir = appData.meta ? appData.meta.dirType : null;
  if (mode === 'loop') {
    if (i === rtState.idx) {
      if (state === 0) isCurr = true;
      else isPassed = true;
    }
  } else {
    if (dir === 'up' || dir === 'outer') {
      if (i < rtState.idx) isPassed = true;
      else if (i === rtState.idx && state === 1) isPassed = true;
    } else {
      if (i > rtState.idx) isPassed = true;
      else if (i === rtState.idx && state === 1) isPassed = true;
    }
    if (i === rtState.idx && state === 0) isCurr = true;
  }
  if (isPassed) node.classList.add('passed');
  if (isCurr) node.classList.add('curr');
  const shortTurnEnabled = appData && appData.meta && ((appData.meta.startIdx !== undefined && appData.meta.startIdx !== -1) || (appData.meta.termIdx !== undefined && appData.meta.termIdx !== -1));
  let xferHTML = '';
  if (st.xfer) {
    st.xfer.forEach((x) => {
      if (x.suspended) {
          xferHTML += `<span class="x-tag suspended" style="background:#ccc; color:#666; border:1px solid #999;">${x.line}<span class="sub">暂缓</span></span>`;
      } else {
        xferHTML += `<span class="x-tag" style="background:${x.color}">${x.line}</span>`;
      }
    });
  }
  let nameStyle = '';
  let deferTag = '';
  let dockTag = '';
  let expressStopTag = '';
  let dotStyle = '';
  const limitedDock = st.dock && st.dock !== 'both';
  const isDirMatch =
    (st.dock === 'up' && (dir === 'up' || dir === 'outer')) ||
    (st.dock === 'down' && (dir === 'down' || dir === 'inner')) ||
    (!st.dock || st.dock === 'both');
  const skipByMode = isSkippedByService(st, i, (appData.stations || []).length, appData.meta);
  const serviceMode = (appData.meta && appData.meta.serviceMode) ? appData.meta.serviceMode : 'normal';
  // 站点本身被标记为暂缓（st.skip）时，无论什么模式都显示"暂缓"标签
  // 因运营模式被跳过（skipByMode）时，只有普通模式才显示"暂缓"标签
  const shouldShowDeferTag = !shortTurnEnabled && (st.skip || (skipByMode && serviceMode === 'normal'));
  if (st.skip || skipByMode) {
    nameStyle = 'color:#999; opacity:0.7;';
    // 站点本身被标记为暂缓时，无论什么模式都显示暂缓标签
    if (st.skip) {
      deferTag = '<span class="defer">暂缓</span>';
    } else if (shouldShowDeferTag) {
      deferTag = '<span class="defer">暂缓</span>';
    }
  }
  if (limitedDock) {
    const txt = st.dock === 'up' ? '仅上行' : (st.dock === 'down' ? '仅下行' : '');
    if (!isDirMatch) {
      if (!nameStyle) nameStyle = 'color:#999; opacity:0.7;';
      // 圆点保持与暂缓站一致的默认样式，仅文字压暗
    }
    if (txt) dockTag = `<span class="x-tag" style="background:${isDirMatch ? '#1e90ff' : '#444'}; padding:2px 5px; font-size:11px; border-radius:3px; color:#fff;">${txt}</span>`;
  }
  // 大站停靠标签：常驻显示，只要站点设置了expressStop就显示
  if (st.expressStop !== false) {
    expressStopTag = `<span class="x-tag" style="background:#ffa502; padding:2px 5px; font-size:11px; border-radius:3px; color:#fff;">大站停靠</span>`;
  }
  
  // 计算标签数量：换乘站、暂缓、进上下行停靠、大站停靠
  if (mode === 'loop') {
    const parsedName = parseColorMarkup(st.name);
    const parsedEn = parseColorMarkup(st.en);
    // 环线模式：换乘标签也需要根据数量和文字长度智能排列
    let xferHTMLFormatted = '';
    if (st.xfer && st.xfer.length > 0) {
      const fontSize = 10;
      const padding = '1px 4px';
      const borderRadius = 3;
      const maxLengthPerRow = 4; // 超过4个字单独一行
      const xferTags = [];
      st.xfer.forEach((x) => {
        let tagHTML = '';
        let textLength = x.line.length;
        if (x.suspended) {
          tagHTML = `<span class="x-tag suspended" style="background:#ccc; color:#666; border:1px solid #999; font-size:${fontSize}px; padding:${padding}; border-radius:${borderRadius}px; display:inline-flex; align-items:center; gap:2px; margin:1px;">${x.line}<span class="sub" style="font-size:8px; background:#999; color:#fff; padding:0 2px; border-radius:2px; margin-left:2px;">暂缓</span></span>`;
          textLength += 2; // 加上"暂缓"2个字
        } else {
          tagHTML = `<span class="x-tag" style="background:${x.color}; font-size:${fontSize}px; padding:${padding}; border-radius:${borderRadius}px; margin:1px; color:#fff;">${x.line}</span>`;
        }
        xferTags.push({ html: tagHTML, length: textLength });
      });
      
      // 按照每行2个标签分组，但如果标签字数过多则单独一行
      if (xferTags.length > 0) {
        const rows = [];
        let i = 0;
        while (i < xferTags.length) {
          const currentTag = xferTags[i];
          
          // 如果当前标签字数过多，单独一行
          if (currentTag.length > maxLengthPerRow) {
            rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:140px; overflow:hidden;">${currentTag.html}</div>`);
            i++;
          } else if (i + 1 < xferTags.length) {
            // 检查下一个标签
            const nextTag = xferTags[i + 1];
            // 如果下一个标签字数过多，当前标签单独一行
            if (nextTag.length > maxLengthPerRow) {
              rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:140px; overflow:hidden;">${currentTag.html}</div>`);
              i++;
            } else {
              // 两个标签都可以放在一行
              rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:140px; overflow:hidden;">${currentTag.html}${nextTag.html}</div>`);
              i += 2;
            }
          } else {
            // 最后一个标签，单独一行
            rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:140px; overflow:hidden;">${currentTag.html}</div>`);
            i++;
          }
        }
        xferHTMLFormatted = rows.join('');
      }
    }
    // 默认顺序：名字在前，换乘标签在后（在drawRing中会根据上下半环调整）
    node.innerHTML = `<div class="dot"${dotStyle}></div><div class="n-txt"><div style="${nameStyle}">${parsedName}</div><div class="en">${parsedEn}</div>${deferTag}${dockTag}${expressStopTag}<div class="x-box">${xferHTMLFormatted}</div></div>`;
  } else {
    // 线性模式：标签按偶数左右排布（每行2个）
    // 首先收集所有标签的文本信息，用于计算动态样式
    const tagInfos = [];
    
    // 收集换乘标签信息
    if (st.xfer && st.xfer.length > 0) {
      st.xfer.forEach((x) => {
        if (x.suspended) {
          // 暂缓的换乘标签，只计算换乘线路名的长度，"暂缓"是子标签
          tagInfos.push({ text: x.line, type: 'xfer-suspended', bgColor: '#ccc', textColor: '#666', hasSub: true });
        } else {
          tagInfos.push({ text: x.line, type: 'xfer', bgColor: x.color, textColor: '#fff', hasSub: false });
        }
      });
    }
    
    // 收集进上下行停靠标签信息
    if (limitedDock) {
      const txt = st.dock === 'up' ? '仅上行' : (st.dock === 'down' ? '仅下行' : '');
      if (txt) {
        tagInfos.push({ text: txt, type: 'dock', bgColor: isDirMatch ? '#1e90ff' : '#444', textColor: '#fff', hasSub: false });
      }
    }
    
    // 收集大站停靠标签信息
    if (st.expressStop !== false) {
      tagInfos.push({ text: '大站停靠', type: 'express', bgColor: '#ffa502', textColor: '#fff', hasSub: false });
    }
    
    // 收集暂缓标签信息
    if (deferTag) {
      tagInfos.push({ text: '暂缓', type: 'defer', bgColor: '#95a5a6', textColor: '#fff', hasSub: false });
    }
    
    // 固定样式设置
    const fontSize = 12;
    const padding = '2px 6px';
    const borderRadius = 3;
    const maxLengthPerRow = 4; // 超过4个字单独一行
    
    // 生成标签HTML和字数信息
    const tags = [];
    tagInfos.forEach(info => {
      // 计算标签字数（暂缓标签如果有子标签，需要加上"暂缓"2个字）
      let textLength = info.text.length;
      if (info.type === 'xfer-suspended' && info.hasSub) {
        textLength += 2; // 加上"暂缓"2个字
      }
      
      let tagHTML = '';
      if (info.type === 'xfer-suspended' && info.hasSub) {
        // 暂缓的换乘标签
        const subFontSize = Math.max(7, fontSize - 2);
        tagHTML = `<span class="x-tag suspended" style="background:${info.bgColor}; color:${info.textColor}; border:1px solid #999; font-size:${fontSize}px; padding:${padding}; border-radius:${borderRadius}px; display:flex; align-items:center; gap:2px; box-shadow:0 2px 4px rgba(0,0,0,0.2) !important;">${info.text}<span class="sub" style="font-size:${subFontSize}px; background:#999; color:#fff; padding:0 2px; border-radius:2px; margin-left:2px;">暂缓</span></span>`;
      } else if (info.type === 'defer') {
        // 暂缓标签
        tagHTML = `<span class="defer" style="font-size:${fontSize}px; padding:${padding}; border-radius:${borderRadius}px; background:${info.bgColor}; color:${info.textColor}; font-weight:bold; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${info.text}</span>`;
      } else {
        // 其他标签
        tagHTML = `<span class="x-tag" style="background:${info.bgColor}; color:${info.textColor}; font-size:${fontSize}px; padding:${padding}; border-radius:${borderRadius}px; font-weight:bold; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${info.text}</span>`;
      }
      
      tags.push({ html: tagHTML, length: textLength });
    });
    
    // 按照每行2个标签分组，但如果标签字数过多则单独一行
    let tagsContent = '';
    if (tags.length > 0) {
      const rows = [];
      let i = 0;
      while (i < tags.length) {
        const currentTag = tags[i];
        
        // 如果当前标签字数过多，单独一行
        if (currentTag.length > maxLengthPerRow) {
          rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:110px; overflow:hidden;">${currentTag.html}</div>`);
          i++;
        } else if (i + 1 < tags.length) {
          // 检查下一个标签
          const nextTag = tags[i + 1];
          // 如果下一个标签字数过多，当前标签单独一行
          if (nextTag.length > maxLengthPerRow) {
            rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:110px; overflow:hidden;">${currentTag.html}</div>`);
            i++;
          } else {
            // 两个标签都可以放在一行
            rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:110px; overflow:hidden;">${currentTag.html}${nextTag.html}</div>`);
            i += 2;
          }
        } else {
          // 最后一个标签，单独一行
          rows.push(`<div style="display:flex; gap:3px; justify-content:center; width:100%; max-width:110px; overflow:hidden;">${currentTag.html}</div>`);
          i++;
        }
      }
      tagsContent = rows.join('');
    }
    
    const parsedName = parseColorMarkup(st.name);
    const parsedEn = parseColorMarkup(st.en);
    node.innerHTML = `
      <div class="info-top">${tagsContent}</div>
      <div class="dot"${dotStyle}></div>
      <div class="info-btm">
        <div class="name" style="${nameStyle}">${parsedName}</div>
        <div class="en">${parsedEn}</div>
      </div>
    `;
  }
  return node;
}

// 检测运行环境
function detectEnvironment() {
  try {
    // 检测 Electron 环境 - 多种方式检测
    if (typeof window !== 'undefined') {
      // 方式1: 检查 window.process
      if (window.process && window.process.type) {
        return 'Electron';
      }
      // 方式2: 检查 window.electronAPI (如果有 preload 脚本暴露)
      if (window.electronAPI) {
        return 'Electron';
      }
      // 方式3: 检查 window.require (Electron 中可能可用)
      if (typeof window.require === 'function') {
        try {
          const { app } = window.require('electron');
          if (app) return 'Electron';
        } catch (e) {
          // require 存在但无法加载 electron，可能是 Node.js 环境但不是 Electron
        }
      }
      // 方式4: 检测用户代理
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('electron')) {
          return 'Electron';
        }
      }
    }
    return 'Browser';
  } catch (e) {
    return 'Browser';
  }
}

// 获取版本号
function getAppVersion() {
  try {
    // 尝试从 window 对象获取版本号（如果 Electron 提供了的话）
    if (typeof window !== 'undefined' && window.APP_VERSION) {
      return window.APP_VERSION;
    }
    // 尝试从 package.json 或者 meta 标签获取
    if (typeof document !== 'undefined') {
      const metaVersion = document.querySelector('meta[name="app-version"]');
      if (metaVersion) {
        return metaVersion.content;
      }
    }
    // 默认版本号（可以从 package.json 读取，但这里先写死，后续可以通过构建脚本注入）
    return '1.3.9';
  } catch (e) {
    return '1.3.9';
  }
}

// 创建警告提示
function createWarningMessage(root) {
  const warning = document.createElement('div');
  warning.id = 'display-warning';
  warning.innerHTML = `
    <div class="warning-icon">⚠️</div>
    <div class="warning-text">软件UI显示异常，请重启软件</div>
  `;
  
  const container = root || document.body;
  if (container) {
    container.appendChild(warning);
  }
  
  return warning;
}

// 创建水印
function createWatermark(root) {
  const watermark = document.createElement('div');
  watermark.id = 'watermark';
  
  const env = detectEnvironment();
  const version = getAppVersion();
  
  // 获取物理分辨率
  // window.screen.width 返回的是逻辑像素（受缩放影响），需要乘以 devicePixelRatio 得到物理分辨率
  const logicalWidth = window.screen.width || window.innerWidth;
  const logicalHeight = window.screen.height || window.innerHeight;
  const scaleFactor = window.devicePixelRatio || 1.0;
  const physicalWidth = Math.round(logicalWidth * scaleFactor);
  const physicalHeight = Math.round(logicalHeight * scaleFactor);
  const resolution = `${physicalWidth} × ${physicalHeight}`;
  
  // 获取缩放比例
  const scalePercent = Math.round(scaleFactor * 100);
  
  watermark.innerHTML = `
    <div>环境: ${env === 'Electron' ? 'Electron' : '浏览器'}</div>
    <div>版本: v${version}</div>
    <div>分辨率: ${resolution}</div>
    <div>缩放: ${scalePercent}%</div>
  `;
  
  // 如果根元素存在，添加到根元素，否则添加到 body
  const container = root || document.body;
  if (container) {
    container.appendChild(watermark);
  }
  
  return watermark;
}

export function initDisplayWindow(rootElement) {
  const root = rootElement || document.getElementById('display-app');
  if (!root) return () => {};
  injectDisplayStyles();
  
  // 创建水印
  createWatermark(root);
  
  // 创建警告提示
  const warningElement = createWarningMessage(root);
  
  // 存储初始分辨率和缩放比例
  let initialScreenWidth = window.screen.width;
  let initialScreenHeight = window.screen.height;
  let initialDevicePixelRatio = window.devicePixelRatio || 1.0;
  
  // 检查并显示警告的函数
  const checkAndShowWarning = () => {
    const currentScreenWidth = window.screen.width;
    const currentScreenHeight = window.screen.height;
    const currentDevicePixelRatio = window.devicePixelRatio || 1.0;
    
    // 检查分辨率是否变化
    const resolutionChanged = (currentScreenWidth !== initialScreenWidth || currentScreenHeight !== initialScreenHeight);
    
    // 检查缩放比例是否变化
    const scaleChanged = Math.abs(currentDevicePixelRatio - initialDevicePixelRatio) > 0.01;
    
    // 如果分辨率或缩放变化，显示警告
    if (resolutionChanged || scaleChanged) {
      if (warningElement) {
        warningElement.classList.add('show');
      }
    } else {
      if (warningElement) {
        warningElement.classList.remove('show');
      }
    }
  };
  
  // 初始检查
  checkAndShowWarning();
  
  // 监听窗口大小变化（可能表示分辨率或缩放变化）
  const resizeHandler = () => {
    checkAndShowWarning();
  };
  
  window.addEventListener('resize', resizeHandler);
  
  // 定期检查（因为某些缩放变化可能不会触发resize事件）
  const checkInterval = setInterval(() => {
    checkAndShowWarning();
  }, 1000);
  
  // 清理函数：移除事件监听器和定时器
  const cleanupWarning = () => {
    window.removeEventListener('resize', resizeHandler);
    if (checkInterval) {
      clearInterval(checkInterval);
    }
  };
  
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('metro_pids_v3') : null;
  let appData = null;
  let rt = { idx: 0, state: 0 };
  let arrivalTimer = null;
  let lastArrivalIdx = -1;
  let asViewMode = 0;
  let recorder = null;
  let chunks = [];
  let clockTimer = null;

  const fitScreen = () => {
    const scaler = root.querySelector('#scaler');
    if (!scaler) return;
    
    // 使用多种方式获取窗口尺寸，确保准确性
    // 优先使用视口单位计算，因为它最准确反映实际可用空间
    const visualWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    const visualHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    
    // 计算缩放比例
    // 由于窗口逻辑尺寸固定为1900×600，visualWidth和visualHeight应该也是1900×600
    // 使用Math.max确保内容能够覆盖整个窗口，消除黑边
    const scaleX = visualWidth / SCALER_W;
    const scaleY = visualHeight / SCALER_H;
    const scale = Math.max(scaleX, scaleY);
    
    // 应用缩放，使用transform-origin确保从中心缩放
    scaler.style.transform = `scale(${scale})`;
    scaler.style.transformOrigin = 'center center';
    
    // 确保scaler容器居中并填满整个窗口（消除黑边）
    const displayApp = root;
    if (displayApp) {
      displayApp.style.display = 'flex';
      displayApp.style.justifyContent = 'center';
      displayApp.style.alignItems = 'center';
      displayApp.style.width = '100vw';
      displayApp.style.height = '100vh';
      displayApp.style.overflow = 'hidden';
      displayApp.style.margin = '0';
      displayApp.style.padding = '0';
      displayApp.style.position = 'fixed';
      displayApp.style.top = '0';
      displayApp.style.left = '0';
      displayApp.style.right = '0';
      displayApp.style.bottom = '0';
    }
    
    // 确保body和html也填满窗口
    if (document.body) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100vw';
      document.body.style.height = '100vh';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = '0';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.bottom = '0';
    }
    if (document.documentElement) {
      document.documentElement.style.margin = '0';
      document.documentElement.style.padding = '0';
      document.documentElement.style.width = '100vw';
      document.documentElement.style.height = '100vh';
      document.documentElement.style.overflow = 'hidden';
    }
  };

  const updateClock = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const dEl = root.querySelector('#date');
    const tEl = root.querySelector('#time');
    if (dEl) dEl.innerText = `${y}-${m}-${d}`;
    if (tEl) tEl.innerText = `${hh}:${mm}`;
  };

  const handleKeyDown = (e) => {
    const targetTag = e.target && e.target.tagName;
    if (targetTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;
    if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    const ignore = new Set(['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock','NumLock','ScrollLock','ContextMenu']);
    if (ignore.has(e.code)) return;
    try {
      const normCode = normalizeKeyNameGlobal(e.code || e.key);
      const normKey = normalizeKeyNameGlobal(e.key || e.code || null);
      if (bc) {
        bc.postMessage({ t: 'CMD_KEY', code: e.code, key: e.key, normCode, normKey });
      }
    } catch (err) {
      // 忽略异常
    }
  };

  const locate = (selector) => root.querySelector(selector);
  const locateId = (id) => root.querySelector(`#${id}`);

  const cleanupArrivalTimer = () => {
    if (arrivalTimer) {
      clearInterval(arrivalTimer);
      arrivalTimer = null;
    }
  };

  const renderDisp = () => {
    if (!appData || !appData.stations || !appData.stations.length) return;
    const meta = appData.meta || {};
    const themeColor = meta.themeColor || '#00b894';
    root.style.setProperty('--theme', themeColor);
    root.style.setProperty('--contrast-color', getContrastColor(themeColor));
    // 根据主题颜色决定箭头闪烁颜色的“反色”逻辑：
    // - 如果背景颜色接近红色，则使用黄色箭头
    // - 如果背景颜色接近黄色，则使用红色箭头
    // - 其他颜色默认使用黄色箭头
    const yellowColor = '#f1c40f';
    const redColor = '#e74c3c';
    let arrowBlinkColor = yellowColor;
    try {
      const m = /^#?([0-9a-f]{6})$/i.exec(themeColor);
      if (m) {
        const intVal = parseInt(m[1], 16);
        const r = (intVal >> 16) & 0xff;
        const g = (intVal >> 8) & 0xff;
        const b = intVal & 0xff;
        // 参考目标颜色的 RGB
        const redRef = { r: 0xe7, g: 0x4c, b: 0x3c };     // #e74c3c
        const yellowRef = { r: 0xf1, g: 0xc4, b: 0x0f };  // #f1c40f
        const dist = (c1, c2) => {
          const dr = c1.r - c2.r;
          const dg = c1.g - c2.g;
          const db = c1.b - c2.b;
          return Math.sqrt(dr * dr + dg * dg + db * db);
        };
        const distToRed = dist({ r, g, b }, redRef);
        const distToYellow = dist({ r, g, b }, yellowRef);
        // 阈值 ~100：大致表示“颜色比较接近”
        if (distToRed < 100) {
          // 背景接近红色 → 箭头用黄色
          arrowBlinkColor = yellowColor;
        } else if (distToYellow < 100) {
          // 背景接近黄色 → 箭头用红色
          arrowBlinkColor = redColor;
        } else {
          arrowBlinkColor = yellowColor;
        }
      }
    } catch (e) {
      arrowBlinkColor = yellowColor;
    }
    root.style.setProperty('--arrow-blink-accent-color', arrowBlinkColor);
    const sts = appData.stations;
    const mapDiv = locateId('d-map');
    const arrivalScreen = locateId('arrival-screen');
    const header = locate('.header');
    renderNormalScreen(sts, meta);
    if (rt.state === 0) {
      if (rt.idx !== lastArrivalIdx) {
        lastArrivalIdx = rt.idx;
        asViewMode = 0;
        cleanupArrivalTimer();
        arrivalTimer = setInterval(() => {
          asViewMode = (asViewMode + 1) % 2;
          renderArrivalScreen(sts, meta);
        }, 5000);
      } else if (!arrivalTimer) {
        arrivalTimer = setInterval(() => {
          asViewMode = (asViewMode + 1) % 2;
          renderArrivalScreen(sts, meta);
        }, 5000);
      }
      if (mapDiv) mapDiv.style.display = 'none';
      if (header) header.style.display = 'flex';
      if (arrivalScreen) {
        arrivalScreen.style.display = 'flex';
        renderArrivalScreen(sts, meta);
      }
    } else {
      cleanupArrivalTimer();
      lastArrivalIdx = -1;
      if (mapDiv) mapDiv.style.display = 'flex';
      if (header) header.style.display = 'flex';
      if (arrivalScreen) arrivalScreen.style.display = 'none';
    }
  };

  const renderNormalScreen = (sts, meta) => {
    const lineEl = locateId('d-line-no');
    if (lineEl) {
      const lineName = meta.lineName || '--';
      const parsedLineName = parseColorMarkup(lineName);
      
      // 移除颜色标记来计算纯文本长度（用于判断是否超过5个字）
      const textOnly = lineName.replace(/<[^>]+>([^<]*)<\/>/g, '$1');
      
      // 创建滚动容器
      lineEl.innerHTML = '';
      const lineBox = document.createElement('div');
      lineBox.className = 'marquee-box';
      lineBox.style.fontSize = '36px';
      lineBox.style.fontWeight = '900';
      lineBox.style.color = 'var(--contrast-color)';
      lineBox.style.lineHeight = '1';
      lineBox.style.width = '100%';
      lineBox.style.maxWidth = '100%';
      
      const lineContent = document.createElement('span');
      lineContent.className = 'marquee-content';
      lineContent.innerHTML = parsedLineName;
      lineBox.appendChild(lineContent);
      lineEl.appendChild(lineBox);
      
      // 检查是否需要滚动：超过5个字就开始滚动
      setTimeout(() => {
        if (textOnly.length > 5 || lineContent.offsetWidth > lineBox.offsetWidth) {
          const w = lineContent.offsetWidth;
          lineContent.innerHTML = `${parsedLineName}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedLineName}`;
          lineContent.classList.add('scrolling');
          let dur = (w + 50) / 50;
          if (dur < 3) dur = 3;
          lineContent.style.animationDuration = `${dur}s`;
        }
      }, 0);
    }
    const termBox = locate('.h-term');
    const nextLbl = locate('.h-next .lbl');
    if (!termBox) return;
    termBox.innerHTML = '';
    const createScrollBlock = (st) => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      wrapper.style.minWidth = '140px';
      wrapper.style.maxWidth = '260px';
      const nameBox = document.createElement('div');
      nameBox.className = 'marquee-box';
      nameBox.style.fontSize = '32px';
      nameBox.style.fontWeight = '900';
      nameBox.style.color = 'var(--contrast-color)';
      nameBox.style.lineHeight = '1';
      const nameContent = document.createElement('span');
      nameContent.className = 'marquee-content';
      const parsedName = parseColorMarkup(st.name);
      const parsedEn = parseColorMarkup(st.en);
      nameContent.innerHTML = parsedName;
      nameBox.appendChild(nameContent);
      const enBox = document.createElement('div');
      enBox.className = 'marquee-box';
      enBox.style.fontSize = '14px';
      enBox.style.color = 'var(--contrast-color)';
      enBox.style.opacity = '0.8';
      enBox.style.fontWeight = 'bold';
      const enContent = document.createElement('span');
      enContent.className = 'marquee-content';
      enContent.innerHTML = parsedEn;
      enBox.appendChild(enContent);
      wrapper.appendChild(nameBox);
      wrapper.appendChild(enBox);
      setTimeout(() => {
        if (nameContent.offsetWidth > nameBox.offsetWidth) {
          const w = nameContent.offsetWidth;
          nameContent.innerHTML = `${parsedName}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedName}`;
          nameContent.classList.add('scrolling');
          let dur = (w + 50) / 50;
          if (dur < 3) dur = 3;
          nameContent.style.animationDuration = `${dur}s`;
        }
        if (enContent.offsetWidth > enBox.offsetWidth) {
          const w = enContent.offsetWidth;
          enContent.innerHTML = `${parsedEn}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedEn}`;
          enContent.classList.add('scrolling');
          let dur = (w + 50) / 40;
          if (dur < 3) dur = 3;
          enContent.style.animationDuration = `${dur}s`;
        }
      }, 0);
      return wrapper;
    };
    termBox.innerHTML = '';
    if (meta.mode === 'loop') {
      const dirMap = { outer: '外环运行', inner: '内环运行' };
      const iconClass = meta.dirType === 'outer' ? 'fas fa-undo' : 'fas fa-redo';
      const anim = meta.dirType === 'outer' ? 'spin-outer 3s linear infinite' : 'spin-inner 3s linear infinite';
      termBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; height:100%;">
          <div style="width: 54px; height: 54px; background: var(--contrast-color); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); flex-shrink: 0;">
            <i class="${iconClass}" style="font-size: 38px; color: var(--theme); animation: ${anim};"></i>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-start; justify-content:center;">
            <div style="font-size:36px; font-weight:900; color:var(--contrast-color); line-height:1.1;">${dirMap[meta.dirType] || '--'}</div>
            <div style="font-size:14px; font-weight:bold; color:var(--contrast-color); opacity:0.8;">${meta.dirType ? meta.dirType.toUpperCase() + ' LOOP' : '--'}</div>
          </div>
        </div>
      `;
    } else {
      const getFirst = () => {
        for (let i = 0; i < sts.length; i++) if (!sts[i].skip) return sts[i];
        return sts[0];
      };
      const getLast = () => {
        for (let i = sts.length - 1; i >= 0; i--) if (!sts[i].skip) return sts[i];
        return sts[sts.length - 1];
      };
      let startSt = getFirst();
      let termSt = getLast();
      if (meta.startIdx !== undefined && meta.startIdx !== -1) {
        const s = sts[meta.startIdx];
        if (s) startSt = s;
      }
      if (meta.termIdx !== undefined && meta.termIdx !== -1) {
        const t = sts[meta.termIdx];
        if (t) termSt = t;
      }
      let arrowHTML = '';
      //右侧顶部三角
      if (meta.dirType === 'up' || meta.dirType === 'outer') {
        arrowHTML = `
          <i class="fas fa-chevron-right a1" style="animation-delay:0s;"></i>
          <i class="fas fa-chevron-right a2" style="animation-delay:0.25s;"></i>
          <i class="fas fa-chevron-right a3" style="animation-delay:0.5s;"></i>
        `;
      } else {
        // 左向箭头需动画从右到左，故将延时反转（a3 最先）
        arrowHTML = `
          <i class="fas fa-chevron-left a1" style="animation-delay:0.5s;"></i>
          <i class="fas fa-chevron-left a2" style="animation-delay:0.25s;"></i>
          <i class="fas fa-chevron-left a3" style="animation-delay:0s;"></i>
        `;
      }
      termBox.appendChild(createScrollBlock(startSt));
      const arrows = document.createElement('div');
      arrows.className = 'route-arrows';
      arrows.innerHTML = arrowHTML;
      termBox.appendChild(arrows);
      termBox.appendChild(createScrollBlock(termSt));
    }
    let targetSt;
    let isArriving = (rt.state === 0);
    let isAtTerm = false;
    if (meta.mode !== 'loop') {
      let checkNext;
      if (meta.mode === 'loop') {
        checkNext = meta.dirType === 'outer' ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
      } else {
        checkNext = (meta.dirType === 'up' || meta.dirType === 'outer') ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
      }
      if (checkNext === rt.idx && !isArriving) {
        isAtTerm = true;
      }
    }
    if (isArriving) {
      targetSt = sts[rt.idx];
      if (nextLbl) nextLbl.innerHTML = '到达站:<br><span class="en">Arriving Station:</span>';
    } else {
      let nextIdx;
      if (meta.mode === 'loop') {
        nextIdx = (meta.dirType === 'outer') ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
      } else {
        nextIdx = (meta.dirType === 'up') ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
      }
      if (nextIdx === rt.idx) {
        targetSt = sts[rt.idx];
        if (nextLbl) nextLbl.innerHTML = '终点站:<br><span class="en">Terminal Station:</span>';
      } else {
        targetSt = sts[nextIdx];
        if (nextLbl) nextLbl.innerHTML = '下一站:<br><span class="en">Next Station:</span>';
      }
    }
    const nextStBox = locateId('d-next-st');
    if (!nextStBox || !targetSt) return;
    nextStBox.innerHTML = '';
    const nWrapper = document.createElement('div');
    nWrapper.className = 'marquee-box';
    nWrapper.style.width = '100%';
    nWrapper.style.display = 'flex';
    nWrapper.style.flexDirection = 'column';
    nWrapper.style.alignItems = 'flex-end';
    const nNameBox = document.createElement('div');
    nNameBox.className = 'marquee-box';
    nNameBox.style.maxWidth = '100%';
    nNameBox.style.height = '40px';
    const nNameContent = document.createElement('span');
    nNameContent.className = 'marquee-content';
    nNameContent.style.fontSize = '36px';
    nNameContent.style.fontWeight = '900';
    nNameContent.style.lineHeight = '1.1';
    const parsedTargetName = parseColorMarkup(targetSt.name);
    const parsedTargetEn = parseColorMarkup(targetSt.en);
    nNameContent.innerHTML = parsedTargetName;
    nNameBox.appendChild(nNameContent);
    const nEnBox = document.createElement('div');
    nEnBox.className = 'marquee-box';
    nEnBox.style.maxWidth = '100%';
    nEnBox.style.fontSize = '16px';
    nEnBox.style.fontWeight = 'bold';
    nEnBox.style.color = '#666';
    const nEnContent = document.createElement('span');
    nEnContent.className = 'marquee-content';
    nEnContent.innerHTML = parsedTargetEn;
    nEnBox.appendChild(nEnContent);
    nWrapper.appendChild(nNameBox);
    nWrapper.appendChild(nEnBox);
    nextStBox.appendChild(nWrapper);
    setTimeout(() => {
      if (nNameContent.offsetWidth > nNameBox.offsetWidth) {
        const w = nNameContent.offsetWidth;
        nNameContent.innerHTML = `${parsedTargetName}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedTargetName}`;
        nNameContent.classList.add('scrolling');
        let dur = (w + 50) / 50;
        if (dur < 3) dur = 3;
        nNameContent.style.animationDuration = `${dur}s`;
      }
      if (nEnContent.offsetWidth > nEnBox.offsetWidth) {
        const w = nEnContent.offsetWidth;
        nEnContent.innerHTML = `${parsedTargetEn}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedTargetEn}`;
        nEnContent.classList.add('scrolling');
        let dur = (w + 50) / 40;
        if (dur < 3) dur = 3;
        nEnContent.style.animationDuration = `${dur}s`;
      }
    }, 0);
    const mapBox = locateId('d-map');
    if (!mapBox) return;
    if (meta.mode === 'linear') drawLinear(mapBox, sts, meta);
    else drawRing(mapBox, sts, meta);
  };

  const renderArrivalScreen = (sts, meta) => {
    const st = sts[rt.idx];
    if (!st) return;
    
    // 更新顶栏中间的到达站显示
    const nextLbl = locate('.h-next .lbl');
    const nextStBox = locateId('d-next-st');
    if (nextLbl && nextStBox) {
      let isTerminal = false;
      // 检查是否是终点站
      if (meta.mode !== 'loop') {
        let nextIdx;
        if (meta.dirType === 'up' || meta.dirType === 'outer') {
          nextIdx = getNextValidSt(rt.idx, 1, appData);
        } else {
          nextIdx = getNextValidSt(rt.idx, -1, appData);
        }
        if (nextIdx === rt.idx) {
          isTerminal = true;
        }
      }
      
      if (isTerminal) {
        nextLbl.innerHTML = '终点站:<br><span class="en">Terminal Station:</span>';
      } else {
        nextLbl.innerHTML = '到达站:<br><span class="en">Arriving Station:</span>';
      }
      
      // 更新站点名称显示
      nextStBox.innerHTML = '';
      const nWrapper = document.createElement('div');
      nWrapper.className = 'marquee-box';
      nWrapper.style.width = '100%';
      nWrapper.style.display = 'flex';
      nWrapper.style.flexDirection = 'column';
      nWrapper.style.alignItems = 'flex-end';
      const nNameBox = document.createElement('div');
      nNameBox.className = 'marquee-box';
      nNameBox.style.fontSize = '36px';
      nNameBox.style.fontWeight = '900';
      nNameBox.style.color = '#000';
      nNameBox.style.lineHeight = '1.1';
      const nNameContent = document.createElement('span');
      nNameContent.className = 'marquee-content';
      const parsedName = parseColorMarkup(st.name);
      nNameContent.innerHTML = parsedName;
      nNameBox.appendChild(nNameContent);
      const nEnBox = document.createElement('div');
      nEnBox.className = 'marquee-box';
      nEnBox.style.fontSize = '16px';
      nEnBox.style.fontWeight = 'bold';
      nEnBox.style.color = '#666';
      nEnBox.style.opacity = '0.9';
      const nEnContent = document.createElement('span');
      nEnContent.className = 'marquee-content';
      const parsedEn = parseColorMarkup(st.en);
      nEnContent.innerHTML = parsedEn;
      nEnBox.appendChild(nEnContent);
      nWrapper.appendChild(nNameBox);
      nWrapper.appendChild(nEnBox);
      nextStBox.appendChild(nWrapper);
      
      // 处理文字过长时的滚动效果
      setTimeout(() => {
        if (nNameContent.offsetWidth > nNameBox.offsetWidth) {
          const w = nNameContent.offsetWidth;
          nNameContent.innerHTML = `${parsedName}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedName}`;
          nNameContent.classList.add('scrolling');
          let dur = (w + 50) / 50;
          if (dur < 3) dur = 3;
          nNameContent.style.animationDuration = `${dur}s`;
        }
        if (nEnContent.offsetWidth > nEnBox.offsetWidth) {
          const w = nEnContent.offsetWidth;
          nEnContent.innerHTML = `${parsedEn}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${parsedEn}`;
          nEnContent.classList.add('scrolling');
          let dur = (w + 50) / 40;
          if (dur < 3) dur = 3;
          nEnContent.style.animationDuration = `${dur}s`;
        }
      }, 0);
    }
    
    const doorCn = locateId('as-door-msg-cn');
    const doorEn = locateId('as-door-msg-en');
    const doorIcon = root.querySelector('.as-door-img i');
    const lArrow = root.querySelector('.l-arrow');
    const rArrow = root.querySelector('.r-arrow');
    if (doorIcon) {
      doorIcon.className = 'fas fa-door-open';
      doorIcon.style.transform = 'none';
    }
    if (lArrow) lArrow.classList.remove('active');
    if (rArrow) rArrow.classList.remove('active');
    // 根据车站 turnback 设置计算有效开门侧
    const invertDoor = (door) => {
      if (!door) return 'left';
      if (door === 'left') return 'right';
      if (door === 'right') return 'left';
      return door; // “双侧”或其他保持原样
    };

    // 优先使用 payload 中的显式有效车门(如 _effectiveDoor)，否则用配置并结合折返动态判断
    let effectiveDoor = (st._effectiveDoor) ? st._effectiveDoor : (st.door || 'left');
    if (!st._effectiveDoor) {
      try {
        const startIdx = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
        const termIdx = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : sts.length - 1;
        const atTerminalForDir = (meta.dirType === 'up' || meta.dirType === 'outer') ? (rt.idx === termIdx) : (rt.idx === startIdx);
        if (st.turnback && st.turnback !== 'none' && atTerminalForDir) {
          effectiveDoor = invertDoor(effectiveDoor);
        }
      } catch (e) {
        // 忽略异常，继续使用配置值
      }
    }

    if (effectiveDoor === 'right') {
      if (doorCn) doorCn.innerText = '右侧开门';
      if (doorEn) doorEn.innerText = 'Doors will be opened on the right side';
      if (doorIcon) doorIcon.style.transform = 'scaleX(-1)';
      if (rArrow) rArrow.classList.add('active');
    } else if (effectiveDoor === 'both') {
      if (doorCn) doorCn.innerText = '双侧开门';
      if (doorEn) doorEn.innerText = 'Doors will be opened on both sides';
      if (doorIcon) doorIcon.className = 'fas fa-dungeon';
      if (lArrow) lArrow.classList.add('active');
      if (rArrow) rArrow.classList.add('active');
    } else {
      if (doorCn) doorCn.innerText = '左侧开门';
      if (doorEn) doorEn.innerText = 'Doors will be opened on this side';
      if (lArrow) lArrow.classList.add('active');
    }
    // 上下行提示
    if (st.dock && st.dock !== 'both') {
      if (st.dock === 'up') {
        if (doorCn) doorCn.innerText += '\n(仅上行停靠)';
        if (doorEn) doorEn.innerText += '\n(Only dock for upbound trains)';
      } else if (st.dock === 'down') {
        if (doorCn) doorCn.innerText += '\n(仅下行停靠)';
        if (doorEn) doorEn.innerText += '\n(Only dock for downbound trains)';
      }
    }
    const mapPanel = root.querySelector('.as-panel-right');
    if (!mapPanel) return;
    mapPanel.innerHTML = '';
    if (asViewMode === 1) {
      mapPanel.style.display = 'flex';
      mapPanel.style.flexDirection = 'column';
      mapPanel.style.justifyContent = 'center';
      mapPanel.style.alignItems = 'center';
      mapPanel.style.padding = '0';
      mapPanel.style.overflowX = 'hidden';
      const len = st.name.length;
      let cnSize = 140;
      if (len === 4) cnSize = 130;
      else if (len >= 5 && len <= 7) cnSize = 130;
      else if (len > 7) cnSize = 70;
      const enSize = Math.max(30, cnSize * 0.5);
      const parsedName = parseColorMarkup(st.name);
      const parsedEn = parseColorMarkup(st.en);
      mapPanel.innerHTML = `
        <div style="font-size: ${cnSize}px; font-weight: 900; color: #000; line-height: 1.2; letter-spacing: 5px; text-align: center;">${parsedName}</div>
        <div style="font-size: ${enSize}px; font-weight: bold; color: #666; font-family: Arial, sans-serif; margin-top: 20px; text-align: center; max-width: 95%; word-wrap: break-word;">${parsedEn}</div>
      `;
      return;
    }
    mapPanel.style.display = 'block';
    mapPanel.style.padding = '0 20px';
    mapPanel.style.overflowX = 'auto';
    mapPanel.style.alignItems = 'center';
    const box = document.createElement('div');
    box.className = 'l-box';
    box.style.minWidth = '100%';
    const track = document.createElement('div');
    track.className = 'track-double';
 
    
    // 如果没有箭头（站点数 <= 1），不显示线路条
    // 注意：这里先创建 track，在后面渲染箭头后再判断是否显示
    box.appendChild(track);
    /* lift the entire track + nodes group up slightly */
    box.style.transform = 'translateY(-22px)';
    const nextStep = (meta.dirType === 'up' || meta.dirType === 'outer') ? 1 : -1;
    const prevStep = -nextStep;
    const getNextRaw = (idx, step) => {
      let next = idx + step;
      const len = sts.length;
      const metaStart = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
      const metaTerm = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : len - 1;
      const minIdx = Math.min(metaStart, metaTerm);
      const maxIdx = Math.max(metaStart, metaTerm);
      if (meta.mode === 'loop') {
        if (next >= len) next = 0;
        if (next < 0) next = len - 1;
        return next;
      }
      if (next > maxIdx || next < minIdx) return idx;
      return next;
    };
    const displaySts = [];
    const curr = rt.idx;
    
    // 根据系统缩放比例和分辨率计算最大显示站点数
    // 获取缩放因子（devicePixelRatio，例如 1.0 = 100%, 1.25 = 125%, 2.0 = 200%, 2.5 = 250%, 3.0 = 300%）
    const scaleFactor = window.devicePixelRatio || 1.0;
    
    // 检测是否为4K或2K分辨率
    // 注意：在Electron中，window.screen.width/height 返回的是逻辑像素，需要考虑缩放
    // 使用 window.screen.width 和 window.screen.height 获取屏幕分辨率
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    
    // 计算物理分辨率
    // 在Electron中，window.screen.width返回的是逻辑像素（受缩放影响）
    // 物理分辨率 = 逻辑像素 × devicePixelRatio
    const physicalWidth = Math.round(screenWidth * scaleFactor);
    const physicalHeight = Math.round(screenHeight * scaleFactor);
    
    // 4K分辨率判断：物理宽度3800-3900，高度2100-2200（覆盖3840×2160等4K分辨率）
    const is4KResolution = physicalWidth >= 3800 && physicalWidth <= 3900 && 
                           physicalHeight >= 2100 && physicalHeight <= 2200;
    
    // 2K分辨率判断：物理宽度2500-2600，高度1400-1500（覆盖2560×1440等2K分辨率）
    const is2KResolution = physicalWidth >= 2500 && physicalWidth <= 2600 && 
                           physicalHeight >= 1400 && physicalHeight <= 1500;
    
    let targetTotal = 7; // 默认7站（100%缩放）
    
    // 4K分辨率特殊处理
    if (is4KResolution) {
      if (scaleFactor >= 3.0) {
        targetTotal = 5; // 4K 300%缩放：最多显示5站
      } else if (scaleFactor >= 2.5) {
        targetTotal = 5; // 4K 250%缩放：最多显示5站
      } else if (scaleFactor >= 2.0) {
        targetTotal = 6; // 4K 200%缩放：最多显示6站
      } else if (scaleFactor >= 1.25) {
        targetTotal = 7; // 4K 125%缩放：最多显示7站
      } else {
        targetTotal = 7; // 4K 100%缩放：最多显示7站
      }
    } else if (is2KResolution) {
      // 2K分辨率特殊处理
      if (scaleFactor >= 1.75) {
        targetTotal = 6; // 2K 175%缩放：最多显示6站
      } else if (scaleFactor >= 1.5) {
        targetTotal = 6; // 2K 150%缩放：最多显示6站
      } else if (scaleFactor >= 1.25) {
        targetTotal = 7; // 2K 125%缩放：最多显示7站
      } else {
        targetTotal = 7; // 2K 100%缩放：最多显示7站
      }
    } else {
      // 非4K/2K分辨率，使用原有逻辑
      if (scaleFactor >= 1.75) {
        targetTotal = 4; // 175%及以上缩放：最多显示4站
      } else if (scaleFactor >= 1.5) {
        targetTotal = 5; // 150%缩放：最多显示5站
      } else if (scaleFactor >= 1.25) {
        targetTotal = 6; // 125%缩放：最多显示6站
      } else {
        targetTotal = 7; // 100%缩放：默认7站
      }
    }
    
    const metaStart = (meta.startIdx !== undefined && meta.startIdx !== -1) ? parseInt(meta.startIdx) : 0;
    const metaTerm = (meta.termIdx !== undefined && meta.termIdx !== -1) ? parseInt(meta.termIdx) : sts.length - 1;
    const minIdx = Math.min(metaStart, metaTerm);
    const maxIdx = Math.max(metaStart, metaTerm);
    const futureSts = [];
    const pastSts = [];
    let temp = curr;
    for (let i = 0; i < 5; i++) {
      const next = getNextRaw(temp, nextStep);
      if (next === temp || next === curr) break;
      if (next < minIdx || next > maxIdx) break;
      futureSts.push(sts[next]);
      temp = next;
    }
    temp = curr;
    const minPast = 2;
    for (let i = 0; i < minPast; i++) {
      const prev = getNextRaw(temp, prevStep);
      if (prev === temp || prev === curr || futureSts.includes(sts[prev])) break;
      if (prev < minIdx || prev > maxIdx) break;
      pastSts.push(sts[prev]);
      temp = prev;
    }
    const neededPast = Math.max(0, targetTotal - 1 - futureSts.length);
    let morePastNeeded = neededPast - pastSts.length;
    temp = pastSts.length > 0 ? sts.indexOf(pastSts[pastSts.length - 1]) : curr;
    for (let i = 0; i < morePastNeeded; i++) {
      const prev = getNextRaw(temp, prevStep);
      if (prev === temp || prev === curr || pastSts.includes(sts[prev]) || futureSts.includes(sts[prev])) break;
      if (prev < minIdx || prev > maxIdx) break;
      pastSts.push(sts[prev]);
      temp = prev;
    }
    let currentTotal = 1 + futureSts.length + pastSts.length;
    if (currentTotal < targetTotal) {
      const neededFuture = targetTotal - currentTotal;
      let lastFutureIdx = sts.indexOf(futureSts.length > 0 ? futureSts[futureSts.length - 1] : sts[curr]);
      temp = lastFutureIdx;
      for (let i = 0; i < neededFuture; i++) {
        const next = getNextRaw(temp, nextStep);
        if (next === temp || next === curr || futureSts.includes(sts[next]) || pastSts.includes(sts[next])) break;
        if (next < minIdx || next > maxIdx) break;
        futureSts.push(sts[next]);
        temp = next;
      }
    }
    currentTotal = 1 + pastSts.length + futureSts.length;
    if (currentTotal > targetTotal) {
      let overflow = currentTotal - targetTotal;
      while (overflow > 0 && futureSts.length > 0) {
        futureSts.pop();
        overflow--;
      }
      while (overflow > 0 && pastSts.length > minPast) {
        pastSts.pop();
        overflow--;
      }
    }
    pastSts.reverse();
    displaySts.push(...pastSts, sts[curr], ...futureSts);
    const isReversed = (meta.dirType === 'down' || meta.dirType === 'inner');
    if (isReversed) displaySts.reverse();
    
    // 计算总站点数量（在有效范围内）
    const total = maxIdx - minIdx + 1;
    const MAX_POSITIONS = 7;
    const nodeWidth = 160; // 到达站页面站点宽度
    let positionMap = null; // 站点索引到位置的映射
    
    // 如果开启缩放，检查实际站点数是否小于缩放限制的站点数
    // 使用较小的值来决定是否使用特殊处理逻辑
    const effectiveMaxPositions = Math.min(MAX_POSITIONS, targetTotal);
    
    // 如果站点数量少于或等于effectiveMaxPositions，创建位置映射，将末站放到指定位置
    if (total <= effectiveMaxPositions) {
      // 根据effectiveMaxPositions计算终点站位置（位置索引 = effectiveMaxPositions - 1）
      const endPosition = effectiveMaxPositions - 1; // 终点站的位置索引
      
      // 创建位置映射：将站点均匀分布，起点站在位置0，终点站在指定位置
      // 使用更精确的浮点数计算，确保站点均匀分布
      positionMap = new Map();
      for (let i = minIdx; i <= maxIdx; i++) {
        const relativeIdx = i - minIdx; // 相对于minIdx的索引
        if (relativeIdx === 0) {
          // 第一个站点在位置 0
          positionMap.set(i, 0);
        } else if (i === maxIdx) {
          // 最后一个站点（终点站）在指定位置
          positionMap.set(i, endPosition);
        } else {
          // 其余站点均匀分布：使用精确计算，避免四舍五入导致的分布不均
          // 使用浮点数计算，最后再四舍五入，确保分布更均匀
          const position = (relativeIdx / (total - 1)) * endPosition;
          positionMap.set(i, Math.round(position));
        }
      }
    }
    
    track.style.border = 'none';
    track.style.height = '18px';
    
    // 如果站点数量少于或等于effectiveMaxPositions，使用绝对定位
    if (total <= effectiveMaxPositions && positionMap) {
      box.style.position = 'relative';
      box.style.width = '100%';
      box.style.height = '100%';
      
      // 计算track的实际宽度：需要包含终点站的中心位置
      const endPositionIndex = effectiveMaxPositions - 1; // 终点站位置索引（最大位置索引）
      const trackWidth = endPositionIndex * nodeWidth + nodeWidth / 2;
      track.style.width = trackWidth + 'px';
      
      // 计算站点中心位置的辅助函数
      const getStationCenter = (stationIdx, posIndex) => {
        // 如果是第一个站点（minIdx），左对齐，中心在 nodeWidth/2
        if (stationIdx === minIdx) {
          return nodeWidth / 2;
        }
        // 如果是最后一个站点（maxIdx），左对齐，中心在 posIndex * 160 + nodeWidth/2
        if (stationIdx === maxIdx) {
          return posIndex * nodeWidth + nodeWidth / 2;
        }
        // 中间站点，中心对齐，中心在 posIndex * 160
        return posIndex * nodeWidth;
      };
      
      // 计算实际显示的站点数量，确保站点均匀分布
      const displayStsCount = displaySts.length;
      
      // 计算可用宽度：从起点站中心到终点站中心
      const startCenter = nodeWidth / 2; // 起点站中心位置
      const endCenter = trackWidth - nodeWidth / 2; // 终点站中心位置
      const availableWidth = endCenter - startCenter; // 可用宽度
      
      // 计算每个站点之间的间距（如果只有一个站点，间距为0）
      const spacing = displayStsCount > 1 ? availableWidth / (displayStsCount - 1) : 0;
      
      displaySts.forEach((stNode, displayIdx) => {
        const realIdx = sts.indexOf(stNode);
        const node = mkNode(stNode, realIdx, 'linear', appData, rt);
        node.dataset.realIdx = String(realIdx);
        
        // 设置绝对定位
        node.style.position = 'absolute';
        
        // 根据显示索引均匀分布站点
        if (displayIdx === 0) {
          // 第一个显示的站点（起点站）：左对齐，位置 0
          node.style.left = '0px';
          node.style.transform = 'none';
        } else if (displayIdx === displayStsCount - 1) {
          // 最后一个显示的站点（终点站）：使用位置映射确保在正确位置
          const position = positionMap.get(realIdx);
          if (position !== undefined) {
            node.style.left = (position * nodeWidth) + 'px';
            node.style.transform = 'none'; // 使用左对齐
          }
        } else {
          // 中间站点：均匀分布
          const centerX = startCenter + (displayIdx * spacing);
          node.style.left = centerX + 'px';
          node.style.transform = 'translateX(-50%)'; // 中心对齐
        }
        
        if (realIdx === rt.idx) {
          const dot = node.querySelector('.dot');
          if (dot) {
            dot.style.background = '#f1c40f';
            dot.style.borderColor = '#fff';
            dot.style.boxShadow = '0 0 10px #f1c40f';
            dot.style.animation = 'pulse-yellow 2s infinite';
          }
          const name = node.querySelector('.name');
          if (name) name.style.color = '#000';
        }
        box.appendChild(node);
      });
      
      // 计算渐变位置
      const travelTerminalIdx = (meta.dirType === 'up' || meta.dirType === 'outer') ? maxIdx : minIdx;
      
      // 找到当前站点和终点站在 displaySts 中的索引
      const currDisplayIdx = displaySts.findIndex(st => sts.indexOf(st) === rt.idx);
      const termDisplayIdx = displaySts.findIndex(st => sts.indexOf(st) === travelTerminalIdx);
      
      let currCenter, termCenter;
      
      if (currDisplayIdx >= 0) {
        if (currDisplayIdx === 0) {
          currCenter = nodeWidth / 2; // 起点站
        } else if (currDisplayIdx === displayStsCount - 1) {
          const currPos = positionMap.get(rt.idx);
          if (currPos !== undefined) {
            currCenter = currPos * nodeWidth + nodeWidth / 2; // 终点站
          } else {
            currCenter = trackWidth - nodeWidth / 2;
          }
        } else {
          currCenter = startCenter + (currDisplayIdx * spacing); // 中间站点
        }
      } else {
        currCenter = trackWidth / 2; // 默认居中
      }
      
      if (termDisplayIdx >= 0) {
        if (termDisplayIdx === 0) {
          termCenter = nodeWidth / 2; // 起点站
        } else if (termDisplayIdx === displayStsCount - 1) {
          const termPos = positionMap.get(travelTerminalIdx);
          if (termPos !== undefined) {
            termCenter = termPos * nodeWidth + nodeWidth / 2; // 终点站
          } else {
            termCenter = trackWidth - nodeWidth / 2;
          }
        } else {
          termCenter = startCenter + (termDisplayIdx * spacing); // 中间站点
        }
      } else {
        termCenter = trackWidth / 2; // 默认居中
      }
      
      const currPct = (currCenter / trackWidth) * 100;
      const termPct = (termCenter / trackWidth) * 100;
      const leftPct = Math.min(currPct, termPct);
      const rightPct = Math.max(currPct, termPct);
      track.style.background = `linear-gradient(to right, #ccc 0%, #ccc ${leftPct}%, var(--theme) ${leftPct}%, var(--theme) ${rightPct}%, #ccc ${rightPct}%, #ccc 100%)`;
      
      // 计算箭头位置
      const getArrowPosition = (i) => {
        // i 是 displaySts 中的索引
        if (i < 0 || i >= displayStsCount - 1) return 0;
        
        // 计算当前站点和下一个站点的中心位置
        let currentCenter, nextCenter;
        
        if (i === 0) {
          // 第一个站点（起点站）：左对齐，中心在 nodeWidth/2
          currentCenter = nodeWidth / 2;
        } else if (i === displayStsCount - 1) {
          // 最后一个站点（终点站）：使用位置映射
          const currentStIdx = sts.indexOf(displaySts[i]);
          const position = positionMap.get(currentStIdx);
          if (position !== undefined) {
            currentCenter = position * nodeWidth + nodeWidth / 2;
          } else {
            currentCenter = trackWidth - nodeWidth / 2;
          }
        } else {
          // 中间站点：使用均匀分布的间距
          currentCenter = startCenter + (i * spacing);
        }
        
        if (i + 1 === displayStsCount - 1) {
          // 下一个站点是最后一个站点（终点站）：使用位置映射
          const nextStIdx = sts.indexOf(displaySts[i + 1]);
          const nextPos = positionMap.get(nextStIdx);
          if (nextPos !== undefined) {
            nextCenter = nextPos * nodeWidth + nodeWidth / 2;
          } else {
            nextCenter = trackWidth - nodeWidth / 2;
          }
        } else {
          // 下一个站点是中间站点：使用均匀分布的间距
          nextCenter = startCenter + ((i + 1) * spacing);
        }
        
        // 箭头在两个中心之间
        return (currentCenter + nextCenter) / 2;
      };
      
      // 如果没有箭头（站点数 <= 1），不显示线路条
      if (displaySts.length <= 1) {
        track.style.display = 'none';
      } else {
        for (let i = 0; i < displaySts.length - 1; i++) {
          const arrowCenter = getArrowPosition(i);
          for (let k = -1; k <= 1; k++) {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.left = (arrowCenter + k * 20) + 'px';
            wrapper.style.top = '50%';
            wrapper.style.zIndex = '10';
            let baseTransform = 'translate(-50%, -50%)';
            if (isReversed) baseTransform += ' rotate(180deg)';
            wrapper.style.transform = baseTransform;
            const arrow = document.createElement('div');
            arrow.innerHTML = `<i class="fas fa-chevron-right"></i>`;
            const arrowI = arrow.firstElementChild;
            if (arrowI) arrowI.classList.add('track-arrow');
            arrow.style.fontSize = '24px';
            wrapper.appendChild(arrow);
            box.appendChild(wrapper);
          }
        }
      }
      mapPanel.appendChild(box);
    } else {
      // 原有逻辑：站点数量 > 7 时使用 flexbox
    displaySts.forEach((stNode) => {
      const realIdx = sts.indexOf(stNode);
      const node = mkNode(stNode, realIdx, 'linear', appData, rt);
      node.dataset.realIdx = String(realIdx);
      if (realIdx === rt.idx) {
        const dot = node.querySelector('.dot');
        if (dot) {
          dot.style.background = '#f1c40f';
          dot.style.borderColor = '#fff';
          dot.style.boxShadow = '0 0 10px #f1c40f';
          dot.style.animation = 'pulse-yellow 2s infinite';
        }
        const name = node.querySelector('.name');
        if (name) name.style.color = '#000';
      }
      box.appendChild(node);
    });
    mapPanel.appendChild(box);
    const nodeEls = Array.from(box.querySelectorAll('.l-node'));
    if (nodeEls.length > 0) {
      const boxRect = box.getBoundingClientRect();
      const centers = nodeEls.map((el) => {
        const r = el.getBoundingClientRect();
        return (r.left - boxRect.left) + (r.width / 2);
      });
      let currNodeIdx = nodeEls.findIndex((el) => Number(el.dataset.realIdx) === rt.idx);
      if (currNodeIdx === -1) currNodeIdx = Math.floor(nodeEls.length / 2);
      const currCenter = centers[currNodeIdx];
      const pct = Math.max(0, Math.min(100, (currCenter / boxRect.width) * 100));
      const travelTerminalIdx = (meta.dirType === 'up' || meta.dirType === 'outer') ? maxIdx : minIdx;
      const termNodeIdxInSlice = nodeEls.findIndex((el) => Number(el.dataset.realIdx) === travelTerminalIdx);
      if (termNodeIdxInSlice !== -1) {
        const termCenter = centers[termNodeIdxInSlice];
        const termPct = Math.max(0, Math.min(100, (termCenter / boxRect.width) * 100));
        const leftPct = Math.min(pct, termPct);
        const rightPct = Math.max(pct, termPct);
        track.style.background = `linear-gradient(to right, #ccc 0%, #ccc ${leftPct}%, var(--theme) ${leftPct}%, var(--theme) ${rightPct}%, #ccc ${rightPct}%, #ccc 100%)`;
      } else {
        if (isReversed) {
          track.style.background = `linear-gradient(to right, var(--theme) ${pct}%, #ccc ${pct}%)`;
        } else {
          track.style.background = `linear-gradient(to right, #ccc ${pct}%, var(--theme) ${pct}%)`;
        }
      }
    }
      // 如果没有箭头（站点数 <= 1），不显示线路条
      if (displaySts.length <= 1) {
        track.style.display = 'none';
      } else {
    for (let i = 0; i < displaySts.length - 1; i++) {
      const arrowCenter = (i + 1) * 160;
      for (let k = -1; k <= 1; k++) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.left = (arrowCenter + k * 20) + 'px';
        wrapper.style.top = '50%';
        wrapper.style.zIndex = '10';
        let baseTransform = 'translate(-50%, -50%)';
        if (isReversed) baseTransform += ' rotate(180deg)';
        wrapper.style.transform = baseTransform;
        const arrow = document.createElement('div');
        arrow.innerHTML = `<i class="fas fa-chevron-right"></i>`;
        const arrowI = arrow.firstElementChild;
        if (arrowI) arrowI.classList.add('track-arrow');
        arrow.style.fontSize = '24px';
        wrapper.appendChild(arrow);
        box.appendChild(wrapper);
      }
    }
      }
    }
    
    mapPanel.appendChild(box);
  };

  const drawLinear = (c, sts, m) => {
    c.innerHTML = '';
    c.className = 'btm-map map-l';
    c.style.paddingBottom = '200px';
    const box = document.createElement('div');
    box.className = 'l-box';
    const sIdx = (m.startIdx !== undefined && m.startIdx !== -1) ? parseInt(m.startIdx) : 0;
    const eIdx = (m.termIdx !== undefined && m.termIdx !== -1) ? parseInt(m.termIdx) : sts.length - 1;
    const rangeStart = Math.min(sIdx, eIdx);
    const rangeEnd = Math.max(sIdx, eIdx);
    const track = document.createElement('div');
    track.className = 'track-double';
    track.style.border = 'none';
    track.style.height = '18px';
    const total = sts.length;
    
    // 根据系统缩放比例和分辨率计算最大位置数
    // 获取缩放因子（devicePixelRatio，例如 1.0 = 100%, 1.25 = 125%, 2.0 = 200%, 2.5 = 250%）
    const scaleFactor = window.devicePixelRatio || 1.0;
    
    // 检测是否为4K或2K分辨率
    // 注意：window.screen.width 返回的是逻辑像素，需要考虑缩放
    // 在Electron中，window.screen.width返回的是逻辑像素（受缩放影响）
    // 物理分辨率 = 逻辑像素 × devicePixelRatio
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const physicalWidth = Math.round(screenWidth * scaleFactor);
    const physicalHeight = Math.round(screenHeight * scaleFactor);
    
    // 4K分辨率判断：物理宽度3800-3900，高度2100-2200（覆盖3840×2160等4K分辨率）
    const is4KResolution = physicalWidth >= 3800 && physicalWidth <= 3900 && 
                           physicalHeight >= 2100 && physicalHeight <= 2200;
    
    // 2K分辨率判断：物理宽度2500-2600，高度1400-1500（覆盖2560×1440等2K分辨率）
    const is2KResolution = physicalWidth >= 2500 && physicalWidth <= 2600 && 
                           physicalHeight >= 1400 && physicalHeight <= 1500;
    
    let targetMaxPositions = 17; // 默认17个位置（100%缩放）
    
    // 4K分辨率特殊处理
    if (is4KResolution) {
      if (scaleFactor >= 3.0) {
        targetMaxPositions = 11; // 4K 300%缩放：11个位置
      } else if (scaleFactor >= 2.5) {
        targetMaxPositions = 11; // 4K 250%缩放：11个位置
      } else if (scaleFactor >= 1.0) {
        targetMaxPositions = 17; // 4K 100%-249%缩放：17个位置
      } else {
        targetMaxPositions = 17; // 4K 100%以下缩放：17个位置（默认）
      }
    } else if (is2KResolution) {
      // 2K分辨率特殊处理
      if (scaleFactor >= 1.25 && scaleFactor < 1.5) {
        targetMaxPositions = 17; // 2K 125%缩放：17个位置
      } else if (scaleFactor < 1.25) {
        targetMaxPositions = 17; // 2K 100%缩放：17个位置
      } else if (scaleFactor >= 1.5) {
        // 2K 150%及以上缩放
        if (scaleFactor >= 1.75) {
          targetMaxPositions = 13; // 2K 175%缩放：13个位置
        } else {
          targetMaxPositions = 13; // 2K 150%缩放：13个位置
        }
      }
    } else {
      // 非4K/2K分辨率，使用原有逻辑
      if (scaleFactor >= 1.75) {
        targetMaxPositions = 10; // 175%及以上缩放：10个位置
      } else if (scaleFactor >= 1.5) {
        targetMaxPositions = 11; // 150%缩放：11个位置
      } else if (scaleFactor >= 1.25) {
        targetMaxPositions = 13; // 125%缩放：13个位置
      } else {
        targetMaxPositions = 17; // 100%缩放：17个位置
      }
    }
    
    const MAX_POSITIONS = targetMaxPositions;
    let spacing = 110;
    
    // 计算渐变位置：如果站点数量少于或等于MAX_POSITIONS，使用flexbox布局；否则使用原始计算
    let pStart, pEnd, pCurr;
    
    // 这些值会在下面的条件分支中计算
    // 如果使用flexbox布局（total <= MAX_POSITIONS），会在布局代码中重新计算
    if (total <= MAX_POSITIONS) {
      // 使用flexbox布局，在布局代码中会重新计算
      // 这里先设置默认值，稍后会被覆盖
      const availableWidth = 1900 - 40; // 减去左右padding
      const trackWidth = availableWidth;
      const startCenter = (rangeStart / (total - 1)) * trackWidth;
      const endCenter = (rangeEnd / (total - 1)) * trackWidth;
      const currCenter = (rt.idx / (total - 1)) * trackWidth;
      pStart = (startCenter / trackWidth) * 100;
      pEnd = (endCenter / trackWidth) * 100;
      pCurr = (currCenter / trackWidth) * 100;
      track.style.width = trackWidth + 'px';
    } else {
      // 原有逻辑：基于站点数量计算百分比
      pStart = (rangeStart + 0.5) / total * 100;
      pEnd = (rangeEnd + 0.5) / total * 100;
      pCurr = (rt.idx + 0.5) / total * 100;
    }
    
    let grad = `linear-gradient(to right, #ccc 0%, #ccc 100%)`;
    if (m.dirType === 'up' || m.dirType === 'outer') {
      const tStart = Math.max(pCurr, pStart);
      const tEnd = pEnd;
      if (tStart < tEnd) {
        grad = `linear-gradient(to right, #ccc 0%, #ccc ${tStart}%, var(--theme) ${tStart}%, var(--theme) ${tEnd}%, #ccc ${tEnd}%, #ccc 100%)`;
      }
    } else {
      const tStart = pStart;
      const tEnd = Math.min(pCurr, pEnd);
      if (tStart < tEnd) {
        grad = `linear-gradient(to right, #ccc 0%, #ccc ${tStart}%, var(--theme) ${tStart}%, var(--theme) ${tEnd}%, #ccc ${tEnd}%, #ccc 100%)`;
      }
    }
    track.style.background = grad;
    
    // 如果没有箭头（范围内站点数 <= 1），不显示线路条
    const hasArrows = rangeEnd > rangeStart;
    if (!hasArrows) {
      track.style.display = 'none';
    }
    
    box.appendChild(track);
    
    let targetIdx = rt.idx;
    if (rt.state === 1) {
      targetIdx = (m.dirType === 'up' || m.dirType === 'outer') ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
    }
    
    // 如果站点数量少于或等于MAX_POSITIONS，使用flexbox均匀分布
    if (total <= MAX_POSITIONS) {
      box.style.position = 'relative'; // 确保箭头绝对定位的基准
      box.style.display = 'flex';
      box.style.justifyContent = 'space-between';
      box.style.alignItems = 'center';
      box.style.width = '100%';
      box.style.height = '100%';
      sts.forEach((st, i) => {
        const node = mkNode(st, i, 'linear', appData, rt);
        const dot = node.querySelector('.dot');
        const name = node.querySelector('.name');
        const en = node.querySelector('.en');
        
        // 使用flex布局，不需要绝对定位
        node.style.position = 'relative';
        node.style.flexShrink = '0';
        
        if (i < rangeStart || i > rangeEnd) {
          node.style.opacity = '0.3';
          if (dot) {
            dot.style.background = '#fff';
            dot.style.borderColor = '#ccc';
          }
          if (name) name.style.color = '#ccc';
          if (en) en.style.color = '#eee';
          node.classList.remove('passed', 'curr');
        } else {
          if (st.skip && dot) {
            dot.style.background = '#fff';
            dot.style.borderColor = '#ccc';
            dot.style.width = '30px';
            dot.style.height = '30px';
          } else if (i === targetIdx && dot) {
            dot.style.background = '#f1c40f';
            dot.style.borderColor = '#fff';
            dot.style.boxShadow = '0 0 10px #f1c40f';
            dot.style.animation = 'pulse-yellow 2s infinite';
            if (name) name.style.color = '#000';
          }
        }
        box.appendChild(node);
      });
      
      // 重新计算track宽度和渐变位置，基于flexbox布局
      // 使用justify-content: space-between时，站点均匀分布在整个宽度上
      // box宽度是100%，实际渲染宽度是1900px（scaler宽度）
      // track宽度应该与box宽度一致，使用100%或固定值1900px
      const nodeWidth = 110;
      const boxWidth = 1900; // box的实际宽度（scaler宽度）
      const trackWidth = boxWidth; // track宽度与box宽度一致
      track.style.width = trackWidth + 'px';
      
      // 计算站点的实际中心位置（考虑节点宽度）
      // 使用space-between时，第一个节点的左边缘在0，最后一个节点的右边缘在boxWidth
      // 第一个站点的中心在 nodeWidth/2，最后一个站点的中心在 boxWidth - nodeWidth/2
      const firstNodeCenter = nodeWidth / 2; // 55px
      const lastNodeCenter = boxWidth - nodeWidth / 2; // 1900 - 55 = 1845px
      
      // 辅助函数：计算站点的实际中心位置（供箭头和渐变使用）
      const getStationCenter = (idx) => {
        if (idx === 0) return firstNodeCenter;
        if (idx === total - 1) return lastNodeCenter;
        const ratio = idx / (total - 1);
        return firstNodeCenter + (lastNodeCenter - firstNodeCenter) * ratio;
      };
      
      // 重新计算渐变位置（基于站点的实际中心位置）
      const startCenter = getStationCenter(rangeStart);
      const endCenter = getStationCenter(rangeEnd);
      const currCenter = getStationCenter(rt.idx);
      
      pStart = (startCenter / trackWidth) * 100;
      pEnd = (endCenter / trackWidth) * 100;
      pCurr = (currCenter / trackWidth) * 100;
      
      // 重新应用渐变（基于新的位置值）
      let newGrad = `linear-gradient(to right, #ccc 0%, #ccc 100%)`;
      if (m.dirType === 'up' || m.dirType === 'outer') {
        const tStart = Math.max(pCurr, pStart);
        const tEnd = pEnd;
        if (tStart < tEnd) {
          newGrad = `linear-gradient(to right, #ccc 0%, #ccc ${tStart}%, var(--theme) ${tStart}%, var(--theme) ${tEnd}%, #ccc ${tEnd}%, #ccc 100%)`;
        }
      } else {
        const tStart = pStart;
        const tEnd = Math.min(pCurr, pEnd);
        if (tStart < tEnd) {
          newGrad = `linear-gradient(to right, #ccc 0%, #ccc ${tStart}%, var(--theme) ${tStart}%, var(--theme) ${tEnd}%, #ccc ${tEnd}%, #ccc 100%)`;
        }
      }
      track.style.background = newGrad;
    } else {
      // 原有逻辑：站点数量 >= 17 时使用 flexbox
      sts.forEach((st, i) => {
        const node = mkNode(st, i, 'linear', appData, rt);
        const dot = node.querySelector('.dot');
        const name = node.querySelector('.name');
        const en = node.querySelector('.en');
        if (i < rangeStart || i > rangeEnd) {
          node.style.opacity = '0.3';
          if (dot) {
            dot.style.background = '#fff';
            dot.style.borderColor = '#ccc';
          }
          if (name) name.style.color = '#ccc';
          if (en) en.style.color = '#eee';
          node.classList.remove('passed', 'curr');
        } else {
          if (st.skip && dot) {
            dot.style.background = '#fff';
            dot.style.borderColor = '#ccc';
            dot.style.width = '30px';
            dot.style.height = '30px';
          } else if (i === targetIdx && dot) {
            dot.style.background = '#f1c40f';
            dot.style.borderColor = '#fff';
            dot.style.boxShadow = '0 0 10px #f1c40f';
            dot.style.animation = 'pulse-yellow 2s infinite';
            if (name) name.style.color = '#000';
          }
        }
        box.appendChild(node);
      });
    }
    c.appendChild(box);
    
    // 计算箭头位置
    const getArrowPosition = (i) => {
      if (total <= MAX_POSITIONS) {
        // 使用flexbox布局时，箭头位置在两个站点中间
        // 使用space-between时，第一个节点的左边缘在0，最后一个节点的右边缘在boxWidth
        // 每个节点宽度110px，所以第一个节点中心在55px，最后一个节点中心在(boxWidth-55)px
        const nodeWidth = 110;
        const boxWidth = 1900; // box的实际宽度（scaler宽度），与track宽度一致
        const firstNodeCenter = nodeWidth / 2; // 55px
        const lastNodeCenter = boxWidth - nodeWidth / 2; // 1900 - 55 = 1845px
        
        // 计算第i个和第i+1个站点的中心位置（线性插值）
        const ratio1 = i / (total - 1);
        const ratio2 = (i + 1) / (total - 1);
        const center1 = firstNodeCenter + (lastNodeCenter - firstNodeCenter) * ratio1;
        const center2 = firstNodeCenter + (lastNodeCenter - firstNodeCenter) * ratio2;
        
        // 箭头位置在两个站点中心的中间
        return (center1 + center2) / 2;
      } else {
        return (i + 1) * spacing;
      }
    };
    
    // 计算当前站点位置（用于滚动）
    const getCurrentPosition = (idx) => {
      if (total <= MAX_POSITIONS) {
        // 使用flexbox布局时，站点位置基于比例计算
        const availableWidth = 1900 - 40; // 减去左右padding
        return (idx / (total - 1)) * availableWidth;
      } else {
        return idx * spacing;
      }
    };
    
    for (let i = 0; i < sts.length - 1; i++) {
      if (i < rangeStart || i >= rangeEnd) continue;
      const arrowCenter = getArrowPosition(i);
      for (let k = -1; k <= 1; k++) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.left = (arrowCenter + k * 20) + 'px';
        wrapper.style.top = '50%';
        wrapper.style.zIndex = '10';
        let rot = '';
        if (m.dirType === 'down' || m.dirType === 'inner') rot = 'rotate(180deg)';
        wrapper.style.transform = `translate(-50%, -50%) ${rot}`;
        const arrow = document.createElement('div');
        const isCurrSeg = (() => {
          if (rt.state === 1) {
            if (m.dirType === 'up' || m.dirType === 'outer') {
              return i === rt.idx;
            }
            return i === rt.idx - 1;
          }
          return false;
        })();
        arrow.innerHTML = `<i class="fas fa-chevron-right"></i>`;
        const ai = arrow.firstElementChild;
        if (ai) {
          ai.classList.add('segment-arrow');
          if (isCurrSeg) ai.classList.add('segment-arrow-current'); else ai.classList.add('segment-arrow-default');
        }
        arrow.style.fontSize = '24px';
        wrapper.appendChild(arrow);
        box.appendChild(wrapper);
      }
    }
    setTimeout(() => {
      const currentPos = getCurrentPosition(rt.idx);
      c.scrollTo({
        left: currentPos - 2080 / 2 + 45,
        behavior: 'smooth'
      });
    }, 50);
  };

  const drawRing = (c, sts, m) => {
    c.innerHTML = '';
    c.className = 'btm-map map-r';
    c.style.overflowX = 'auto';
    c.style.justifyContent = 'flex-start';
    c.style.display = 'flex';
    c.style.paddingBottom = '0';
    const H = 360;
    const trackGap = 100;
    const cornerR = 30;
    const totalSt = sts.length;
    const topCount = Math.ceil(totalSt / 2);
    const btmCount = totalSt - topCount;
    const minSpacing = 160;
    const minTotalW = 1400;
    const w = Math.max(minTotalW, topCount * minSpacing);
    const ringWidth = w + 2 * (cornerR + 20);
    const W = Math.max(2080, ringWidth + 300);
    const cx = W / 2;
    const cy = H / 2;
    const x1 = cx - w / 2;
    const x2 = cx + w / 2;
    const y1 = cy - trackGap / 2;
    const y2 = cy + trackGap / 2;
    const d = `M ${x1} ${y1} L ${x2} ${y1} A ${cornerR} ${cornerR} 0 0 1 ${x2 + cornerR} ${y1 + cornerR} L ${x2 + cornerR} ${y2 - cornerR} A ${cornerR} ${cornerR} 0 0 1 ${x2} ${y2} L ${x1} ${y2} A ${cornerR} ${cornerR} 0 0 1 ${x1 - cornerR} ${y2 - cornerR} L ${x1 - cornerR} ${y1 + cornerR} A ${cornerR} ${cornerR} 0 0 1 ${x1} ${y1} Z`;
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = `${W}px`;
    wrapper.style.height = `${H}px`;
    wrapper.style.flexShrink = '0';
    c.appendChild(wrapper);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    const vertLen = trackGap - 2 * cornerR;
    const arcLen = Math.PI * cornerR + vertLen;
    const perimeter = 2 * w + 2 * arcLen;
    const topStep = topCount > 0 ? w / topCount : 0;
    const btmStep = btmCount > 0 ? w / btmCount : 0;
    const getStDist = (k) => {
      if (k < topCount) {
        return topStep * k + topStep / 2;
      }
      const kb = k - topCount;
      return (w + arcLen) + (btmStep * kb + btmStep / 2);
    };
    let splitDist = getStDist(rt.idx);
    const trackBase = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trackBase.setAttribute('d', d);
    trackBase.setAttribute('fill', 'none');
    trackBase.setAttribute('stroke-width', '18');
    const trackOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trackOverlay.setAttribute('d', d);
    trackOverlay.setAttribute('fill', 'none');
    trackOverlay.setAttribute('stroke-width', '18');
    if (m.dirType === 'outer') {
      trackBase.setAttribute('stroke', m.themeColor);
      trackOverlay.setAttribute('stroke', '#ccc');
      trackOverlay.setAttribute('stroke-dasharray', `${splitDist} ${perimeter}`);
    } else {
      trackBase.setAttribute('stroke', '#ccc');
      trackOverlay.setAttribute('stroke', m.themeColor);
      trackOverlay.setAttribute('stroke-dasharray', `${splitDist} ${perimeter}`);
    }
    svg.appendChild(trackBase);
    svg.appendChild(trackOverlay);
    let targetIdx = rt.idx;
    let prevIdx = -1;
    if (rt.state === 1) {
      prevIdx = rt.idx;
      targetIdx = (m.dirType === 'outer') ? getNextValidSt(rt.idx, 1, appData) : getNextValidSt(rt.idx, -1, appData);
    } else {
      targetIdx = rt.idx;
      prevIdx = -1;
    }
    const measurePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    measurePath.setAttribute('d', d);
    measurePath.style.display = 'none';
    svg.appendChild(measurePath);
    sts.forEach((st, i) => {
      const dist = getStDist(i);
      const pt = measurePath.getPointAtLength(dist);
      const node = mkNode(st, i, 'loop', appData, rt);
      node.style.left = `${pt.x}px`;
      node.style.top = `${pt.y}px`;
      const label = node.querySelector('.n-txt');
      const isUpperHalf = pt.y < cy;
      if (isUpperHalf) {
        label.style.top = '0';
        label.style.bottom = 'auto';
        label.style.transform = 'translate(-50%, calc(-100% - 10px))';
        // 上半环：换乘标签在站点名字上方
        const xBox = label.querySelector('.x-box');
        // 找到第一个div子元素（名字div）
        const children = Array.from(label.children);
        const nameDiv = children.find(child => child.tagName === 'DIV' && child !== xBox && !child.classList.contains('en'));
        if (xBox && nameDiv) {
          // 将换乘标签移到名字之前
          label.insertBefore(xBox, nameDiv);
        }
      } else {
        label.style.top = '28px';
        label.style.bottom = 'auto';
        label.style.transform = 'translateX(-50%)';
        // 下半环：换乘标签在站点名字下方（保持原顺序，不需要调整）
      }
      const dot = node.querySelector('.dot');
      if (st.skip && dot) {
        dot.style.background = '#fff';
        dot.style.borderColor = '#ccc';
        dot.style.width = '24px';
        dot.style.height = '24px';
        if (label) label.style.opacity = '0.6';
      } else if (i === targetIdx && dot) {
        dot.style.background = '#f1c40f';
        dot.style.borderColor = '#fff';
        dot.style.boxShadow = '0 0 10px #f1c40f';
        dot.style.animation = 'pulse-yellow-centered 1.5s infinite';
        if (label) label.style.color = '#000';
      } else if (i === prevIdx && dot) {
        dot.style.background = '#fff';
        dot.style.borderColor = '#ccc';
        dot.style.boxShadow = 'none';
        if (label) label.style.color = '#999';
      }
      // 环线绘制
      wrapper.appendChild(node);
      const nextI = (i + 1) % sts.length;
      let d1 = dist;
      let d2 = getStDist(nextI);
      if (d2 < d1) d2 += perimeter;
      const segLen = d2 - d1;
      const isCurrentSeg = rt.state === 1 && ((prevIdx === i && targetIdx === nextI) || (prevIdx === nextI && targetIdx === i));
      [0.38, 0.5, 0.62].forEach((ratio, ridx) => {
        let aDist = (d1 + segLen * ratio) % perimeter;
        const ptArr = measurePath.getPointAtLength(aDist);
        const pA = measurePath.getPointAtLength((aDist - 2 + perimeter) % perimeter);
        const pB = measurePath.getPointAtLength((aDist + 2) % perimeter);
        let angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI;
        if (m.dirType === 'inner') angle += 180;
        const arrow = document.createElement('div');
        arrow.innerHTML = `<i class="fas fa-chevron-right"></i>`;
        const arrowI = arrow.firstElementChild;
        if (arrowI) {
          arrowI.classList.add('ring-arrow');
          if (isCurrentSeg) arrowI.classList.add('ring-arrow-current'); else arrowI.classList.add('ring-arrow-default');
        }
        arrow.style.position = 'absolute';
        arrow.style.left = `${ptArr.x}px`;
        arrow.style.top = `${ptArr.y}px`;
        arrow.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
        arrow.style.fontSize = '20px';
        arrow.style.zIndex = '6';
        wrapper.appendChild(arrow);
      });
    });
    wrapper.appendChild(svg);
    let focusDist = 0;
    if (rt.state === 1) {
      let d1 = getStDist(prevIdx);
      let d2 = getStDist(targetIdx);
      if (m.dirType === 'outer') {
        if (d2 < d1) d2 += perimeter;
      } else {
        if (d1 < d2) d1 += perimeter;
      }
      let midDist = (d1 + d2) / 2;
      midDist %= perimeter;
      let distDiff = Math.abs(d2 - d1);
      if (distDiff > perimeter / 2) distDiff = perimeter - distDiff;
      const avgStep = perimeter / sts.length;
      if (distDiff > avgStep * 1.5) {
        if (m.dirType === 'outer') midDist += avgStep * 0.5;
        else midDist -= avgStep * 0.5;
        midDist = (midDist % perimeter + perimeter) % perimeter;
      }
      focusDist = midDist;
    } else {
      focusDist = getStDist(targetIdx);
    }
    const focusPt = measurePath.getPointAtLength(focusDist);
    setTimeout(() => {
      c.scrollTo({
        left: focusPt.x - 2080 / 2,
        behavior: 'smooth'
      });
    }, 50);
  };

  const startRec = async (bps) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', frameRate: 60 },
        audio: false
      });
      const recTip = locateId('rec-tip');
      if (recTip) recTip.style.display = 'block';
      const options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bps };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) options.mimeType = 'video/webm';
      recorder = new MediaRecorder(stream, options);
      chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'MetroPIDS_' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
        a.click();
        if (recTip) recTip.style.display = 'none';
      };
      recorder.start();
      if (bc) bc.postMessage({ t: 'REC_STARTED' });
    } catch (err) {
      console.error(err);
      alert('录制启动失败，请检查浏览器权限');
      if (bc) bc.postMessage({ t: 'REC_STOP_ERR' });
    }
  };

  const stopRec = () => {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const handleBroadcastMessage = (event) => {
    const data = event.data;
    if (!data || !data.t) return;
    if (data.t === 'SYNC') {
      appData = data.d;
      rt = data.r || rt;
      renderDisp();
    }
    if (data.t === 'REC_START') {
      startRec(data.bps);
    }
    if (data.t === 'REC_STOP') {
      stopRec();
    }
  };

  const handleWindowMessage = (event) => {
    const data = event.data;
    if (!data || data.t !== 'SYNC') return;
    appData = data.d;
    rt = data.r || rt;
    renderDisp();
  };

  const restoreSnapshot = () => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const raw = window.localStorage.getItem(DISPLAY_SNAPSHOT_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data || data.t !== 'SYNC') return false;
      appData = data.d;
      rt = data.r || rt;
      if (appData) renderDisp();
      return true;
    } catch (err) {
      console.warn('Failed to restore display snapshot', err);
      return false;
    } finally {
      window.localStorage.removeItem(DISPLAY_SNAPSHOT_KEY);
    }
  };

  window.addEventListener('resize', fitScreen);
  clockTimer = setInterval(updateClock, 1000);
  updateClock();
  fitScreen();
  let restored = false;
  if (bc) {
    bc.addEventListener('message', handleBroadcastMessage);
    bc.postMessage({ t: 'REQ' });
    restored = restoreSnapshot();
  } else {
    restored = restoreSnapshot();
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleWindowMessage);
  }
  document.addEventListener('keydown', handleKeyDown);
  renderDisp();

  // 调试辅助：在浏览器控制台调用可绘制示例环线
  if (typeof window !== 'undefined') {
    window.debugRenderRing = function(count = 18, idx = 2, dir = 'outer') {
      try {
        const c = locateId('d-map') || root.querySelector('#scaler');
        if (!c) return console.warn('No container found for ring render');
        const m = { dirType: dir, themeColor: getComputedStyle(root).getPropertyValue('--theme') || '#00b894', mode: 'loop' };
        const sts = [];
        for (let i = 0; i < count; i++) sts.push({ name: `站 ${i+1}`, en: `St ${i+1}` });
        // 确保 drawRing 在此作用域可用
        if (typeof drawRing === 'function') drawRing(c, sts, m);
        else console.warn('drawRing() not available');
      } catch (err) { console.warn('debugRenderRing failed', err); }
    };
  }

  return () => {
    // 清理警告相关的事件监听器和定时器
    cleanupWarning();
    
    window.removeEventListener('resize', fitScreen);
    document.removeEventListener('keydown', handleKeyDown);
    if (bc) bc.removeEventListener('message', handleBroadcastMessage);
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleWindowMessage);
    }
    if (clockTimer) clearInterval(clockTimer);
    cleanupArrivalTimer();
    stopRec();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };
}

