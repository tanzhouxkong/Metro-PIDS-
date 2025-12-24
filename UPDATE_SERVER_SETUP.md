# 更新服务器快速设置指南

## 方案一：使用 Gitee Raw 链接（推荐）

### 步骤 1：在 Gitee 仓库创建目录结构

1. 访问你的 Gitee 仓库：`https://gitee.com/tanzhouxkong/Metro-PIDS-`
2. 在仓库根目录创建以下目录结构：
   ```
   releases/
   ├── win32/
   ├── mac/
   └── linux/
   ```

### 步骤 2：上传文件

**Windows 版本** → 上传到 `releases/win32/`：
- `latest.yml`
- `metro-pids Setup X.X.X.exe`
- `*.exe.blockmap`

**Mac 版本** → 上传到 `releases/mac/`：
- `latest-mac.yml`
- `metro-pids-X.X.X.dmg`
- `*.dmg.blockmap`

**Linux 版本** → 上传到 `releases/linux/`：
- `latest-linux.yml`
- `metro-pids-X.X.X.AppImage`
- `*.AppImage.blockmap`

### 步骤 3：验证文件可访问

确保可以通过以下 URL 访问：
- Windows: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/win32/latest.yml`
- Mac: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/mac/latest-mac.yml`
- Linux: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/linux/latest-linux.yml`

**注意**：如果使用其他分支（如 `master`），将 URL 中的 `main` 替换为实际分支名。

---

## 方案二：使用 GitHub Releases（自动化）

### 步骤 1：创建 GitHub Token

1. 访问：`https://github.com/settings/tokens`
2. 点击 "Generate new token (classic)"
3. 选择权限：`repo`（完整仓库权限）
4. 复制生成的 Token

### 步骤 2：设置环境变量

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN="your_github_token"
```

**Windows (CMD):**
```cmd
set GH_TOKEN=your_github_token
```

**Linux/Mac:**
```bash
export GH_TOKEN=your_github_token
```

### 步骤 3：自动发布

```bash
npm run publish:gh
```

这会自动：
- 打包应用
- 上传到 GitHub Releases
- 创建版本标签

---

## 修改配置

如果使用其他服务器，修改 `package.json` 中的 `publish.url`：

```json
{
  "build": {
    "win": {
      "publish": {
        "provider": "generic",
        "url": "你的服务器地址/releases/win32/"
      }
    }
  }
}
```

---

## 重要提示

1. **HTTPS 必需**：更新服务器必须支持 HTTPS
2. **latest.yml 必需**：这是检查更新的关键文件
3. **版本号**：新版本号必须大于当前应用版本
4. **文件路径**：确保 URL 路径与实际文件路径一致

