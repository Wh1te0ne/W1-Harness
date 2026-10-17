param([ValidateRange(0,65532)][int]$DebugPortBase = 0, [switch]$RefreshProject)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$localLogs = Join-Path $root '.work/local-dev'
New-Item -ItemType Directory -Path $localLogs -Force | Out-Null
$w1Home = Join-Path $env:USERPROFILE '.w1-harness'
$w1Data = Join-Path $env:APPDATA 'W1 Harness'
New-Item -ItemType Directory -Path $w1Home -Force | Out-Null
$projectStore = Join-Path $w1Home 'storages/workspace.json'
if (Test-Path -LiteralPath $projectStore) {
  $projectVersion = (Get-Content -Raw -LiteralPath $projectStore | ConvertFrom-Json).unit.version
  if ($projectVersion -eq 2) {
    $activeW1 = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) }
    if ($activeW1) { throw 'Close W1 Harness from its application menu before upgrading project metadata.' }
  }
}
& node (Join-Path $PSScriptRoot 'migrate-projects.mjs') $w1Home
if ($LASTEXITCODE -ne 0) { throw 'W1 project migration failed; application launch stopped.' }
$usageProfile = Join-Path $w1Home 'profiles/desktop/package.json'
if (Test-Path -LiteralPath $usageProfile) {
  $usageManifest = Get-Content -Raw -LiteralPath $usageProfile | ConvertFrom-Json
  if ($usageManifest.dependencies.'dsh-usage-manager' -or $usageManifest.dependencies.'dsh-cost-meter') {
    $activeW1 = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) }
    if ($activeW1) { throw 'Exit W1 before migrating its usage module.' }
  }
}
& node (Join-Path $PSScriptRoot 'migrate-usage.mjs') $w1Home
if ($LASTEXITCODE -ne 0) { throw 'W1 usage migration failed; launch stopped.' }
$rules = Join-Path $w1Home 'AGENTS.md'
if (-not (Test-Path -LiteralPath $rules)) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AGENTS.default.md') -Destination $rules }
foreach ($name in @('ELECTRON_RUN_AS_NODE','ELECTRON_OVERRIDE_DIST_PATH','DSH_DESKTOP_DSH_DIR','DSH_DESKTOP_PNPM_ENTRY','DSH_DESKTOP_PRIMARY_RUNTIME_DIR','DSH_DESKTOP_MANDATORY_UPDATE_CONFIG')) {
  Remove-Item -LiteralPath ("Env:" + $name) -ErrorAction SilentlyContinue
}
$env:W1_HOME = $w1Home
$env:W1_USER_DATA = $w1Data
$env:DSH_HOME = $w1Home
$env:DSH_AGENTS_HOME = Join-Path $w1Home 'agents'
$env:DSH_DESKTOP_USER_DATA_DIR = $w1Data
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:DSH_DESKTOP_DEV_APP = '0'
$env:DSH_DESKTOP_NO_INSPECT = '1'
if ($DebugPortBase -gt 0) {
  foreach ($port in $DebugPortBase..($DebugPortBase + 2)) {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
    try { $probe.Start() } finally { $probe.Stop() }
  }
  $env:DSH_DESKTOP_NO_INSPECT = '0'
  $env:DSH_DESKTOP_MAIN_INSPECT_PORT = [string]$DebugPortBase
  $env:DSH_DESKTOP_RENDERER_DEBUG_PORT = [string]($DebugPortBase+1)
  $env:DSH_DESKTOP_HOST_INSPECT_PORT = [string]($DebugPortBase+2)
}
Push-Location -LiteralPath $root
try {
  $launchArgs = @('--filter','@deepseek-ai/dsh-desktop','run','start','--reuse-runtime')
  if (-not $RefreshProject -and (Test-Path -LiteralPath (Join-Path $root 'apps/desktop/.desktop-build/development/project/desktop-runtime.json'))) { $launchArgs += '--reuse-project' }
  & node (Join-Path $root 'node_modules/pnpm/bin/pnpm.cjs') @launchArgs *> (Join-Path $localLogs 'desktop.log')
  if ($LASTEXITCODE -ne 0) { throw "W1 failed to start. See $localLogs/desktop.log" }
} finally { Pop-Location }
