const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell, screen, nativeImage, desktopCapturer, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const crypto = require('crypto');

// 导入显示器控制API服务器
let displayApiServer = null;
try {
  const apiServerModule = require('./scripts/display-api-server.js');
  displayApiServer = apiServerModule.createDisplayApiServer();
} catch (e) {
  console.warn('[main] 无法加载显示器控制API服务器:', e);
}

// ================= GPU 加速优化（优先作用于显示端） =================
// 这些开关需要在 app.ready 之前配置，主要影响 Chromium 渲染管线。
// Electron 默认已经启用 GPU，但通过以下开关可以更偏向 GPU 光栅化和零拷贝路径，
// 对显示端这种大量动画/绘制的窗口更友好。
try {
  app.commandLine.appendSwitch('enable-gpu');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
} catch (e) {
  console.warn('[main] 配置 GPU 开关失败:', e);
}

// 启用主进程日志输出（打包后也需要日志来调试）
const ENABLE_MAIN_VERBOSE_LOG = true; // 改为 true，确保打包后也能看到日志
const __MAIN_ORIGINAL_LOG = console.log;
console.log = (...args) => {
  if (ENABLE_MAIN_VERBOSE_LOG) __MAIN_ORIGINAL_LOG(...args);
  // 同时也输出到 logger（如果可用）
  if (logger) {
    try {
      logger.info(...args);
    } catch (e) {}
  }
};

// 引入 mica-electron 用于 Windows 11 Mica 效果
// 注意：mica-electron 需要在 app 初始化后加载，所以在 createWindow 中加载
let MicaBrowserWindow = BrowserWindow; // 默认使用标准 BrowserWindow
let IS_WINDOWS_11 = false;
let WIN10 = null;

// 设置应用名称（用于通知等系统显示）
// 必须在 app.whenReady() 之前设置
app.setName('Metro-PIDS');

// 设置应用用户模型 ID（Windows 通知设置需要）
// 必须在 app.whenReady() 之前设置
// 使用与 package.json 中 appId 相同的值，确保通知设置中能正确识别应用
if (process.platform === 'win32') {
  app.setAppUserModelId('com.Metro-PIDS.myapp');
}

// 引入日志和存储
let logger = null;
let Store = null;
let store = null;
try {
  logger = require('electron-log');
  Store = require('electron-store');
  store = new Store();
  
  // 配置 logger 输出到文件和控制台
  if (logger) {
    logger.transports.console.level = 'debug';
    logger.transports.file.level = 'debug';
    logger.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
    console.log('[main] 日志文件位置:', logger.transports.file.getFile().path);
  }
} catch (e) {
  console.warn('electron-log or electron-store not available:', e);
}

// Electron 32+ 内置了 setBackgroundMaterial API，无需额外安装原生模块
// 如果需要更强的效果，可以安装 electron-acrylic-window（需要 Visual Studio 构建工具）

let autoUpdater = null;
try {
  // electron-updater 仅安装后可用，需安全 require
  // eslint-disable-next-line global-require
  console.log('[main] 尝试加载 electron-updater...');
  const updater = require('electron-updater');
  console.log('[main] electron-updater 模块加载成功:', typeof updater);
  console.log('[main] updater.autoUpdater:', typeof updater.autoUpdater);
  
  autoUpdater = updater.autoUpdater;
  
  if (!autoUpdater) {
    console.error('[main] updater.autoUpdater 为 undefined');
    // 尝试其他可能的导出方式
    if (updater.default && updater.default.autoUpdater) {
      autoUpdater = updater.default.autoUpdater;
      console.log('[main] 使用 updater.default.autoUpdater');
    }
  }
  
  // 配置日志
  if (logger && autoUpdater) {
    autoUpdater.logger = logger;
  }
  
  if (autoUpdater) {
    console.log('[main] electron-updater loaded successfully');
  } else {
    console.error('[main] electron-updater 加载失败：autoUpdater 为 null');
  }
  
  // 注意：在开发模式下（未打包），electron-updater 默认不会检查更新
  // 这是正常行为，更新功能需要在打包后的应用中测试
} catch (e) {
  console.error('[main] Failed to load electron-updater:', e);
  console.error('[main] Error details:', {
    message: e.message,
    stack: e.stack,
    code: e.code,
    name: e.name
  });
  autoUpdater = null;
}

let mainWin = null;
let MAIN_BLUR_ENABLED = true; // 高斯模糊开关状态，默认开启
let displayWindows = new Map(); // 存储多个显示端窗口，key为displayId
let lineManagerWin = null;
let devWin = null;
let throughOperationTarget = null; // 存储贯通线路选择目标 ('lineA' 或 'lineB')

// BrowserView 管理：存储主窗口中的多个视图
let browserViews = new Map(); // key: viewId, value: { view: BrowserView, bounds: {x, y, width, height} }

// 判断是否为开发环境（electron-vite 在开发时会注入 ELECTRON_RENDERER_URL 或 VITE_DEV_SERVER_URL）
const isDev = !app.isPackaged || !!process.env.ELECTRON_RENDERER_URL || !!process.env.VITE_DEV_SERVER_URL;

// 添加全局错误处理，捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('[main] 未捕获的异常:', error);
  console.error('[main] 错误堆栈:', error.stack);
  // 同时记录到 logger
  if (logger) {
    try {
      logger.error('未捕获的异常', error);
    } catch (e) {}
  }
  // 不要立即退出，给应用一个机会记录错误或显示错误对话框
  // 如果窗口存在，确保它显示出来
  if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
    try {
      mainWin.show();
    } catch (e) {}
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[main] 未处理的 Promise 拒绝:', reason);
  if (reason instanceof Error) {
    console.error('[main] 错误堆栈:', reason.stack);
  }
  // 同时记录到 logger
  if (logger) {
    try {
      logger.error('未处理的 Promise 拒绝', reason);
    } catch (e) {}
  }
});

// 获取 preload 脚本路径：
// - 开发模式：electron-vite 会自动处理，使用 dist/main/preload.js（热重载支持）
// - 生产/打包后：使用与 main 同目录下的 preload.js
function getPreloadPath() {
  // electron-vite 在开发模式下会将 preload 打包到 dist/main/preload.js
  // 这样支持热重载功能
  if (process.env.ELECTRON_RENDERER_URL || !app.isPackaged) {
    // 开发模式：使用 electron-vite 打包后的 preload.js（支持热重载）
    return path.join(__dirname, 'preload.js');
  }
  // 生产模式：使用打包后的 preload.js
  return path.join(__dirname, 'preload.js');
}

/**
 * 获取渲染进程页面的 URL
 * - 开发环境：使用 electron-vite 提供的本地服务器地址（ELECTRON_RENDERER_URL）
 * - 生产环境：使用打包后 dist/renderer 目录中的静态文件
 * @param {string} htmlRelativePath 相对于渲染根目录的 html 路径，如 'index.html' 或 'displays/display-2/display_window.html'
 */
function getRendererUrl(htmlRelativePath) {
  const basePath = htmlRelativePath.replace(/^\//, '');
  
  // electron-vite 开发模式：使用 Vite 开发服务器（支持 HMR ⚡️）
  const devUrl = process.env.ELECTRON_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    // 确保 URL 格式正确，支持 HMR
    const url = devUrl.replace(/\/$/, '');
    return `${url}/${basePath}`;
  }
  
  // 兜底：开发模式但环境变量缺失时，使用默认端口
  if (!app.isPackaged) {
    return `http://localhost:5173/${basePath}`;
  }
  
  // 生产环境：使用打包后的静态文件
  // 打包后，__dirname 指向 app.asar/out/main（如果在 asar 中）或 out/main（如果解压）
  // 渲染进程文件在 out/renderer 目录下
  // 在 asar 中，路径应该是：app.asar/out/renderer/index.html
  // app.getAppPath() 返回 app.asar 的路径（如果使用 asar）
  let resolved;
  
  if (app.isPackaged) {
    // 打包后：app.getAppPath() 返回 app.asar 的路径
    const appPath = app.getAppPath();
    // app.asar/out/renderer/index.html
    resolved = path.join(appPath, 'out/renderer', basePath);
    console.log(`[getRendererUrl] 打包模式 - appPath: ${appPath}, resolved: ${resolved}`);
  } else {
    // 开发环境：__dirname 指向 out/main
    resolved = path.join(__dirname, '../renderer', basePath);
    console.log(`[getRendererUrl] 开发模式 - __dirname: ${__dirname}, resolved: ${resolved}`);
  }
  
  // 验证文件是否存在（注意：在 asar 中，fs.existsSync 可以检查 asar 内的文件）
  try {
    if (!fs.existsSync(resolved)) {
      console.warn(`[getRendererUrl] ⚠️ 文件不存在: ${resolved}`);
      console.warn(`[getRendererUrl] __dirname: ${__dirname}`);
      if (app.isPackaged) {
        console.warn(`[getRendererUrl] app.getAppPath(): ${app.getAppPath()}`);
        // 尝试备用路径
        const altPath = path.join(__dirname, '../renderer', basePath);
        if (fs.existsSync(altPath)) {
          console.log(`[getRendererUrl] 使用备用路径: ${altPath}`);
          resolved = altPath;
        }
      }
    } else {
      console.log(`[getRendererUrl] ✅ 文件存在: ${resolved}`);
    }
  } catch (e) {
    console.error(`[getRendererUrl] 检查文件存在性时出错:`, e);
  }
  
  // 转换为 file:// URL 格式（Windows 需要特殊处理）
  const fileUrl = `file://${resolved.replace(/\\/g, '/')}`;
  return fileUrl;
}

// 重新应用 Mica 效果的辅助函数
function reapplyMicaEffect() {
  if (!mainWin || mainWin.isDestroyed()) return;
  if (!MAIN_BLUR_ENABLED) {
    console.log('[MainWindow] 模糊开关关闭，跳过重新应用效果');
    return;
  }
  
  const isWindows = process.platform === 'win32';
  if (!isWindows || MicaBrowserWindow === BrowserWindow) return;
  
  try {
    // 确保背景透明
    mainWin.setBackgroundColor('#00000000');
    
    // 延迟应用效果，确保背景色设置生效
    setTimeout(() => {
      try {
        if (IS_WINDOWS_11 && typeof mainWin.setMicaAcrylicEffect === 'function') {
          mainWin.setBackgroundColor('#00000000');
          mainWin.setMicaAcrylicEffect();
          console.log('[MainWindow] ✅ 重新应用 Mica Acrylic 效果');
        } else if (WIN10 && typeof mainWin.setAcrylic === 'function') {
          mainWin.setBackgroundColor('#00000000');
          mainWin.setAcrylic();
          console.log('[MainWindow] ✅ 重新应用 Acrylic 效果');
        }
      } catch (e) {
        console.warn('[MainWindow] ⚠️ 重新应用效果失败:', e);
      }
    }, 50);
  } catch (e) {
    console.warn('[MainWindow] ⚠️ 重新应用效果失败:', e);
  }
}

