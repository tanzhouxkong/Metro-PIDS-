# Metro-PIDS 显示器控制 API 文档

## 概述

Metro-PIDS 提供了 HTTP API 接口，用于通过外部程序控制显示器。API 服务器在应用启动时自动启动，默认端口为 **9001**。

## 启动

API 服务器会在应用启动时自动启动。如果端口被占用，服务器将不会启动（不会影响主应用运行）。

可以通过环境变量 `DISPLAY_API_PORT` 修改端口：

```bash
# Windows PowerShell
$env:DISPLAY_API_PORT="9002"; npm start

# Linux/Mac
DISPLAY_API_PORT=9002 npm start
```

## API 端点

### 1. 获取 API 信息

**GET** `/api/display/info`

返回 API 的基本信息和可用端点列表。

**响应示例：**
```json
{
  "ok": true,
  "name": "Metro-PIDS Display Control API",
  "version": "1.0.0",
  "endpoints": [
    "GET    /api/display/status - 获取显示器状态",
    "POST   /api/display/open - 打开显示器",
    "POST   /api/display/close - 关闭显示器",
    "POST   /api/display/sync - 同步数据到显示器",
    "POST   /api/display/control - 发送控制命令",
    "POST   /api/display/edit - 编辑显示端配置",
    "GET    /api/display/info - 获取API信息"
  ],
  "commands": {
    "next": "下一站",
    "prev": "上一站",
    "arrive": "到达",
    "depart": "发车",
    "key": "自定义按键（需要提供keyCode参数）"
  }
}
```

---

### 2. 获取显示器状态

**GET** `/api/display/status`

获取所有已打开的显示器窗口的状态信息。

**响应示例：**
```json
{
  "ok": true,
  "displays": [
    {
      "id": "display-1",
      "isOpen": true,
      "width": 1900,
      "height": 600,
      "x": 100,
      "y": 100
    },
    {
      "id": "display-2",
      "isOpen": true,
      "width": 1500,
      "height": 400,
      "x": 2000,
      "y": 100
    }
  ],
  "count": 2
}
```

---

### 3. 打开显示器

**POST** `/api/display/open`

打开指定的显示器窗口。

**请求体：**
```json
{
  "displayId": "display-1",  // 可选，默认为 "display-1"
  "width": 1900,              // 可选，使用配置的默认尺寸
  "height": 600               // 可选，使用配置的默认尺寸
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "显示器 display-1 已打开",
  "displayId": "display-1"
}
```

**示例（cURL）：**
```bash
curl -X POST http://localhost:9001/api/display/open \
  -H "Content-Type: application/json" \
  -d '{"displayId": "display-1", "width": 1900, "height": 600}'
```

---

### 4. 关闭显示器

**POST** `/api/display/close`

关闭指定的显示器窗口，或关闭所有显示器。

**请求体：**
```json
{
  "displayId": "display-1"  // 可选，不提供则关闭所有显示器
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "显示器 display-1 已关闭",
  "closed": ["display-1"]
}
```

**关闭所有显示器：**
```json
{
  "ok": true,
  "message": "所有显示器已关闭",
  "closed": ["display-1", "display-2"]
}
```

---

### 5. 同步数据到显示器

**POST** `/api/display/sync`

将 PIDS 数据同步到所有已打开的显示器窗口。

**请求体：**
```json
{
  "appData": {
    // PIDS 应用数据对象
    "lineNumber": "1",
    "stations": [
      {"name": "站点1", "en": "Station 1"},
      {"name": "站点2", "en": "Station 2"}
    ],
    "currentStation": 0,
    // ... 其他字段
  },
  "rtState": {  // 可选
    "idx": 0,
    "state": 0
  }
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "数据已同步到所有显示器"
}
```

**注意：** `appData` 的结构需要符合 Metro-PIDS 的数据格式。建议从控制面板导出数据后使用。

---

### 6. 发送控制命令

**POST** `/api/display/control`

向显示器发送控制命令（如前进、后退、到达、发车等）。

**请求体：**
```json
{
  "command": "next"  // "next" | "prev" | "arrive" | "depart" | "key"
}
```

**自定义按键：**
```json
{
  "command": "key",
  "keyCode": "ArrowRight"  // 任意键盘按键代码
}
```

