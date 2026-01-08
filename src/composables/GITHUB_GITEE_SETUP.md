# GitHub/Gitee 仓库模式设置指南

## 已实现功能确认

✅ **GitHub 仓库模式** - 已实现
✅ **Gitee 仓库模式** - 已实现

## 功能说明

两种模式都支持：
- ✅ **查询（查）**: 从仓库读取预设线路列表
- ✅ **获取单个线路**: 通过文件名获取单个线路详情
- ❌ **创建（增）**: 不支持自动创建（需要手动上传文件）
- ❌ **更新（改）**: 不支持自动更新（需要手动更新文件）
- ❌ **删除（删）**: 不支持自动删除（需要手动删除文件）

## 快速设置

### GitHub 仓库模式

#### 1. 创建 GitHub 仓库

1. 登录 GitHub
2. 点击右上角 `+` → `New repository`
3. 仓库名：`metro-pids-lines`（或任意名称）
4. 选择 `Public` 或 `Private`
5. 点击 `Create repository`

#### 2. 创建文件夹并上传文件

**方法一：使用脚本自动上传（推荐）**

使用提供的脚本可以快速将本地预设线路文件上传到 GitHub 仓库：

```bash
# 设置 GitHub Token（如果没有设置环境变量）
# Windows PowerShell:
$env:GITHUB_TOKEN="your_github_token_here"

# Linux/macOS:
export GITHUB_TOKEN="your_github_token_here"

# 使用脚本上传（预览模式，不会实际上传）
node scripts/upload-preset-lines-to-github.js \
  --owner yourusername \
  --repo metro-pids-lines \
  --branch main \
  --path preset-lines \
  --dry-run

# 实际上传文件
node scripts/upload-preset-lines-to-github.js \
  --owner yourusername \
  --repo metro-pids-lines \
  --branch main \
  --path preset-lines

# 或者通过命令行参数传递 token
node scripts/upload-preset-lines-to-github.js \
  --owner yourusername \
  --repo metro-pids-lines \
  --token your_github_token_here
```

**方法二：手动上传（如果脚本不可用）**

1. 在仓库中点击 `Create new file`
2. 输入路径：`preset-lines/上海地铁2号线.json`（会自动创建文件夹）
3. 粘贴线路 JSON 内容
4. 点击 `Commit new file`
5. 重复步骤 2-4，上传其他预设线路文件

#### 3. 配置应用

```javascript
import { useCloudLines } from './composables/useCloudLines.js';
import { managePresetLinesWithCloud } from './composables/useFileIO.js';
import { usePidsState } from './composables/usePidsState.js';

const { state } = usePidsState();
const cloudLines = useCloudLines(state);

// 配置 GitHub 仓库
cloudLines.setCloudConfig('github', {
    owner: 'your-username',        // 替换为你的 GitHub 用户名
    repo: 'metro-pids-lines',      // 替换为你的仓库名
    branch: 'main',                // 分支名（默认 main）
    path: 'preset-lines',          // 文件路径（默认 preset-lines）
    token: ''                      // 可选：私有仓库需要 Token
});

// 使用预设线路管理器
const presetManager = managePresetLinesWithCloud(state, cloudLines);

// 从 GitHub 同步预设线路
await presetManager.syncPresetLinesFromCloud();
```

#### 4. 获取 GitHub Token（仅私有仓库需要）

1. 访问：https://github.com/settings/tokens
2. 点击 `Generate new token` → `Generate new token (classic)`
3. 勾选 `repo` 权限
4. 生成并复制 Token
5. 在配置中填入 `token` 字段

### Gitee 仓库模式

#### 1. 创建 Gitee 仓库

1. 登录 Gitee
2. 点击右上角 `+` → `新建仓库`
3. 仓库名：`metro-pids-lines`
4. 选择 `公开` 或 `私有`
5. 点击 `创建`

#### 2. 创建文件夹并上传文件

1. 在仓库中点击 `上传文件`
2. 创建 `preset-lines` 文件夹
3. 上传所有预设线路 JSON 文件
4. 提交更改

#### 3. 配置应用

```javascript
const { state } = usePidsState();
const cloudLines = useCloudLines(state);

// 配置 Gitee 仓库
cloudLines.setCloudConfig('gitee', {
    owner: 'your-username',        // 替换为你的 Gitee 用户名
    repo: 'metro-pids-lines',      // 替换为你的仓库名
    branch: 'master',              // 分支名（默认 master）
    path: 'preset-lines',         // 文件路径
    token: ''                      // 可选：私有仓库需要 Token
});

const presetManager = managePresetLinesWithCloud(state, cloudLines);
await presetManager.syncPresetLinesFromCloud();
```

#### 4. 获取 Gitee Token（仅私有仓库需要）

1. 访问：https://gitee.com/profile/personal_access_tokens
2. 点击 `生成新令牌`
3. 勾选 `projects` 权限
4. 生成并复制 Token

## 仓库文件结构示例

```
your-repo/
  └── preset-lines/              # 配置的路径
      ├── 上海地铁2号线.json
      ├── 上海地铁16号线.json
      ├── K101.json
      ├── 济南地铁1号线.json
      ├── 济南地铁2号线.json
      ├── 济南地铁3号线.json
      ├── 济南地铁4号线.json
      ├── 济南地铁6号线.json
      ├── 济南地铁8号线.json
      ├── 济南地铁4号线 - 济南地铁8号线 (贯通).json
      ├── 高新云巴.json
      └── 济阳线.json
```

## API 地址格式

### GitHub
- **文件列表**: `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}`
- **单个文件**: `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}/{filename}`

### Gitee
- **文件列表**: `https://gitee.com/api/v5/repos/{owner}/{repo}/contents/{path}?ref={branch}`
- **单个文件**: `https://gitee.com/{owner}/{repo}/raw/{branch}/{path}/{filename}`

## 测试配置

可以使用以下命令测试配置是否正确：

```javascript
// 检查配置
const config = cloudLines.getCloudConfig();
console.log('当前配置:', config);

// 测试获取线路列表
const result = await cloudLines.listCloudLines();
console.log('线路列表:', result);
```

## 注意事项

1. **公开仓库**: 不需要 Token，可以直接访问
2. **私有仓库**: 需要配置 Token 才能访问
3. **文件命名**: 文件名必须与线路名称匹配（如：`上海地铁2号线.json`）
4. **文件格式**: 必须是有效的 JSON 格式
5. **手动管理**: GitHub/Gitee 模式不支持自动增删改，需要手动在仓库中管理文件

## 故障排查

### 问题：获取文件列表失败

**可能原因**：
- 仓库不存在或路径错误
- 分支名错误
- Token 无效（私有仓库）

**解决方法**：
1. 检查仓库 URL 是否正确
2. 确认分支名（GitHub 默认 `main`，Gitee 默认 `master`）
3. 检查 Token 权限是否足够

### 问题：文件不存在

**可能原因**：
- 文件名不匹配
- 文件路径错误

**解决方法**：
1. 检查文件名是否与线路名称匹配
2. 确认文件在正确的路径下

