@echo off
REM ============================================================
REM  Metro-PIDS 线路一键上传到 Cloudflare (Windows 批处理)
REM
REM  功能：
REM    1. 切到项目根目录
REM    2. 让你选择上传到「本地 dev Worker」或「线上 Cloudflare Worker」
REM    3. 设置环境变量 CF_LINES_API_BASE / CF_LINES_TOKEN
REM    4. 调用 npm 脚本：npm run cf:upload-preset
REM
REM  使用方法：
REM    1. 确保已安装 Node.js 和 wrangler，并且 Worker 已部署。
REM    2. 如果要上传到本地 dev，请先在另一窗口运行：
REM         cd cloudflare
REM         wrangler dev
REM    3. 双击运行本脚本，按提示选择目标环境并上传。
REM ============================================================

@echo.
@echo [Cloudflare Upload] 一键上传 preset 到 Cloudflare / 本地 dev

REM -------- 基本路径设置 --------
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

REM -------- 选择目标环境 --------
echo.
echo 请选择上传目标：
echo   [1] 上传到本地  Worker (http://127.0.0.1:8787)
echo   [2] 上传到 Cloudflare Worker (https://metro-pids.2906360289.workers.dev)
set /p TARGET_CHOICE=请输入 1 或 2 上传到 然后回车（默认 2 ）: 

if "%TARGET_CHOICE%"=="1" (
    set "CF_TARGET=http://127.0.0.1:8787"
) else (
    set "CF_TARGET=https://metro-pids.2906360289.workers.dev"
)

echo.
echo 将使用的 API 地址: %CF_TARGET%
echo.

REM -------- 可选：输入写操作 Token --------
echo 如果你的 Worker 在 wrangler.toml 中设置了 CLOUD_TOKEN，请在此输入同样的值。
echo 如果沒有设置 Token，这里可以直接按回车跳过。
set /p CF_TOKEN=请输入写操作 Token（可留空）: 

REM -------- 设置环境变量 --------
set "CF_LINES_API_BASE=%CF_TARGET%"
if not "%CF_TOKEN%"=="" (
    set "CF_LINES_TOKEN=%CF_TOKEN%"
) else (
    set "CF_LINES_TOKEN="
)

echo.
echo [Cloudflare Upload] 开始上传 preset...
echo   CF_LINES_API_BASE=%CF_LINES_API_BASE%
if not "%CF_TOKEN%"=="" (
  echo   CF_LINES_TOKEN=[已设置 Token]
) else (
  echo   CF_LINES_TOKEN=[未设置 Token]
)
echo.

REM -------- 执行 npm 脚本 --------
call npm run cf:upload-preset

echo.
echo [Cloudflare Upload] 已执行完成。请查看上方日志是否有错误。
echo 如果是上传到本地 dev，确认 http://127.0.0.1:8787/preset 是否已有数据。
echo 如果是上传到线上，请稍后访问 https://metro-pids.2906360289.workers.dev/preset 检查。
echo.
pause


