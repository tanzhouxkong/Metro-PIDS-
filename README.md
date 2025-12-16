# Metro-PIDS

这是一个基于网页/Electron 的地铁站台信息显示（PIDS）控制与显示端项目。它包含一个控制面板（管理员界面）用于编辑线路、设置快捷键、启动自动播放等；以及一个用于投屏的显示端页面，用于实时展示下一站/车门信息与到站提示。

## 主要功能

- 多线路支持：可以创建/删除/切换多条线路，每条线路包含站点列表与运行方向信息。
- 实时显示：Display 窗口用于投屏展示当前站、下一站、对侧开门提示等信息。
- 快捷键控制：支持配置“下一步/上一站/到达/发车”等快捷键，并在显示端按键时转发控制端执行。
- 自动播放（Autoplay）：支持按键或定时自动前进，带倒计时与暂停/继续功能。
- 主题与视觉：支持浅色/深色主题与一些视觉定制。
- 文件管理：可从文件夹加载线路 JSON、刷新并保存当前线路到打开的文件夹（需要主机 API 支持）。

## 文件结构（简要）

- `index.html`：控制端（Admin / Control Panel），包含设置、快捷键、线路编辑、保存与广播到 Display。
- `display_window.html`：显示端（Display），接收 BroadcastChannel 消息并渲染实时信息，同时将按键事件转发回控制端。
- `main.js`, `preload.js`：项目的主进程/预加载脚本（Electron 环境时使用）。
- `json/`：示例或存放线路 JSON 的文件夹（视项目运行环境而定）。

## 安装与运行

开发环境依赖 Node/npm（可运行在普通浏览器或打包为 Electron 应用）：

1. 安装依赖：

```powershell
npm install
```

2. 启动开发/构建（视项目 scripts 而定）：

```powershell
npm run build
# 或者
npm start
```

> 如果在 Electron 环境中运行，请确保 `window.electronAPI` 提供文件读写、打开文件夹等能力。

## 快速使用说明

1. 打开 `index.html`（在浏览器或 Electron 中）作为控制端。
2. 在左侧打开显示端窗口（`Open Display` 按钮），会打开 `display_window.html`。
3. 在 `Settings` 面板中配置快捷键（默认 `Enter` 为下一步），保存后即时生效。
4. 点击 `保存当前线路` 会调用主机 API 将当前线路 JSON 写回到打开的线路文件夹；若未启用主机 API 会有浏览器下载回退或警告。
![image](https://github.com/tanzhouxkong/Metro-PIDS-/blob/main/png/5927dbe6eb3380ee4f61f83f5b6d994b.png)
![image](https://github.com/tanzhouxkong/Metro-PIDS-/blob/main/png/63a4d5e4b05ec6912bcc4e98e9d1de10.png)
![image](https://github.com/tanzhouxkong/Metro-PIDS-/blob/main/png/6f74a3b7be2c2ececb5856631ec8f2d8.png)
![image](https://github.com/tanzhouxkong/Metro-PIDS-/blob/main/png/80b6c62fab4707431c4903e3baba8e36.png)
![image](https://github.com/tanzhouxkong/Metro-PIDS-/blob/main/png/bcf833f16cfeb516c2e8a4f262fedf02.png)
## 开发与调试提示

- BroadcastChannel 名称为 `metro_pids_v3`，控制端与显示端通过该频道同步与转发按键。
- 键名处理：项目代码中对键名做了规范化（`NumpadEnter -> Enter`, `Space` 统一处理, 单字符字母统一为 `KeyX`），以保证显示端/控制端在不同浏览器或键盘配置下的一致性。
- 如果在显示端按键没有生效，请打开两端开发者工具观察控制台日志（control <- CMD_KEY / display -> forwarding key），这些日志能帮助诊断键名和匹配问题。

## 贡献

欢迎在 GitHub 仓库提交 issue/PR：
https://github.com/tanzhouxkong/Metro-PIDS-

## 许可证

请参考仓库中的 LICENSE（若有）。

---

如需我把 README 转成更短的项目简介或增加截图与演示步骤，我可以继续完善。

---

## Vue 重构说明 (初始骨架)

- 本仓库已添加一个最小的 Vue 3 ES module 骨架，位于 `src/`。主要文件：
	- `src/main.js`：Vue 入口，使用 CDN 的 `vue.esm-browser.js`。
	- `src/App.js`：顶层组件，集成了两个占位组件 `src/components/AdminApp.js` 和新的 `src/components/DisplayWindow.js` 展示预览。
	- `src/utils/displayWindowLogic.js`：从 `display_window.html` 提取出来的渲染逻辑，用于驱动 Vue 组件或独立显示端窗口。
- 目的：保留现有 `index.html` 与 `display_window.html`，同时提供一个增量迁移路径，将控制面板逻辑逐步拆成 Vue 组件。

### 运行（快速）

1. 在浏览器中直接打开 `index.html`。Vue 模块通过相对路径 `./src/main.js` 加载。
2. 或使用一个静态文件服务器（推荐），例如在项目根目录运行：

```powershell
npx http-server . -p 8080
# 然后在浏览器打开 http://localhost:8080/index.html
```
### 更新日志

- 优化了内存占用。
- 统一了直线与环线模式下，从到达站前往目标站的方向箭头动画。
- 支持站点停靠方向（`双向` / `上行` / `下行`）。


