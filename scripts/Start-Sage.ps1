$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Use-Node.ps1"
Push-Location $sageRoot
try {
    $sageRequiredPaths = @('node_modules', 'backend/node_modules', 'frontend/node_modules', '.env', 'backend/.env', 'frontend/.env')
    $sageMissingPaths = @($sageRequiredPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($sageMissingPaths.Count -gt 0) {
        & "$sageNodeDirectory/npm.cmd" run setup
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar SAGE. Revisa el mensaje anterior.' }
    } else {
        docker compose up -d --wait
        if ($LASTEXITCODE -ne 0) { throw 'Docker no esta disponible. Abre Docker Desktop.' }
        & "$sageNodeDirectory/npm.cmd" run db:generate
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el cliente de datos.' }
        & "$sageNodeDirectory/npm.cmd" run db:migrate
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones.' }
    }
    & "$sageNodeDirectory/npm.cmd" run dev
} finally { Pop-Location }