function createWindow() {
  console.log('[MainWindow] ===== 开始创建窗口 =====');
  // 尝试加载 mica-electron（需要在 app 初始化后）
  // 按照官方示例使用解构导入
  if (MicaBrowserWindow === BrowserWindow) {
    try {
      console.log('[main] 正在加载 mica-electron...');
      // 按照官方示例：使用解构导入
      const { MicaBrowserWindow: MicaBW, IS_WINDOWS_11: IS_W11, WIN10: W10 } = require('mica-electron');
      console.log('[main] mica-electron 模块导出:', { MicaBrowserWindow: typeof MicaBW, IS_WINDOWS_11: IS_W11, WIN10: W10 });
      
      // 使用解构导入的值
      MicaBrowserWindow = MicaBW || BrowserWindow;
      IS_WINDOWS_11 = IS_W11 || false;
      WIN10 = W10 || null;
      
      console.log('[main] ✅ mica-electron 加载成功');
      console.log('[main] MicaBrowserWindow:', MicaBrowserWindow === BrowserWindow ? '未加载（使用标准 BrowserWindow）' : '已加载');
      console.log('[main] IS_WINDOWS_11:', IS_WINDOWS_11);
      console.log('[main] WIN10:', WIN10);
      
      // 检查原生模块是否存在
      const fs = require('fs');
      const path = require('path');
      const micaElectronPath = path.join(__dirname, 'node_modules', 'mica-electron', 'src');
      const arch = process.arch;
      const nodeFile = path.join(micaElectronPath, `micaElectron_${arch}.node`);
      if (fs.existsSync(nodeFile)) {
        console.log('[main] ✅ 原生模块文件存在:', nodeFile);
      } else {
        console.warn('[main] ⚠️ 原生模块文件不存在:', nodeFile);
        console.warn('[main] ⚠️ 需要重新编译 mica-electron，请运行: npm install --build-from-source mica-electron');
      }
    } catch (e) {
      console.error('[main] ❌ mica-electron 加载失败:', e.message);
      console.error('[main] 错误堆栈:', e.stack);
    }
  }
  
  // 使用方案二：隐藏默认标题栏，显示系统窗口控制按钮
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  
  // Linux 不支持自定义标题栏，使用系统默认标题栏
  if (isLinux) {
    console.log('[MainWindow] 创建 Linux 窗口');
    mainWin = new BrowserWindow({
      width: 1280,
      height: 800,
      frame: true, // Linux 使用系统框架
      transparent: false,
      resizable: true,
      show: true, // 立即显示
      webPreferences: {
        preload: getPreloadPath(),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    console.log('[MainWindow] Linux 窗口已创建:', mainWin !== null);
    if (mainWin) {
      mainWin.show();
      mainWin.center();
      console.log('[MainWindow] Linux 窗口已显示');
    }
  } else {
    // Windows 和 MacOS 使用自定义标题栏，启用透明以支持毛玻璃效果（透到桌面）
    // 使用 MicaBrowserWindow（如果可用）以获得更好的 Mica 效果支持
    // 按照官方示例：先不显示窗口，等 dom-ready 后再显示
    // 根据当前主显示器工作区域自动适配一个合适的初始大小，避免过大导致窗口被挤到左上角
    let initialWidth = 1600;
    let initialHeight = 900;
    try {
      const primary = screen.getPrimaryDisplay();
      const size = (primary && (primary.workAreaSize || primary.workArea)) || null;
      if (size && size.width && size.height) {
        initialWidth = Math.min(initialWidth, size.width);
        initialHeight = Math.min(initialHeight, size.height);
      }
    } catch (e) {
      console.warn('[MainWindow] 获取屏幕信息失败，使用默认窗口大小', e);
    }

    mainWin = new MicaBrowserWindow({
      width: initialWidth,
      height: initialHeight,
      frame: false, // 隐藏默认框架
      transparent: true, // 启用透明以支持毛玻璃效果（透到桌面）
      resizable: true,
      backgroundColor: '#00000000', // 完全透明的背景色（使用黑色透明，确保 Mica 效果可见）
      hasShadow: true, // 启用窗口阴影
      show: true, // 立即显示窗口，避免页面加载失败导致窗口不显示
      // 隐藏默认标题栏，但保留系统窗口控制按钮
      titleBarStyle: 'hidden',
      // 显示系统自带窗口控制按钮
      titleBarOverlay: {
        color: isWindows ? 'rgba(0, 0, 0, 0)' : undefined, // Windows 设置为透明
        symbolColor: isWindows ? '#2d3436' : undefined, // Windows 控制按钮颜色
        height: 32 // 控制按钮高度，与自定义标题栏高度一致
      },
      webPreferences: {
        preload: getPreloadPath(),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    console.log('[MainWindow] 窗口对象已创建:', mainWin !== null);
    console.log('[MainWindow] 窗口是否可见:', mainWin && mainWin.isVisible());
    
    // 按照官方示例：窗口创建后立即设置主题和效果
    if (isWindows && mainWin && MicaBrowserWindow !== BrowserWindow) {
      try {
        // 按照官方示例：先设置主题，然后设置效果
        if (IS_WINDOWS_11) {
          // Windows 11: 使用 Mica Acrylic Effect（Acrylic for Windows 11）
          if (typeof mainWin.setAutoTheme === 'function') {
            mainWin.setAutoTheme();
            console.log('[MainWindow] ✅ 已设置自动主题');
          } else if (typeof mainWin.setDarkTheme === 'function') {
            mainWin.setDarkTheme();
            console.log('[MainWindow] ✅ 已设置深色主题');
          }
          
          if (typeof mainWin.setMicaAcrylicEffect === 'function') {
            mainWin.setMicaAcrylicEffect();
            console.log('[MainWindow] ✅ 已启用 Mica Acrylic 效果');
          }
        } else if (WIN10) {
          // Windows 10: 使用 Acrylic 效果
          if (typeof mainWin.setAcrylic === 'function') {
            mainWin.setAcrylic();
            console.log('[MainWindow] ✅ 已启用 Acrylic 效果');
          }
        }
      } catch (e) {
        console.error('[MainWindow] ❌ 应用效果失败:', e);
      }
    }
    
    // 窗口创建后立即居中（因为 show: true，窗口会立即显示）
    mainWin.once('ready-to-show', () => {
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.center();
          console.log('[MainWindow] ✅ 窗口已显示并居中');
        }
      } catch (e) {
        console.warn('[MainWindow] ⚠️ 居中窗口失败:', e);
      }
    });
    
    // 确保窗口可见
    console.log('[MainWindow] 确保窗口可见 - 主窗口对象:', mainWin !== null);
    if (mainWin && !mainWin.isDestroyed()) {
      try {
        mainWin.show();
        mainWin.center();
        mainWin.focus();
        console.log('[MainWindow] ✅ 窗口已显示、居中并获取焦点');
        console.log('[MainWindow] 窗口可见性:', mainWin.isVisible());
      } catch (e) {
        console.error('[MainWindow] ❌ 显示窗口失败:', e);
      }
    } else {
      console.error('[MainWindow] ❌ 窗口对象无效或已销毁');
    }
    
    // 处理窗口失焦时的行为，确保保持透明背景
    mainWin.on('blur', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        try {
          mainWin.setBackgroundColor('#00000000'); // 设置透明背景
        } catch (e) {
          console.warn('[MainWindow] ⚠️ 设置透明背景失败:', e);
        }
      }
    });
    
    // 窗口重新获得焦点时重新应用 Mica 效果
    mainWin.on('focus', () => {
      reapplyMicaEffect();
    });
    
    // 监听页面导航事件，在导航完成后重新应用 Mica 效果
    mainWin.webContents.on('did-navigate', () => {
      console.log('[MainWindow] 页面导航完成，重新应用 Mica 效果');
      reapplyMicaEffect();
    });
    
    // 监听页面内导航（如 hash 变化）
    mainWin.webContents.on('did-navigate-in-page', () => {
      console.log('[MainWindow] 页面内导航完成，重新应用 Mica 效果');
      reapplyMicaEffect();
    });
    
    // 监听页面加载完成事件（每次页面加载完成后都重新应用）
    mainWin.webContents.on('did-finish-load', () => {
      console.log('[MainWindow] 页面加载完成，重新应用 Mica 效果');
      // 延迟应用，确保页面完全渲染
      setTimeout(() => {
        reapplyMicaEffect();
      }, 100);
    });
    
    // 监听 DOM 内容更新事件（Vue 组件切换时可能触发）
    mainWin.webContents.on('dom-ready', () => {
      console.log('[MainWindow] DOM 就绪，重新应用 Mica 效果');
      // 延迟应用，确保 DOM 完全更新
      setTimeout(() => {
        reapplyMicaEffect();
      }, 150);
    });
  }

  // 添加页面加载失败的处理（在 loadURL 之前）
  mainWin.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error('[MainWindow] ❌ 主框架页面加载失败:', {
        errorCode,
        errorDescription,
        validatedURL,
        errorCodeName: getErrorCodeName(errorCode)
      });
      
      // 即使加载失败，也要显示窗口
      setTimeout(() => {
        if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
          console.log('[MainWindow] 页面加载失败，但强制显示窗口');
          try {
            mainWin.show();
            mainWin.center();
            // 注入错误信息到页面
            mainWin.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="padding: 20px; font-family: Arial; line-height: 1.6;">
                <h2>页面加载失败</h2>
                <p><strong>错误代码:</strong> ${errorCode} (${getErrorCodeName(errorCode)})</p>
                <p><strong>错误描述:</strong> ${errorDescription}</p>
                <p><strong>尝试加载:</strong> ${validatedURL}</p>
                <p><strong>应用路径:</strong> ${app.getAppPath()}</p>
                <p><strong>是否打包:</strong> ${app.isPackaged}</p>
                <p><strong>__dirname:</strong> ${__dirname}</p>
              </div>';
            `).catch(e => console.error('[MainWindow] 注入错误信息失败:', e));
          } catch (e) {
            console.error('[MainWindow] 显示窗口失败:', e);
          }
        }
      }, 1000);
    }
  });
  
  // 错误代码名称映射
  function getErrorCodeName(code) {
    const codes = {
      '-3': 'ABORTED',
      '-2': 'INVALID_ARGUMENT',
      '-1': 'FAILED',
      '0': 'OK',
      '1': 'ABORTED',
      '2': 'FILE_NOT_FOUND',
      '3': 'TIMED_OUT',
      '4': 'FILE_TOO_BIG',
      '5': 'UNEXPECTED',
      '6': 'ACCESS_DENIED',
      '7': 'INVALID_HANDLE',
      '8': 'FILE_EXISTS',
      '9': 'FILE_TOO_MANY_OPENED',
      '10': 'NOT_A_DIRECTORY',
      '11': 'NOT_A_FILE',
      '20': 'NETWORK_ACCESS_DENIED',
      '21': 'NETWORK_FAILED',
      '22': 'NETWORK_TIMED_OUT'
    };
    return codes[code] || 'UNKNOWN';
  }
  
  const controlPath = getRendererUrl('index.html');
  console.log('[MainWindow] 准备加载页面:', controlPath);
  console.log('[MainWindow] 应用路径:', app.isPackaged ? app.getAppPath() : __dirname);
  
  try {
    mainWin.loadURL(controlPath).catch((error) => {
      console.error('[MainWindow] ❌ loadURL Promise 拒绝:', error);
      console.error('[MainWindow] 尝试加载的路径:', controlPath);
    });
  } catch (e) {
    console.error('[MainWindow] ❌ loadURL 调用失败:', e);
    console.error('[MainWindow] 错误堆栈:', e.stack);
    // 即使 loadURL 失败，也尝试显示窗口
    setTimeout(() => {
      if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
        console.log('[MainWindow] loadURL 异常，强制显示窗口');
        try {
          mainWin.show();
          mainWin.center();
        } catch (e2) {
          console.error('[MainWindow] 强制显示窗口也失败:', e2);
        }
      }
    }, 1000);
  }
  
  // 在页面加载完成后再次确保背景透明并应用 Mica 效果（首次加载）
  mainWin.webContents.once('did-finish-load', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      try {
        // 多次设置背景透明，确保生效
        mainWin.setBackgroundColor('#00000000');
        setTimeout(() => {
          mainWin.setBackgroundColor('#00000000');
          console.log('[MainWindow] ✅ 页面加载完成后设置背景为透明');
          
          // 如果 Mica 效果可用，再次应用（确保模糊效果显示）
          if (isWindows && MicaBrowserWindow !== BrowserWindow) {
            if (IS_WINDOWS_11 && typeof mainWin.setMicaAcrylicEffect === 'function') {
              mainWin.setMicaAcrylicEffect();
              console.log('[MainWindow] ✅ 页面加载后重新应用 Mica Acrylic 效果');
              
              // 再次延迟应用，确保模糊效果生效
              setTimeout(() => {
                mainWin.setBackgroundColor('#00000000');
                mainWin.setMicaAcrylicEffect();
                console.log('[MainWindow] ✅ 延迟再次应用 Mica Acrylic 效果，确保模糊显示');
              }, 200);
            } else if (WIN10 && typeof mainWin.setAcrylic === 'function') {
              mainWin.setAcrylic();
              console.log('[MainWindow] ✅ 页面加载后重新应用 Acrylic 效果');
              
              // 再次延迟应用
              setTimeout(() => {
                mainWin.setBackgroundColor('#00000000');
                mainWin.setAcrylic();
              }, 200);
            }
          }
        }, 100);
      } catch (e) {
        console.warn('[MainWindow] ⚠️ 页面加载后设置透明背景失败:', e);
      }
    }
  });


  // 监听来自线路管理器的线路切换请求
  ipcMain.on('switch-line-request', (event, lineName) => {
    if (mainWin && !mainWin.isDestroyed()) {
      // 通过 webContents.send 发送消息到渲染进程
      mainWin.webContents.send('switch-line-request', lineName);
    }
  });

  // 开启 DevTools 控制台（用于调试）
  // 仅在开发模式下自动打开
  if (!app.isPackaged) {
    mainWin.webContents.openDevTools();
  }
  
  // 将主进程日志发送到渲染进程（用于调试）
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => {
    originalLog.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-log', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };
  console.error = (...args) => {
    originalError.apply(console, args);
    try {
      mainWin && mainWin.webContents.send('main-console-error', args.map(a => String(a)).join(' '));
    } catch (e) {}
  };

  // 将主窗体设为无边框，以完全替换系统控件
  // 无边框窗口需在渲染层提供可拖拽区域（CSS -webkit-app-region: drag）
  // 仅在创建时生效

  // 拦截 renderer 的 window.open 来创建受控窗口
  mainWin.webContents.setWindowOpenHandler(({ url, features, disposition }) => {
    try {
      const u = url.toString();
      if (u.endsWith('display_window.html') || u.includes('display_window.html')) {
        createDisplayWindow();
        return { action: 'deny' };
      }
    } catch (e) {
      // 忽略错误
    }
    return { action: 'allow' };
  });

  // 暴露 IPC 供渲染层打开显示窗口
  ipcMain.handle('open-display', (event, opts) => {
    const w = opts && typeof opts.width === 'number' ? opts.width : undefined;
    const h = opts && typeof opts.height === 'number' ? opts.height : undefined;
    const displayId = opts && opts.displayId ? opts.displayId : 'display-1';
    console.log('[main] open-display requested, width=', w, 'height=', h, 'displayId=', displayId);
    createDisplayWindow(w, h, displayId);
    return true;
  });

  // 暴露 IPC 供渲染层切换显示端
  ipcMain.handle('switch-display', async (event, displayId, width, height) => {
    console.log('[main] switch-display requested, displayId=', displayId, 'width=', width, 'height=', height);
    
    // 检查是否已存在该显示端窗口
    const existingWin = displayWindows.get(displayId);
    if (existingWin && !existingWin.isDestroyed()) {
      // 如果已存在该显示端窗口，检查是否需要重新加载URL（配置可能已更改）
      try {
        // 读取当前配置，检查URL是否变化
        let needReload = false;
        let expectedUrl = null;
        
        // 从 electron-store 读取配置
        let displayConfig = null;
        if (store) {
          try {
            const settings = store.get('settings', {});
            const displays = settings.display?.displays || {};
            displayConfig = displays[displayId];
            console.log(`[main] switch-display: 从 electron-store 读取显示端配置 ${displayId}:`, displayConfig ? {
              source: displayConfig.source,
              url: displayConfig.url,
              name: displayConfig.name
            } : '未找到配置');
          } catch (e) {
            console.warn('[main] 从 electron-store 读取显示端配置失败:', e);
          }
        }
        
        // 如果 electron-store 中没有配置，尝试从主窗口的 localStorage 读取
        if (!displayConfig && mainWin && !mainWin.isDestroyed()) {
          try {
            const localStorageSettings = await mainWin.webContents.executeJavaScript(`
              (function() {
                try {
                  const raw = localStorage.getItem('pids_settings_v1');
                  if (raw) {
                    return JSON.parse(raw);
                  }
                  return null;
                } catch(e) {
                  return null;
                }
              })();
            `);
            
            if (localStorageSettings && localStorageSettings.display && localStorageSettings.display.displays) {
              displayConfig = localStorageSettings.display.displays[displayId];
              if (displayConfig) {
                console.log(`[main] switch-display: 从主窗口 localStorage 读取显示端配置 ${displayId}:`, {
                  source: displayConfig.source,
                  url: displayConfig.url,
                  name: displayConfig.name
                });
                // 同步到 electron-store
                if (store) {
                  const currentSettings = store.get('settings', {});
                  if (!currentSettings.display) currentSettings.display = {};
                  if (!currentSettings.display.displays) currentSettings.display.displays = {};
                  currentSettings.display.displays[displayId] = displayConfig;
                  store.set('settings', currentSettings);
                }
              }
            }
          } catch (e) {
            console.warn('[main] 从主窗口读取配置失败:', e);
          }
        }
        
        // 计算期望的URL
        if (displayConfig && displayConfig.source === 'builtin') {
          if (displayConfig.url) {
            // 自定义HTML文件路径
            let customFilePath = displayConfig.url.trim();
            let resolvedPath;
            if (path.isAbsolute(customFilePath)) {
              resolvedPath = customFilePath;
            } else {
              if (app.isPackaged) {
                resolvedPath = path.join(app.getAppPath(), customFilePath);
              } else {
                resolvedPath = path.join(__dirname, '..', customFilePath);
              }
            }
            resolvedPath = path.normalize(resolvedPath);
            
            if (fs.existsSync(resolvedPath)) {
              const fileUrl = process.platform === 'win32' 
                ? `file:///${resolvedPath.replace(/\\/g, '/')}`
                : `file://${resolvedPath}`;
              expectedUrl = fileUrl;
            } else {
              console.warn(`[main] switch-display: 配置的本地文件不存在: ${resolvedPath}`);
            }
          } else {
            // 使用默认路径
            if (displayId === 'display-1') {
              expectedUrl = getRendererUrl('display_window.html');
            } else {
              const customRel = path.join('displays', displayId, 'display_window.html');
              const customPath = app.isPackaged 
                ? path.join(app.getAppPath(), 'out/renderer', customRel)
                : path.join(__dirname, '../renderer', customRel);
              if (fs.existsSync(customPath)) {
                expectedUrl = getRendererUrl(customRel);
              } else {
                expectedUrl = getRendererUrl('display_window.html');
              }
            }
          }
        } else {
          // 没有配置，使用默认路径
          if (displayId === 'display-1') {
            expectedUrl = getRendererUrl('display_window.html');
          } else {
            expectedUrl = getRendererUrl('display_window.html');
          }
        }
        
        // 获取当前窗口的URL
        const currentUrl = existingWin.webContents.getURL();
        console.log(`[main] switch-display: 当前窗口URL: ${currentUrl}`);
        console.log(`[main] switch-display: 期望URL: ${expectedUrl}`);
        
        // 比较URL，如果不一致则需要重新加载
        if (expectedUrl && currentUrl !== expectedUrl) {
          needReload = true;
          console.log(`[main] switch-display: URL不一致，需要重新加载`);
        }
        
        if (needReload) {
          // 需要重新加载，关闭旧窗口并创建新窗口
          console.log(`[main] 显示端 ${displayId} 配置已更改，重新加载窗口`);
          try {
            existingWin.close();
            displayWindows.delete(displayId);
          } catch (e) {
            console.warn(`[main] 关闭显示窗口 ${displayId} 失败:`, e);
          }
        } else {
          // 配置未更改，直接聚焦并调整尺寸
          if (typeof width === 'number' && typeof height === 'number') {
            existingWin.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)));
          }
          existingWin.focus();
          console.log(`[main] 显示端 ${displayId} 窗口已存在，已聚焦`);
          return true;
        }
      } catch (e) {
        console.warn(`[main] 处理显示窗口 ${displayId} 失败:`, e);
      }
    }
    
    // 关闭所有现有的显示窗口（除了目标显示端）
    for (const [id, win] of displayWindows.entries()) {
      if (id !== displayId && win && !win.isDestroyed()) {
        try {
          win.close();
        } catch (e) {
          console.warn(`[main] 关闭显示窗口 ${id} 失败:`, e);
        }
      }
    }
    
    // 清理已关闭的窗口引用
    for (const [id, win] of displayWindows.entries()) {
      if (win && win.isDestroyed()) {
        displayWindows.delete(id);
      }
    }
    
    // 创建新的显示窗口（如果不存在或需要重新加载）
    createDisplayWindow(width, height, displayId);
    
    return true;
  });

  // 暴露 IPC 供渲染层同步设置到主进程
  ipcMain.handle('settings/sync', async (event, settings) => {
    try {
      if (store && settings) {
        store.set('settings', settings);
        console.log('[main] 设置已同步到 electron-store');
        return { ok: true };
      }
      return { ok: false, error: 'store 未初始化或 settings 为空' };
    } catch (e) {
      console.error('[main] 同步设置失败:', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  // 暴露 IPC 供API服务器编辑显示端配置
  ipcMain.handle('api/edit-display', async (event, displayId, displayData) => {
    try {
      if (!mainWin || mainWin.isDestroyed()) {
        return { ok: false, error: '主窗口未就绪' };
      }
      
      // 通过IPC通知渲染进程更新显示端配置
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ ok: false, error: '操作超时' });
        }, 5000);
        
        const handler = (event, response) => {
          clearTimeout(timeout);
          ipcMain.removeListener('api/edit-display-result', handler);
          resolve(response);
        };
        
        ipcMain.once('api/edit-display-result', handler);
        
        // 发送编辑请求到渲染进程
        mainWin.webContents.send('api/edit-display-request', displayId, displayData);
      });
      
      return result;
    } catch (e) {
      console.error('[main] 编辑显示端失败:', e);
      return { ok: false, error: String(e.message || e) };
    }
  });

  // 暴露 IPC 供渲染层打开线路管理器
  ipcMain.handle('open-line-manager', (event, target) => {
    // target 可能是 'lineA' 或 'lineB'，用于贯通线路设置
    throughOperationTarget = target || null;
    createLineManagerWindow();
    return true;
  });

  // 暴露 IPC 供渲染层打开开发者窗口
  ipcMain.handle('open-dev-window', (event) => {
    createDevWindow();
    return true;
  });

  // 暴露 IPC 供渲染层关闭开发者窗口
  ipcMain.handle('close-dev-window', (event) => {
    if (devWin && !devWin.isDestroyed()) {
      devWin.close();
      devWin = null;
    }
    return true;
  });

  // 暴露 IPC 供渲染层打开开发者工具
  ipcMain.handle('dev/open-dev-tools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win && !win.isDestroyed()) {
      win.webContents.openDevTools();
      return true;
    }
    return false;
  });

  // 更新F12开发者工具设置（用于开发者窗口通知主进程）
  ipcMain.handle('dev/update-f12-setting', async (event, enabled) => {
    // 将设置同步到所有显示窗口的localStorage
    try {
      for (const [displayId, displayWin] of displayWindows.entries()) {
        if (displayWin && !displayWin.isDestroyed()) {
          await displayWin.webContents.executeJavaScript(`
            (function() {
              try {
                if (${enabled}) {
                  localStorage.setItem('metro_pids_enable_f12_devtools', 'true');
                } else {
                  localStorage.removeItem('metro_pids_enable_f12_devtools');
                }
                return true;
              } catch(e) {
                return false;
              }
            })();
          `);
        }
      }
      return true;
    } catch (e) {
      console.warn('[main] 更新F12设置失败:', e);
      return false;
    }
  });

  ipcMain.handle('dialog/alert', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return;
    try {
      await showElectronAlert({ parent: win, type: 'alert', title: '提示', msg: String(message) });
      return true;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('dialog/confirm', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return false;
    try {
      const res = await showElectronAlert({ parent: win, type: 'confirm', title: '确认', msg: String(message) });
      return !!res;
    } catch (e) {
      return false;
    }
  });

  // 文件选择对话框
  ipcMain.handle('dialog/showOpenDialog', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { canceled: true };
    try {
      const result = await dialog.showOpenDialog(win, {
        ...options,
        properties: options.properties || ['openFile']
      });
      return result;
    } catch (e) {
      console.error('[main] showOpenDialog error:', e);
      return { canceled: true, error: String(e) };
    }
  });

  ipcMain.handle('effects/dialog-blur', (event, enable) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    try {
      if (typeof win.setVisualEffectState === 'function') {
        win.setVisualEffectState(enable ? 'active' : 'inactive');
      }
      if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
        win.setVibrancy(enable ? 'fullscreen-ui' : 'none');
      }
      if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
        win.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
      }
      return { ok: true };
    } catch (err) {
      console.warn('failed to toggle dialog blur', err);
      return { ok: false, error: String(err) };
    }
  });

  // 主窗口模糊开关（通过 mica-electron 控制，而非 CSS）
  ipcMain.handle('effects/main-blur', (event, enable) => {
    MAIN_BLUR_ENABLED = !!enable;
    const win = mainWin;
    if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' };
    try {
      // 关闭模糊：尽量退回无材质/透明
      if (!MAIN_BLUR_ENABLED) {
        if (process.platform === 'win32') {
          if (typeof win.setBackgroundMaterial === 'function') {
            win.setBackgroundMaterial('none');
          }
          // 保持透明背景
          if (typeof win.setBackgroundColor === 'function') {
            win.setBackgroundColor('#00000000');
          }
        } else if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
          win.setVibrancy('none');
        }
        return { ok: true };
      }

      // 开启模糊：根据平台恢复 Mica/Acrylic
      if (process.platform === 'win32') {
        if (typeof win.setBackgroundColor === 'function') {
          win.setBackgroundColor('#00000000');
        }
        if (IS_WINDOWS_11 && typeof win.setMicaAcrylicEffect === 'function') {
          win.setMicaAcrylicEffect();
        } else if (WIN10 && typeof win.setAcrylic === 'function') {
          win.setAcrylic();
        } else if (typeof win.setBackgroundMaterial === 'function') {
          win.setBackgroundMaterial('acrylic');
        }
      } else if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
        win.setVibrancy('fullscreen-ui');
      }
      return { ok: true };
    } catch (err) {
      console.warn('[effects/main-blur] toggle failed:', err);
      return { ok: false, error: String(err) };
    }
  });

  // 广播最大化/还原事件供渲染层更新 UI
  mainWin.on('maximize', () => {
    try { mainWin.webContents.send('window/maxstate', true); } catch (e) {}
  });
  mainWin.on('unmaximize', () => {
    try { mainWin.webContents.send('window/maxstate', false); } catch (e) {}
  });

  // 窗口 ready 后发送初始最大化状态，并创建 BrowserView 复合布局
  mainWin.once('ready-to-show', () => {
    try { mainWin.webContents.send('window/maxstate', mainWin.isMaximized()); } catch (e) {}
    
    // 延迟一小段时间确保主窗口内容已加载，然后创建 BrowserView 复合布局
    // 关键问题：BrowserView 覆盖整个窗口时会拦截所有事件，即使设置了 pointer-events: none
    // 解决方案：创建两个独立的 BrowserView，分别覆盖顶部栏和侧边栏区域
    // 这样内容区域就不会被 BrowserView 覆盖，可以正常交互
    setTimeout(() => {
      const bounds = mainWin.getBounds();
      const titleBarHeight = 32;
      const sidebarWidth = 60;
      const sidebarUrl = getRendererUrl('sidebar.html');
      
      console.log('[MainWindow] 📦 准备创建顶部栏+侧边栏 BrowserView（合并为一个 L 形 BrowserView）...');
      console.log('[MainWindow] 📦 侧边栏 URL:', sidebarUrl);
      
      // 创建两个独立的 BrowserView：顶部栏和侧边栏
      // 这样内容区域（从 x=60, y=32 开始）不会被 BrowserView 覆盖，可以正常接收鼠标和键盘事件
      const topbarUrl = getRendererUrl('topbar.html');
      const sidebarUrlForView = getRendererUrl('sidebar.html');
      
      console.log('[MainWindow] 📦 准备创建顶部栏和侧边栏 BrowserView...');
      console.log('[MainWindow] 📦 顶部栏 URL:', topbarUrl);
      console.log('[MainWindow] 📦 侧边栏 URL:', sidebarUrl);
      
      // 1. 顶部栏 BrowserView：覆盖整个宽度，高度 32px
      const topbarView = createBrowserView('topbar', topbarUrl, {
        x: 0,
        y: 0,
        width: 1, // 整个宽度
        height: 32 / bounds.height // 高度 32px
      });
      
      // 2. 侧边栏 BrowserView：覆盖左侧 60px，从顶部栏下方开始到窗口底部
      const sidebarView = createBrowserView('sidebar', sidebarUrl, {
        x: 0,
        y: 32 / bounds.height, // 从顶部栏下方开始
        width: sidebarWidth / bounds.width, // 宽度 60px
        height: (bounds.height - 32) / bounds.height // 剩余高度
      });
      
      if (!topbarView || !sidebarView) {
        console.error('[MainWindow] ❌ 创建 BrowserView 失败');
        return;
      }
      
      console.log('[MainWindow] ✅ 顶部栏和侧边栏 BrowserView 创建成功');
      
      // 确保顶部栏 BrowserView 在最顶层
      if (topbarView) {
        try {
          if (typeof mainWin.setTopBrowserView === 'function') {
            mainWin.setTopBrowserView(topbarView);
            console.log('[MainWindow] ✅ 顶部栏 BrowserView 已设置为最顶层');
          }
        } catch (e) {
          console.warn('[MainWindow] ⚠️ 设置顶部栏层级失败:', e);
        }
      }
      
      // 监听加载完成
      if (topbarView && topbarView.webContents) {
        topbarView.webContents.once('did-finish-load', () => {
          console.log('[BrowserView:topbar] ✅ 顶部栏页面加载完成');
          // 页面加载完成后再次确保顶部栏在最顶层
          try {
            if (mainWin && !mainWin.isDestroyed() && topbarView && !topbarView.isDestroyed()) {
              mainWin.setTopBrowserView(topbarView);
            }
          } catch (e) {
            console.warn('[BrowserView:topbar] ⚠️ 设置层级失败:', e);
          }
        });
      }
      
      if (sidebarView && sidebarView.webContents) {
        sidebarView.webContents.once('did-finish-load', () => {
          console.log('[BrowserView:sidebar] ✅ 侧边栏页面加载完成');
        });
      }
    }, 500);
  });

  // 监听窗口大小变化，自动调整 BrowserView 布局
  mainWin.on('resize', () => {
    updateBrowserViewsLayout();
  });

  mainWin.on('move', () => {
    updateBrowserViewsLayout();
  });

  mainWin.on('closed', () => {
    // 主窗口关闭时，关闭所有其他窗口
    closeAllWindows();
    mainWin = null;
  });
}

// ==================== BrowserView 复合布局管理 ====================

/**
 * 更新所有 BrowserView 的布局（窗口大小变化时调用）
 */
function updateBrowserViewsLayout() {
  if (!mainWin || mainWin.isDestroyed()) return;
  
  const bounds = mainWin.getBounds();
  const titleBarHeight = 32; // 标题栏高度
  const contentHeight = bounds.height - titleBarHeight;
  
  for (const [viewId, viewData] of browserViews.entries()) {
    // 安全检查：确保 viewData 和 view 存在，并且 view 有 isDestroyed 方法
    if (!viewData || !viewData.view) {
      browserViews.delete(viewId);
      continue;
    }
    
    // 检查 BrowserView 是否已被销毁
    try {
      if (typeof viewData.view.isDestroyed === 'function' && viewData.view.isDestroyed()) {
        browserViews.delete(viewId);
        continue;
      }
    } catch (e) {
      // 如果 isDestroyed 调用失败，说明 view 可能已无效，移除它
      console.warn(`[BrowserView] ⚠️ 检查 ${viewId} 状态失败:`, e);
      browserViews.delete(viewId);
      continue;
    }
    
    // 根据相对位置和大小计算绝对位置
    let x = Math.floor(viewData.bounds.x * bounds.width);
    let y = Math.floor(viewData.bounds.y * bounds.height);
    let width = Math.floor(viewData.bounds.width * bounds.width);
    let height = Math.floor(viewData.bounds.height * bounds.height);
    
    // 顶部栏和侧边栏现在是两个独立的 BrowserView
    // 内容区域（从 x=60, y=32 开始）不会被 BrowserView 覆盖，可以正常接收鼠标和键盘事件
    if (viewId === 'topbar') {
      // 顶部栏：覆盖整个宽度，高度 32px
      x = 0;
      y = 0;
      width = bounds.width;
      height = 32;
    } else if (viewId === 'sidebar') {
      // 侧边栏：覆盖左侧 60px，从顶部栏下方开始到窗口底部
      x = 0;
      y = 32; // 从顶部栏下方开始（顶部栏高度 32px）
      width = 60;
      height = bounds.height - 32; // 剩余高度（总高度减去顶部栏高度）
    }
    
    viewData.view.setBounds({
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.max(100, width),
      height: Math.max(100, height)
    });
  }
}