**可用命令：**
- `next`: 下一站（等同于按右箭头键）
- `prev`: 上一站（等同于按左箭头键）
- `arrive`: 到达（等同于按 Enter 键）
- `depart`: 发车（等同于按 Space 键）
- `key`: 自定义按键（需要提供 `keyCode` 参数）

**响应示例：**
```json
{
  "ok": true,
  "message": "命令 next 已发送",
  "command": "next"
}
```

---

### 7. 编辑显示端配置

**POST** `/api/display/edit`

编辑指定显示端的配置信息。系统显示器只能更新开关值（仅显示器1），非系统显示器可以更新所有字段。

**请求体：**
```json
{
  "displayId": "display-3",
  "displayData": {
    "name": "第三方显示器",           // 可选，显示端名称
    "source": "builtin",              // 可选，显示端类型（目前仅支持 "builtin"）
    "url": "/path/to/custom.html",    // 可选，本地网页文件路径
    "description": "第三方自定义显示端", // 可选，描述信息
    "lineNameMerge": true,            // 可选，线路名合并（仅显示器1）
    "showAllStations": false           // 可选，显示全部站点（仅显示器1）
  }
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "显示端 display-3 配置已更新",
  "displayId": "display-3"
}
```

**注意事项：**
- 系统显示器（`isSystem: true`）只能更新开关值，且仅当 `displayId` 为 `display-1` 时有效
- 非系统显示器可以更新所有字段
- `lineNameMerge` 和 `showAllStations` 开关仅对 `display-1` 有效

---

## 第三方显示器接收消息

第三方显示器可以通过 **BroadcastChannel** 或 **window.postMessage** 接收来自主程序的消息。

### 消息接收方式

Metro-PIDS 使用 **BroadcastChannel** 作为主要通信机制，频道名称为 `metro_pids_v3`。如果浏览器不支持 BroadcastChannel，会自动回退到 `window.postMessage`。

### 消息格式

主程序发送的消息格式如下：

```javascript
{
  t: 'SYNC',        // 消息类型：'SYNC' | 'CMD_KEY' | 'REC_START' | 'REC_STOP' | 'REQ'
  d: appData,       // 应用数据（当 t === 'SYNC' 时）
  r: rtState,       // 实时状态（当 t === 'SYNC' 时，可选）
  code: 'ArrowRight', // 按键代码（当 t === 'CMD_KEY' 时）
  key: 'ArrowRight', // 按键名称（当 t === 'CMD_KEY' 时）
  bps: 800000       // 比特率（当 t === 'REC_START' 时）
}
```

### 消息类型说明

- **`SYNC`**: 同步数据消息，包含完整的 PIDS 应用数据和实时状态
- **`CMD_KEY`**: 控制命令消息，模拟键盘按键
- **`REC_START`**: 开始录制消息
- **`REC_STOP`**: 停止录制消息
- **`REQ`**: 请求数据消息（显示端启动时发送，请求主程序同步数据）

### 实现示例

