# Metro-PIDS

这是一个基于网页/Electron 的地铁站台信息显示（PIDS）控制与显示端项目。它包含一个控制面板（管理员界面）用于编辑线路、设置快捷键、启动自动播放等；以及一个用于投屏的显示端页面，用于实时展示下一站/车门信息与到站提示。

## ✨ 特性

### 📦 开箱即用
- 基于 **electron-vite** 构建，配置简单，开箱即用
- 支持 Vue 3 + Composition API
- 完整的 TypeScript 支持（可选）

### 🔥 热重启 - 主进程
- 修改 `main.js` 或 `preload.js` 时自动重启应用
- 无需手动重启，提升开发效率

### ⚡️ HMR - 渲染进程
- 修改 Vue 组件时自动热更新
- 保持应用状态，无需刷新页面
- 支持 CSS、JS 文件的即时更新

### 🔄 热重载 - 预加载脚本
- 修改 `preload.js` 时自动重载
- 无需重启应用即可看到更改

### 💪 完整的 Node.js API 支持
- 主进程、渲染进程、预加载脚本中均支持完整的 Node.js API
- 使用 `contextIsolation` 确保安全性
- 通过 `contextBridge` 安全地暴露 API

### 🎯 基于 Vite 官方模板
- 使用 Vue 3 + Vite 作为前端框架
- 支持现代 ES modules
- 快速的开发服务器和构建

### 🪟 Windows 高斯模糊支持
- 基于 **mica-electron** 实现 Windows 11 Mica/Acrylic 毛玻璃效果
- 支持 Windows 11 的 Mica Acrylic 效果（更强的模糊）
- 支持 Windows 10 的 Acrylic 效果
- 自动检测 Windows 版本并应用相应的模糊效果
- 支持主题切换（浅色/深色/自动）
- 窗口背景透明，让原生模糊效果透出

## 主要功能

- 多线路支持：可以创建/删除/切换多条线路，每条线路包含站点列表与运行方向信息。
- **线路名合并显示**：支持在显示端将多条线路名以并排的线路块形式展示，每个线路块显示大号数字、"号线"和"Line X"格式，适用于贯通运营线路的展示需求。
- 实时显示：Display 窗口用于投屏展示当前站、下一站、对侧开门提示等信息，支持"下一站/到达站"信息的居中显示和文本右对齐。
- 快捷键控制：支持配置"下一步/上一站/到达/发车"等快捷键，并在显示端按键时转发控制端执行。
- 自动播放（Autoplay）：支持按键或定时自动前进，带倒计时与暂停/继续功能。
- 主题与视觉：支持浅色/深色主题与一些视觉定制。
- 文件管理：可从文件夹加载线路 JSON、刷新并保存当前线路到打开的文件夹（需要主机 API 支持）。
- **站点计算 API**：提供统一的站点计算逻辑 API，支持短交路、暂缓停靠、快车、直达车等复杂运营模式，方便第三方显示器集成。

## 文件结构

```
├── main.js              # 主进程入口（支持热重启 🔥）
├── preload.js           # 预加载脚本（支持热重载 🔄）
├── index.html           # 控制端主页
├── display_window.html  # 显示端页面
├── electron.vite.config.js  # electron-vite 配置
├── src/
│   ├── main.js          # Vue 应用入口（支持 HMR ⚡️）
│   ├── App.js           # 根组件
│   ├── components/      # Vue 组件
│   └── composables/     # Composition API 组合式函数
└── dist/                # 构建输出目录
    ├── main/            # 主进程和预加载脚本
    └── renderer/        # 渲染进程（前端）
```

## 安装与运行

### 开发环境

1. **安装依赖**：
```bash
npm install
```

2. **启动开发服务器**（支持热重启、HMR、热重载）：
```bash
npm run dev
```

开发模式特性：
- 🔥 **主进程热重启**：修改 `main.js` 自动重启
- ⚡️ **渲染进程 HMR**：修改 Vue 组件即时更新
- 🔄 **预加载脚本热重载**：修改 `preload.js` 自动重载
- 📦 **开箱即用**：无需额外配置

3. **预览构建结果**：
```bash
npm run preview
```

### 项目截图

![截图1](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/5927dbe6eb3380ee4f61f83f5b6d994b.png)

![截图2](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/63a4d5e4b05ec6912bcc4e98e9d1de10.png)

![截图3](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/6f74a3b7be2c2ececb5856631ec8f2d8.png)

![截图4](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/80b6c62fab4707431c4903e3baba8e36.png)

