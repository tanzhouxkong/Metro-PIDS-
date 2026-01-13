@echo off
REM ============================================================
REM Metro-PIDS 一键本地更新测试脚本（适用于 Windows）
REM 用途：
REM   1. 打包生成 dist 下的安装包和 latest.yml（如无则自动构建）
REM   2. 启动本地更新 HTTP 服务（scripts/local-update-server.js）
REM   3. 设置 LOCAL_UPDATE_URL 并启动 Metro-PIDS 应用
REM 使用方法：
REM   在项目根目录双击运行本脚本，或在 CMD 中执行：
REM     start-local-update.bat
REM ============================================================

setlocal ENABLEDELAYEDEXPANSION

REM ---------------- 基本路径与端口配置 ----------------
set ROOT_DIR=%~dp0
set DIST_DIR=%ROOT_DIR%dist
set PORT=8080
set LOCAL_UPDATE_URL=http://localhost:%PORT%/

echo.
echo [Metro-PIDS] 一键本地更新測試啟動中...
echo 根目錄: %ROOT_DIR%
echo 打包輸出目錄: %DIST_DIR%
echo 本地更新 URL: %LOCAL_UPDATE_URL%
echo.

REM ---------------- 檢查 node 和 npm ----------------
where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 未檢測到 Node.js，請先安裝 Node.js 後重試。
  pause
  goto :eof
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 未檢測到 npm，請確認 Node.js 安裝正確。
  pause
  goto :eof
)

REM ---------------- 檢查 node_modules ----------------
if not exist "%ROOT_DIR%node_modules" (
  echo [步驟 1] 未找到 node_modules，正在執行 npm install ...
  cd /d "%ROOT_DIR%"
  npm install
  if errorlevel 1 (
    echo [錯誤] npm install 失敗，請檢查日誌。
    pause
    goto :eof
  )
) else (
  echo [步驟 1] 檢測到 node_modules，跳過 npm install。
)

REM ---------------- 檢查 dist/latest.yml ----------------
if not exist "%DIST_DIR%\latest.yml" (
  echo [步驟 2] 未找到 dist\latest.yml，正在執行 npm run build 生成更新文件...
  cd /d "%ROOT_DIR%"
  npm run build
  if errorlevel 1 (
    echo [錯誤] npm run build 失敗，請檢查日誌。
    pause
    goto :eof
  )
) else (
  echo [步驟 2] 已存在 dist\latest.yml，跳過構建。
)

REM ---------------- 啟動本地更新服務 ----------------
echo [步驟 3] 啟動本地更新 HTTP 服務（端口 %PORT%）...
cd /d "%ROOT_DIR%"
start "Metro-PIDS Local Update Server" cmd /c "npm run serve:update"

REM 稍等片刻以確保服務啟動
timeout /t 3 /nobreak >nul

REM ---------------- 啟動 Metro-PIDS 應用 ----------------
echo [步驟 4] 使用本地更新源啟動 Metro-PIDS 應用...
set LOCAL_UPDATE_URL=%LOCAL_UPDATE_URL%
cd /d "%ROOT_DIR%"
npm start

echo.
echo 應用已退出。如果需要結束本地更新服務，請關閉名為
\"Metro-PIDS Local Update Server\" 的命令行窗口。
echo.
pause

endlocal