#### 方法一：使用 BroadcastChannel（推荐）

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>第三方显示器</title>
</head>
<body>
  <div id="display-content"></div>
  
  <script>
    // 创建 BroadcastChannel
    const channelName = 'metro_pids_v3';
    let bc = null;
    
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(channelName);
        console.log('BroadcastChannel 已创建:', channelName);
      } catch (e) {
        console.warn('BroadcastChannel 创建失败:', e);
      }
    }
    
    // 处理消息
    function handleMessage(data) {
      if (!data || !data.t) return;
      
      switch (data.t) {
        case 'SYNC':
          // 接收到同步数据
          const appData = data.d;      // 应用数据
          const rtState = data.r;      // 实时状态
          
          console.log('收到同步数据:', appData);
          console.log('实时状态:', rtState);
          
          // 更新显示内容
          updateDisplay(appData, rtState);
          break;
          
        case 'CMD_KEY':
          // 接收到控制命令
          console.log('收到控制命令:', data.code);
          handleControlCommand(data.code);
          break;
          
        case 'REC_START':
          console.log('开始录制，比特率:', data.bps);
          break;
          
        case 'REC_STOP':
          console.log('停止录制');
          break;
      }
    }
    
    // 更新显示内容
    function updateDisplay(appData, rtState) {
      const content = document.getElementById('display-content');
      if (!appData) return;
      
      // 示例：显示线路名称和当前站点
      const lineName = appData.meta?.lineName || '未知线路';
      const currentIdx = rtState?.idx ?? 0;
      const stations = appData.stations || [];
      const currentStation = stations[currentIdx]?.name || '未知站点';
      
      content.innerHTML = `
        <h1>${lineName}</h1>
        <p>当前站点: ${currentStation}</p>
        <p>站点索引: ${currentIdx} / ${stations.length - 1}</p>
      `;
    }
    
    // 处理控制命令
    function handleControlCommand(keyCode) {
      // 根据按键代码执行相应操作
      switch (keyCode) {
        case 'ArrowRight':
          console.log('下一站');
          break;
        case 'ArrowLeft':
          console.log('上一站');
          break;
        case 'Enter':
          console.log('到达');
          break;
        case 'Space':
          console.log('发车');
          break;
      }
    }
    
    // 监听 BroadcastChannel 消息
    if (bc) {
      bc.addEventListener('message', (event) => {
        handleMessage(event.data);
      });
      
      // 显示端启动时，请求主程序同步数据
      bc.postMessage({ t: 'REQ' });
    }
    
    // 回退方案：监听 window.postMessage
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (event) => {
        // 安全检查：只处理来自同源的消息
        if (event.data && event.data.t) {
          handleMessage(event.data);
        }
      });
    }
  </script>
</body>
</html>
```

#### 方法二：使用 Metro-PIDS Display SDK

如果您的项目支持 ES6 模块，可以使用官方提供的 Display SDK：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>第三方显示器（使用 SDK）</title>
</head>
<body>
  <div id="display-content"></div>
  
  <script type="module">
    import { createDisplaySdk } from '../src/utils/displaySdk.js';
    
    // 创建 SDK 实例
    const sdk = createDisplaySdk({ channelName: 'metro_pids_v3' });
    
    // 监听消息
    sdk.onMessage((msg) => {
      if (msg.t === 'SYNC') {
        const appData = msg.d;
        const rtState = msg.r;
        updateDisplay(appData, rtState);
      } else if (msg.t === 'CMD_KEY') {
        handleControlCommand(msg.code);
      }
    });
    
    // 显示端启动时，请求主程序同步数据
    sdk.request();
    
    function updateDisplay(appData, rtState) {
      const content = document.getElementById('display-content');
      if (!appData) return;
      
      const lineName = appData.meta?.lineName || '未知线路';
      const currentIdx = rtState?.idx ?? 0;
      const stations = appData.stations || [];
      const currentStation = stations[currentIdx]?.name || '未知站点';
      
      content.innerHTML = `
        <h1>${lineName}</h1>
        <p>当前站点: ${currentStation}</p>
        <p>站点索引: ${currentIdx} / ${stations.length - 1}</p>
      `;
    }
    
    function handleControlCommand(keyCode) {
      console.log('收到控制命令:', keyCode);
    }
  </script>
</body>
</html>
```

### 数据快照恢复

Metro-PIDS 会在发送同步数据时，将数据快照保存到 `localStorage`（键名：`metro_pids_display_snapshot`）。第三方显示器可以在启动时尝试恢复快照：

```javascript
function restoreSnapshot() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  
  const raw = window.localStorage.getItem('metro_pids_display_snapshot');
  if (!raw) return false;
  
  try {
    const data = JSON.parse(raw);
    if (data && data.t === 'SYNC') {
      const appData = data.d;
      const rtState = data.r;
      
      // 恢复显示
      updateDisplay(appData, rtState);
      return true;
    }
  } catch (err) {
    console.warn('恢复快照失败:', err);
  }
  
  return false;
}

// 页面加载时尝试恢复快照
window.addEventListener('DOMContentLoaded', () => {
  restoreSnapshot();
});
```

### 注意事项

