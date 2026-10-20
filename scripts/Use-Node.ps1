$ErrorActionPreference = 'Stop'
$sageRoot = Split-Path -Parent $PSScriptRoot
$sageTools = Join-Path $sageRoot '.tools'
$sageNodeDirectory = Join-Path $sageTools 'node-v24.21.0-win-x64'
$sageNode = Join-Path $sageNodeDirectory 'node.exe'
if (-not (Test-Path -LiteralPath $sageNode)) {
    New-Item -ItemType Directory -Path $sageTools -Force | Out-Null
    $sageArchive = Join-Path $sageTools 'node-v24.21.0-win-x64.zip'
    Write-Host 'Preparando Node.js 24.21.0 desde nodejs.org...'
    Invoke-WebRequest 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -UseBasicParsing -OutFile $sageArchive
    $sageHash = (Get-FileHash -LiteralPath $sageArchive -Algorithm SHA256).Hash.ToLower()
    if ($sageHash -ne '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541') {
        throw 'El archivo de Node no coincide con el SHA256 oficial.'
    }
    Expand-Archive -LiteralPath $sageArchive -DestinationPath $sageTools -Force
}
$env:Path = "$sageNodeDirectory;$env:Path"
if ((& $sageNode --version) -ne 'v24.21.0') { throw 'Version de Node incorrecta.' }