/**
 * 创建 BrowserView
 * @param {string} viewId 视图ID（如 'display', 'lineManager'）
 * @param {string} url 要加载的URL
 * @param {object} bounds 相对位置和大小 {x: 0-1, y: 0-1, width: 0-1, height: 0-1}
 * @returns {BrowserView|null}
 */
function createBrowserView(viewId, url, bounds = { x: 0, y: 0, width: 1, height: 1 }) {
  console.log(`[BrowserView] ========== 创建 BrowserView: ${viewId} ==========`);
  console.log(`[BrowserView:${viewId}] URL:`, url);
  console.log(`[BrowserView:${viewId}] bounds:`, bounds);
  
  if (!mainWin || mainWin.isDestroyed()) {
    console.error('[BrowserView] ❌ 主窗口不存在，无法创建 BrowserView');
    return null;
  }
  
  console.log(`[BrowserView:${viewId}] ✅ 主窗口存在`);
  
  // 如果已存在，先移除
  if (browserViews.has(viewId)) {
    console.log(`[BrowserView:${viewId}] ⚠️ 已存在，先移除旧的`);
    removeBrowserView(viewId);
  }
  
  // 为侧边栏 BrowserView 启用透明背景以支持毛玻璃效果
  const viewOptions = {
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // 确保背景也能正常渲染
      transparent: true // 启用透明背景
    }
  };
  
  const view = new BrowserView(viewOptions);
  
  // 设置 BrowserView 背景为透明（让 mica-electron 的 Mica 效果透出）
  try {
    view.setBackgroundColor('#00000000');
    console.log(`[BrowserView:${viewId}] ✅ 已设置背景为透明`);
  } catch (e) {
    console.warn(`[BrowserView:${viewId}] ⚠️ 设置透明背景失败:`, e);
  }
  
  // 确保 BrowserView 没有边框和框架（对于侧边栏）
  if (viewId === 'sidebar') {
    // BrowserView 本身没有边框，但我们需要确保内容区域正确显示
    console.log(`[BrowserView:${viewId}] 创建侧边栏视图，bounds:`, bounds);
  }
  
  // 存储视图和布局信息
  browserViews.set(viewId, {
    view: view,
    bounds: bounds
  });
  
  // 加载URL
  console.log(`[BrowserView:${viewId}] 📥 开始加载 URL:`, url);
  view.webContents.loadURL(url);
  
  // 设置初始布局
  console.log(`[BrowserView:${viewId}] 📐 设置初始布局`);
  updateBrowserViewsLayout();
  
  // 为侧边栏 BrowserView 添加毛玻璃效果（透到桌面）
  if (viewId === 'sidebar') {
    // BrowserView 的模糊效果通过 mica-electron 实现（主窗口的 Mica 效果会透出）
    // 主窗口已设置为透明，所以 BrowserView 的内容可以透到桌面
    view.webContents.once('did-finish-load', () => {
      console.log(`[BrowserView:${viewId}] ✅ 页面加载完成，毛玻璃效果通过 mica-electron 实现`);
      
      // 延迟检查 DOM，确保 Vue 组件已渲染
      setTimeout(() => {
        view.webContents.executeJavaScript(`
          (function() {
            const leftrailApp = document.getElementById('leftrail-app');
            const leftRail = document.getElementById('leftRail');
            const buttons = leftRail?.querySelectorAll('button') || [];
            console.log('[BrowserView:sidebar] DOM 检查:', {
              leftrailApp: !!leftrailApp,
              leftRail: !!leftRail,
              buttonsCount: buttons.length,
              leftrailAppChildren: leftrailApp?.children?.length || 0
            });
            if (buttons.length > 0) {
              console.log('[BrowserView:sidebar] ✅ 按钮已渲染:', buttons.length);
            } else {
              console.warn('[BrowserView:sidebar] ⚠️ 未找到按钮');
            }
          })();
        `).catch(e => console.warn('[BrowserView:sidebar] DOM 检查失败:', e));
      }, 2000);
    });
    
    // 监听页面加载失败
    view.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[BrowserView:${viewId}] ❌ 页面加载失败:`, errorCode, errorDescription);
    });
  }
  
  // 开发模式下打开 DevTools
  if (!app.isPackaged) {
    console.log(`[BrowserView:${viewId}] 🔧 打开 DevTools`);
    view.webContents.openDevTools();
  }
  
  // 监听 console 消息并转发到主进程
  view.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = `[BrowserView:${viewId}]`;
    if (level === 0) console.log(prefix, message);
    else if (level === 1) console.warn(prefix, message);
    else if (level === 2) console.error(prefix, message);
  });
  
  // 将视图附加到主窗口（使用 addBrowserView 支持多个 BrowserView）
  try {
    if (typeof mainWin.addBrowserView === 'function') {
      // Electron 较新版本支持 addBrowserView（支持多个 BrowserView）
      mainWin.addBrowserView(view);
      console.log(`[BrowserView:${viewId}] ✅ 已使用 addBrowserView 添加到主窗口`);
    } else {
      // 旧版本使用 setBrowserView（只能设置一个）
      mainWin.setBrowserView(view);
      console.log(`[BrowserView:${viewId}] ✅ 已使用 setBrowserView 添加到主窗口`);
    }
  } catch (e) {
    console.error(`[BrowserView:${viewId}] ❌ 添加 BrowserView 到窗口失败:`, e);
  }
  
  // 对于顶部栏，确保它在最上层
  if (viewId === 'topbar') {
    try {
      if (typeof mainWin.setTopBrowserView === 'function') {
        mainWin.setTopBrowserView(view);
        console.log(`[BrowserView:${viewId}] ✅ 顶部栏已设置为最顶层`);
      }
    } catch (e) {
      console.warn(`[BrowserView:${viewId}] ⚠️ 设置顶部栏层级失败:`, e);
    }
  }
  
  console.log(`[BrowserView] 创建视图: ${viewId}, URL: ${url}`);
  return view;
}

/**
 * 移除 BrowserView
 * @param {string} viewId 视图ID
 */
function removeBrowserView(viewId) {
  if (!browserViews.has(viewId)) return;
  
  const viewData = browserViews.get(viewId);
  // 安全检查：确保 viewData 和 view 存在，并且 view 有 isDestroyed 方法
  if (viewData && viewData.view) {
    try {
      if (typeof viewData.view.isDestroyed === 'function' && !viewData.view.isDestroyed()) {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.removeBrowserView(viewData.view);
        }
        viewData.view.destroy();
      }
    } catch (e) {
      console.warn(`[BrowserView] ⚠️ 移除 ${viewId} 时检查状态失败:`, e);
      // 即使检查失败，也尝试销毁 view
      try {
        if (viewData.view && typeof viewData.view.destroy === 'function') {
          viewData.view.destroy();
        }
      } catch (destroyErr) {
        console.warn(`[BrowserView] ⚠️ 销毁 ${viewId} 失败:`, destroyErr);
      }
    }
  }
  
  browserViews.delete(viewId);
  console.log(`[BrowserView] 移除视图: ${viewId}`);
  
  // 如果还有其他视图，重新设置最后一个为活动视图
  if (browserViews.size > 0 && mainWin && !mainWin.isDestroyed()) {
    const lastView = Array.from(browserViews.values())[browserViews.size - 1];
    if (lastView && lastView.view) {
      try {
        if (typeof lastView.view.isDestroyed === 'function' && !lastView.view.isDestroyed()) {
          mainWin.setBrowserView(lastView.view);
        }
      } catch (e) {
        console.warn(`[BrowserView] ⚠️ 设置活动视图失败:`, e);
      }
    }
  } else if (mainWin && !mainWin.isDestroyed()) {
    mainWin.setBrowserView(null);
  }
}

/**
 * 更新 BrowserView 的布局
 * @param {string} viewId 视图ID
 * @param {object} bounds 新的相对位置和大小
 */
function updateBrowserViewBounds(viewId, bounds) {
  if (!browserViews.has(viewId)) return false;
  
  const viewData = browserViews.get(viewId);
  if (viewData) {
    viewData.bounds = { ...viewData.bounds, ...bounds };
    updateBrowserViewsLayout();
    return true;
  }
  return false;
}

// IPC 接口：创建 BrowserView
ipcMain.handle('browserview/create', async (event, { viewId, url, bounds }) => {
  try {
    const view = createBrowserView(viewId, url, bounds);
    return { ok: !!view, viewId };
  } catch (e) {
    console.error('[BrowserView] 创建失败:', e);
    return { ok: false, error: String(e) };
  }
});

// IPC 接口：移除 BrowserView
ipcMain.handle('browserview/remove', async (event, viewId) => {
  try {
    removeBrowserView(viewId);
    return { ok: true };
  } catch (e) {
    console.error('[BrowserView] 移除失败:', e);
    return { ok: false, error: String(e) };
  }
});

// IPC 接口：更新 BrowserView 布局
ipcMain.handle('browserview/update-bounds', async (event, viewId, bounds) => {
  try {
    const success = updateBrowserViewBounds(viewId, bounds);
    return { ok: success };
  } catch (e) {
    console.error('[BrowserView] 更新布局失败:', e);
    return { ok: false, error: String(e) };
  }
});

// IPC 接口：列出所有 BrowserView
ipcMain.handle('browserview/list', async () => {
  return {
    ok: true,
    views: Array.from(browserViews.keys()).map(viewId => {
      const viewData = browserViews.get(viewId);
      return {
        viewId,
        bounds: viewData ? viewData.bounds : null
      };
    })
  };
});

// 设置框架层级（用于控制 BrowserView 的层级）
// 按照图片中的方案：使用 setTopBrowserView 来控制 BrowserView 的层级
// 正常情况：内容区域的 BrowserView（主窗口 webContents）在框架布局的 BrowserView 之上
// 弹出/提示情况：如果框架弹出下拉框或提示，框架布局的 BrowserView 会被提升到最顶层
// 按照图片中的方案：使用 setTopBrowserView 来控制 BrowserView 的层级
// 正常情况：内容区域的 BrowserView（主窗口 webContents）在框架布局的 BrowserView 之上
// 弹出/提示情况：如果框架弹出下拉框或提示，框架布局的 BrowserView 会被提升到最顶层
ipcMain.handle('browserview/set-frame-level', async (event, { top }) => {
  try {
    const frameViewData = browserViews.get('frame');
    if (!frameViewData || !frameViewData.view) {
      return { ok: false, error: 'frame BrowserView not found' };
    }
    
    const frameView = frameViewData.view;
    if (frameView.isDestroyed && frameView.isDestroyed()) {
      return { ok: false, error: 'frame BrowserView is destroyed' };
    }
    
    if (top) {
      // 将框架 BrowserView 提升到最顶层（用于显示下拉框或提示）
      if (typeof mainWin.setTopBrowserView === 'function') {
        mainWin.setTopBrowserView(frameView);
        console.log('[BrowserView:frame] ✅ 框架已提升到最顶层');
      }
    } else {
      // 将框架 BrowserView 降到底层，让主窗口的 webContents 和其他 BrowserView 在上层
      // 获取所有 BrowserView，将除了框架 BrowserView 之外的其他 BrowserView 提升到顶层
      const allViews = mainWin.getBrowserViews();
      for (let i = allViews.length - 1; i >= 0; i--) {
        const view = allViews[i];
        if (view && view !== frameView && !view.isDestroyed()) {
          if (typeof mainWin.setTopBrowserView === 'function') {
            mainWin.setTopBrowserView(view);
          }
        }
      }
      // 如果没有其他 BrowserView，主窗口的 webContents 自然在上层
      console.log('[BrowserView:frame] ✅ 框架已降到底层，内容区域可以接收鼠标事件');
    }
    
    return { ok: true };
  } catch (e) {
    console.error('[BrowserView:sidebar] 设置框架层级失败:', e);
    return { ok: false, error: String(e) };
  }
});

// 面板切换 IPC 处理器（侧边栏 -> 主窗口）
ipcMain.handle('ui/switch-panel', async (event, panelId) => {
  // 将消息发送到主窗口
  if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
    try {
      mainWin.webContents.send('ui/panel-state-changed', panelId);
      
      // 面板切换后重新应用 Mica 效果（多次延迟确保生效）
      console.log('[MainWindow] 面板切换:', panelId, '，重新应用 Mica 效果');
      reapplyMicaEffect();
      
      // 延迟再次应用，确保 Vue 组件切换完成后效果仍然存在
      setTimeout(() => {
        reapplyMicaEffect();
      }, 200);
      
      // 更长的延迟，确保主页完全加载后效果仍然存在
      setTimeout(() => {
        reapplyMicaEffect();
      }, 500);
      
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return { ok: false, error: 'main-window-not-available' };
});

ipcMain.handle('ui/close-panel', async (event) => {
  // 将消息发送到主窗口
  if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
    try {
      mainWin.webContents.send('ui/panel-state-changed', null);
      
      // 关闭面板后（可能返回到主页）重新应用 Mica 效果
      console.log('[MainWindow] 关闭面板，重新应用 Mica 效果');
      reapplyMicaEffect();
      
      // 延迟再次应用，确保主页完全加载后效果仍然存在
      setTimeout(() => {
        reapplyMicaEffect();
      }, 200);
      
      setTimeout(() => {
        reapplyMicaEffect();
      }, 500);
      
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return { ok: false, error: 'main-window-not-available' };
});

// ==================== BrowserView 管理结束 ====================

// 辅助：默认线路文件目录位于 userData/lines/默认
function getLinesDir(dir) {
  if (dir && typeof dir === 'string' && dir.length > 0) return dir;
  // 获取当前活动的文件夹
  const currentFolder = store ? (store.get('linesCurrentFolder') || 'default') : 'default';
  const folders = store ? (store.get('linesFolders') || {}) : {};
  if (folders[currentFolder]) {
    return folders[currentFolder].path;
  }
  // 如果默认文件夹不存在，使用默认路径（lines/默认）
  const defaultPath = path.join(app.getPath('userData'), 'lines', '默认');
  // 确保物理目录存在
  try {
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }
  } catch (e) {
    console.warn('[getLinesDir] 创建默认线路目录失败:', e);
  }
  // 确保默认文件夹被添加到列表中
  if (store) {
    const currentFolders = store.get('linesFolders') || {};
    if (!currentFolders.default) {
      currentFolders.default = { name: '默认', path: defaultPath };
      store.set('linesFolders', currentFolders);
      if (!store.get('linesCurrentFolder')) {
        store.set('linesCurrentFolder', 'default');
      }
    }
  }
  return defaultPath;
}

// 获取所有文件夹配置
function getLinesFolders() {
  if (!store) {
    const defaultPath = path.join(app.getPath('userData'), 'lines', '默认');
    // 确保物理目录存在
    try {
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
    } catch (e) {
      console.warn('[getLinesFolders] (no-store) 创建默认线路目录失败:', e);
    }
    return {
      default: {
        name: '默认',
        path: defaultPath
      }
    };
  }
  const folders = store.get('linesFolders') || {};
  // 确保有默认文件夹
  if (!folders.default) {
    const defaultPath = path.join(app.getPath('userData'), 'lines', '默认');
    // 确保物理目录存在
    try {
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
    } catch (e) {
      console.warn('[getLinesFolders] 创建默认线路目录失败:', e);
    }
    folders.default = {
      name: '默认',
      path: defaultPath
    };
    store.set('linesFolders', folders);
  }
  return folders;
}

// 获取当前活动的文件夹ID
function getCurrentLinesFolder() {
  if (!store) return 'default';
  return store.get('linesCurrentFolder') || 'default';
}

async function ensureDir(dir) {
  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (e) {
    // 忽略错误
  }
}

// 初始化预设线路文件：从 preset-lines 文件夹复制到默认文件夹
async function initPresetLinesFromSource() {
  try {
    // 获取应用目录下的 preset-lines 文件夹路径
    // 打包后使用 app.getAppPath()，开发环境使用 __dirname
    // asarUnpack 会将 preset-lines 解包到 app.asar.unpacked 中
    let presetLinesDir;
    if (app.isPackaged) {
      // 打包后，优先检查 app.asar.unpacked/preset-lines（解包目录）
      const appPath = app.getAppPath();
      const unpackedDir = path.join(path.dirname(appPath), 'app.asar.unpacked', 'preset-lines');
      if (fs.existsSync(unpackedDir)) {
        presetLinesDir = unpackedDir;
      } else {
        // 如果解包目录不存在，尝试从 asar 中读取
        presetLinesDir = path.join(appPath, 'preset-lines');
      }
    } else {
      // 开发环境
      presetLinesDir = path.join(__dirname, 'preset-lines');
    }
    
    // 检查 preset-lines 文件夹是否存在
    try {
      await fsPromises.access(presetLinesDir);
    } catch (e) {
      // 文件夹不存在，跳过初始化
      console.log('[initPresetLines] preset-lines 文件夹不存在，跳过初始化');
      return;
    }
    
    // 获取默认文件夹路径（lines/默认）
    const defaultLinesDir = path.join(app.getPath('userData'), 'lines', '默认');
    await ensureDir(defaultLinesDir);
    
    // 确保默认文件夹在配置中
    if (store) {
      const folders = store.get('linesFolders') || {};
      if (!folders.default) {
        folders.default = { name: '默认', path: defaultLinesDir };
        store.set('linesFolders', folders);
      }
    }
    
    // 读取 preset-lines 文件夹中的所有 JSON 文件
    const files = await fsPromises.readdir(presetLinesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      console.log('[initPresetLines] preset-lines 文件夹中没有 JSON 文件');
      return;
    }
    
    // 复制每个文件到默认文件夹（仅当目标文件不存在时）
    let copiedCount = 0;
    for (const filename of jsonFiles) {
      try {
        const sourcePath = path.join(presetLinesDir, filename);
        const targetPath = path.join(defaultLinesDir, filename);
        
        // 检查目标文件是否已存在
        try {
          await fsPromises.access(targetPath);
          // 文件已存在，跳过
          continue;
        } catch (e) {
          // 文件不存在，复制文件
          const content = await fsPromises.readFile(sourcePath, 'utf8');
          await fsPromises.writeFile(targetPath, content, 'utf8');
          copiedCount++;
          console.log(`[initPresetLines] 已复制预设线路文件: ${filename}`);
        }
      } catch (e) {
        console.warn(`[initPresetLines] 复制文件 ${filename} 失败:`, e);
      }
    }
    
    if (copiedCount > 0) {
      console.log(`[initPresetLines] 初始化完成，共复制 ${copiedCount} 个预设线路文件`);
    } else {
      console.log('[initPresetLines] 所有预设线路文件已存在，跳过复制');
    }
  } catch (e) {
    console.warn('[initPresetLines] 初始化预设线路文件失败:', e);
  }
}


// 查找 JSON 文件的辅助函数（recursive 参数控制是否递归查找子文件夹）
async function findJsonFiles(dir, baseDir = null, recursive = false) {
  if (!baseDir) baseDir = dir;
  const out = [];
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 如果启用递归，递归查找子文件夹
        if (recursive) {
          const subFiles = await findJsonFiles(fullPath, baseDir, recursive);
          out.push(...subFiles);
        }
        // 如果不递归，跳过子文件夹
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          const txt = await fsPromises.readFile(fullPath, 'utf8');
          let json = null;
          try { json = JSON.parse(txt); } catch (e) { json = null; }
          const version = json && json.meta && json.meta.version ? json.meta.version : null;
          // 计算相对路径作为文件名（相对于 baseDir）
          const relativePath = path.relative(baseDir, fullPath);
          const nameWithoutExt = relativePath.replace(/\.json$/i, '').replace(/\\/g, '/');
          out.push({ name: nameWithoutExt, version, mtime: stat.mtimeMs, fullPath });
        } catch (e) {
          // 出错则跳过该文件
        }
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return out;
}

// 列出线路文件(JSON)，返回 { name, version, mtime } 数组（支持递归查找子文件夹）
// dir 可以是文件夹路径（字符串）或文件夹ID
ipcMain.handle('lines/list', async (event, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  await ensureDir(base);
  try {
    // 不递归查找子文件夹，只查找当前文件夹下的 JSON 文件
    const files = await findJsonFiles(base, base, false);
    return files;
  } catch (err) {
    return { error: String(err) };
  }
});

// 读取单个线路文件（支持子文件夹路径）
ipcMain.handle('lines/read', async (event, filename, dir) => {
  let base;
  if (dir && typeof dir === 'string') {
    // 如果 dir 看起来像是一个完整路径（包含路径分隔符或绝对路径）
    if (dir.includes(path.sep) || path.isAbsolute(dir)) {
      base = dir;
    } else {
      // 否则认为是文件夹ID，从配置中获取路径
      const folders = getLinesFolders();
      if (folders[dir]) {
        base = folders[dir].path;
      } else {
        base = getLinesDir(dir);
      }
    }
  } else {
    base = getLinesDir(dir);
  }
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 保存线路文件，附带简单版本处理（支持子文件夹路径）
ipcMain.handle('lines/save', async (event, filename, contentObj, dir) => {
  const base = getLinesDir(dir);
  await ensureDir(base);
  // 如果 filename 包含路径分隔符，说明要保存到子文件夹
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
    // 确保父目录存在
    await ensureDir(path.dirname(fp));
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    let existing = null;
    try {
      const t = await fsPromises.readFile(fp, 'utf8');
      existing = JSON.parse(t);
    } catch (e) {
      existing = null;
    }
    const existingVer = existing && existing.meta && existing.meta.version ? existing.meta.version : 0;
    if (!contentObj.meta) contentObj.meta = {};
    const incomingVer = contentObj.meta.version ? contentObj.meta.version : 0;
    if (incomingVer <= existingVer) {
      contentObj.meta.version = existingVer + 1; // 版本递增
    }
    // 写入文件
    await fsPromises.writeFile(fp, JSON.stringify(contentObj, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 删除线路文件（支持子文件夹路径）
ipcMain.handle('lines/delete', async (event, filename, dir) => {
  const base = getLinesDir(dir);
  // 如果 filename 包含路径分隔符，说明是子文件夹中的文件
  let fp;
  if (filename.includes('/') || filename.includes('\\')) {
    // 相对路径，直接拼接
    fp = path.join(base, filename);
    if (!fp.endsWith('.json')) fp += '.json';
  } else {
    // 简单文件名
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    fp = path.join(base, name);
  }
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 在文件管理器中打开线路目录
ipcMain.handle('lines/openFolder', async (event, dir) => {
  const base = getLinesDir(dir);
  try {
    await ensureDir(base);
    const r = await shell.openPath(base);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: base };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 打开指定的文件夹路径（用于右键菜单）
ipcMain.handle('lines/folders/open', async (event, folderPath) => {
  try {
    const r = await shell.openPath(folderPath);
    if (r && r.length) return { ok: false, error: r };
    return { ok: true, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：列出所有文件夹（自动扫描并添加已存在的文件夹）
ipcMain.handle('lines/folders/list', async () => {
  try {
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 扫描 lines 目录下的所有子文件夹
    const existingDirs = [];
    try {
      const entries = await fsPromises.readdir(baseLinesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(baseLinesDir, entry.name);
          existingDirs.push({
            name: entry.name,
            path: dirPath
          });
        }
      }
    } catch (e) {
      console.warn('扫描文件夹失败:', e);
    }
    
    // 获取当前配置的文件夹
    let folders = getLinesFolders();
    let hasChanges = false;
    
    // 将已存在但未配置的文件夹添加到配置中
    for (const dir of existingDirs) {
      const existingId = Object.keys(folders).find(id => folders[id].path === dir.path);
      if (!existingId) {
        // 文件夹存在但不在配置中，自动添加
        const newId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        folders[newId] = { name: dir.name, path: dir.path };
        hasChanges = true;
      }
    }
    
    // 如果有新文件夹被添加，保存配置
    if (hasChanges && store) {
      store.set('linesFolders', folders);
    }
    
    const current = getCurrentLinesFolder();
    const result = Object.keys(folders).map(id => ({
      id,
      name: folders[id].name,
      path: folders[id].path,
      isCurrent: id === current
    }));
    return { ok: true, folders: result, current };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：添加文件夹（在 lines 目录下创建子文件夹）
ipcMain.handle('lines/folders/add', async (event, folderName) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
  if (!win) return { ok: false, error: 'no-window' };
  try {
    // 获取 lines 基础目录
    const baseLinesDir = path.join(app.getPath('userData'), 'lines');
    await ensureDir(baseLinesDir);
    
    // 如果没有提供文件夹名，返回错误提示前端先获取用户输入
    if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
      return { ok: false, error: 'folder-name-required' };
    }
    
    // 清理文件夹名称，移除不合法字符
    const sanitizedFolderName = folderName.trim().replace(/[<>:"/\\|?*]/g, '');
    if (!sanitizedFolderName) {
      return { ok: false, error: '文件夹名称无效' };
    }
    
    // 先检查文件夹名称是否已存在（按名称检查，不按路径）
    const folders = getLinesFolders();
    const existingByName = Object.keys(folders).find(id => {
      const folder = folders[id];
      return folder && folder.name === sanitizedFolderName;
    });
    if (existingByName) {
      return { ok: false, error: `文件夹名称"${sanitizedFolderName}"已存在，请使用其他名称` };
    }
    
    // 构建完整路径
    const folderPath = path.join(baseLinesDir, sanitizedFolderName);
    
    // 检查文件夹路径是否已存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (stat.isDirectory()) {
        // 文件夹路径已存在，检查是否已在配置中
        const existingId = Object.keys(folders).find(id => folders[id].path === folderPath);
        if (existingId) {
          return { ok: false, error: '该文件夹路径已存在', folderId: existingId };
        }
        // 文件夹路径已存在但不在配置中，直接添加到配置
      } else {
        return { ok: false, error: '路径已存在但不是文件夹' };
      }
    } catch (e) {
      // 文件夹不存在，创建它
      await ensureDir(folderPath);
    }
    
    // 再次检查该路径是否已经在配置中（防止并发创建）
    const foldersCheck = getLinesFolders();
    const existingId = Object.keys(foldersCheck).find(id => foldersCheck[id].path === folderPath);
    if (existingId) {
      return { ok: false, error: '该文件夹已存在', folderId: existingId };
    }
    
    // 生成新的文件夹ID（使用时间戳）
    const newId = `folder_${Date.now()}`;
    
    foldersCheck[newId] = { name: sanitizedFolderName, path: folderPath };
    if (store) {
      store.set('linesFolders', foldersCheck);
    }
    
    return { ok: true, folderId: newId, name: sanitizedFolderName, path: folderPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：删除文件夹（同时删除文件夹及其内部的所有文件）
// 支持通过路径或ID来删除文件夹（优先使用路径）
ipcMain.handle('lines/folders/remove', async (event, folderPathOrId) => {
  try {
    if (folderPathOrId === 'default') {
      return { ok: false, error: '不能删除默认文件夹' };
    }
    
    console.log(`[main] 删除文件夹，参数: ${folderPathOrId}`);
    const folders = getLinesFolders();
    
    let targetFolderId = null;
    let folderPath = null;
    
    // 判断传入的是路径还是ID
    const isPath = folderPathOrId.includes(path.sep) || path.isAbsolute(folderPathOrId);
    
    if (isPath) {
      // 传入的是路径，通过路径查找配置中的文件夹
      folderPath = folderPathOrId;
      // 标准化路径（处理路径分隔符差异）
      const normalizedPath = path.normalize(folderPath);
      
      // 在配置中查找匹配的路径
      for (const [id, folder] of Object.entries(folders)) {
        if (id === 'default') continue;
        const normalizedFolderPath = path.normalize(folder.path);
        if (normalizedFolderPath === normalizedPath) {
          targetFolderId = id;
          break;
        }
      }
      
      if (!targetFolderId) {
        console.warn(`[main] 通过路径找不到文件夹配置，路径: ${folderPath}`);
        // 即使配置中找不到，也尝试直接删除文件系统中的文件夹
        // 这样可以处理配置不同步的情况
      }
    } else {
      // 传入的是ID，通过ID查找
      targetFolderId = folderPathOrId;
      if (!folders[targetFolderId]) {
        const availableIds = Object.keys(folders);
        const errorMsg = `文件夹配置不存在。请求的ID: "${targetFolderId}"，当前可用的ID: ${availableIds.length > 0 ? availableIds.map(id => `"${id}"`).join(', ') : '无'}`;
        console.warn(`[main] ${errorMsg}`);
        return { ok: false, error: errorMsg };
      }
      folderPath = folders[targetFolderId].path;
    }
    
    // 如果没有找到配置但传入了路径，使用传入的路径直接删除
    if (!targetFolderId && isPath) {
      console.log(`[main] 配置中未找到文件夹，但将尝试删除路径: ${folderPath}`);
    }
    
    // 验证文件夹路径是否存在
    try {
      const stat = await fsPromises.stat(folderPath);
      if (!stat.isDirectory()) {
        // 路径存在但不是文件夹，只删除配置（如果找到了配置）
        console.warn(`路径 ${folderPath} 存在但不是文件夹，只删除配置`);
        if (targetFolderId && folders[targetFolderId]) {
          delete folders[targetFolderId];
          if (store) {
            store.set('linesFolders', folders);
          }
        }
        return { ok: true };
      }
    } catch (statErr) {
      // 文件夹路径不存在，可能已经被删除，只删除配置（如果找到了配置）
      console.warn(`文件夹路径 ${folderPath} 不存在，只删除配置:`, statErr.message);
      if (targetFolderId && folders[targetFolderId]) {
        delete folders[targetFolderId];
        if (store) {
          store.set('linesFolders', folders);
        }
      }
      return { ok: true };
    }
    
    // 如果删除的是当前文件夹，切换到默认文件夹
    if (targetFolderId) {
      const current = getCurrentLinesFolder();
      if (current === targetFolderId) {
        if (store) {
          store.set('linesCurrentFolder', 'default');
        }
      }
    }
    
    // 删除文件夹及其内部的所有文件
    try {
      // 使用 Node.js 14.14.0+ 的 fs.promises.rm，支持 recursive 选项
      await fsPromises.rm(folderPath, { recursive: true, force: true });
      console.log(`成功删除文件夹: ${folderPath}`);
    } catch (rmErr) {
      // 如果 fs.promises.rm 不可用或失败，尝试使用 rmdir
      try {
        await fsPromises.rmdir(folderPath, { recursive: true });
        console.log(`使用 rmdir 成功删除文件夹: ${folderPath}`);
      } catch (rmdirErr) {
        // 如果都失败，记录错误但继续删除配置
        console.error(`删除文件夹失败 ${folderPath}:`, rmdirErr);
        // 即使删除失败，也继续删除配置，避免配置和实际文件不一致
        // return { ok: false, error: `删除文件夹失败: ${rmdirErr.message}` };
      }
    }
    
    // 从配置中移除文件夹（如果找到了配置）
    if (targetFolderId && folders[targetFolderId]) {
      delete folders[targetFolderId];
      if (store) {
        store.set('linesFolders', folders);
      }
    }
    
    return { ok: true };
  } catch (err) {
    console.error('删除文件夹时发生错误:', err);
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：重命名文件夹
ipcMain.handle('lines/folders/rename', async (event, folderId, newName) => {
  try {
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
      return { ok: false, error: '文件夹名称不能为空' };
    }
    
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    folders[folderId].name = newName.trim();
    if (store) {
      store.set('linesFolders', folders);
    }
    
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：切换当前文件夹
ipcMain.handle('lines/folders/switch', async (event, folderId) => {
  try {
    const folders = getLinesFolders();
    if (!folders[folderId]) {
      return { ok: false, error: '文件夹不存在' };
    }
    
    if (store) {
      store.set('linesCurrentFolder', folderId);
    }
    
    return { ok: true, folderId, name: folders[folderId].name, path: folders[folderId].path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 多文件夹管理：获取当前文件夹
ipcMain.handle('lines/folders/current', async () => {
  try {
    const folders = getLinesFolders();
    const current = getCurrentLinesFolder();
    const folder = folders[current];
    if (!folder) {
      return { ok: false, error: '当前文件夹不存在' };
    }
    return { ok: true, folderId: current, name: folder.name, path: folder.path };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 短交路预设目录
function getShortTurnsDir() {
  return path.join(app.getPath('userData'), 'shortturns');
}

// 列出短交路预设（按线路名称筛选）
ipcMain.handle('shortturns/list', async (event, lineName) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  try {
    const files = await findJsonFiles(base, base, false); // 不递归查找子文件夹
    const presets = [];
    for (const file of files) {
      try {
        const res = await fsPromises.readFile(file.fullPath, 'utf8');
        const preset = JSON.parse(res);
        // 如果指定了线路名称，只返回匹配的预设
        if (!lineName || (preset.lineName && preset.lineName === lineName)) {
          // file.name 可能包含路径，我们只需要文件名（不含扩展名）
          const presetName = path.basename(file.name, '.json');
          presets.push({
            name: presetName,
            ...preset,
            mtime: file.mtime
          });
        }
      } catch (e) {
        // 跳过无效文件
      }
    }
    return presets;
  } catch (err) {
    return { error: String(err) };
  }
});

// 保存短交路预设
ipcMain.handle('shortturns/save', async (event, presetName, presetData) => {
  const base = getShortTurnsDir();
  await ensureDir(base);
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.writeFile(fp, JSON.stringify(presetData, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 读取短交路预设
ipcMain.handle('shortturns/read', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    const txt = await fsPromises.readFile(fp, 'utf8');
    return { ok: true, content: JSON.parse(txt) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 删除短交路预设
ipcMain.handle('shortturns/delete', async (event, presetName) => {
  const base = getShortTurnsDir();
  const sanitized = presetName.replace(/[<>:"/\\|?*]/g, '').trim();
  if (!sanitized) {
    return { ok: false, error: '预设名称无效' };
  }
  const fp = path.join(base, sanitized + '.json');
  try {
    await fsPromises.unlink(fp);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 计算数据的 MD5 哈希值（用于比较线路是否相同）
ipcMain.handle('utils/calculate-md5', async (event, data) => {
  try {
    // 标准化数据（移除版本号等可能变化的字段）
    const normalizeForCompare = (line) => {
      const normalized = JSON.parse(JSON.stringify(line));
      if (normalized.meta) {
        delete normalized.meta.version;
      }
      return normalized;
    };
    
    const normalized = normalizeForCompare(data);
    
    // 将数据转换为 JSON 字符串（标准化格式，排序键）
    const jsonStr = JSON.stringify(normalized, Object.keys(normalized).sort());
    
    // 使用 Node.js crypto 模块计算 MD5
    const hash = crypto.createHash('md5').update(jsonStr, 'utf8').digest('hex');
    return { ok: true, hash };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 在默认浏览器打开外部链接
ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return { ok: false, error: 'invalid-url' };
    const result = await shell.openExternal(url);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 提供应用版本给渲染层
ipcMain.handle('app/get-version', async () => {
  try {
    return { ok: true, version: app.getVersion() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('app/is-packaged', async () => {
  try {
    return app.isPackaged;
  } catch (e) {
    return false;
  }
});

// Mica Electron IPC 处理器
ipcMain.handle('mica/get-info', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    const info = {
      isWindows11: IS_WINDOWS_11,
      isWindows10: !!WIN10,
      currentEffect: null,
      currentTheme: 'auto',
      backgroundColor: mainWin.getBackgroundColor ? mainWin.getBackgroundColor() : '#00000000'
    };
    
    // 尝试检测当前效果（通过检查方法是否存在）
    if (MicaBrowserWindow !== BrowserWindow && mainWin) {
      if (typeof mainWin.setMicaAcrylicEffect === 'function') {
        // 无法直接检测当前效果，但可以知道支持 Mica Acrylic
        info.currentEffect = 'acrylic'; // 使用 Acrylic 效果
      } else if (typeof mainWin.setMicaEffect === 'function') {
        info.currentEffect = 'mica'; // 标准 Mica 效果
      }
    }
    
    return { ok: true, ...info };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-mica-effect', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (!IS_WINDOWS_11) {
      return { ok: false, error: 'Mica 效果仅支持 Windows 11' };
    }
    
    if (typeof mainWin.setMicaAcrylicEffect !== 'function') {
      return { ok: false, error: 'setMicaAcrylicEffect 方法不可用' };
    }
    
    // 重要：按照 mica-electron 的要求，必须先设置背景为透明，再应用 Mica 效果
    // Mica 效果在 Windows 11 上需要窗口背景完全透明才能显示
    
    // 步骤1: 先设置主题（Mica 效果需要主题支持）
    if (typeof mainWin.setAutoTheme === 'function') {
      mainWin.setAutoTheme();
      console.log('[Mica IPC] 步骤1: 已设置自动主题');
    } else if (typeof mainWin.setLightTheme === 'function') {
      mainWin.setLightTheme();
      console.log('[Mica IPC] 步骤1: 已设置浅色主题');
    }
    
    // 步骤2: 设置背景为透明（多次设置确保生效）
    mainWin.setBackgroundColor('#00000000');
    console.log('[Mica IPC] 步骤2: 设置背景为透明');
    
    // 延迟一下，确保背景色设置生效
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 步骤3: 再次设置背景透明
    mainWin.setBackgroundColor('#00000000');
    console.log('[Mica IPC] 步骤3: 再次确保背景透明');
    
    // 步骤4: 应用 Mica Acrylic 效果（更强的模糊）
    // 注意：Mica Acrylic 效果可能需要窗口有焦点才能显示
    // 如果窗口失去焦点，效果可能会消失
    mainWin.setMicaAcrylicEffect();
    console.log('[Mica IPC] 步骤4: 已调用 setMicaAcrylicEffect()');
    
    // 尝试使用 alwaysFocused 来保持 Mica 效果（如果可用）
    // 注意：这会降低性能，所以只在需要时使用
    // 暂时禁用 alwaysFocused，因为它可能不是必需的
    // if (typeof mainWin.alwaysFocused === 'function') {
    //   try {
    //     mainWin.alwaysFocused(true);
    //     console.log('[Mica IPC] 步骤4.1: 已启用 alwaysFocused 以保持 Mica 效果');
    //   } catch (e) {
    //     console.warn('[Mica IPC] alwaysFocused 不可用:', e);
    //   }
    // }
    
    // 确保窗口有焦点（Mica 效果可能需要窗口有焦点才能显示）
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.focus();
      console.log('[Mica IPC] 步骤4.1: 已确保窗口有焦点');
    }
    
    // 步骤5: 延迟再次应用，确保效果生效
    setTimeout(() => {
      try {
        mainWin.setBackgroundColor('#00000000');
        mainWin.setMicaAcrylicEffect();
        const bgFinal = mainWin.getBackgroundColor();
        console.log('[Mica IPC] 步骤5: 延迟再次应用 Mica Acrylic 效果，最终背景色:', bgFinal);
        console.log('[Mica IPC] 💡 提示：即使显示 #000000，Mica 模糊效果应该仍然可见');
        console.log('[Mica IPC] 💡 如果看不到模糊，请检查内容区域的背景色是否遮挡了效果');
        
        // 检查背景色（应用 Mica 后可能返回 #000000，这是正常的）
        const bgAfterMica = mainWin.getBackgroundColor();
        console.log('[Mica IPC] 应用 Mica 后背景色:', bgAfterMica);
        console.log('[Mica IPC] 💡 提示：即使显示 #000000，Mica 模糊效果应该仍然可见');
        console.log('[Mica IPC] 💡 如果看不到模糊，请检查内容区域的背景色是否遮挡了效果');
      } catch (e) {
        console.warn('[Mica IPC] 延迟应用失败:', e);
      }
    }, 100);
    
    return { ok: true };
  } catch (e) {
    console.error('[Mica IPC] 设置 Mica 效果失败:', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-acrylic', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (!WIN10) {
      return { ok: false, error: 'Acrylic 效果需要 Windows 10+' };
    }
    
    if (typeof mainWin.setAcrylic !== 'function') {
      return { ok: false, error: 'setAcrylic 方法不可用' };
    }
    
    mainWin.setBackgroundColor('#00000000');
    mainWin.setAcrylic();
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-light-theme', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (typeof mainWin.setLightTheme === 'function') {
      mainWin.setLightTheme();
      return { ok: true };
    }
    
    return { ok: false, error: 'setLightTheme 方法不可用' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-dark-theme', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (typeof mainWin.setDarkTheme === 'function') {
      mainWin.setDarkTheme();
      return { ok: true };
    }
    
    return { ok: false, error: 'setDarkTheme 方法不可用' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-auto-theme', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (typeof mainWin.setAutoTheme === 'function') {
      mainWin.setAutoTheme();
      return { ok: true };
    }
    
    return { ok: false, error: 'setAutoTheme 方法不可用' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-background-color', async (event, color) => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (typeof mainWin.setBackgroundColor !== 'function') {
      return { ok: false, error: 'setBackgroundColor 方法不可用' };
    }
    
    mainWin.setBackgroundColor(color || '#00000000');
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('mica/set-rounded-corner', async () => {
  try {
    if (!mainWin || mainWin.isDestroyed()) {
      return { ok: false, error: '主窗口不存在' };
    }
    
    if (MicaBrowserWindow === BrowserWindow) {
      return { ok: false, error: 'Mica Electron 未加载' };
    }
    
    if (typeof mainWin.setRoundedCorner === 'function') {
      mainWin.setRoundedCorner();
      return { ok: true };
    } else if (typeof mainWin.setSmallRoundedCorner === 'function') {
      mainWin.setSmallRoundedCorner();
      return { ok: true };
    }
    
    return { ok: false, error: 'setRoundedCorner 方法不可用' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 提供操作系统版本信息给渲染层
ipcMain.handle('app/get-os-version', async () => {
  try {
    const os = require('os');
    const { execSync } = require('child_process');
    const platform = os.platform();
    let osVersion = '';
    
    if (platform === 'win32') {
      // Windows: 使用 PowerShell 获取准确的 Windows 版本信息
      try {
        // 使用 PowerShell 获取 Windows 版本号（更准确）
        const psCommand = `
          $os = Get-CimInstance Win32_OperatingSystem;
          $version = $os.Version;
          $build = $os.BuildNumber;
          $caption = $os.Caption;
          # 检查是否是 Windows 11（Build 22000 或更高）
          if ([int]$build -ge 22000) {
            $caption = "Windows 11";
          }
          Write-Output "$caption $version (Build $build)"
        `;
        const result = execSync(`powershell -Command "${psCommand}"`, { 
          encoding: 'utf8', 
          timeout: 5000,
          windowsHide: true 
        }).trim();
        if (result) {
          osVersion = result;
        } else {
          // 降级方案：使用 os.release()
          const release = os.release();
          osVersion = `Windows ${release}`;
        }
      } catch (e) {
        // 如果 PowerShell 失败，使用降级方案
        console.warn('Failed to get Windows version via PowerShell:', e);
        const release = os.release();
        const buildNumber = release.split('.')[2] || '';
        // Windows 11 的 Build 号是 22000 或更高
        if (buildNumber && parseInt(buildNumber) >= 22000) {
          osVersion = `Windows 11 ${release}`;
        } else {
          osVersion = `Windows 10 ${release}`;
        }
      }
    } else if (platform === 'darwin') {
      // macOS: 使用 os.release() 获取 Darwin 版本，通常需要映射到 macOS 版本
      const release = os.release();
      // Darwin 版本号映射（简化版本，可根据需要扩展）
      osVersion = `macOS ${release}`;
    } else if (platform === 'linux') {
      // Linux: 尝试获取发行版信息，如果没有则使用内核版本
      // 性能优化：使用异步操作避免阻塞事件循环
      // 注意：由于这是IPC处理函数，异步读取可能导致返回值延迟
      // 为了保持兼容性，先尝试同步读取，如果失败则使用默认值
      try {
        const fs = require('fs');
        // 尝试同步读取（文件很小，影响可接受）
        if (fs.existsSync('/etc/os-release')) {
          const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
          const lines = osRelease.split('\n');
          let name = '';
          let version = '';
          for (const line of lines) {
            if (line.startsWith('PRETTY_NAME=')) {
              const match = line.match(/PRETTY_NAME="(.+)"/);
              if (match) {
                osVersion = match[1];
                break;
              }
            } else if (line.startsWith('NAME=') && !name) {
              const match = line.match(/NAME="(.+)"/);
              if (match) name = match[1];
            } else if (line.startsWith('VERSION=') && !version) {
              const match = line.match(/VERSION="(.+)"/);
              if (match) version = match[1];
            }
          }
          if (!osVersion && name) {
            osVersion = version ? `${name} ${version}` : name;
          }
        }
        if (!osVersion) {
          osVersion = `Linux ${os.release()}`;
        }
      } catch (e) {
        osVersion = `Linux ${os.release()}`;
      }
    } else {
      osVersion = `${platform} ${os.release()}`;
    }
    
    return { ok: true, osVersion: osVersion || `${platform} ${os.release()}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 应用重启（用于重置数据后彻底刷新主窗口与 BrowserView）
ipcMain.handle('app/relaunch', () => {
  try {
    app.relaunch();
    app.exit(0); // 使用 exit 以确保 relaunch 生效
    return { ok: true };
  } catch (e) {
    console.error('[main] app/relaunch 失败:', e);
    return { ok: false, error: String(e) };
  }
});

// 获取环境变量中的 Gitee Token
ipcMain.handle('env/get-gitee-token', () => {
  // 优先从环境变量读取，支持多种命名方式
  return process.env.GITEE_TOKEN || 
         process.env.GITEE_ACCESS_TOKEN || 
         null;
});

// 更新主窗口进度条（用于任务栏图标）
ipcMain.handle('window/set-progress-bar', async (event, progress) => {
  try {
    if (mainWin && !mainWin.isDestroyed()) {
      // progress 是 0 到 1 之间的浮点数，-1 表示移除进度条
      if (progress >= 0 && progress <= 1) {
        mainWin.setProgressBar(progress);
      } else if (progress === -1) {
        mainWin.setProgressBar(-1);
      }
      return { ok: true };
    }
    return { ok: false, error: 'Main window not available' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 取色窗口和状态
let colorPickerWin = null;
let colorPickResolve = null;

// 启动取色模式
ipcMain.handle('color/startPick', async (event) => {
  try {
    // 如果已经有取色窗口，先关闭
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    // 获取主屏幕尺寸和位置
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const screenBounds = primaryDisplay.bounds;
    
    colorPickerWin = new BrowserWindow({
      width: screenSize.width,
      height: screenSize.height,
      x: screenBounds.x,
      y: screenBounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: getPreloadPath()
      }
    });
    
    // 创建取色页面 HTML
    const pickerHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      background: transparent;
      cursor: crosshair;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      color: white;
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      user-select: none;
    }
    .picker-hint {
      background: rgba(0,0,0,0.7);
      padding: 16px 24px;
      border-radius: 8px;
      /* 毛玻璃效果通过 mica-electron 实现，不使用 CSS backdrop-filter */
    }
  </style>
</head>
<body>
  <div class="picker-hint">点击屏幕任意位置取色 (ESC 取消)</div>
  <script>
    document.addEventListener('click', (e) => {
      window.electronAPI.sendColorPickClick(e.screenX, e.screenY);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.electronAPI.cancelColorPick();
      }
    });
  </script>
</body>
</html>`;
    
    // 等待窗口准备好后再显示
    colorPickerWin.once('ready-to-show', () => {
      // 允许鼠标事件，但确保窗口在最上层
      colorPickerWin.setIgnoreMouseEvents(false);
      colorPickerWin.show();
      colorPickerWin.focus();
      // 确保窗口始终在最上层
      colorPickerWin.setAlwaysOnTop(true, 'screen-saver');
    });
    
    colorPickerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pickerHTML)}`);
    
    // 监听窗口关闭
    colorPickerWin.on('closed', () => {
      colorPickerWin = null;
      if (colorPickResolve) {
        const resolve = colorPickResolve;
        colorPickResolve = null;
        resolve({ ok: false, error: 'cancelled' });
      }
    });
    
    // 返回 Promise，等待取色结果
    return new Promise((resolve) => {
      colorPickResolve = resolve;
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 显示系统通知
ipcMain.handle('notification/show', async (event, { title, body, options = {} }) => {
  try {
    // Electron 的 Notification 在 Windows/Linux 上需要应用已就绪
    if (!Notification.isSupported()) {
      return { ok: false, error: '系统不支持通知' };
    }

    const notification = new Notification({
      title: title || '通知',
      body: body || '',
      icon: options.icon || undefined,
      badge: options.badge || undefined,
      tag: options.tag || undefined,
      silent: options.silent || false,
      urgency: options.urgency || 'normal' // 'normal', 'critical', 'low'
    });

    // 可选：添加点击事件处理
    notification.on('click', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.focus();
      }
    });

    notification.show();
    return { ok: true };
  } catch (e) {
    console.error('显示通知失败:', e);
    return { ok: false, error: String(e) };
  }
});

// 处理取色点击
ipcMain.on('color-picker-click', async (event, x, y) => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  try {
    // 使用系统 API 获取准确的鼠标位置
    const cursorPoint = screen.getCursorScreenPoint();
    const actualX = cursorPoint.x;
    const actualY = cursorPoint.y;
    
    // 使用系统 API 获取像素颜色（各平台使用不同的方法）
    const { execSync } = require('child_process');
    let systemColor = null;
    
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell 调用 Windows API GetPixel
      try {
        const psScript = `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PixelColor {
  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
  [DllImport("gdi32.dll")]
  public static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);
}
"@; $hdc = [PixelColor]::GetDC([IntPtr]::Zero); $colorRef = [PixelColor]::GetPixel($hdc, ${actualX}, ${actualY}); [PixelColor]::ReleaseDC([IntPtr]::Zero, $hdc); $r = $colorRef -band 0x0000FF; $g = ($colorRef -band 0x00FF00) -shr 8; $b = ($colorRef -band 0xFF0000) -shr 16; Write-Output "$r,$g,$b"`;
        
        const result = execSync(`powershell -Command "${psScript}"`, { encoding: 'utf-8', timeout: 5000 });
        const parts = result.trim().split(',');
        if (parts.length === 3) {
          const r = parseInt(parts[0].trim());
          const g = parseInt(parts[1].trim());
          const b = parseInt(parts[2].trim());
          
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
          }
        }
      } catch (psError) {
        console.warn('[ColorPicker] Windows PowerShell 取色失败:', psError.message || psError);
      }
    } else if (process.platform === 'darwin') {
      // macOS: 使用 screencapture 命令截取指定坐标的像素
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 使用 screencapture 截取指定坐标的 1x1 像素区域
        // -R x,y,w,h: 指定区域，-x: 不播放快门声音
        execSync(`screencapture -R ${actualX},${actualY},1,1 -x "${tmpFile}"`, { timeout: 5000 });
        
        if (fs.existsSync(tmpFile)) {
          // 读取图片并获取像素颜色
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // macOS 上 getBitmap() 返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (macError) {
        console.warn('[ColorPicker] macOS 系统 API 取色失败:', macError.message || macError);
      }
    } else if (process.platform === 'linux') {
      // Linux: 使用 xwd + ImageMagick convert 或者 import 命令
      try {
        const fs = require('fs');
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.png`);
        
        // 方法1: 尝试使用 import 命令（ImageMagick）直接截取指定坐标的像素
        try {
          execSync(`import -window root -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
        } catch (importError) {
          // import 失败，尝试使用 xwd + convert
          const xwdFile = path.join(os.tmpdir(), `color_pick_${Date.now()}.xwd`);
          try {
            // 使用 xwd 截取整个屏幕
            execSync(`xwd -root -silent -out "${xwdFile}"`, { timeout: 5000 });
            
            if (fs.existsSync(xwdFile)) {
              // 使用 convert 裁剪指定坐标的像素
              execSync(`convert "${xwdFile}" -crop 1x1+${actualX}+${actualY} "${tmpFile}"`, { timeout: 5000 });
            }
            
            // 清理 xwd 文件
            try { fs.unlinkSync(xwdFile); } catch (e) {}
          } catch (xwdError) {
            throw importError; // 如果都失败，抛出原始错误
          }
        }
        
        if (fs.existsSync(tmpFile)) {
          const image = nativeImage.createFromPath(tmpFile);
          if (image && !image.isEmpty()) {
            const bitmap = image.getBitmap();
            
            if (bitmap && bitmap.length >= 4) {
              // Linux 上 getBitmap() 通常返回 RGBA 格式
              const r = bitmap[0];
              const g = bitmap[1];
              const b = bitmap[2];
              
              systemColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
          }
          
          // 清理临时文件
          try { fs.unlinkSync(tmpFile); } catch (e) {}
        }
      } catch (linuxError) {
        console.warn('[ColorPicker] Linux 系统 API 取色失败:', linuxError.message || linuxError);
      }
    }
    
    // 如果系统 API 成功获取颜色，直接返回
    if (systemColor) {
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: systemColor });
      return;
    }
    
    // 回退方法：使用 desktopCapturer（适用于所有平台或 Windows API 失败时）
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenSize = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;
    
    // 使用原始分辨率（考虑缩放因子）获取屏幕源
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: {
        width: screenSize.width * scaleFactor,
        height: screenSize.height * scaleFactor
      }
    });
    
    if (!sources || sources.length === 0) {
      throw new Error('无法获取屏幕源');
    }
    
    // 找到主显示器
    const source = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
    
    if (!source || !source.thumbnail) {
      throw new Error('无法获取屏幕缩略图');
    }
    
    // 直接从 thumbnail 获取 bitmap
    const bitmap = source.thumbnail.getBitmap();
    const thumbnailSize = source.thumbnail.getSize();
    
    // 计算坐标：鼠标位置需要乘以缩放因子来匹配缩略图分辨率
    const pixelX = Math.floor(actualX * scaleFactor);
    const pixelY = Math.floor(actualY * scaleFactor);
    
    // 确保坐标在有效范围内
    if (pixelX < 0 || pixelX >= thumbnailSize.width || pixelY < 0 || pixelY >= thumbnailSize.height) {
      throw new Error('坐标超出范围');
    }
    
    const width = thumbnailSize.width;
    const pixelIndex = (pixelY * width + pixelX) * 4;
    
    if (bitmap && bitmap.length > pixelIndex + 3) {
      // Electron 的 getBitmap() 在 Windows 上返回 BGRA 格式
      const b = bitmap[pixelIndex];
      const g = bitmap[pixelIndex + 1];
      const r = bitmap[pixelIndex + 2];
      
      // 确保值在 0-255 范围内
      const rClamped = Math.max(0, Math.min(255, r));
      const gClamped = Math.max(0, Math.min(255, g));
      const bClamped = Math.max(0, Math.min(255, b));
      
      const rgbColor = `#${rClamped.toString(16).padStart(2, '0')}${gClamped.toString(16).padStart(2, '0')}${bClamped.toString(16).padStart(2, '0')}`;
      
      const resolve = colorPickResolve;
      colorPickResolve = null;
      
      if (colorPickerWin) {
        colorPickerWin.close();
        colorPickerWin = null;
      }
      
      resolve({ ok: true, color: rgbColor });
    } else {
      throw new Error('无法读取像素颜色');
    }
  } catch (err) {
    console.error('取色失败:', err);
    
    const resolve = colorPickResolve;
    colorPickResolve = null;
    
    if (colorPickerWin) {
      colorPickerWin.close();
      colorPickerWin = null;
    }
    
    resolve({ ok: false, error: String(err) });
  }
});

