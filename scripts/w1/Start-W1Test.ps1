param([string]$Executable, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ($PrepareOnly) {
    & node (Join-Path $PSScriptRoot 'prepare-test-profile.mjs')
    exit $LASTEXITCODE
}
$env:W1_TEST_MODE = '1'
$env:W1_TEST_LAUNCHER = $PSCommandPath
$env:W1_TEST_POWERSHELL = Join-Path $PSHOME 'pwsh.exe'
foreach ($name in @('W1_HOME','W1_USER_DATA','W1_DESKTOP_EXECUTABLE','W1_DESKTOP_LAUNCHER','DSH_HOME',
    'DSH_DESKTOP_DSH_DIR','DSH_DESKTOP_USER_DATA_DIR','DSH_DESKTOP_PRIMARY_RUNTIME_DIR','ELECTRON_RUN_AS_NODE','NODE_OPTIONS')) {
    Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue
}
# Never inherit credentials from the daily shell; the test credential file owns its only configured key.
Get-ChildItem Env: | Where-Object Name -Match '(^DSH_CRED_|KEY|TOKEN|SECRET|PASSWORD)' | ForEach-Object {
    Remove-Item -LiteralPath ('Env:' + $_.Name)
}
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:DSH_DESKTOP_NO_INSPECT = '1'
if ($Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw 'Test executable was not found.' }
    Start-Process -FilePath $Executable -WindowStyle Hidden
} else {
    Push-Location -LiteralPath $testRoot
    try {
        & node --import tsx/esm apps/desktop/scripts/dev.ts --skip-build --reuse-runtime
        if ($LASTEXITCODE -ne 0) { throw 'Test launch failed; prepare its build and runtime first.' }
    } finally { Pop-Location }
}
