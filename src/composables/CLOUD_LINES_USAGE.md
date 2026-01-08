# 预设线路云控功能使用说明

## 概述

已为预设线路（在 useFileIO.js 中 lineNameToFilename 定义的线路）添加了云控增删查改功能。通过云控API，可以实现：

- **查询（查）**: 从云端获取预设线路列表
- **创建（增）**: 将本地预设线路上传到云端
- **更新（改）**: 更新云端已有的预设线路
- **删除（删）**: 从云端删除预设线路

## 快速开始

### 1. 初始化云控功能

```javascript
import { useCloudLines } from './composables/useCloudLines.js';
import { managePresetLinesWithCloud } from './composables/useFileIO.js';
import { usePidsState } from './composables/usePidsState.js';

// 获取应用状态
const { state } = usePidsState();

// 初始化云控线路管理
const cloudLines = useCloudLines(state);

// 初始化预设线路云控管理（专门针对预设线路）
const presetCloudManager = managePresetLinesWithCloud(state, cloudLines);
```

### 2. 配置云控方案

提供三种方案，无需服务器：

#### 方案一：本地存储模式（推荐，无需服务器）

```javascript
// 使用本地 localStorage 存储（无需服务器）
cloudLines.setCloudConfig('local');
```

#### 方案二：GitHub 仓库模式（免费，无需服务器）

```javascript
// 使用 GitHub 仓库存储线路文件
cloudLines.setCloudConfig('github', {
    owner: 'your-username',      // GitHub 用户名
    repo: 'metro-pids-lines',    // 仓库名
    branch: 'main',              // 分支名（默认 main）
    path: 'preset-lines',        // 线路文件存放路径（默认 preset-lines）
    token: 'your-token'          // GitHub Token（可选，用于私有仓库）
});
```

**GitHub 使用步骤**：
1. 在 GitHub 创建一个新仓库（如：`metro-pids-lines`）
2. 在仓库中创建 `preset-lines` 文件夹
3. 将线路 JSON 文件上传到该文件夹
4. 配置上述参数即可使用

#### 方案三：Gitee 仓库模式（国内推荐，无需服务器）

```javascript
// 使用 Gitee 仓库存储线路文件
cloudLines.setCloudConfig('gitee', {
    owner: 'your-username',      // Gitee 用户名
    repo: 'metro-pids-lines',    // 仓库名
    branch: 'master',            // 分支名（默认 master）
    path: 'preset-lines',        // 线路文件存放路径
    token: 'your-token'          // Gitee Token（可选）
});
```

**Gitee 使用步骤**（与 GitHub 相同）：
1. 在 Gitee 创建一个新仓库
2. 创建 `preset-lines` 文件夹
3. 上传线路 JSON 文件
4. 配置参数即可使用

#### 方案四：自定义 API 服务器（需要服务器）

```javascript
// 使用自定义 API 服务器
cloudLines.setCloudConfig('api', {
    apiBase: 'https://your-api.com/lines',
    token: 'your-auth-token'
});
```

### 3. 使用预设线路云控功能

#### 查询云端预设线路列表
```javascript
const result = await presetCloudManager.listPresetLinesFromCloud();
if (result.ok) {
    console.log('云端预设线路:', result.lines);
}
```

#### 从云端同步预设线路到本地
```javascript
const result = await presetCloudManager.syncPresetLinesFromCloud();
if (result.ok) {
    console.log(`同步成功: ${result.synced} 条线路`);
}
```

#### 将本地预设线路上传到云端
```javascript
// 上传当前选中的线路
const result = await presetCloudManager.uploadPresetLineToCloud();

// 或者上传指定线路
const result = await presetCloudManager.uploadPresetLineToCloud('上海地铁2号线');
```

#### 从云端删除预设线路
```javascript
const result = await presetCloudManager.deletePresetLineFromCloud('上海地铁2号线');
```

## 导入/导出功能

如果使用本地模式，还提供了文件导入/导出功能：

```javascript
// 导出所有线路到 JSON 文件
await cloudLines.exportToFile();

// 从 JSON 文件导入线路
await cloudLines.importFromFile();
```

## API接口规范（仅适用于自定义API服务器模式）

如果使用自定义API服务器，需要实现以下RESTful接口：

### 1. 获取预设线路列表
```
GET /preset
Response: { lines: [ { meta: { lineName: "..." }, stations: [...] }, ... ] }
```

### 2. 获取单个预设线路
```
GET /preset/:lineName
Response: { meta: { lineName: "..." }, stations: [...] }
```