// 取消取色
ipcMain.on('color-picker-cancel', () => {
  if (!colorPickerWin || !colorPickResolve) return;
  
  const resolve = colorPickResolve;
  colorPickResolve = null;
  
  if (colorPickerWin) {
    colorPickerWin.close();
    colorPickerWin = null;
  }
  
  resolve({ ok: false, error: 'cancelled' });
});

// 渲染层可调用的窗口控制（最小化/最大化或还原/关闭）
ipcMain.handle('window/minimize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.minimize();
    try { event.sender.send('window/maxstate', win ? win.isMaximized() : false); } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/toggleMax', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (!win) return { ok: false, error: 'no-window' };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    const maximized = win.isMaximized();
    try { event.sender.send('window/maxstate', maximized); } catch (e) {}
    return { ok: true, maximized };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('window/close', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWin;
    if (win) win.close();
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
});

// 辅助函数：延迟执行
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, ms);
  });
}

// 获取静默更新配置（默认为 false）
function getSilentUpdateEnabled() {
  if (!store) return false;
  return store.get('silentUpdateEnabled', false);
}

// 初始化自动更新
async function initAutoUpdater() {
  if (!autoUpdater) return;
  
  try {
    autoUpdater.disableWebInstaller = false;
    
    // 如果指定了本地更新源，则优先使用（便于本地搭建HTTP服务测试更新）
    // 用法：启动前设置环境变量 LOCAL_UPDATE_URL，例如
    //   Windows PowerShell:  $env:LOCAL_UPDATE_URL="http://localhost:8080/"
    //   macOS/Linux:         LOCAL_UPDATE_URL="http://localhost:8080/" npm start
    const localFeed = process.env.LOCAL_UPDATE_URL;
    if (localFeed) {
      try {
        autoUpdater.setFeedURL({
          url: localFeed,
          provider: 'generic'
        });
        console.log('[main] 使用本地更新源 LOCAL_UPDATE_URL:', localFeed);
      } catch (e) {
        console.error('[main] 设置本地更新源失败:', e);
      }
    }
    
    // 根据静默更新配置决定是否自动下载
    const silentUpdateEnabled = getSilentUpdateEnabled();
    autoUpdater.autoDownload = silentUpdateEnabled;
    // 确保更新安装后自动运行应用（无缝更新）
    autoUpdater.autoInstallOnAppQuit = true;
    console.log(`[main] 初始化自动更新，静默更新: ${silentUpdateEnabled ? '已启用' : '已禁用'}`);
    console.log(`[main] autoUpdater.autoDownload: ${autoUpdater.autoDownload}`);
    console.log(`[main] autoUpdater.autoInstallOnAppQuit: ${autoUpdater.autoInstallOnAppQuit}`);
    
    // 设置请求头，确保正确的 User-Agent
    autoUpdater.requestHeaders = {
      'User-Agent': `Metro-PIDS-App/${app.getVersion()} (${process.platform})`
    };
    
    // 开发环境下也允许检查更新
    // electron-updater 在开发模式下会使用 package.json 中的配置
    if (!app.isPackaged) {
      // 开发模式下，可以设置 channel 为 latest 或使用默认配置
      // autoUpdater.channel = 'latest';
      console.log('[main] 开发模式下初始化更新检查，将使用 package.json 中的 GitHub 配置');
    }
    
    // 错误处理
    autoUpdater.on('error', (err) => {
      const errorMsg = String(err);
      const errorDetails = {
        message: errorMsg,
        stack: err.stack,
        code: err.code,
        name: err.name
      };
      if (logger) {
        logger.error(['检查更新失败', errorDetails]);
      } else {
        console.error('检查更新失败:', errorDetails);
      }
      try { 
        mainWin && mainWin.webContents.send('update/error', errorMsg); 
      } catch (e) {}
    });
    
    // 有可用更新
    autoUpdater.on('update-available', (info) => {
      const currentVersion = app.getVersion();
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 检查到有更新', { currentVersion, latestVersion: info.version, silentUpdate: silentUpdateEnabled });
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-available 详细信息:', {
        version: info.version,
        currentVersion: currentVersion,
        releaseDate: info.releaseDate,
        path: info.path,
        silentUpdate: silentUpdateEnabled
      });
      
      // 如果启用了静默更新，自动开始下载
      if (silentUpdateEnabled && !autoUpdater.autoDownload) {
        console.log('[main] 静默更新已启用，自动开始下载更新...');
        // 由于 autoDownload 可能为 false，我们需要手动触发下载
        autoUpdater.downloadUpdate().catch(err => {
          console.error('[main] 静默下载更新失败:', err);
          if (logger) {
            logger.error('静默下载更新失败', err);
          }
        });
      }
      
      try { 
        // 通知渲染进程有更新可用（用于显示NEW标记）
        mainWin && mainWin.webContents.send('update/available', info);
        // 发送一个特殊事件来标记有更新（用于UI显示）
        mainWin && mainWin.webContents.send('update/has-update', { version: info.version, silentUpdate: silentUpdateEnabled });
      } catch (e) {
        console.error('[main] 发送 update-available 事件失败:', e);
      }
    });
    
    // 没有可用更新
    autoUpdater.on('update-not-available', (info) => {
      const currentVersion = app.getVersion();
      if (logger) {
        logger.info('没有可用更新', { currentVersion, info });
      } else {
        console.log('[main] 没有可用更新', { currentVersion, info });
      }
      
      // 输出详细信息用于调试
      console.log('[main] update-not-available 详细信息:', {
        version: info ? info.version : 'N/A',
        currentVersion: currentVersion,
        releaseDate: info ? info.releaseDate : 'N/A',
        path: info ? info.path : 'N/A',
        // 如果 info 中有 updateInfo，也输出
        updateInfo: info ? info.updateInfo : null
      });
      
      // 如果 info 为空或版本号相同，说明确实没有更新
      // 如果版本号不同但没有触发 update-available，可能是版本格式问题
      if (info && info.version) {
        console.log('[main] 版本对比:', {
          current: currentVersion,
          latest: info.version,
          areEqual: currentVersion === info.version,
          // 尝试比较去掉 'v' 前缀的版本
          currentClean: currentVersion.replace(/^v/, ''),
          latestClean: info.version.replace(/^v/, ''),
          areEqualClean: currentVersion.replace(/^v/, '') === info.version.replace(/^v/, '')
        });
      }
      
      try { 
        mainWin && mainWin.webContents.send('update/not-available', info || {}); 
      } catch (e) {
        console.error('[main] 发送 update-not-available 事件失败:', e);
      }
    });
    
    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      if (logger) {
        logger.info('下载进度:', progress);
      }
      try { 
        mainWin && mainWin.webContents.send('update/progress', progress); 
      } catch (e) {}
    });
    
    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
      const silentUpdateEnabled = getSilentUpdateEnabled();
      
      if (logger) {
        logger.info('下载完毕！提示安装更新', { silentUpdate: silentUpdateEnabled });
        logger.info(info);
      } else {
        console.log('[main] 下载完成', { version: info.version, silentUpdate: silentUpdateEnabled });
      }
      
      // 检查是否用户已经跳过了当前版本
      if (store) {
        const skippedVersion = store.get('skippedVersion');
        if (info && info.version === skippedVersion) {
          if (logger) {
            logger.info('用户已跳过此版本，不提示更新');
          }
          return;
        }
      }
      
      // 如果启用了静默更新，自动安装
      if (silentUpdateEnabled) {
        console.log('[main] 静默更新模式：下载完成，自动安装更新...');
        if (logger) {
          logger.info('静默更新：下载完成，自动安装更新', { version: info.version });
        }
        
        try {
          // 清除跳过的版本标记
          if (store) {
            store.delete('skippedVersion');
          }
          
          // 延迟一小段时间，确保下载完全完成，然后自动安装
          setTimeout(() => {
            try {
              console.log('[main] 执行自动安装更新...');
              // quitAndInstall(isSilent, isForceRunAfter)
              // isSilent: true = 静默安装（Windows 需要 NSIS 配置支持）
              // isForceRunAfter: true = 安装完成后自动运行应用
              autoUpdater.quitAndInstall(true, true);
              if (logger) {
                logger.info('已调用 quitAndInstall(true, true)，应用将退出并静默安装更新');
              }
            } catch (installErr) {
              console.error('[main] 自动安装更新失败:', installErr);
              if (logger) {
                logger.error('自动安装更新失败', installErr);
              }
              // 如果自动安装失败，发送通知给用户
              try {
                mainWin && mainWin.webContents.send('update/downloaded', info);
              } catch (e) {}
            }
          }, 1000); // 延迟 1 秒
        } catch (e) {
          console.error('[main] 静默更新自动安装处理失败:', e);
          if (logger) {
            logger.error('静默更新自动安装处理失败', e);
          }
          // 如果出错，发送通知给用户
          try {
            mainWin && mainWin.webContents.send('update/downloaded', info);
          } catch (sendErr) {}
        }
      } else {
        // 非静默模式，发送通知给用户
        try { 
          mainWin && mainWin.webContents.send('update/downloaded', info); 
        } catch (e) {}
      }
    });
  } catch (e) {
    if (logger) {
      logger.error('autoUpdater setup failed', e);
    } else {
      console.warn('autoUpdater setup failed', e);
    }
  }
}

