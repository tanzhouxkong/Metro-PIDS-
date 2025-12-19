# Deploy dist/ to Gitee Pages branch
# Usage: .\scripts\deploy-to-gitee.ps1 -RepoUrl "https://gitee.com/<user>/<repo>.git" -Branch "pages"
param(
  [string]$RepoUrl = "",
  [string]$Branch = "pages",
  [string]$TempDir = "$env:TEMP\metro-pids-gitee-deploy"
)

if (-not (Test-Path "dist")) {
  Write-Error "dist directory not found. Run npm run build first."
  exit 1
}

if (-not $RepoUrl) {
  Write-Error "RepoUrl is required. Example: https://gitee.com/yourname/yourrepo.git"
  exit 1
}

# Clean temp dir
if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
New-Item -ItemType Directory -Path $TempDir | Out-Null

Write-Host "Cloning Gitee repo branch $Branch into $TempDir..."
git clone --branch $Branch --single-branch $RepoUrl $TempDir 2>&1 | Write-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host "Branch $Branch not found, creating new branch locally..."
  git clone $RepoUrl $TempDir 2>&1 | Write-Host
  Push-Location $TempDir
  git checkout --orphan $Branch
  git rm -rf .
  Pop-Location
}

# Copy dist content
Write-Host "Copying dist/ to temp dir/releases/..."
if (-Not (Test-Path "$TempDir\releases")) { New-Item -ItemType Directory -Path "$TempDir\releases" | Out-Null }
Copy-Item -Path "dist\*" -Destination "$TempDir\releases" -Recurse -Force

Push-Location $TempDir
# Configure git user if not set
git config user.email "auto-deploy@example.com" 2>$null
git config user.name "auto-deploy" 2>$null

git add --all
if (git commit -m "Deploy Metro-PIDS dist $(Get-Date -Format o)" ) {
  Write-Host "Pushing to $Branch..."
  git push origin $Branch
} else {
  Write-Host "No changes to commit."
}
Pop-Location

Write-Host "Deploy finished."