1. **频道名称**：必须使用 `metro_pids_v3` 作为 BroadcastChannel 的频道名称
2. **消息格式**：消息必须包含 `t` 字段（消息类型）
3. **数据格式**：`appData` 的结构需要符合 Metro-PIDS 的数据格式
4. **跨域限制**：如果第三方显示器与主程序不在同一域名下，BroadcastChannel 可能无法工作，此时会自动回退到 `window.postMessage`
5. **浏览器兼容性**：BroadcastChannel 在较新的浏览器中支持良好，IE 不支持

---

## 使用示例

### Python 示例

```python
import requests
import json

API_BASE = "http://localhost:9001"

# 获取显示器状态
response = requests.get(f"{API_BASE}/api/display/status")
print(response.json())

# 打开显示器
response = requests.post(
    f"{API_BASE}/api/display/open",
    json={"displayId": "display-1", "width": 1900, "height": 600}
)
print(response.json())

# 发送控制命令
response = requests.post(
    f"{API_BASE}/api/display/control",
    json={"command": "next"}
)
print(response.json())
```

### JavaScript/Node.js 示例

```javascript
const http = require('http');

const API_BASE = 'http://localhost:9001';

// 获取显示器状态
function getDisplayStatus() {
  return new Promise((resolve, reject) => {
    http.get(`${API_BASE}/api/display/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// 发送控制命令
function sendCommand(command) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${API_BASE}/api/display/control`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.write(JSON.stringify({ command }));
    req.end();
  });
}

// 使用示例
(async () => {
  const status = await getDisplayStatus();
  console.log('显示器状态:', status);
  
  await sendCommand('next');
  console.log('已发送"下一站"命令');
})();
```

### PowerShell 示例

```powershell
$apiBase = "http://localhost:9001"

# 获取显示器状态
$status = Invoke-RestMethod -Uri "$apiBase/api/display/status" -Method Get
Write-Host "显示器状态: $($status | ConvertTo-Json)"

# 打开显示器
$openBody = @{
    displayId = "display-1"
    width = 1900
    height = 600
} | ConvertTo-Json

$openResult = Invoke-RestMethod -Uri "$apiBase/api/display/open" -Method Post -Body $openBody -ContentType "application/json"
Write-Host "打开结果: $($openResult | ConvertTo-Json)"

# 发送控制命令
$controlBody = @{
    command = "next"
} | ConvertTo-Json

$controlResult = Invoke-RestMethod -Uri "$apiBase/api/display/control" -Method Post -Body $controlBody -ContentType "application/json"
Write-Host "控制结果: $($controlResult | ConvertTo-Json)"
```

---

## 错误处理

所有 API 端点都会返回标准的 JSON 响应格式：

**成功响应：**
```json
{
  "ok": true,
  "message": "操作成功",
  ...
}
```

**错误响应：**
```json
{
  "ok": false,
  "error": "错误描述信息"
}
```

**HTTP 状态码：**
- `200`: 成功
- `400`: 请求参数错误
- `404`: 端点不存在
- `500`: 服务器内部错误
- `503`: 服务未初始化

---

## 注意事项

1. **端口占用**：如果默认端口 9001 被占用，API 服务器将不会启动，但不会影响主应用运行。

2. **数据格式**：`/api/display/sync` 接口的 `appData` 参数需要符合 Metro-PIDS 的数据格式。建议从控制面板导出数据后使用。

3. **BroadcastChannel**：API 通过 BroadcastChannel 机制向显示器发送消息，所有已打开的显示器窗口都会收到同步数据和控制命令。

4. **CORS**：API 服务器已启用 CORS，支持跨域请求。

5. **安全性**：当前 API 服务器没有身份验证机制，仅监听本地接口（localhost）。在生产环境中使用时应考虑添加安全措施。

---

## 故障排除

### API 服务器未启动

1. 检查控制台日志，查看是否有端口占用错误
2. 尝试修改端口：`DISPLAY_API_PORT=9002 npm start`
3. 确认 `scripts/display-api-server.js` 文件存在且可访问

### 显示器未响应命令

1. 确认显示器窗口已打开（使用 `/api/display/status` 检查）
2. 检查控制台日志，查看是否有错误信息
3. 确认数据格式正确（特别是 `/api/display/sync` 接口）

---

## 更新日志

- **v1.0.0** (2024-01-XX): 初始版本，提供基本的显示器控制功能
