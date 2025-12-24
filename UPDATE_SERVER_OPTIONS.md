# 更新服务器替代方案

由于 Gitee Pages 已下线，以下是几种可用的替代方案：

## 方案一：使用 Gitee Raw 链接（推荐，最简单）

Gitee 的 raw 文件链接仍然可用，不需要 Pages 功能。

### 配置步骤：

1. **在 Gitee 仓库中创建 releases 目录**
   - 直接在仓库的任意分支（如 `main` 或 `master`）创建 `releases/` 目录
   - 按系统分类：`releases/win32/`、`releases/mac/`、`releases/linux/`

2. **上传文件到仓库**
   - 将打包后的文件上传到对应目录
   - 文件路径示例：`releases/win32/latest.yml`

3. **更新 package.json 配置**

```json
{
  "build": {
    "win": {
      "publish": {
        "provider": "generic",
        "url": "https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/win32/"
      }
    },
    "mac": {
      "publish": {
        "provider": "generic",
        "url": "https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/mac/"
      }
    },
    "linux": {
      "publish": {
        "provider": "generic",
        "url": "https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/linux/"
      }
    }
  }
}
```

**注意**：将 `main` 替换为你实际使用的分支名。

### 优点：
- ✅ 无需额外配置
- ✅ 免费使用
- ✅ 国内访问速度快

### 缺点：
- ⚠️ 需要手动上传文件
- ⚠️ 文件大小限制（Gitee 单文件限制通常为 100MB）

---

## 方案二：使用 GitHub Releases（推荐，自动化）

你的配置中已经有 GitHub 配置，可以直接使用。

### 配置步骤：

1. **使用 GitHub Releases**
   - 配置已经存在，只需要在 GitHub 上创建 Releases
   - 使用 `npm run publish:gh` 自动发布

2. **更新 package.json**（如果需要）

```json
{
  "build": {
    "win": {
      "publish": {
        "provider": "github",
        "owner": "tanzhouxkong",
        "repo": "Metro-PIDS-"
      }
    }
  }
}
```

3. **设置 GitHub Token**
   ```bash
   # 在环境变量中设置
   export GH_TOKEN=your_github_token
   ```

4. **自动发布**
   ```bash
   npm run publish:gh
   ```

### 优点：
- ✅ 自动化发布
- ✅ 支持大文件
- ✅ 版本管理完善

### 缺点：
- ⚠️ 需要 GitHub Token
- ⚠️ 国内访问可能较慢

---

## 方案三：使用自建服务器或 CDN

如果有自己的服务器或 CDN 服务。

### 配置示例：

```json
{
  "build": {
    "win": {
      "publish": {
        "provider": "generic",
        "url": "https://your-domain.com/releases/win32/"
      }
    }
  }
}
```

### 服务器要求：
- 支持 HTTPS
- 可以访问静态文件
- 支持 CORS（如果需要）

---

## 方案四：使用对象存储服务

### 阿里云 OSS / 腾讯云 COS / 七牛云

```json
{
  "build": {
    "win": {
      "publish": {
        "provider": "generic",
        "url": "https://your-bucket.oss-cn-hangzhou.aliyuncs.com/releases/win32/"
      }
    }
  }
}
```

### 优点：
- ✅ 国内访问速度快
- ✅ 支持大文件
- ✅ 可配置 CDN 加速

---

## 快速切换方案

### 切换到 Gitee Raw（方案一）

1. 修改 `package.json` 中的 URL
2. 在 Gitee 仓库创建 `releases/` 目录
3. 上传文件到对应目录
4. 重新打包应用

### 切换到 GitHub Releases（方案二）

1. 设置 GitHub Token
2. 运行 `npm run publish:gh`
3. 自动上传到 GitHub Releases

---

## 文件结构示例（所有方案通用）

```
releases/
├── win32/
│   ├── latest.yml
│   ├── metro-pids Setup 1.3.3.exe
│   └── metro-pids Setup 1.3.3.exe.blockmap
├── mac/
│   ├── latest-mac.yml
│   ├── metro-pids-1.3.3.dmg
│   └── metro-pids-1.3.3.dmg.blockmap
└── linux/
    ├── latest-linux.yml
    ├── metro-pids-1.3.3.AppImage
    └── metro-pids-1.3.3.AppImage.blockmap
```

---

## 推荐方案

**如果主要用户在国内**：使用 **方案一（Gitee Raw）** 或 **方案四（对象存储）**

**如果需要自动化**：使用 **方案二（GitHub Releases）**

**如果有自己的服务器**：使用 **方案三（自建服务器）**