// 检查并安装待安装的更新（应用启动时）
// 这个函数在 initAutoUpdater 之前调用，用于检测是否有待安装的更新
let startupUpdateHandler = null;

async function checkAndInstallPendingUpdate() {
  if (!autoUpdater) return false;
  
  try {
    console.log('[main] 检查是否有待安装的更新...');
    
    return new Promise((resolve) => {
      let timeoutId = null;
      let resolved = false;
      
      // 设置超时，避免无限等待
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (startupUpdateHandler) {
            autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
            startupUpdateHandler = null;
          }
          console.log('[main] 检查待安装更新超时，继续正常启动');
          resolve(false);
        }
      }, 3000); // 3秒超时
      
      // 监听 update-downloaded 事件（仅用于启动时检测）
      startupUpdateHandler = (info) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        
        if (startupUpdateHandler) {
          autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
          startupUpdateHandler = null;
        }
        
        console.log('[main] 检测到待安装的更新:', info.version);
        if (logger) {
          logger.info('检测到待安装的更新，自动安装并重启', { version: info.version });
        }
        
        // 检查是否用户跳过了此版本
        if (store) {
          const skippedVersion = store.get('skippedVersion');
          if (info && info.version === skippedVersion) {
            console.log('[main] 用户已跳过此版本，不自动安装');
            resolve(false);
            return;
          }
        }
        
        // 清除跳过的版本标记
        if (store) {
          store.delete('skippedVersion');
        }
        
        // 延迟一小段时间，确保所有初始化完成，然后自动安装并重启
        setTimeout(() => {
          try {
            console.log('[main] 自动安装待安装的更新并重启应用...');
            if (logger) {
              logger.info('应用将退出并静默安装更新，安装完成后自动启动新版本');
            }
            // 静默安装并自动运行应用
            // quitAndInstall(isSilent, isForceRunAfter)
            // isSilent: true = 静默安装，不显示安装界面
            // isForceRunAfter: true = 安装完成后自动运行应用
            autoUpdater.quitAndInstall(true, true);
            resolve(true);
          } catch (e) {
            console.error('[main] 自动安装待安装的更新失败:', e);
            if (logger) {
              logger.error('自动安装待安装的更新失败', e);
            }
            resolve(false);
          }
        }, 800); // 延迟 800ms，确保初始化完成
      };
      
      autoUpdater.once('update-downloaded', startupUpdateHandler);
      
      // 触发检查更新，如果更新已下载，electron-updater 会立即触发 update-downloaded 事件
      autoUpdater.checkForUpdates().then(() => {
        // checkForUpdates 成功，但不代表有更新，等待事件触发
        console.log('[main] 检查更新请求已发送，等待响应...');
      }).catch(err => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          if (startupUpdateHandler) {
            autoUpdater.removeListener('update-downloaded', startupUpdateHandler);
            startupUpdateHandler = null;
          }
          // 检查更新失败不代表没有待安装的更新，继续正常启动
          console.log('[main] 检查更新失败（可能没有待安装的更新）:', err.message);
          resolve(false);
        }
      });
    });
  } catch (e) {
    console.error('[main] 检查待安装更新失败:', e);
    if (logger) {
      logger.error('检查待安装更新失败', e);
    }
    return false;
  }
}

