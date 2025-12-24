# 版本发布指南

## 发布新版本到更新服务器

### 1. 更新版本号

在 `package.json` 中更新版本号：
```json
{
  "version": "1.3.3"  // 改为新版本号
}
```

### 2. 打包应用

```bash
npm run build
```

打包完成后，`dist` 目录会生成以下文件：
- `metro-pids Setup X.X.X.exe` (Windows)
- `latest.yml` (Windows 更新配置)
- `metro-pids Setup X.X.X.exe.blockmap` (Windows 增量更新)

### 3. 上传文件到更新服务器

**注意**：Gitee Pages 已下线，现在使用 Gitee Raw 链接或 GitHub Releases。

#### 方式一：使用 Gitee Raw 链接（推荐，国内访问快）

1. 访问你的 Gitee 仓库：`https://gitee.com/tanzhouxkong/Metro-PIDS-`
2. 在仓库的 `main` 分支（或你使用的主分支）中创建 `releases` 目录
3. 按系统分类创建子目录：
   - `releases/win32/` - Windows 版本
   - `releases/mac/` - Mac 版本  
   - `releases/linux/` - Linux 版本

4. 上传文件到对应目录：

**Windows 版本上传到 `releases/win32/`：**
- `metro-pids Setup X.X.X.exe`
- `latest.yml` (重命名为 `latest.yml` 或保持原样)
- `metro-pids Setup X.X.X.exe.blockmap`

**Mac 版本上传到 `releases/mac/`：**
- `metro-pids-X.X.X.dmg`
- `latest-mac.yml`
- `metro-pids-X.X.X.dmg.blockmap`

**Linux 版本上传到 `releases/linux/`：**
- `metro-pids-X.X.X.AppImage`
- `latest-linux.yml`
- `metro-pids-X.X.X.AppImage.blockmap`

#### 方式二：使用 Git 命令

```bash
# 1. 克隆主分支（main 或 master）
git clone https://gitee.com/tanzhouxkong/Metro-PIDS-.git temp-repo
cd temp-repo

# 2. 创建目录结构（如果不存在）
mkdir -p releases/win32
mkdir -p releases/mac
mkdir -p releases/linux

# 3. 复制 Windows 文件（从项目根目录的 dist 文件夹）
cp ../dist/metro-pids\ Setup\ *.exe releases/win32/
cp ../dist/latest.yml releases/win32/
cp ../dist/*.blockmap releases/win32/

# 4. 提交并推送
git add releases/
git commit -m "发布新版本 X.X.X"
git push origin main  # 或 master，根据你的主分支名

# 5. 清理临时目录
cd ..
rm -rf temp-repo
```

#### 方式三：使用 GitHub Releases（自动化，推荐）

```bash
# 1. 设置 GitHub Token
export GH_TOKEN=your_github_token  # Linux/Mac
# 或
set GH_TOKEN=your_github_token     # Windows CMD
# 或
$env:GH_TOKEN="your_github_token"  # Windows PowerShell

# 2. 自动发布（会自动打包并上传）
npm run publish:gh
```

### 4. 验证更新服务器

确保文件可以通过以下 URL 访问：

**使用 Gitee Raw：**
- Windows: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/win32/latest.yml`
- Mac: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/mac/latest-mac.yml`
- Linux: `https://gitee.com/tanzhouxkong/Metro-PIDS-/raw/main/releases/linux/latest-linux.yml`

**注意**：如果使用其他分支（如 `master`），将 URL 中的 `main` 替换为实际分支名。

**使用 GitHub Releases：**
- 访问：`https://github.com/tanzhouxkong/Metro-PIDS-/releases`
- 确认最新版本已发布

### 5. 测试自动更新

1. 安装旧版本的应用
2. 启动应用，等待自动检查更新（或手动点击"检查更新"）
3. 确认能够检测到新版本并成功下载安装

## 重要提示

1. **latest.yml 文件很重要**：这是 electron-updater 检查更新的关键文件，必须存在且格式正确
2. **文件命名**：确保安装包文件名与 `latest.yml` 中的文件名一致
3. **版本号**：`latest.yml` 中的版本号必须大于当前应用版本，否则不会提示更新
4. **HTTPS**：更新服务器必须支持 HTTPS
5. **Gitee Raw**：使用 Gitee Raw 链接时，确保文件在仓库的主分支（main/master）中
6. **GitHub Releases**：使用 GitHub Releases 时，需要设置 `GH_TOKEN` 环境变量

## 文件结构示例

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

## 常见问题

### Q: 为什么检查不到更新？
A: 检查以下几点：
- `latest.yml` 文件是否存在且可访问
- 版本号是否大于当前应用版本
- 文件路径是否正确
- Gitee Pages 是否已开启

### Q: 可以只发布 Windows 版本吗？
A: 可以，只上传 Windows 版本的文件即可，其他系统的用户不会收到更新提示

### Q: 如何回退版本？
A: 删除新版本文件，保留旧版本文件，或修改 `latest.yml` 指向旧版本

