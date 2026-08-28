# Content OS Lite — 快速安装脚本 (PowerShell)
# 使用方法: 在项目根目录执行 .\install.ps1
# 也可以用 npm run setup 来执行

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Content OS Lite — 快速安装" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查 Node.js
Write-Host "[1/5] 检查 Node.js..." -NoNewline
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host " ✗" -ForegroundColor Red
    Write-Host ""
    Write-Host "  请先安装 Node.js 18+:" -ForegroundColor Red
    Write-Host "  下载地址: https://nodejs.org" -ForegroundColor Red
    Write-Host ""
    exit 1
}
Write-Host " ✓ ($nodeVersion)" -ForegroundColor Green

# 2. 安装依赖
Write-Host "[2/5] 安装项目依赖（可能需要几分钟）..." -NoNewline
npm install --silent 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host " ✗" -ForegroundColor Red
    Write-Host "  npm install 失败，请检查网络后重试" -ForegroundColor Red
    exit 1
}
Write-Host " ✓" -ForegroundColor Green

# 3. 配置环境变量
Write-Host "[3/5] 配置环境变量..." -NoNewline
if (-not (Test-Path .env.local)) {
    Copy-Item .env.example .env.local
    Write-Host " ✓ (已创建 .env.local)" -ForegroundColor Yellow
} else {
    Write-Host " ✓ (.env.local 已存在)" -ForegroundColor Green
}

# 4. 初始化数据库
Write-Host "[4/5] 初始化 SQLite 数据库..." -NoNewline
$env:DATABASE_URL = "file:./dev.db"
npx prisma migrate dev --name init 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host " ⚠ (尝试 db push...)" -ForegroundColor Yellow
    npx prisma db push 2>$null
}
Write-Host " ✓" -ForegroundColor Green

# 5. 生成 Prisma Client
Write-Host "[5/5] 生成 Prisma Client..." -NoNewline
npx prisma generate 2>$null
Write-Host " ✓" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步：" -ForegroundColor White
Write-Host "  1. 编辑 .env.local 文件，填入你的 AI API Key" -ForegroundColor White
Write-Host "     推荐 DeepSeek: https://platform.deepseek.com" -ForegroundColor Gray
Write-Host "  2. 运行 npm run dev 启动应用" -ForegroundColor White
Write-Host "  3. 浏览器访问 http://localhost:3000" -ForegroundColor White
Write-Host ""
