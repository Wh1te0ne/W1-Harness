param([string]$Executable, [switch]$PrepareOnly, [ValidateRange(0,65532)][int]$DebugPortBase = 0)
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
# Source launches from the daily checkout redirect to the one development Test.
$sourceEntry = Join-Path $testRoot '.work/self-dev/scripts/w1/Start-W1Test.ps1'
if (-not $Executable -and (Test-Path -LiteralPath $sourceEntry)) {
    & (Join-Path $PSHOME 'pwsh.exe') -NoProfile -File $sourceEntry -PrepareOnly:$PrepareOnly -DebugPortBase $DebugPortBase
    exit $LASTEXITCODE
}
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$env:W1_TEST_MODE = '1'
$env:W1_TEST_LAUNCHER = $PSCommandPath
$env:W1_TEST_POWERSHELL = Join-Path $PSHOME 'pwsh.exe'
foreach ($name in @('W1_HOME','W1_USER_DATA','W1_DESKTOP_EXECUTABLE','W1_DESKTOP_LAUNCHER','DSH_HOME',
    'DSH_DESKTOP_DSH_DIR','DSH_DESKTOP_USER_DATA_DIR','DSH_DESKTOP_PRIMARY_RUNTIME_DIR','ELECTRON_RUN_AS_NODE','NODE_OPTIONS',
    'DSH_DESKTOP_PNPM_ENTRY','DSH_DESKTOP_MANDATORY_UPDATE_CONFIG','ELECTRON_OVERRIDE_DIST_PATH')) {
    Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue
}
# Credentials are resolved only from the independent Test profile.
Get-ChildItem Env: | Where-Object Name -Match '(^DSH_CRED_|KEY|TOKEN|SECRET|PASSWORD)' | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:DSH_DESKTOP_DEV_APP = '0'
$env:DSH_DESKTOP_NO_INSPECT = '1'
$env:W1_CLIENT_HOT_RELOAD = '0'
if ($Executable) {
    if ($PrepareOnly) { throw 'PrepareOnly is for the source Test entry.' }
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Test executable was not found.' }
    Start-Process -FilePath $Executable -WindowStyle Hidden
    exit 0
}
$env:DSH_HOME = Join-Path $env:USERPROFILE '.w1-harness-test'
$env:DSH_AGENTS_HOME = Join-Path $env:DSH_HOME 'agents'
$env:DSH_DESKTOP_USER_DATA_DIR = Join-Path $env:APPDATA 'W1 Harness Test'
$testApp = Join-Path $testRoot '.work/local-dev/test-app'
$env:W1_DESKTOP_EXECUTABLE = & $node (Join-Path $PSScriptRoot 'prepare-windows-shell.mjs') $testApp --check
if ($LASTEXITCODE -ne 0) { throw 'Test runtime missing. Run scripts/w1/Install-W1TestLauncher.ps1 first.' }
$activeTest = Get-CimInstance Win32_Process -Filter "Name='W1 Harness.exe' OR Name='electron.exe'" | Where-Object {
    $_.ExecutablePath -eq $env:W1_DESKTOP_EXECUTABLE -or $_.CommandLine -like '*W1 Harness Test*'
}
if ($activeTest) {
    if ($PrepareOnly) { throw 'Exit W1 Harness Test before preparing its project.' }
    if (-not ($activeTest | Where-Object ExecutablePath -eq $env:W1_DESKTOP_EXECUTABLE)) { throw 'Exit the packaged W1 Harness Test before opening the source Test.' }
    & $env:W1_DESKTOP_EXECUTABLE "--user-data-dir=$($env:DSH_DESKTOP_USER_DATA_DIR)" (Join-Path $testRoot 'apps/desktop') --w1-activate-only
    exit $LASTEXITCODE
}
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
$launchLog = Join-Path $testRoot ('.work/local-dev/test-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + $PID + '.log')
$env:W1_LAUNCH_STARTED_AT = [string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Push-Location -LiteralPath $testRoot
try {
    $launchArgs = @((Join-Path $PSScriptRoot 'start-prepared.mjs'))
    if ($PrepareOnly) { $launchArgs += '--prepare-only' }
    & $node (Join-Path $PSScriptRoot 'run-logged.mjs') $launchLog $node @launchArgs
    if ($LASTEXITCODE -ne 0) { throw "W1 Harness Test failed to start. See $launchLog" }
} finally { Pop-Location }
