# Content OS - One-click Startup Script
# Usage: Right-click -> "Run with PowerShell" or
#        Terminal: powershell -ExecutionPolicy Bypass -File start.ps1
#
# This script starts:
#   1. Douyin data microservice (port 8800)
#   2. Content OS main app (port 3000)
#   3. Opens browser automatically

# --- Config ---

$CONTEXTOS_DIR = "D:\Project\contextos"
$DOUYIN_DIR    = "D:\Project\douyin-downloader"
$PORT_MAIN     = 3000
$PORT_DOUYIN   = 8800

# --- Helper Functions ---

function Test-Port([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Write-Status([string]$msg) { Write-Host "[Content OS] $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)     { Write-Host "[Content OS] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg)   { Write-Host "[Content OS] $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)    { Write-Host "[Content OS] $msg" -ForegroundColor Red }

# --- Pre-flight Checks ---

Write-Status "Checking environment..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js not found. Please install it first."
    pause; exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Err "Python not found. Douyin microservice cannot start."
    Write-Err "Install Python 3.10+: https://www.python.org/downloads/"
    pause; exit 1
}

$envFile = Join-Path $CONTEXTOS_DIR ".env.local"
if (-not (Test-Path $envFile)) {
    $exampleFile = Join-Path $CONTEXTOS_DIR ".env.example"
    if (Test-Path $exampleFile) {
        Copy-Item $exampleFile $envFile
        Write-Warn "Created .env.local from .env.example. Edit it to add your API keys."
    } else {
        Write-Err ".env.local not found and no .env.example available."
        pause; exit 1
    }
}

$nodeModules = Join-Path $CONTEXTOS_DIR "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Status "Installing Node dependencies..."
    Push-Location $CONTEXTOS_DIR
    npm install
    Pop-Location
}

Write-OK "Environment check passed."

# --- Start Douyin Microservice (port 8800) ---

Write-Status "Checking Douyin data microservice (port $PORT_DOUYIN)..."

if (Test-Port $PORT_DOUYIN) {
    Write-OK "Douyin microservice already running (port $PORT_DOUYIN)."
} else {
    $cookiePath = Join-Path $env:USERPROFILE ".tabbit-browser\douyin.json"
    $serverScript = Join-Path $DOUYIN_DIR "test_server.py"
    $canStartDouyin = $true

    if (-not (Test-Path $cookiePath)) {
        Write-Warn "Douyin cookie file not found: $cookiePath"
        Write-Warn "Douyin features (search, hot, comments, detail) will be unavailable."
        $canStartDouyin = $false
    }

    if (-not (Test-Path $serverScript)) {
        Write-Warn "Douyin microservice code not found: $serverScript"
        Write-Warn "Douyin features will be unavailable."
        $canStartDouyin = $false
    }

    if ($canStartDouyin) {
        Write-Status "Starting Douyin data microservice..."
        Start-Process -FilePath "python" `
            -ArgumentList "test_server.py" `
            -WorkingDirectory $DOUYIN_DIR `
            -WindowStyle Minimized

        $retries = 15
        $ready = $false
        while (($retries -gt 0) -and (-not $ready)) {
            Start-Sleep -Seconds 2
            try {
                $resp = Invoke-WebRequest -Uri "http://localhost:$PORT_DOUYIN/api/v1/health" -UseBasicParsing -TimeoutSec 3
                if ($resp.StatusCode -eq 200) { $ready = $true }
            } catch { }
            $retries--
        }

        if ($ready) {
            Write-OK "Douyin microservice started (port $PORT_DOUYIN)."
        } else {
            Write-Warn "Douyin microservice startup timed out. Douyin features may be unavailable."
        }
    }
}

# --- Start Content OS Main Service (port 3000) ---

Write-Status "Checking Content OS main service (port $PORT_MAIN)..."

if (Test-Port $PORT_MAIN) {
    Write-OK "Content OS already running (port $PORT_MAIN)."
} else {
    Write-Status "Starting Content OS..."
    Start-Process -FilePath "powershell" `
        -ArgumentList "-NoExit", "-Command", "cd '$CONTEXTOS_DIR'; npm run dev" `
        -WindowStyle Normal

    $retries = 30
    $ready = $false
    while (($retries -gt 0) -and (-not $ready)) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$PORT_MAIN/api/health" -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) { $ready = $true }
        } catch { }
        $retries--
    }

    if ($ready) {
        Write-OK "Content OS started (port $PORT_MAIN)."
    } else {
        Write-Err "Content OS startup timed out. Check the console window for errors."
        pause; exit 1
    }
}

# --- Open Browser ---

Start-Sleep -Seconds 1
Write-Status "Opening browser..."
Start-Process "http://localhost:$PORT_MAIN"

# --- Summary ---

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-OK "Content OS is ready!"
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Content OS : http://localhost:$PORT_MAIN" -ForegroundColor White
if (Test-Port $PORT_DOUYIN) {
    Write-Host "  Douyin API  : http://localhost:$PORT_DOUYIN" -ForegroundColor White
} else {
    Write-Host "  Douyin API  : NOT RUNNING (port $PORT_DOUYIN)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  To stop: close the corresponding PowerShell windows." -ForegroundColor Gray
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
