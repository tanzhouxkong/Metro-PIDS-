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
   - 启动 Metro-PIDS（不要手动跑 `node scripts/display-api-server.js`），主进程会自动启动 API 服务器。  
   - 通过 API 推送数据，第三方显示器即可显示站点，快捷键也会调用 API 控制线路。

### 启动 API 服务器

由 Metro-PIDS 主进程自动启动（端口默认 9001）。  
检查：浏览器访问 `http://localhost:9001/api/display/info` 应该返回 ok: true。

### 推送数据示例（PowerShell）

```powershell
$apiBase = "http://localhost:9001"; $body = @{
  appData = @{
    meta = @{
      lineName = "测试线路"
      lineNumber = "1"
    }
    stations = @(
      @{ name = "站点1"; en = "Station 1" }
      @{ name = "站点2"; en = "Station 2" }
      @{ name = "站点3"; en = "Station 3" }
    )
  }
  rtState = @{
    idx = 0
    state = 0
  }
} | ConvertTo-Json -Depth 10; Invoke-RestMethod -Uri "$apiBase/api/display/sync" -Method Post -Body $body -ContentType "application/json"
```

成功后返回 `{"ok":true,"message":"数据已同步到所有显示器"}`，第三方显示器会显示站点列表。

### 快捷键（第三方模板内置，通过 API 调用）

- `→` 下一站（command: `next`）
- `←` 上一站（command: `prev`）
- `Enter` 到达（command: `arrive`）
- `Space` 发车（command: `depart`）
- `F12` 切换调试面板

> 如果第三方显示器窗口不能接收按键，点击页面一次或确保窗口获得焦点即可或者将焦点放到主程序上也可以使用。

### 相关示例文件路径

- 第三方显示器模板：`examples/third-party-display-template.html`
- Display SDK 示例（UMD 手动加载示例）：`examples/display-sdk-demo.html`