app.whenReady().then(async () => {
  console.log('[main] ✅ Electron 应用已准备就绪');
  console.log('[main] 应用路径:', app.getAppPath());
  console.log('[main] 是否打包:', app.isPackaged);
  console.log('[main] __dirname:', __dirname);
  console.log('[main] 日志文件位置:', logger ? logger.transports.file.getFile().path : 'N/A');
  
  // 在 Windows 上，尝试显示控制台窗口以便调试（仅打包后）
  if (app.isPackaged && process.platform === 'win32') {
    try {
      // 尝试附加到父进程的控制台，或创建新的控制台窗口
      const { exec } = require('child_process');
      exec('cmd /c "echo 控制台已打开 && pause"', { windowsHide: false });
    } catch (e) {
      // 忽略错误
    }
  }
  
  // 初始化预设线路文件（从 preset-lines 复制到默认文件夹）
  try {
    await initPresetLinesFromSource();
  } catch (e) {
    console.warn('[main] 初始化预设线路文件失败:', e);
    console.warn('[main] 错误堆栈:', e.stack);
  }
  
  // 在创建窗口之前检查并安装待安装的更新
  // 如果有待安装的更新，会自动安装并重启，不会创建窗口
  if (app.isPackaged && autoUpdater) {
    // 先进行基本的 autoUpdater 配置（不设置完整的事件监听器）
    try {
      autoUpdater.disableWebInstaller = false;
      autoUpdater.autoInstallOnAppQuit = true;
      // 设置请求头
      autoUpdater.requestHeaders = {
        'User-Agent': `Metro-PIDS-App/${app.getVersion()} (${process.platform})`
      };
    } catch (e) {
      console.error('[main] 初始化 autoUpdater 基本配置失败:', e);
    }
    
    // 检查是否有待安装的更新
    const hasPendingUpdate = await checkAndInstallPendingUpdate();
    if (hasPendingUpdate) {
      // 如果有待安装的更新，应用会退出并安装，不会执行后续代码
      // quitAndInstall 会立即退出应用，所以这里不会继续执行
      console.log('[main] 检测到待安装的更新，应用将退出并安装更新');
      return;
    }
  }
  
  try {
    createWindow();
    console.log('[main] ✅ 窗口创建成功');
    
    // 确保窗口最终会显示（防止页面加载失败导致窗口永远不显示）
    setTimeout(() => {
      if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
        console.warn('[main] ⚠️ 窗口创建后 10 秒仍未显示，强制显示');
        try {
          mainWin.show();
          mainWin.center();
          mainWin.focus();
          // 如果页面还是空白，显示错误信息
          mainWin.webContents.executeJavaScript(`
            if (!document.body || document.body.innerHTML.trim() === '') {
              document.body = document.createElement('body');
              document.body.innerHTML = '<div style="padding: 40px; font-family: Arial; line-height: 1.6;">
                <h1>应用启动问题</h1>
                <p>窗口已创建但页面未加载。请查看控制台日志获取详细信息。</p>
                <p><strong>应用路径:</strong> ${app.getAppPath()}</p>
                <p><strong>是否打包:</strong> ${app.isPackaged}</p>
              </div>';
            }
          `).catch(e => console.error('[main] 注入错误信息失败:', e));
        } catch (e) {
          console.error('[main] 强制显示窗口失败:', e);
        }
      }
    }, 10000); // 10 秒超时
  } catch (e) {
    console.error('[main] ❌ 窗口创建失败:', e);
    console.error('[main] 错误堆栈:', e.stack);
    // 即使窗口创建失败，也不要立即退出，给用户一个机会看到错误信息
    if (logger) {
      logger.error('窗口创建失败', e);
    }
  }
  
  // 初始化自动更新（设置完整的事件监听器）
  await initAutoUpdater();
  
  // 延迟检查更新，确保窗口准备完成
  scheduleAutoUpdateCheck();
  
  // 在 Windows 上，确保应用注册到通知系统
  // 这会让应用出现在 Windows 设置 > 系统 > 通知和操作 中
  if (process.platform === 'win32' && Notification.isSupported()) {
    try {
      // 静默发送一个测试通知（立即关闭），以确保应用被注册到通知系统
      // 用户不会看到这个通知，但它会触发 Windows 注册应用
      const testNotification = new Notification({
        title: 'Metro-PIDS',
        body: '',
        silent: true
      });
      // 立即关闭测试通知，用户不会看到
      testNotification.close();
      console.log('[main] Windows 通知系统注册完成');
    } catch (e) {
      console.warn('[main] Windows 通知系统注册失败:', e);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // 启动显示器控制API服务器
  if (displayApiServer) {
    try {
      const { server, PORT, setApiHandlers } = displayApiServer;
      
      // 设置API处理器
      setApiHandlers({
        getDisplayWindows: () => displayWindows,
        createDisplayWindow: (width, height, displayId) => {
          return createDisplayWindow(width, height, displayId);
        },
        closeDisplayWindow: (displayId) => {
          if (displayId) {
            // 关闭指定显示器
            const win = displayWindows.get(displayId);
            if (win && !win.isDestroyed()) {
              win.close();
              displayWindows.delete(displayId);
              return [displayId];
            }
            return [];
          } else {
            // 关闭所有显示器
            const closed = [];
            for (const [id, win] of displayWindows.entries()) {
              if (win && !win.isDestroyed()) {
                win.close();
                closed.push(id);
              }
            }
            displayWindows.clear();
            return closed;
          }
        },
        sendBroadcastMessage: (payload) => {
          // 通过所有显示端窗口的webContents发送BroadcastChannel消息
          const channelName = 'metro_pids_v3';
          const payloadStr = JSON.stringify(payload);
          
          // 改进的发送代码：同时使用 BroadcastChannel 和 window.postMessage
          const jsCode = `
            (function() {
              try {
                let success = false;
                
                // 方法1：使用 BroadcastChannel（同源时有效）
                if (typeof BroadcastChannel !== 'undefined') {
                  try {
                    const bc = new BroadcastChannel('${channelName}');
                    bc.postMessage(${payloadStr});
                    bc.close();
                    success = true;
                  } catch(e) {
                    console.warn('[Display] BroadcastChannel 发送失败:', e);
                  }
                }
                
                // 方法2：使用 window.postMessage（作为回退方案，对所有窗口有效）
                if (typeof window !== 'undefined' && typeof window.postMessage === 'function') {
                  try {
                    window.postMessage(${payloadStr}, '*');
                    success = true;
                  } catch(e) {
                    console.warn('[Display] postMessage 发送失败:', e);
                  }
                }
                
                return success;
              } catch(e) {
                console.error('[Display] 发送消息失败:', e);
                return false;
              }
            })();
          `;
          
          let successCount = 0;
          for (const [id, win] of displayWindows.entries()) {
            if (win && !win.isDestroyed() && win.webContents) {
              try {
                win.webContents.executeJavaScript(jsCode).catch(e => {
                  console.warn(`[DisplayAPI] 向 ${id} 发送消息失败:`, e);
                });
                successCount++;
              } catch (e) {
                console.warn(`[DisplayAPI] 执行脚本失败 (${id}):`, e);
              }
            }
          }
          
          // 同时发送到主窗口（如果存在）
          if (mainWin && !mainWin.isDestroyed() && mainWin.webContents) {
            try {
              mainWin.webContents.executeJavaScript(jsCode).catch(e => {
                console.warn('[DisplayAPI] 向主窗口发送消息失败:', e);
              });
            } catch (e) {
              console.warn('[DisplayAPI] 向主窗口执行脚本失败:', e);
            }
          }
          
          return successCount;
        },
        getMainWindow: () => mainWin,
        getStore: () => store,
        editDisplay: async (displayId, displayData) => {
          // 通过IPC调用编辑显示端
          try {
            if (!mainWin || mainWin.isDestroyed()) {
              return { ok: false, error: '主窗口未就绪' };
            }
            
            const result = await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                ipcMain.removeListener('api/edit-display-result', handler);
                resolve({ ok: false, error: '操作超时' });
              }, 5000);
              
              const handler = (event, response) => {
                clearTimeout(timeout);
                ipcMain.removeListener('api/edit-display-result', handler);
                resolve(response);
              };
              
              ipcMain.once('api/edit-display-result', handler);
              
              // 发送编辑请求到渲染进程
              mainWin.webContents.send('api/edit-display-request', displayId, displayData);
            });
            
            return result;
          } catch (e) {
            console.error('[DisplayAPI] 编辑显示端失败:', e);
            return { ok: false, error: String(e.message || e) };
          }
        }
      });
      
      // 启动服务器
      server.listen(PORT, () => {
        console.log(`[DisplayAPI] ✅ 显示器控制 API 服务器已启动，端口: ${PORT}`);
        console.log(`[DisplayAPI] 访问 http://localhost:${PORT}/api/display/info 查看API文档`);
      });
      
      server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
          console.warn(`[DisplayAPI] 端口 ${PORT} 已被占用，API服务器未启动`);
        } else {
          console.error('[DisplayAPI] 服务器错误:', e);
        }
      });
    } catch (e) {
      console.error('[main] 启动显示器控制API服务器失败:', e);
    }
  }
});

// 关闭所有窗口的辅助函数
function closeAllWindows() {
  console.log('[main] 开始关闭所有窗口...');
  
  // 关闭所有显示端窗口
  if (displayWindows && displayWindows.size > 0) {
    console.log(`[main] 关闭 ${displayWindows.size} 个显示端窗口...`);
    for (const [id, win] of displayWindows.entries()) {
      if (win && !win.isDestroyed()) {
        try {
          win.close();
        } catch (e) {
          console.warn(`[main] 关闭显示端窗口 ${id} 失败:`, e);
        }
      }
    }
    displayWindows.clear();
  }
  
  // 关闭线路管理器窗口
  if (lineManagerWin && !lineManagerWin.isDestroyed()) {
    console.log('[main] 关闭线路管理器窗口...');
    try {
      lineManagerWin.close();
    } catch (e) {
      console.warn('[main] 关闭线路管理器窗口失败:', e);
    }
    lineManagerWin = null;
  }
  
  // 关闭开发者工具窗口
  if (devWin && !devWin.isDestroyed()) {
    console.log('[main] 关闭开发者工具窗口...');
    try {
      devWin.close();
    } catch (e) {
      console.warn('[main] 关闭开发者工具窗口失败:', e);
    }
    devWin = null;
  }
  
  // 关闭颜色选择器窗口
  if (colorPickerWin && !colorPickerWin.isDestroyed()) {
    console.log('[main] 关闭颜色选择器窗口...');
    try {
      colorPickerWin.close();
    } catch (e) {
      console.warn('[main] 关闭颜色选择器窗口失败:', e);
    }
    colorPickerWin = null;
  }
  
  // 关闭所有 BrowserView
  if (browserViews && browserViews.size > 0) {
    console.log(`[main] 关闭 ${browserViews.size} 个 BrowserView...`);
    for (const [viewId, viewData] of browserViews.entries()) {
      if (viewData && viewData.view) {
        try {
          if (typeof viewData.view.isDestroyed === 'function' && !viewData.view.isDestroyed()) {
            if (mainWin && !mainWin.isDestroyed()) {
              mainWin.removeBrowserView(viewData.view);
            }
            viewData.view.destroy();
          }
        } catch (e) {
          console.warn(`[main] 关闭 BrowserView ${viewId} 失败:`, e);
        }
      }
    }
    browserViews.clear();
  }
  
  // 关闭所有其他窗口（通过 BrowserWindow.getAllWindows() 获取）
  const allWindows = BrowserWindow.getAllWindows();
  for (const win of allWindows) {
    if (win && !win.isDestroyed() && win !== mainWin) {
      try {
        console.log(`[main] 关闭窗口: ${win.getTitle() || '未命名窗口'}`);
        win.close();
      } catch (e) {
        console.warn('[main] 关闭窗口失败:', e);
      }
    }
  }
  
  console.log('[main] 所有窗口关闭完成');
}

// 应用程序退出前处理：确保所有窗口都已关闭
app.on('before-quit', (event) => {
  console.log('[main] before-quit 事件触发');
  // 如果还有窗口未关闭，先关闭所有窗口
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    console.log(`[main] 检测到 ${allWindows.length} 个窗口仍在运行，开始关闭...`);
    closeAllWindows();
    // 等待窗口关闭完成后再退出
    setTimeout(() => {
      // 再次检查，如果还有窗口，强制关闭
      const remainingWindows = BrowserWindow.getAllWindows();
      if (remainingWindows.length > 0) {
        console.log(`[main] 仍有 ${remainingWindows.length} 个窗口未关闭，强制关闭...`);
        for (const win of remainingWindows) {
          if (win && !win.isDestroyed()) {
            try {
              win.destroy();
            } catch (e) {
              console.warn('[main] 强制关闭窗口失败:', e);
            }
          }
        }
      }
    }, 100);
  }
});

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed 事件触发');
  // 确保所有窗口都已关闭
  closeAllWindows();
  if (process.platform !== 'darwin') {
    console.log('[main] 退出应用程序');
    app.quit();
  }
});

// 检查 Gitee 更新（自定义逻辑，因为 electron-updater 不支持 Gitee）
async function checkGiteeUpdate() {
  try {
    const https = require('https');
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    const currentVersion = app.getVersion().replace(/^v/, ''); // 移除可能的 v 前缀
    
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            if (!Array.isArray(releases) || releases.length === 0) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-releases' });
              return;
            }
            
            // 获取最新的非预发布版本
            const latestRelease = releases.find(r => !r.prerelease) || releases[0];
            if (!latestRelease || !latestRelease.tag_name) {
              resolve({ ok: true, hasUpdate: false, reason: 'no-valid-release' });
              return;
            }
            
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            const needsUpdate = latestVersion !== currentVersion;
            
            console.log('[main] Gitee 更新检查:', {
              current: currentVersion,
              latest: latestVersion,
              needsUpdate: needsUpdate
            });
            
            if (needsUpdate) {
              // 检查是否启用了静默更新
              const silentUpdateEnabled = getSilentUpdateEnabled();
              
              // 发送更新可用事件
              try {
                const updateInfo = {
                  version: latestVersion,
                  releaseDate: latestRelease.created_at,
                  releaseNotes: latestRelease.body,
                  releaseUrl: latestRelease.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${latestRelease.tag_name}`,
                  assets: latestRelease.assets || []
                };
                mainWin && mainWin.webContents.send('update/available', updateInfo);
                mainWin && mainWin.webContents.send('update/has-update', { version: latestVersion, silentUpdate: silentUpdateEnabled });
                
                // 如果启用了静默更新，自动触发下载（通过调用 update/download IPC）
                if (silentUpdateEnabled) {
                  console.log('[main] Gitee 静默更新已启用，自动开始下载更新...');
                  // 注意：Gitee 的下载需要通过自定义逻辑实现，这里只是触发事件通知前端
                  // 前端可以监听 update/available 事件，如果 silentUpdate 为 true，则自动调用 downloadUpdate
                }
              } catch (e) {
                console.error('[main] 发送 Gitee 更新事件失败:', e);
              }
              
              resolve({ ok: true, hasUpdate: true, version: latestVersion, release: latestRelease, silentUpdate: silentUpdateEnabled });
            } else {
              // 发送无更新事件
              try {
                mainWin && mainWin.webContents.send('update/not-available', { version: currentVersion });
              } catch (e) {}
              resolve({ ok: true, hasUpdate: false, reason: 'already-latest' });
            }
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            reject(new Error('解析失败: ' + String(e)));
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        reject(err);
      });
    });
  } catch (e) {
    throw new Error('检查 Gitee 更新失败: ' + String(e));
  }
}

// 供渲染层触发更新动作的 IPC
ipcMain.handle('update/check', async () => {
  console.log('[main] update/check: 收到检查更新请求');
  
  const updateSource = getUpdateSource();
  console.log('[main] update/check: 更新源:', updateSource);
  
  // 如果使用 Gitee，使用自定义检查逻辑
  if (updateSource === 'gitee') {
    try {
      const result = await checkGiteeUpdate();
      return { ok: true, source: 'gitee', ...result };
    } catch (e) {
      const errorDetails = {
        message: String(e),
        stack: e.stack,
        code: e.code,
        name: e.name
      };
      console.error('[main] Gitee update/check error:', errorDetails);
      if (logger) {
        logger.error('Gitee update/check error:', errorDetails);
      }
      
      try {
        mainWin && mainWin.webContents.send('update/error', String(e));
      } catch (sendErr) {
        console.error('[main] 发送更新错误事件失败:', sendErr);
      }
      
      return { ok: false, error: String(e), source: 'gitee' };
    }
  }
  
  // 使用 GitHub（electron-updater）
  console.log('[main] update/check: autoUpdater 状态:', autoUpdater ? '已加载' : '未加载');
  console.log('[main] update/check: app.isPackaged:', app.isPackaged);
  
  // 开发模式下也允许检查更新
  if (!app.isPackaged) {
    console.log('[main] update/check: 当前为开发模式，将检查 GitHub releases 是否有新版本');
    // 开发模式下，electron-updater 会使用 package.json 中的配置来检查更新
  }
  
  if (!autoUpdater) {
    console.error('[main] update/check: autoUpdater is null');
    console.error('[main] update/check: 尝试重新加载 electron-updater...');
    
    // 尝试重新加载
    try {
      delete require.cache[require.resolve('electron-updater')];
      const updater = require('electron-updater');
      autoUpdater = updater.autoUpdater;
      console.log('[main] update/check: 重新加载成功，autoUpdater:', autoUpdater ? '已加载' : '未加载');
      
      if (autoUpdater) {
        // 重新初始化配置
        autoUpdater.disableWebInstaller = false;
        const silentUpdateEnabled = getSilentUpdateEnabled();
        autoUpdater.autoDownload = silentUpdateEnabled;
        if (logger) {
          autoUpdater.logger = logger;
        }
        // 重新绑定事件监听（如果之前已经绑定过，这里会重复绑定，但不影响功能）
        await initAutoUpdater();
      }
    } catch (e) {
      console.error('[main] update/check: 重新加载失败:', e);
      console.error('[main] update/check: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code
      });
    }
    
    if (!autoUpdater) {
      return { ok: false, error: 'autoUpdater 未加载，请确保应用已正确打包' };
    }
  }
  
  try {
    console.log('[main] update/check: checking for updates...');
    console.log('[main] app.getVersion():', app.getVersion());
    
    // 检查更新配置
    if (autoUpdater.config) {
      console.log('[main] updater config:', {
        provider: autoUpdater.config.provider,
        owner: autoUpdater.config.owner,
        repo: autoUpdater.config.repo,
        channel: autoUpdater.config.channel
      });
    } else {
      if (app.isPackaged) {
        console.warn('[main] updater config 为空，将使用 app-update.yml 中的配置');
      } else {
        console.log('[main] 开发模式：将使用 package.json 中的 build.publish 配置检查更新');
        console.log('[main] GitHub 仓库:', 'tanzhouxkong/Metro-PIDS-');
      }
    }
    
    // 强制刷新更新检查
    // electron-updater 会在每次 checkForUpdates 时自动检查 GitHub releases
    // 但为了确保获取最新信息，我们使用 checkForUpdates() 而不是缓存的检查结果
    console.log('[main] 开始检查 GitHub releases...');
    const checkPromise = autoUpdater.checkForUpdates();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('检查更新超时（30秒）')), 30000)
    );
    
    const result = await Promise.race([checkPromise, timeoutPromise]);
    console.log('[main] checkForUpdates result:', result);
    
    // 输出详细信息用于调试
    if (result && result.updateInfo) {
      console.log('[main] 检查到的更新信息:', {
        version: result.updateInfo.version,
        releaseDate: result.updateInfo.releaseDate,
        path: result.updateInfo.path,
        sha512: result.updateInfo.sha512
      });
      console.log('[main] 当前应用版本:', app.getVersion());
      console.log('[main] 版本比较:', {
        current: app.getVersion(),
        latest: result.updateInfo.version,
        needsUpdate: result.updateInfo.version !== app.getVersion()
      });
    }
    
    // 如果返回了 result，说明检查已完成，但事件可能稍后触发
    // 所以这里只返回成功，实际结果通过事件通知
    return { ok: true, source: 'github' };
  } catch (e) {
    const errorDetails = {
      message: String(e),
      stack: e.stack,
      code: e.code,
      name: e.name
    };
    console.error('[main] update/check error:', errorDetails);
    if (logger) {
      logger.error('update/check error:', errorDetails);
    }
    
    // 尝试发送错误事件给渲染进程
    try {
      mainWin && mainWin.webContents.send('update/error', String(e));
    } catch (sendErr) {
      console.error('[main] 发送更新错误事件失败:', sendErr);
    }
    
    return { ok: false, error: String(e), source: 'github' };
  }
});

// 清除所有可能的缓存目录
async function clearUpdaterCache() {
  const os = require('os');
  const platform = process.platform;
  const cacheDirs = [];
  
  if (platform === 'win32') {
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'metro-pids-updater'));
    cacheDirs.push(path.join(app.getPath('userData'), 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Roaming', 'metro-pids-updater'));
    // electron-updater 默认缓存位置（基于 appId）
    cacheDirs.push(path.join(os.homedir(), 'AppData', 'Local', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else if (platform === 'darwin') {
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), 'Library', 'Caches', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  } else {
    cacheDirs.push(path.join(os.homedir(), '.cache', 'metro-pids-updater'));
    cacheDirs.push(path.join(os.homedir(), '.cache', 'com.Metro-PIDS.myapp-updater'));
    if (autoUpdater && autoUpdater.config && autoUpdater.config.cacheDir) {
      cacheDirs.push(autoUpdater.config.cacheDir);
    }
  }
  
  let clearedCount = 0;
  for (const cacheDir of cacheDirs) {
    try {
      if (fs.existsSync(cacheDir)) {
        console.log(`[main] 清除缓存目录: ${cacheDir}`);
        await fsPromises.rm(cacheDir, { recursive: true, force: true });
        clearedCount++;
      }
    } catch (dirErr) {
      console.warn(`[main] 清除缓存目录失败 ${cacheDir}:`, dirErr);
    }
  }
  
  return clearedCount;
}

ipcMain.handle('update/download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[main] update/download: 开始下载更新... (尝试 ${attempt}/${maxRetries})`);
      
      // 如果是重试，先清除之前的下载缓存
      if (attempt > 1) {
        console.log('[main] update/download: 清除之前的下载缓存...');
        const clearedCount = await clearUpdaterCache();
        if (clearedCount > 0) {
          console.log(`[main] update/download: 已清除 ${clearedCount} 个缓存目录`);
          // 等待确保缓存清理完成
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('[main] update/download: 未找到缓存目录');
        }
      }
      
      // 使用 Promise 来捕获错误事件和异常
      const downloadPromise = new Promise((resolve, reject) => {
        let downloadError = null;
        let downloaded = false;
        let timeout = null;
        
        // 监听下载进度，用于诊断
        let lastProgressPercent = 0;
        const progressHandler = (progress) => {
          const percent = Math.round(progress.percent || 0);
          if (percent !== lastProgressPercent && percent % 10 === 0) {
            // 每10%记录一次日志
            console.log(`[main] update/download: 下载进度 ${percent}% (${progress.transferred || 0}/${progress.total || 0} bytes)`);
            lastProgressPercent = percent;
          }
        };
        
        // 清理函数
        const cleanup = () => {
          if (timeout) clearTimeout(timeout);
          try {
            autoUpdater.removeListener('error', errorHandler);
            autoUpdater.removeListener('update-downloaded', downloadedHandler);
            autoUpdater.removeListener('download-progress', progressHandler);
          } catch (e) {}
        };
        
        // 监听错误事件（注意：error 事件可能会在下载过程中多次触发）
        const errorHandler = (err) => {
          const errorMsg = String(err);
          console.error('[main] update/download: 收到错误事件:', errorMsg);
          console.error('[main] update/download: 错误对象详情:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            name: err.name,
            errno: err.errno,
            syscall: err.syscall
          });
          
          // 如果是校验和错误，标记为需要重试
          if (errorMsg.includes('checksum') || errorMsg.includes('sha512')) {
            downloadError = new Error(errorMsg);
            downloadError.isChecksumError = true;
            cleanup();
            reject(downloadError);
          } else {
            downloadError = new Error(errorMsg);
          }
        };
        
        // 监听下载完成事件
        const downloadedHandler = (info) => {
          downloaded = true;
          console.log('[main] update/download: 收到下载完成事件:', info);
          cleanup();
          resolve(info);
        };
        
        // 设置超时（10分钟，给大文件下载更多时间）
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error('下载超时（10分钟）'));
        }, 10 * 60 * 1000);
        
        // 绑定事件监听器（使用 once 确保只触发一次）
        autoUpdater.once('error', errorHandler);
        autoUpdater.once('update-downloaded', downloadedHandler);
        autoUpdater.on('download-progress', progressHandler);
        
        // 开始下载
        autoUpdater.downloadUpdate().then(() => {
          // downloadUpdate 返回的 Promise 通常只表示开始下载，不表示完成
          // 真正的完成和错误通过事件通知
          console.log('[main] update/download: downloadUpdate() 调用完成，等待事件...');
        }).catch((err) => {
          cleanup();
          reject(err);
        });
      });
      
      await downloadPromise;
      console.log('[main] update/download: 下载完成');
      return { ok: true };
    } catch (e) {
      lastError = e;
      const errorMsg = String(e);
      const isChecksumError = errorMsg.includes('checksum') || errorMsg.includes('sha512') || e.isChecksumError;
      
      console.error(`[main] update/download: 下载失败 (尝试 ${attempt}/${maxRetries}):`, errorMsg);
      console.error('[main] update/download: 错误详情:', {
        message: e.message,
        stack: e.stack,
        code: e.code,
        name: e.name,
        isChecksumError: isChecksumError
      });
      
      if (isChecksumError && attempt < maxRetries) {
        console.log(`[main] update/download: 检测到校验和错误，将在 ${attempt * 2} 秒后重试...`);
        // 通知渲染进程正在重试
        try {
          mainWin && mainWin.webContents.send('update/progress', { 
            percent: 0, 
            retrying: true, 
            attempt: attempt + 1,
            maxRetries: maxRetries
          });
        } catch (sendErr) {}
        
        await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // 递增延迟：2秒、4秒
        continue;
      }
      
      // 如果不是校验和错误，或者已经达到最大重试次数，直接返回错误
      if (logger) {
        logger.error('下载更新失败', {
          attempt,
          maxRetries,
          message: errorMsg,
          stack: e.stack,
          code: e.code,
          name: e.name,
          isChecksumError: isChecksumError
        });
      }
      
      // 如果是最后一次尝试，返回详细错误
      if (attempt === maxRetries) {
        return { 
          ok: false, 
          error: errorMsg,
          attempts: attempt,
          isChecksumError: isChecksumError
        };
      }
    }
  }
  
  // 理论上不会到达这里，但为了安全起见
  return { ok: false, error: lastError ? String(lastError) : '未知错误' };
});