![截图5](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/bcf833f16cfeb516c2e8a4f262fedf02.png)

![截图6](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-01-16%20010856.png)

![截图7](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-01-16%20010903.png)

![截图8](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-01-16%20010909.png)

![截图9](https://raw.githubusercontent.com/tanzhouxkong/Metro-PIDS-/main/png/%E5%B1%8F%E5%B9%95%E6%88%AA%E5%9B%BE%202026-01-16%20010929.png)

### 生产构建

```bash
npm run build
```

构建完成后，可执行文件位于 `dist/` 目录。

### 发布到 GitHub Releases

项目配置为自动发布到 GitHub Releases。发布前请确保：

1. **GitHub Token 已设置**（通过环境变量）：
   - `GH_TOKEN` 或 `GITHUB_TOKEN` 环境变量已配置
   - Token 需要 `repo` 权限

2. **发布命令**：
```powershell
# 使用 npm 脚本
npm run publish:gh

# 或直接使用 electron-builder
npx electron-builder --publish=always --win
```

**注意**：如果遇到 SSL 证书验证错误（`unable to verify the first certificate`），可能是企业网络环境的 SSL 拦截导致的。可以尝试以下解决方案：

1. **使用系统 CA 证书**（推荐）：
```powershell
# 方法 1：使用 NODE_OPTIONS 环境变量
$env:NODE_OPTIONS = "--use-system-ca"
npx electron-builder --publish=always --win

# 方法 2：直接在命令中使用
node --use-system-ca node_modules/.bin/electron-builder --publish=always --win
```

2. **手动上传**（最安全）：构建完成后，手动将 `dist/Metro-PIDS-Setup-{version}.exe` 上传到 GitHub Releases
   - 先构建但不发布：`npx electron-builder --win`（不加 `--publish=always`）
   - 然后手动上传到 GitHub Releases

3. **临时禁用 SSL 验证**（仅用于测试，不安全，不推荐）：
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
npx electron-builder --publish=always --win
```

4. **配置企业代理证书**（如果使用企业代理）：
   - 将企业 CA 证书添加到系统信任的根证书存储
   - 或设置 `NODE_EXTRA_CA_CERTS` 环境变量指向证书文件

## 开发指南

### 主进程开发（main.js）

- 修改 `main.js` 后，electron-vite 会自动重启应用
- 支持完整的 Node.js API
- 使用 `require()` 导入模块

### 渲染进程开发（Vue 组件）

- 修改 Vue 组件后，Vite 会自动热更新
- 支持 Vue 3 Composition API
- 使用 ES modules (`import/export`)
- 支持 `<script setup>` 语法

### 预加载脚本开发（preload.js）

- 修改 `preload.js` 后，electron-vite 会自动重载
- 使用 `contextBridge` 暴露 API 到渲染进程
- 支持完整的 Node.js API

### Windows 高斯模糊（Mica）支持

项目使用 **mica-electron** 库实现 Windows 原生高斯模糊效果。

#### 系统要求

- **Windows 11**：支持 Mica Acrylic 效果（推荐）
- **Windows 10**：支持 Acrylic 效果
- 需要安装 Visual Studio Build Tools（用于编译原生模块）

#### 安装与配置

1. **首次安装依赖**：
```bash
npm install
```

2. **如果 mica-electron 编译失败**，需要重新编译：
```bash
# 检查构建工具
npm run check-build-tools

# 重新编译 mica-electron
npm run rebuild-mica
```

#### 功能特性

- **自动检测系统版本**：根据 Windows 版本自动选择 Mica 或 Acrylic 效果
- **主题支持**：支持浅色、深色和自动主题切换
- **背景透明**：窗口背景设置为透明，让原生模糊效果透出
- **自动重新应用**：在窗口焦点变化、页面导航等场景下自动重新应用效果

#### 使用说明

- 模糊效果在应用启动时自动启用
- 可在控制面板中通过设置开关控制模糊效果
- 如果模糊效果不显示，请检查：
  1. 系统是否为 Windows 10/11
  2. mica-electron 是否已正确编译（运行 `npm run check-build-tools`）
  3. 窗口是否有焦点（Mica 效果需要窗口有焦点才能显示）

#### 技术细节

- 使用 `mica-electron` 库（版本 1.5.16+）
- 主进程通过 `MicaBrowserWindow` 创建窗口
- 通过 IPC 通信控制模糊效果的启用/禁用
- 窗口背景色设置为 `#00000000`（完全透明）以显示模糊效果

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **electron-vite** - 基于 Vite 的 Electron 构建工具
- **Vue 3** - 渐进式 JavaScript 框架
- **Vite** - 下一代前端构建工具

## 许可证

MIT

## 第三方显示器（通过 API 控制）

有两种用法：

1. 浏览器同源方式（自动同步）  
   直接在浏览器打开 `http://localhost:5173/examples/third-party-display-template.html`，模板会通过 BroadcastChannel 自动收同步数据并显示站点。

2. 本地显示端 + API 方式（推荐给“第三方显示器”窗口）  
   - 在显示端配置里选择 `examples/third-party-display-template.html` 作为“本地网页文件”。  
   - 启动 Metro-PIDS，第三方显示器会自动通过 BroadcastChannel 接收数据并显示站点。  
   - 快捷键会通过 BroadcastChannel 发送控制命令到主程序。

### BroadcastChannel 通信

Metro-PIDS 使用 **BroadcastChannel** 进行主程序与第三方显示器之间的通信，频道名称为 `metro_pids_v3`。

**优势：**
- ✅ **无需 HTTP 服务器**：避免端口占用、防火墙等问题
- ✅ **更快速**：浏览器原生 API，性能更好
- ✅ **更简单**：无需检查 API 可用性，直接使用广播通信
- ✅ **跨窗口通信**：在同一浏览器/Electron 环境中，可以跨窗口通信

### 快捷键（第三方模板内置，通过 BroadcastChannel 发送）

- `→` 下一站
- `←` 上一站
- `Enter` 到达
- `Space` 发车
- `F12` 切换调试面板

> 如果第三方显示器窗口不能接收按键，点击页面一次或确保窗口获得焦点即可。

### 数据同步

第三方显示器启动时会自动通过 BroadcastChannel 发送 `REQ` 消息请求主程序同步数据。主程序收到请求后会立即发送 `SYNC` 消息，包含完整的站点列表和实时状态。

### 更多信息

详细的 API 文档和实现示例请参考：
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - 完整的 API 文档
- [examples/third-party-display-template.html](./examples/third-party-display-template.html) - 第三方显示器实现示例

### 站点计算 API

Metro-PIDS 提供了统一的站点计算 API (`src/utils/displayStationCalculator.js`)，用于处理复杂的站点过滤和索引计算逻辑，包括：

- **短交路处理**：支持 `startIdx`/`termIdx` 定义的短交路范围
- **暂缓停靠**：处理 `skip` 标记的站点
- **快车模式**：支持 `expressStop` 快车停靠逻辑
- **直达车模式**：处理直达车运营模式
- **方向过滤**：根据 `dock` 属性过滤站点
- **循环模式**：支持循环线路的处理

**主要 API 函数：**
- `getFilteredStations(appData, config)` - 获取过滤后的站点列表
- `calculateDisplayStationInfo(appData, rtState, config)` - 计算当前站和下一站信息
- `isSkippedByService(st, idx, len, meta)` - 判断站点是否被运营模式跳过
- `getNextValidSt(currentIdx, step, appData)` - 获取下一个有效站点

**使用示例：**
```javascript
import { getFilteredStations, calculateDisplayStationInfo } from './src/utils/displayStationCalculator.js';

// 获取过滤后的站点列表
const filteredStations = getFilteredStations(appData, {
  filterByDirection: true,  // 按方向过滤
  reverseOnDown: true       // 下行时反转
});

// 计算当前站和下一站信息
const stationInfo = calculateDisplayStationInfo(appData, rtState, {
  filterByDirection: true,
  reverseOnDown: true
});
// stationInfo.currentIdx - 当前站索引
// stationInfo.nextIdx - 下一站索引
// stationInfo.nextStationName - 下一站名称
```

详细文档和完整示例请参考：
- **API 文档**：`API_DOCUMENTATION.md`（包含 JavaScript 和 Python 示例）
- **完整示例**：`examples/display-with-station-calculator.html`

### 相关示例文件路径

- 第三方显示器模板：`examples/third-party-display-template.html`
- Display SDK 示例（UMD 手动加载示例）：`examples/display-sdk-demo.html`
- **站点计算 API 使用示例**：`examples/display-with-station-calculator.html`（推荐）

### API 文档

完整的 API 文档请参考 [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)，包含：
- HTTP API 端点说明
- 站点计算 API 详细文档
- JavaScript 和 Python 使用示例
- 第三方显示器集成指南
