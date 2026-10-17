param(
    [ValidateRange(1024, 65532)]
    [int]$DebugPortBase = 19320
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'apps\desktop\scripts\dev.ts'))) {
    throw 'Run this launcher from scripts/w1 in the W1 Harness checkout.'
}
$runtimeRoot = Join-Path $projectRoot '.work\runtime'
$testHome = Join-Path $runtimeRoot 'dsh-home'
$electronData = Join-Path $runtimeRoot 'electron-user-data'
$documents = Join-Path $runtimeRoot 'documents'
$pnpmEntry = Join-Path $projectRoot 'node_modules\pnpm\bin\pnpm.cjs'
if (-not (Test-Path -LiteralPath $pnpmEntry)) { throw 'Install the locked workspace dependencies first.' }

foreach ($port in $DebugPortBase..($DebugPortBase + 2)) {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $probe.Start() } catch { throw "Debug port $port is occupied; choose a different -DebugPortBase." } finally { $probe.Stop() }
}
foreach ($directory in @($testHome, $electronData, $documents)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

# The upstream first-use workspace otherwise targets the user's Documents folder.
$patchPath = Join-Path $testHome 'cordis.patch.yml'
$yamlDirectory = $documents.Replace('\', '/').Replace("'", "''")
$patch = "- id: workspace-controller`n  config:`n    documentsDirectory: '$yamlDirectory'`n"
if (Test-Path -LiteralPath $patchPath) {
    if ((Get-Content -LiteralPath $patchPath -Raw).Replace("`r`n", "`n") -ne $patch) {
        throw 'The isolated home patch differs from this launcher; inspect it instead of overwriting it.'
    }
} else {
    [IO.File]::WriteAllText($patchPath, $patch, [Text.UTF8Encoding]::new($false))
}

# These settings apply only to this launcher process and its descendants.
foreach ($name in @('ELECTRON_RUN_AS_NODE', 'ELECTRON_OVERRIDE_DIST_PATH', 'DSH_DESKTOP_DSH_DIR', 'DSH_DESKTOP_PNPM_ENTRY', 'DSH_DESKTOP_PRIMARY_RUNTIME_DIR', 'DSH_DESKTOP_MANDATORY_UPDATE_CONFIG', 'DEEPSEEK_API_KEY')) {
    Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
}
$env:W1_HOME = $testHome
$env:W1_USER_DATA = $electronData
$env:DSH_HOME = $testHome
$env:DSH_DESKTOP_USER_DATA_DIR = $electronData
$env:DSH_DESKTOP_MAIN_INSPECT_PORT = [string]$DebugPortBase
$env:DSH_DESKTOP_RENDERER_DEBUG_PORT = [string]($DebugPortBase + 1)
$env:DSH_DESKTOP_HOST_INSPECT_PORT = [string]($DebugPortBase + 2)
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:DSH_DESKTOP_DEV_APP = '0'
$env:ELECTRON_CACHE = Join-Path $projectRoot '.work\cache\electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:npm_config_cache = Join-Path $projectRoot '.work\npm-cache'
$env:DSH_GATE_CONCURRENCY = '2'

Push-Location -LiteralPath $projectRoot
try {
    Write-Output "W1 baseline: data is isolated under $runtimeRoot"
    Write-Output 'The upstream development launcher uses an OS-assigned local Host port.'
    & node $pnpmEntry run start:desktop
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
