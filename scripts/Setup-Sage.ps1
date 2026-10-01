$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/Use-Node.ps1"
Push-Location $sageRoot
try {
    & "$sageNodeDirectory/npm.cmd" run setup
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar SAGE. Revisa el mensaje anterior.' }
} finally { Pop-Location }
