param([ValidateRange(0,65532)][int]$DebugPortBase = 0, [switch]$RefreshProject, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$env:W1_LAUNCH_STARTED_AT = [string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$node = if ($env:W1_NODE) { $env:W1_NODE } else { (Get-Command node -CommandType Application | Select-Object -First 1).Source }
$launcher = Join-Path $env:USERPROFILE '.w1-harness-app/W1 Harness.exe'
if (-not $env:W1_DESKTOP_LAUNCHER -and (Test-Path -LiteralPath $launcher)) { $env:W1_DESKTOP_LAUNCHER = $launcher }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$w1App = Join-Path $env:USERPROFILE '.w1-harness-app'
$env:W1_DESKTOP_EXECUTABLE = & $node (Join-Path $PSScriptRoot 'prepare-windows-shell.mjs') $w1App --check
if ($LASTEXITCODE -ne 0) { throw 'W1 desktop runtime missing; run Install-W1Launcher.ps1 once.' }
$localLogs = Join-Path $root '.work/local-dev'
New-Item -ItemType Directory -Path $localLogs -Force | Out-Null
$w1Home = Join-Path $env:USERPROFILE '.w1-harness'
$w1Data = Join-Path $env:APPDATA 'W1 Harness'
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
# Each invocation owns its log, including a second launch that focuses the existing instance.
$launchLog = Join-Path $localLogs ('desktop-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID + '.log')
# A running Desktop already owns the prepared profile. Send Electron's normal
# second-instance request without rerunning migrations or the development builder.
if (-not $PrepareOnly -and -not $RefreshProject -and $DebugPortBase -eq 0) {
  $owner = Get-CimInstance Win32_Process -Filter "Name='W1 Harness.exe'" | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.Equals($env:W1_DESKTOP_EXECUTABLE, [StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine -like '*--user-data-dir=*' -and $_.CommandLine -notlike '*--type=*'
  } | Select-Object -First 1
  if ($owner) {
    # Keep a complete development environment if the owner exits during this handoff.
    $env:DSH_DESKTOP_PRIMARY_RUNTIME_DIR = Join-Path $root 'apps/desktop/.desktop-build/targets/win-x64/runtime/primary-runtime'
    $env:ELECTRON_ENABLE_LOGGING = '1'
    "W1 existing instance: forwarding activation to PID $($owner.ProcessId)" | Set-Content -LiteralPath $launchLog
    & $node (Join-Path $PSScriptRoot 'run-logged.mjs') $launchLog $env:W1_DESKTOP_EXECUTABLE "--user-data-dir=$w1Data" (Join-Path $root 'apps/desktop')
    if ($LASTEXITCODE -ne 0) { throw "W1 activation failed. See $launchLog" }
    return
  }
}
New-Item -ItemType Directory -Path $w1Home -Force | Out-Null
$projectStore = Join-Path $w1Home 'storages/workspace.json'
if (Test-Path -LiteralPath $projectStore) {
  $projectState = Get-Content -Raw -LiteralPath $projectStore | ConvertFrom-Json
  $projectVersion = $projectState.unit.version
  if ($projectState.unit.name -ne 'workspace' -or $projectVersion -notin @(2,3)) { throw 'Unsupported W1 project storage format.' }
  if ($projectVersion -eq 2) {
    $activeW1 = Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='W1 Harness.exe'" | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -or $_.ExecutablePath.StartsWith((Join-Path $w1App 'shell') + '\', [StringComparison]::OrdinalIgnoreCase)) }
    if ($activeW1) { throw 'Close W1 Harness from its application menu before upgrading project metadata.' }
    & $node (Join-Path $PSScriptRoot 'migrate-projects.mjs') $w1Home
    if ($LASTEXITCODE -ne 0) { throw 'W1 project migration failed; application launch stopped.' }
  }
}
$usageManifest = $null
$usageProfile = Join-Path $w1Home 'profiles/desktop/package.json'
if (Test-Path -LiteralPath $usageProfile) {
  $usageManifest = Get-Content -Raw -LiteralPath $usageProfile | ConvertFrom-Json
  if ($usageManifest.dependencies.'dsh-usage-manager' -or $usageManifest.dependencies.'dsh-cost-meter' -or
      'dsh-usage-manager' -in $usageManifest.dsh.profile.bundles -or 'dsh-cost-meter' -in $usageManifest.dsh.profile.bundles) {
    $activeW1 = Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='W1 Harness.exe'" | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -or $_.ExecutablePath.StartsWith((Join-Path $w1App 'shell') + '\', [StringComparison]::OrdinalIgnoreCase)) }
    if ($activeW1) { throw 'Exit W1 before migrating its usage module.' }
    & $node (Join-Path $PSScriptRoot 'migrate-usage.mjs') $w1Home
    if ($LASTEXITCODE -ne 0) { throw 'W1 usage migration failed; launch stopped.' }
  }
}
if ($usageManifest.dependencies.'dsh-task-notifier' -or 'dsh-task-notifier' -in $usageManifest.dsh.profile.bundles) {
  $activeW1 = Get-CimInstance Win32_Process -Filter "Name='W1 Harness.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $w1App 'shell') + '\', [StringComparison]::OrdinalIgnoreCase) }
  if ($activeW1) { throw 'Exit W1 before migrating its built-in notifications.' }
  & $node (Join-Path $PSScriptRoot 'migrate-notifications.mjs') $w1Home
  if ($LASTEXITCODE -ne 0) { throw 'W1 notification migration failed; launch stopped.' }
}
$rules = Join-Path $w1Home 'AGENTS.md'
if (-not (Test-Path -LiteralPath $rules)) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'AGENTS.default.md') -Destination $rules }
Push-Location -LiteralPath $root
try {
  $launchArgs = @('scripts/w1/start-prepared.mjs')
  if ($RefreshProject) { $launchArgs += '--refresh-project' }
  if ($PrepareOnly) { $launchArgs += '--prepare-only' }
  $projectRuntime = Join-Path $root 'apps/desktop/.desktop-build/development/project/desktop-runtime.json'
  if (-not $RefreshProject -and (Test-Path -LiteralPath $projectRuntime)) {
    $cachedVersion = (Get-Content -LiteralPath $projectRuntime -Raw | ConvertFrom-Json).release.version
    $sourceVersion = (Get-Content -LiteralPath (Join-Path $root 'apps/desktop/package.json') -Raw | ConvertFrom-Json).version
    if ($cachedVersion -ne $sourceVersion) {
      $activeW1 = Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='W1 Harness.exe'" | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -or $_.ExecutablePath.StartsWith((Join-Path $w1App 'shell') + '\', [StringComparison]::OrdinalIgnoreCase)) }
      if ($activeW1) { throw 'Exit W1 Harness from its application menu, then open W1 again to finish the development update.' }
    }
  }
  & $node (Join-Path $PSScriptRoot 'run-logged.mjs') $launchLog $node @launchArgs
  if ($LASTEXITCODE -ne 0) { throw "W1 failed to start. See $launchLog" }
} finally { Pop-Location }