// 清除更新缓存并重新下载
ipcMain.handle('update/clear-cache-and-download', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    console.log('[main] update/clear-cache-and-download: 清除缓存并重新下载...');
    
    // 清除所有缓存
    const clearedCount = await clearUpdaterCache();
    if (clearedCount > 0) {
      console.log(`[main] 已清除 ${clearedCount} 个缓存目录`);
    } else {
      console.log('[main] 未找到缓存目录');
    }
    
    // 等待确保缓存清理完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 重新下载（这里不使用重试循环，因为用户主动触发的）
    await autoUpdater.downloadUpdate();
    console.log('[main] update/clear-cache-and-download: 重新下载完成');
    return { ok: true };
  } catch (e) {
    const errorMsg = String(e);
    console.error('[main] update/clear-cache-and-download: 失败:', errorMsg);
    
    if (logger) {
      logger.error('清除缓存并重新下载失败', {
        message: errorMsg,
        stack: e.stack,
        code: e.code,
        name: e.name
      });
    }
    
    return { ok: false, error: errorMsg };
  }
});

ipcMain.handle('update/install', async () => {
  if (!autoUpdater) return { ok: false, error: 'no-updater' };
  try {
    // 安装的时候如果设置过 skippedVersion, 需要清除掉
    if (store) {
      store.delete('skippedVersion');
    }
    
    if (logger) {
      logger.info('退出应用，开始静默安装更新！');
    }
    
    // quitAndInstall(isSilent, isForceRunAfter)
    // isSilent: true = 静默安装（Windows NSIS 使用 /S 参数，不显示安装界面）
    // isForceRunAfter: true = 安装完成后自动运行应用
    // 这样用户只需重启应用即可完成更新，无需走安装流程
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 获取 GitHub Releases 列表（用于显示更新日志）
ipcMain.handle('github/get-releases', async () => {
  try {
    const https = require('https');
    const url = 'https://api.github.com/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.published_at,
              html_url: release.html_url,
              prerelease: release.prerelease,
              draft: release.draft
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 GitHub Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 GitHub Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 获取 Gitee Releases 列表（用于显示更新日志和检查更新）
ipcMain.handle('gitee/get-releases', async () => {
  try {
    const https = require('https');
    // Gitee API v5: GET /api/v5/repos/{owner}/{repo}/releases
    const url = 'https://gitee.com/api/v5/repos/tanzhouxkong/Metro-PIDS-/releases';
    
    return new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Metro-PIDS-App',
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            // Gitee API 返回格式与 GitHub 略有不同，进行适配
            // 只返回前10个最新的release
            const recentReleases = releases.slice(0, 10).map(release => ({
              tag_name: release.tag_name,
              name: release.name,
              body: release.body,
              published_at: release.created_at || release.published_at, // Gitee 使用 created_at
              html_url: release.html_url || `https://gitee.com/tanzhouxkong/Metro-PIDS-/releases/${release.tag_name}`,
              prerelease: release.prerelease || false,
              draft: release.draft || false,
              assets: release.assets || [] // 包含下载文件信息
            }));
            resolve({ ok: true, releases: recentReleases });
          } catch (e) {
            console.error('[main] 解析 Gitee Releases 失败:', e);
            resolve({ ok: false, error: '解析失败: ' + String(e) });
          }
        });
      }).on('error', (err) => {
        console.error('[main] 获取 Gitee Releases 失败:', err);
        resolve({ ok: false, error: String(err) });
      });
    });
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 检查更新源配置（从存储中读取，默认为 'github'）
function getUpdateSource() {
  if (!store) return 'github';
  return store.get('updateSource', 'github'); // 'github' 或 'gitee'
}

// 设置更新源配置
ipcMain.handle('update/set-source', async (event, source) => {
  if (!store) return { ok: false, error: 'no-store' };
  if (source !== 'github' && source !== 'gitee') {
    return { ok: false, error: 'invalid-source' };
  }
  store.set('updateSource', source);
  console.log(`[main] 更新源已设置为: ${source}`);
  return { ok: true };
});

// 获取更新源配置
ipcMain.handle('update/get-source', async () => {
  return { ok: true, source: getUpdateSource() };
});

// 设置静默更新配置
ipcMain.handle('update/set-silent', async (event, enabled) => {
  if (!store) return { ok: false, error: 'no-store' };
  const silentEnabled = Boolean(enabled);
  store.set('silentUpdateEnabled', silentEnabled);
  console.log(`[main] 静默更新已${silentEnabled ? '启用' : '禁用'}`);
  
  // 如果启用了静默更新，更新 autoUpdater 配置
  if (autoUpdater) {
    autoUpdater.autoDownload = silentEnabled;
    console.log(`[main] autoUpdater.autoDownload 已设置为: ${silentEnabled}`);
  }
  
  return { ok: true };
});

// 获取静默更新配置
ipcMain.handle('update/get-silent', async () => {
  return { ok: true, enabled: getSilentUpdateEnabled() };
});

// 跳过版本更新
ipcMain.handle('update/skip-version', async (event, version) => {
  if (store && version) {
    store.set('skippedVersion', version);
    if (logger) {
      logger.info('用户跳过版本:', version);
    }
    return { ok: true };
  }
  return { ok: false, error: 'no-store-or-version' };
});

// 自动检查更新：启动时执行（包括开发环境）
async function scheduleAutoUpdateCheck() {
  if (!autoUpdater) {
    console.log('[main] scheduleAutoUpdateCheck: autoUpdater is null');
    return;
  }
  
  // 开发环境和打包环境都执行自动检查
  console.log('[main] scheduleAutoUpdateCheck: 准备检查更新 (开发模式:', !app.isPackaged, ')');
  
  console.log('[main] scheduleAutoUpdateCheck: starting...');
  console.log('[main] app version:', app.getVersion());
  
  // 等待 3 秒再检查更新，确保窗口准备完成，用户进入系统
  await sleep(3000);
  
  try {
    console.log('[main] scheduleAutoUpdateCheck: calling checkForUpdates...');
    const result = await autoUpdater.checkForUpdates();
    console.log('[main] scheduleAutoUpdateCheck: result:', result);
  } catch (err) {
    const errorDetails = {
      message: String(err),
      stack: err.stack,
      code: err.code,
      name: err.name
    };
    if (logger) {
      logger.error('自动检查更新失败:', errorDetails);
    } else {
      console.error('[main] 自动检查更新失败:', errorDetails);
    }
    try { 
      mainWin && mainWin.webContents.send('update/error', String(err)); 
    } catch (e) {}
  }
}

async function createDisplayWindow(width, height, displayId = 'display-1') {
  // 检查是否已存在该显示端窗口
  if (displayWindows.has(displayId)) {
    const existingWin = displayWindows.get(displayId);
    if (existingWin && !existingWin.isDestroyed()) {
      try {
        if (typeof width === 'number' && typeof height === 'number') {
          existingWin.setSize(Math.max(100, Math.floor(width)), Math.max(100, Math.floor(height)));
        }
        existingWin.focus();
      } catch (e) {
        // 忽略尺寸设置异常
      }
      return existingWin;
    } else {
      // 清理已销毁的窗口引用
      displayWindows.delete(displayId);
    }
  }

  // 计算适配缩放后的窗口尺寸
  // 如果没有传入尺寸参数，尝试从配置中读取显示端的默认尺寸
  let defaultWidth = 1900;
  let defaultHeight = 600;
  
  // 尝试从store中读取显示端配置以获取默认尺寸（仅在参数未传入时）
  if (typeof width !== 'number' || typeof height !== 'number') {
    try {
      if (store) {
        const settings = store.get('settings', {});
        const displays = settings.display?.displays || {};
        const displayConfig = displays[displayId];
        if (displayConfig) {
          if (typeof displayConfig.width === 'number' && displayConfig.width > 0) {
            defaultWidth = Number(displayConfig.width);
          }
          if (typeof displayConfig.height === 'number' && displayConfig.height > 0) {
            defaultHeight = Number(displayConfig.height);
          }
          console.log(`[main] 从配置读取 ${displayId} 尺寸:`, defaultWidth, 'x', defaultHeight);
        } else {
          console.warn(`[main] 未找到 ${displayId} 的配置，使用默认尺寸:`, defaultWidth, 'x', defaultHeight);
        }
      }
    } catch (e) {
      console.warn('[main] 读取显示端默认尺寸失败:', e);
    }
  } else {
    console.log(`[main] 使用传入的 ${displayId} 尺寸:`, width, 'x', height);
  }
  
  // 窗口逻辑尺寸始终与内容尺寸一致，不受系统缩放影响
  // 这样可以确保在所有缩放比例下，显示的内容范围都是一样的
  let logicalWidth, logicalHeight;
  
  // 对于 display-2，强制使用 1500x400，忽略所有其他值
  if (displayId === 'display-2') {
    // 强制使用 1500x400，无论配置或传入的参数是什么
    logicalWidth = 1500;
    logicalHeight = 400;
    console.log(`[main] display-2 强制使用固定尺寸:`, logicalWidth, 'x', logicalHeight, '(忽略传入的参数:', width, 'x', height, '和配置值)');
    
    // 同时更新 store 中的配置，确保配置正确
    try {
      if (store) {
        const settings = store.get('settings', {});
        if (!settings.display) settings.display = {};
        if (!settings.display.displays) settings.display.displays = {};
        if (!settings.display.displays['display-2']) {
          settings.display.displays['display-2'] = {};
        }
        settings.display.displays['display-2'].width = 1500;
        settings.display.displays['display-2'].height = 400;
        store.set('settings', settings);
        console.log(`[main] display-2 配置已更新为: 1500x400`);
      }
    } catch (e) {
      console.warn('[main] display-2 更新配置失败:', e);
    }
    
    // 跳过后续的配置读取逻辑
  } else if (false) { // 原来的 display-2 逻辑已移到上面，这里永远不会执行
    // 尝试从配置读取 display-2 的尺寸
    try {
      if (store) {
        const settings = store.get('settings', {});
        const displays = settings.display?.displays || {};
        const display2Config = displays['display-2'];
        if (display2Config) {
          const configWidth = display2Config.width;
          const configHeight = display2Config.height;
          if (typeof configWidth === 'number' && configWidth > 0 && typeof configHeight === 'number' && configHeight > 0) {
            logicalWidth = Number(configWidth);
            logicalHeight = Number(configHeight);
            console.log(`[main] display-2 强制使用配置尺寸:`, logicalWidth, 'x', logicalHeight, '(忽略传入的参数:', width, 'x', height, ')');
          } else {
            // 配置无效，使用传入的参数或默认值
            if (typeof width === 'number' && typeof height === 'number') {
              logicalWidth = Math.max(100, Math.floor(width));
              logicalHeight = Math.max(100, Math.floor(height));
              console.log(`[main] display-2 配置无效，使用传入的参数:`, logicalWidth, 'x', logicalHeight);
            } else {
              logicalWidth = defaultWidth;
              logicalHeight = defaultHeight;
              console.log(`[main] display-2 配置无效，使用默认尺寸:`, logicalWidth, 'x', logicalHeight);
            }
          }
        } else {
          // 没有配置，使用传入的参数或默认值
          if (typeof width === 'number' && typeof height === 'number') {
            logicalWidth = Math.max(100, Math.floor(width));
            logicalHeight = Math.max(100, Math.floor(height));
            console.log(`[main] display-2 无配置，使用传入的参数:`, logicalWidth, 'x', logicalHeight);
          } else {
            logicalWidth = defaultWidth;
            logicalHeight = defaultHeight;
            console.log(`[main] display-2 无配置，使用默认尺寸:`, logicalWidth, 'x', logicalHeight);
          }
        }
      } else {
        // store 不可用，使用传入的参数或默认值
        if (typeof width === 'number' && typeof height === 'number') {
          logicalWidth = Math.max(100, Math.floor(width));
          logicalHeight = Math.max(100, Math.floor(height));
          console.log(`[main] display-2 store不可用，使用传入的参数:`, logicalWidth, 'x', logicalHeight);
        } else {
          logicalWidth = defaultWidth;
          logicalHeight = defaultHeight;
          console.log(`[main] display-2 store不可用，使用默认尺寸:`, logicalWidth, 'x', logicalHeight);
        }
      }
    } catch (e) {
      console.warn('[main] display-2 读取配置失败，使用传入参数或默认值:', e);
      if (typeof width === 'number' && typeof height === 'number') {
        logicalWidth = Math.max(100, Math.floor(width));
        logicalHeight = Math.max(100, Math.floor(height));
      } else {
        logicalWidth = defaultWidth;
        logicalHeight = defaultHeight;
      }
    }
  } else {
    // 其他显示端使用原有逻辑
  if (typeof width === 'number' && typeof height === 'number') {
    // 如果传入了尺寸参数，使用传入的尺寸
    logicalWidth = Math.max(100, Math.floor(width));
    logicalHeight = Math.max(100, Math.floor(height));
      console.log(`[main] ${displayId} 使用传入的尺寸参数:`, logicalWidth, 'x', logicalHeight);
  } else {
    // 使用从配置读取的默认尺寸，如果没有配置则使用默认值
    logicalWidth = defaultWidth;
    logicalHeight = defaultHeight;
      console.log(`[main] ${displayId} 使用配置/默认尺寸:`, logicalWidth, 'x', logicalHeight);
    }
  }
  
  // 确保尺寸为4的倍数，以避免在高DPI下的渲染问题
  const adjustedWidth = Math.ceil(logicalWidth / 4) * 4;
  const adjustedHeight = Math.ceil(logicalHeight / 4) * 4;
  console.log(`[main] ${displayId} 最终窗口尺寸:`, adjustedWidth, 'x', adjustedHeight);

  // 先读取显示端配置，以判断是否为第三方显示器（自定义HTML文件）
  let displayConfig = null;
  
  // 首先尝试从 electron-store 读取
  if (store) {
    try {
      const settings = store.get('settings', {});
      const displays = settings.display?.displays || {};
      displayConfig = displays[displayId];
      console.log(`[main] 创建窗口前读取显示端配置 ${displayId}:`, displayConfig ? {
        source: displayConfig.source,
        url: displayConfig.url,
        name: displayConfig.name
      } : '未找到配置');
    } catch (e) {
      console.warn('[main] 从 electron-store 读取显示端配置失败:', e);
    }
  }
  
  // 如果 electron-store 中没有配置，尝试从主窗口的 localStorage 读取（通过 IPC）
  if (!displayConfig && mainWin && !mainWin.isDestroyed()) {
    try {
      const localStorageSettings = await mainWin.webContents.executeJavaScript(`
        (function() {
          try {
            const raw = localStorage.getItem('pids_settings_v1');
            if (raw) {
              return JSON.parse(raw);
            }
            return null;
          } catch(e) {
            return null;
          }
        })();
      `);
      
      if (localStorageSettings && localStorageSettings.display && localStorageSettings.display.displays) {
        displayConfig = localStorageSettings.display.displays[displayId];
        if (displayConfig) {
          console.log(`[main] 创建窗口前从主窗口 localStorage 读取显示端配置 ${displayId}:`, {
            source: displayConfig.source,
            url: displayConfig.url,
            name: displayConfig.name
          });
        }
      }
    } catch (e) {
      console.warn('[main] 从主窗口读取配置失败:', e);
    }
  }
  
  // 判断是否为第三方显示器（配置了自定义HTML文件）
  const isThirdPartyDisplay = displayConfig && displayConfig.source === 'builtin' && displayConfig.url && displayConfig.url.trim();
  
  // 使用方案二：隐藏默认标题栏，显示系统窗口控制按钮
  const isWindows = process.platform === 'win32';
  const isMacOS = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  
  // 根据是否为第三方显示器选择窗口配置
  let opts;
  if (isThirdPartyDisplay) {
    // 第三方显示器：使用框架窗口（有标题栏、边框等）
    console.log(`[main] ${displayId} 是第三方显示器，使用框架窗口`);
    opts = {
      width: adjustedWidth,
      height: adjustedHeight,
      useContentSize: false,
      frame: true, // 显示框架
      transparent: false,
      backgroundColor: '#ffffff', // 白色背景
      resizable: true, // 允许调整大小
      maximizable: true, // 允许最大化
      minimizable: true, // 允许最小化
      show: false, // 先不显示，等 ready-to-show 事件后再显示
      skipTaskbar: false,
      title: displayConfig.name || `Metro PIDS - ${displayId}`,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1.0,
        backgroundThrottling: false,
        offscreen: false,
        enableBlinkFeatures: 'Accelerated2dCanvas,CanvasOopRasterization'
      }
    };
  } else if (isLinux) {
    // Linux 不支持自定义标题栏，使用系统默认标题栏
    opts = {
      width: adjustedWidth,
      height: adjustedHeight,
      useContentSize: false,
      frame: true, // Linux 使用系统框架
      resizable: false,
      maximizable: false, // 禁用最大化
      show: true,
      skipTaskbar: false,
      title: `Metro PIDS - ${displayId}`,
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1.0,
        // 显示端：确保在后台也保持刷新，并启用 2D Canvas GPU 光栅化
        backgroundThrottling: false,
        offscreen: false,
        enableBlinkFeatures: 'Accelerated2dCanvas,CanvasOopRasterization'
      }
    };
  } else {
    // Windows 和 MacOS 使用自定义标题栏
   // 如果 mica-electron 可用，使用透明背景以支持 Mica 效果（不模糊）
    const useMica = isWindows && MicaBrowserWindow !== BrowserWindow;
    opts = {
      width: adjustedWidth,
      height: adjustedHeight,
      useContentSize: false,
      frame: false, // 隐藏默认框架
      transparent: false, // 如果使用 Mica，启用透明；否则不透明
      backgroundColor: useMica ? '#00000000' : '#090d12', // Mica 时透明，否则使用深色背景
      resizable: false,
      maximizable: false, // 禁用最大化
      show: false, // 先不显示，等 ready-to-show 事件后再显示
      skipTaskbar: false,
      title: `Metro PIDS - ${displayId}`,
      // 隐藏默认标题栏，但保留系统窗口控制按钮
      titleBarStyle: 'hidden',
      // 显示系统自带窗口控制按钮
      // 注意：height 设置为 0 或很小，让自定义状态栏完全控制拖动区域
      titleBarOverlay: {
        color: isWindows ? 'rgba(0, 0, 0, 0)' : undefined, // Windows 设置为透明，MacOS 不需要
        symbolColor: isWindows ? '#2d3436' : undefined, // Windows 控制按钮颜色（与控制面板一致，使用黑色）
        height: 36 // 控制按钮高度，与自定义状态栏高度一致（36px）
      },
      // 顶级窗口（无父级），以独立原生窗口呈现
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        // 禁用自动缩放，使用CSS transform来控制缩放
        zoomFactor: 1.0,
        // 显示端：确保在后台也保持刷新，并启用 2D Canvas GPU 光栅化
        backgroundThrottling: false,
        offscreen: false,
        // 允许高DPI支持 + 2D Canvas GPU 加速
        enableBlinkFeatures: 'Accelerated2dCanvas,CanvasOopRasterization'
      }
    };
  }

  const displayWin = new BrowserWindow(opts);
  
  // 立即确保窗口尺寸正确（防止某些情况下尺寸被错误设置）
  // 对于 display-2，强制使用 1500x400
  let finalWidth = adjustedWidth;
  let finalHeight = adjustedHeight;
  if (displayId === 'display-2') {
    // 强制使用配置中的尺寸，忽略所有其他值
    try {
      if (store) {
        const settings = store.get('settings', {});
        const displays = settings.display?.displays || {};
        const display2Config = displays['display-2'];
        if (display2Config) {
          const configWidth = display2Config.width;
          const configHeight = display2Config.height;
          if (typeof configWidth === 'number' && configWidth > 0 && typeof configHeight === 'number' && configHeight > 0) {
            finalWidth = Math.ceil(Number(configWidth) / 4) * 4;
            finalHeight = Math.ceil(Number(configHeight) / 4) * 4;
            console.log(`[main] display-2 强制使用配置尺寸:`, finalWidth, 'x', finalHeight);
          }
        }
      }
    } catch (e) {
      console.warn('[main] display-2 强制读取配置失败:', e);
    }
  }
  
  displayWin.setSize(finalWidth, finalHeight, false);
  console.log(`[main] ${displayId} 窗口已创建，尺寸已设置为:`, finalWidth, 'x', finalHeight);

  // 根据显示端ID选择不同的HTML文件
  let dispPath;
  
  // displayConfig 已在窗口创建前读取，这里直接使用
  // 如果配置了本地文件路径（source为builtin且url存在），使用该路径
  if (displayConfig && displayConfig.source === 'builtin' && displayConfig.url) {
    let customFilePath = displayConfig.url.trim();
    console.log(`[main] 检测到自定义HTML文件路径: ${customFilePath}`);
    
    // 规范化路径：如果是相对路径，需要相对于应用目录解析
    let resolvedPath;
    if (path.isAbsolute(customFilePath)) {
      // 绝对路径，直接使用
      resolvedPath = customFilePath;
    } else {
      // 相对路径，相对于应用目录解析
      if (app.isPackaged) {
        resolvedPath = path.join(app.getAppPath(), customFilePath);
      } else {
        resolvedPath = path.join(__dirname, '..', customFilePath);
      }
    }
    
    // 规范化路径格式（处理Windows路径分隔符等）
    resolvedPath = path.normalize(resolvedPath);
    console.log(`[main] 解析后的文件路径: ${resolvedPath}`);
    
    // 检查文件是否存在
    if (fs.existsSync(resolvedPath)) {
      // 使用 file:// 协议加载本地文件
      // Windows路径需要特殊处理：file:///C:/path/to/file.html
      // Unix路径：file:///path/to/file.html
      const fileUrl = process.platform === 'win32' 
        ? `file:///${resolvedPath.replace(/\\/g, '/')}`
        : `file://${resolvedPath}`;
      dispPath = fileUrl;
      console.log(`[main] ✅ 使用自定义HTML文件: ${fileUrl}`);
    } else {
      console.warn(`[main] ⚠️ 配置的本地文件不存在: ${resolvedPath}，使用默认路径`);
      // 回退到默认路径
      if (displayId === 'display-1') {
        dispPath = getRendererUrl('display_window.html');
      } else {
        const customRel = path.join('displays', displayId, 'display_window.html');
        const customPath = app.isPackaged 
          ? path.join(app.getAppPath(), 'out/renderer', customRel)
          : path.join(__dirname, '../renderer', customRel);
        if (fs.existsSync(customPath)) {
          dispPath = getRendererUrl(customRel);
        } else {
          dispPath = getRendererUrl('display_window.html');
        }
      }
    }
  } else {
    // 没有配置自定义URL，检查是否有默认的显示端文件
    if (displayId === 'display-1') {
      dispPath = getRendererUrl('display_window.html');
      console.log(`[main] 使用默认主显示器路径: ${dispPath}`);
    } else {
      // 检查是否存在对应的显示端文件
      const customRel = path.join('displays', displayId, 'display_window.html');
      // 直接使用 getRendererUrl 的逻辑来构建路径进行检查
      let customPath;
      
      if (app.isPackaged) {
        // 打包环境：使用 app.getAppPath()
        const appPath = app.getAppPath();
        customPath = path.join(appPath, 'out/renderer', customRel);
      } else {
        // 开发环境：使用 __dirname/../renderer
        customPath = path.join(__dirname, '../renderer', customRel);
      }
      
      console.log(`[main] 检查 display-${displayId} 文件路径: ${customPath}, 存在: ${fs.existsSync(customPath)}`);
      
      if (fs.existsSync(customPath)) {
        dispPath = getRendererUrl(customRel);
        console.log(`[main] ✅ 使用 display-${displayId} 路径: ${dispPath}`);
      } else {
        // 如果不存在，使用默认显示端
        console.warn(`[main] ⚠️ display-${displayId} 文件不存在 (${customPath})，使用默认显示端`);
        if (displayConfig) {
          console.log(`[main] 显示端配置信息: source=${displayConfig.source}, url=${displayConfig.url || '(空)'}, name=${displayConfig.name || '(空)'}`);
        } else {
          console.warn(`[main] ⚠️ 显示端 ${displayId} 的配置未找到`);
        }
        dispPath = getRendererUrl('display_window.html');
      }
    }
  }
  
  console.log(`[main] createDisplayWindow: displayId=${displayId}, dispPath=${dispPath}`);

  // 在窗口准备好后再显示，避免黑屏
  displayWin.once('ready-to-show', () => {
    // 再次确保窗口尺寸正确（特别是 display-2）
    // 对于 display-2，再次从配置读取确保使用正确尺寸
    let expectedWidth = finalWidth;
    let expectedHeight = finalHeight;
    
    if (displayId === 'display-2') {
      try {
        if (store) {
          const settings = store.get('settings', {});
          const displays = settings.display?.displays || {};
          const display2Config = displays['display-2'];
          if (display2Config) {
            const configWidth = display2Config.width;
            const configHeight = display2Config.height;
            if (typeof configWidth === 'number' && configWidth > 0 && typeof configHeight === 'number' && configHeight > 0) {
              expectedWidth = Math.ceil(Number(configWidth) / 4) * 4;
              expectedHeight = Math.ceil(Number(configHeight) / 4) * 4;
              console.log(`[main] display-2 ready-to-show 时强制使用配置尺寸:`, expectedWidth, 'x', expectedHeight);
            }
          }
        }
      } catch (e) {
        console.warn('[main] display-2 ready-to-show 读取配置失败:', e);
      }
    }
    
    const currentSize = displayWin.getSize();
    if (currentSize[0] !== expectedWidth || currentSize[1] !== expectedHeight) {
      console.warn(`[main] ${displayId} 窗口尺寸不匹配！当前: ${currentSize[0]}x${currentSize[1]}, 期望: ${expectedWidth}x${expectedHeight}，正在修正...`);
      displayWin.setSize(expectedWidth, expectedHeight, false);
      // 对于 display-2，如果尺寸仍然不对，多次强制设置
      if (displayId === 'display-2') {
        setTimeout(() => {
          const checkSize = displayWin.getSize();
          if (checkSize[0] !== expectedWidth || checkSize[1] !== expectedHeight) {
            console.warn(`[main] display-2 尺寸仍然不正确，再次强制设置:`, expectedWidth, 'x', expectedHeight);
            displayWin.setSize(expectedWidth, expectedHeight, false);
            // 再延迟一次确保设置成功
            setTimeout(() => {
              const checkSize2 = displayWin.getSize();
              if (checkSize2[0] !== expectedWidth || checkSize2[1] !== expectedHeight) {
                console.error(`[main] display-2 尺寸设置失败！当前: ${checkSize2[0]}x${checkSize2[1]}, 期望: ${expectedWidth}x${expectedHeight}`);
                displayWin.setSize(expectedWidth, expectedHeight, false);
              } else {
                console.log(`[main] display-2 ✅ 尺寸已成功设置为:`, expectedWidth, 'x', expectedHeight);
              }
            }, 200);
          } else {
            console.log(`[main] display-2 ✅ 尺寸已正确:`, expectedWidth, 'x', expectedHeight);
          }
        }, 100);
      }
    } else {
      console.log(`[main] ${displayId} ✅ 窗口尺寸正确:`, expectedWidth, 'x', expectedHeight);
    }
    displayWin.show();
    // 在开发模式下自动打开开发者工具
    if (!app.isPackaged) {
      displayWin.webContents.openDevTools();
    }
  });
  
  displayWin.loadURL(dispPath);
  
  // 确保缩放因子始终为1.0，禁用Electron的自动缩放
  displayWin.webContents.setZoomFactor(1.0);
  
  // 监听缩放变化事件，确保始终保持1.0缩放
  displayWin.webContents.on('did-finish-load', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });
  
  // 监听窗口显示事件，再次确保缩放正确
  displayWin.on('show', () => {
    displayWin.webContents.setZoomFactor(1.0);
  });
  
  // 添加快捷键支持：F12 或 Ctrl+Shift+I (Windows/Linux) / Cmd+Option+I (MacOS) 切换开发者工具
  displayWin.webContents.on('before-input-event', async (event, input) => {
    // F12 键
    if (input.key === 'F12') {
      // 检查是否允许在打包后使用F12
      let allowF12 = !app.isPackaged; // 开发环境默认允许
      
      if (app.isPackaged) {
        // 打包环境：检查localStorage中的设置
        try {
          const result = await displayWin.webContents.executeJavaScript(`
            (function() {
              try {
                return localStorage.getItem('metro_pids_enable_f12_devtools') === 'true';
              } catch(e) {
                return false;
              }
            })();
          `);
          allowF12 = result === true;
        } catch (e) {
          console.warn('[DisplayWindow] 检查F12设置失败:', e);
          allowF12 = false;
        }
      }
      
      if (allowF12) {
      if (displayWin.webContents.isDevToolsOpened()) {
        displayWin.webContents.closeDevTools();
      } else {
        displayWin.webContents.openDevTools();
      }
      event.preventDefault();
      }
      return;
    }
    
    // Ctrl+Shift+I (Windows/Linux) 或 Cmd+Option+I (MacOS)
    const isMac = process.platform === 'darwin';
    const isCtrlShiftI = !isMac && input.control && input.shift && input.key === 'I';
    const isCmdOptionI = isMac && input.meta && input.alt && input.key === 'I';
    
    if (isCtrlShiftI || isCmdOptionI) {
      // 检查是否允许在打包后使用快捷键
      let allowShortcut = !app.isPackaged; // 开发环境默认允许
      
      if (app.isPackaged) {
        // 打包环境：检查localStorage中的设置
        try {
          const result = await displayWin.webContents.executeJavaScript(`
            (function() {
              try {
                return localStorage.getItem('metro_pids_enable_f12_devtools') === 'true';
              } catch(e) {
                return false;
              }
            })();
          `);
          allowShortcut = result === true;
        } catch (e) {
          console.warn('[DisplayWindow] 检查F12设置失败:', e);
          allowShortcut = false;
        }
      }
      
      if (allowShortcut) {
      if (displayWin.webContents.isDevToolsOpened()) {
        displayWin.webContents.closeDevTools();
      } else {
        displayWin.webContents.openDevTools();
      }
      event.preventDefault();
      }
      return;
    }
  });

  // 性能优化：窗口关闭时彻底清理资源，避免内存泄漏
  displayWin.on('closed', () => {
    displayWindows.delete(displayId);
    // 确保窗口引用被清理
    if (displayWin && !displayWin.isDestroyed()) {
      try {
        displayWin.destroy();
      } catch (e) {
        console.warn(`[DisplayWindow:${displayId}] 销毁窗口失败:`, e);
      }
    }
  });

  // 性能优化：监控显示端窗口内存使用，超阈值时刷新页面
  // 显示端窗口通常需要持续运行，内存监控有助于保持性能
  let memoryMonitorInterval = null;
  if (displayWin && displayWin.webContents) {
    memoryMonitorInterval = setInterval(async () => {
      try {
        if (displayWin.isDestroyed()) {
          if (memoryMonitorInterval) {
            clearInterval(memoryMonitorInterval);
            memoryMonitorInterval = null;
          }
          return;
        }
        
        const memoryInfo = displayWin.webContents.getProcessMemoryInfo();
        if (memoryInfo && memoryInfo.privateBytes) {
          const memoryMB = memoryInfo.privateBytes / 1024 / 1024;
          // 显示端窗口内存阈值：800MB（考虑到地图渲染等复杂内容）
          if (memoryMB > 800) {
            console.warn(`[DisplayWindow:${displayId}] 内存使用超阈值（${memoryMB.toFixed(2)}MB），刷新页面`);
            displayWin.webContents.reload();
          }
        }
      } catch (e) {
        // 忽略监控错误，避免影响窗口正常运行
        if (memoryMonitorInterval) {
          clearInterval(memoryMonitorInterval);
          memoryMonitorInterval = null;
        }
      }
    }, 30000); // 每30秒检查一次内存使用
  }

  // 存储窗口引用
  displayWindows.set(displayId, displayWin);

  return displayWin;
}

