# 백엔드 자동 시험 실행
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'backend')
try { python -m pytest -q } finally { Pop-Location }