### 3. 创建预设线路
```
POST /preset
Body: { meta: { lineName: "..." }, stations: [...] }
Response: { meta: { lineName: "..." }, stations: [...] }
```

### 4. 更新预设线路
```
PUT /preset/:lineName
Body: { meta: { lineName: "..." }, stations: [...] }
Response: { meta: { lineName: "..." }, stations: [...] }
```

### 5. 删除预设线路
```
DELETE /preset/:lineName
Response: { ok: true }
```

## GitHub/Gitee 仓库文件结构

如果使用 GitHub/Gitee 模式，仓库结构应该如下：

```
your-repo/
  └── preset-lines/           # 配置的路径（默认 preset-lines）
      ├── 上海地铁2号线.json
      ├── 上海地铁16号线.json
      ├── K101.json
      └── ...
```

每个 JSON 文件包含一个线路对象：
```json
{
  "meta": {
    "lineName": "上海地铁2号线",
    ...
  },
  "stations": [...]
}
```

## 预设线路列表

以下线路被识别为预设线路，支持云控操作：

- 上海地铁2号线
- 上海地铁16号线
- K101
- 济南地铁1号线
- 济南地铁2号线
- 济南地铁3号线
- 济南地铁4号线
- 济南地铁6号线
- 济南地铁8号线
- 济南地铁4号线 - 济南地铁8号线 (贯通)
- 高新云巴
- 济阳线

## 注意事项

1. **API地址配置**: 默认API地址为 `https://api.example.com/lines`，需要根据实际情况修改
2. **认证Token**: 如果API需要认证，需要设置 `cloudLinesAuthToken`
3. **预设线路识别**: 只有上述列出的预设线路才会被自动识别和过滤
4. **错误处理**: 所有操作都有完整的错误处理和用户提示

## 完整示例

### 使用本地存储模式（最简单，推荐）

```javascript
import { useCloudLines } from './composables/useCloudLines.js';
import { managePresetLinesWithCloud } from './composables/useFileIO.js';
import { usePidsState } from './composables/usePidsState.js';

const { state } = usePidsState();
const cloudLines = useCloudLines(state);

// 配置为本地模式（无需服务器）
cloudLines.setCloudConfig('local');

// 获取预设线路管理器
const presetManager = managePresetLinesWithCloud(state, cloudLines);

// 从本地存储同步预设线路
await presetManager.syncPresetLinesFromCloud();

// 上传当前线路到本地存储
await presetManager.uploadPresetLineToCloud();

// 导出到文件
await cloudLines.exportToFile();

// 从文件导入
await cloudLines.importFromFile();
```

### 使用 GitHub 仓库模式

```javascript
const { state } = usePidsState();
const cloudLines = useCloudLines(state);

// 配置 GitHub 仓库
cloudLines.setCloudConfig('github', {
    owner: 'your-username',
    repo: 'metro-pids-lines',
    branch: 'main',
    path: 'preset-lines'
    // token: 'your-token' // 私有仓库需要
});

const presetManager = managePresetLinesWithCloud(state, cloudLines);

// 从 GitHub 同步预设线路
await presetManager.syncPresetLinesFromCloud();
```

### 使用 Gitee 仓库模式

```javascript
const { state } = usePidsState();
const cloudLines = useCloudLines(state);

// 配置 Gitee 仓库
cloudLines.setCloudConfig('gitee', {
    owner: 'your-username',
    repo: 'metro-pids-lines',
    branch: 'master',
    path: 'preset-lines'
});

const presetManager = managePresetLinesWithCloud(state, cloudLines);
await presetManager.syncPresetLinesFromCloud();
```

## 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **本地存储** | 最简单，无需服务器，支持增删改查 | 数据仅存在本地浏览器 | 个人使用，单设备 |
| **GitHub** | 免费，可跨设备同步，版本控制 | 需要手动上传文件，不支持自动增删改 | 多设备同步，开源项目 |
| **Gitee** | 国内访问快，免费，可跨设备同步 | 需要手动上传文件，不支持自动增删改 | 国内用户，多设备同步 |
| **自定义API** | 功能最完整，支持所有操作 | 需要服务器和开发成本 | 企业应用，需要完整控制 |

## 推荐方案

- **个人使用**：推荐使用**本地存储模式**，配合**导出/导入功能**
- **多设备同步**：推荐使用**GitHub/Gitee 仓库模式**，在仓库中手动管理文件
- **企业应用**：推荐使用**自定义API服务器模式**，功能最完整