// 辅助：显示带模糊背景的自定义 Electron 警告/确认弹窗
function showElectronAlert({ parent, type = 'alert', title = '提示', msg = '' } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const modal = new BrowserWindow({
        parent: parent || null,
        modal: !!parent,
        width: 680,
        height: 420,
        resizable: false,
        minimizable: false,
        maximizable: false,
        frame: true,
        show: false,
        transparent: false,
        webPreferences: {
          preload: getPreloadPath(),
          contextIsolation: true,
          nodeIntegration: true
        }
      });

      const id = Date.now().toString(36) + Math.floor(Math.random()*1000).toString(36);
      const url = `${getRendererUrl('electron_alert.html')}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}`;

      let _blurApplied = false;
      const applyParentBlur = (enable) => {
        try {
          if (!parent) return;
          if (typeof parent.setVisualEffectState === 'function') {
            parent.setVisualEffectState(enable ? 'active' : 'inactive');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'darwin' && typeof parent.setVibrancy === 'function') {
            parent.setVibrancy(enable ? 'fullscreen-ui' : 'none');
            _blurApplied = enable;
            return;
          }
          if (process.platform === 'win32' && typeof parent.setBackgroundMaterial === 'function') {
            parent.setBackgroundMaterial(enable ? 'acrylic' : 'mica');
            _blurApplied = enable;
            return;
          }
        } catch (e) {
      // 忽略
        }
      };

      const cleanup = () => {
        try { modal.removeAllListeners(); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
      };

      const responseHandler = (event, data) => {
        try {
          if (!data || data.id !== id) return;
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(!!data.result);
        } catch (e) {
          cleanup();
          try { modal.close(); } catch (e) {}
          resolve(false);
        }
      };

      ipcMain.once('electron-alert-response', responseHandler);

      modal.once('ready-to-show', () => {
        try { applyParentBlur(true); } catch (e) {}
        try { modal.show(); } catch (e) {}
      });

      modal.on('closed', () => {
        // 若未返回结果即关闭，视为取消/false
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { applyParentBlur(false); } catch (e) {}
        resolve(false);
      });

      modal.loadURL(url).catch((e) => {
        try { ipcMain.removeListener('electron-alert-response', responseHandler); } catch (e) {}
        try { modal.close(); } catch (e) {}
        reject(e);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// 创建线路管理器窗口
function createLineManagerWindow() {
  if (lineManagerWin && !lineManagerWin.isDestroyed()) {
    lineManagerWin.focus();
    return;
  }
  
  const isWindows = process.platform === 'win32';
  
  // 使用 MicaBrowserWindow（如果可用）以获得 Mica 模糊效果
  lineManagerWin = new MicaBrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 500,
    frame: false, // 隐藏默认框架，使用自定义标题栏
    transparent: true, // 启用透明以支持毛玻璃效果
    resizable: true,
    backgroundColor: '#00000000', // 完全透明的背景色
    hasShadow: true, // 启用窗口阴影
    titleBarStyle: 'hidden', // 隐藏默认标题栏
    titleBarOverlay: process.platform === 'win32' ? {
      color: 'rgba(0, 0, 0, 0)', // 透明背景
      symbolColor: '#2d3436', // 符号颜色
      height: 32 // 标题栏高度
    } : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false // 先不显示，等 dom-ready 后再显示
  });

  // 应用 Mica 模糊效果（与主窗口相同）
  if (isWindows && lineManagerWin && MicaBrowserWindow !== BrowserWindow) {
    try {
      // 设置主题
      if (IS_WINDOWS_11) {
        if (typeof lineManagerWin.setAutoTheme === 'function') {
          lineManagerWin.setAutoTheme();
          console.log('[LineManagerWindow] ✅ 已设置自动主题');
        } else if (typeof lineManagerWin.setDarkTheme === 'function') {
          lineManagerWin.setDarkTheme();
          console.log('[LineManagerWindow] ✅ 已设置深色主题');
        }
        
        // 应用 Mica Acrylic Effect（Acrylic for Windows 11）
        if (typeof lineManagerWin.setMicaAcrylicEffect === 'function') {
          lineManagerWin.setMicaAcrylicEffect();
          console.log('[LineManagerWindow] ✅ 已应用 Mica Acrylic 效果');
        }
      } else if (WIN10 && typeof lineManagerWin.setAcrylic === 'function') {
        // Windows 10: 使用 Acrylic 效果
        lineManagerWin.setAcrylic();
        console.log('[LineManagerWindow] ✅ 已应用 Acrylic 效果');
      }
    } catch (e) {
      console.warn('[LineManagerWindow] ⚠️ 应用 Mica 效果失败:', e);
    }
  }

  const lineManagerPath = getRendererUrl('line_manager_window.html');
  lineManagerWin.loadURL(lineManagerPath);

  // 确保背景透明并重新应用 Mica 效果
  lineManagerWin.webContents.once('dom-ready', () => {
    if (lineManagerWin && !lineManagerWin.isDestroyed()) {
      try {
        lineManagerWin.setBackgroundColor('#00000000');
        // 延迟应用效果，确保背景色设置生效
        setTimeout(() => {
          if (lineManagerWin && !lineManagerWin.isDestroyed()) {
            try {
              if (IS_WINDOWS_11 && typeof lineManagerWin.setMicaAcrylicEffect === 'function') {
                lineManagerWin.setBackgroundColor('#00000000');
                lineManagerWin.setMicaAcrylicEffect();
                console.log('[LineManagerWindow] ✅ 重新应用 Mica Acrylic 效果');
              } else if (WIN10 && typeof lineManagerWin.setAcrylic === 'function') {
                lineManagerWin.setBackgroundColor('#00000000');
                lineManagerWin.setAcrylic();
                console.log('[LineManagerWindow] ✅ 重新应用 Acrylic 效果');
              }
            } catch (e) {
              console.warn('[LineManagerWindow] ⚠️ 重新应用效果失败:', e);
            }
          }
        }, 50);
      } catch (e) {
        console.warn('[LineManagerWindow] ⚠️ 设置透明背景失败:', e);
      }
    }
    lineManagerWin.show();
  });

  lineManagerWin.once('ready-to-show', () => {
    if (!app.isPackaged) {
      lineManagerWin.webContents.openDevTools();
    }
  });

  lineManagerWin.on('closed', () => {
    lineManagerWin = null;
  });
}

// 创建开发者窗口
function createDevWindow() {
  if (devWin && !devWin.isDestroyed()) {
    devWin.focus();
    return;
  }
  
  devWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    transparent: false,
    resizable: true,
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#f0f2f5',
      symbolColor: '#2d3436',
      height: 32
    } : undefined,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false
  });

  const devPath = getRendererUrl('dev_window.html');
  devWin.loadURL(devPath);

  devWin.once('ready-to-show', () => {
    devWin.show();
    if (!app.isPackaged) {
      devWin.webContents.openDevTools();
    }
  });

  devWin.on('closed', () => {
    devWin = null;
  });
}

// 处理线路管理器的线路切换请求
ipcMain.handle('line-manager/switch-line', async (event, lineName) => {
  try {
    // 通知主窗口切换线路，同时传递 target 信息（如果有）
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('switch-line-request', lineName, throughOperationTarget);
      // 清除 target（使用后清除）
      const target = throughOperationTarget;
      throughOperationTarget = null;
      // 关闭线路管理器窗口
      if (lineManagerWin && !lineManagerWin.isDestroyed()) {
        lineManagerWin.close();
      }
      return { ok: true, target: target };
    }
    return { ok: false, error: '主窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// 处理关闭窗口请求
ipcMain.handle('line-manager/close', async (event) => {
  try {
    if (lineManagerWin && !lineManagerWin.isDestroyed()) {
      lineManagerWin.close();
      return { ok: true };
    }
    return { ok: false, error: '窗口不存在' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
