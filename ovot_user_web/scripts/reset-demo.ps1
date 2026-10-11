# 로컬 시연 데이터 초기화 (위치 기록·음성 파일 삭제 후 시연용 데이터 다시 넣기)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'backend')
try { python -m app.seed --reset } finally { Pop-Location }
