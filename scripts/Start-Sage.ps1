$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Use-Node.ps1"
Push-Location $sageRoot
try {
    if (-not (Test-Path 'backend/node_modules') -or -not (Test-Path 'frontend/node_modules') -or -not (Test-Path 'backend/.env')) {
        & "$sageNodeDirectory/npm.cmd" run setup
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar SAGE. Revisa el mensaje anterior.' }
    } else {
        docker compose up -d --wait
        if ($LASTEXITCODE -ne 0) { throw 'Docker no esta disponible. Abre Docker Desktop.' }
    }
    & "$sageNodeDirectory/npm.cmd" run dev
} finally { Pop-Location }
