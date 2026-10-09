# OVOT 로컬 실행: 프런트 빌드 후 서버 실행 (http://localhost:8100)
# 사용법: powershell -ExecutionPolicy Bypass -File scripts/start.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $SkipBuild) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'npm을 찾을 수 없습니다. Node.js 20 이상을 설치하거나 PATH에 추가하세요.'
    }
    Push-Location (Join-Path $root 'frontend')
    try {
        if (-not (Test-Path 'node_modules')) { npm ci }
        npm run build
    } finally { Pop-Location }
}

Push-Location (Join-Path $root 'backend')
try {
    python -m pip install -q -r requirements.txt
    python run.py
} finally { Pop-Location }
