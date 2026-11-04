param()
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$sourceInstaller = Join-Path $testRoot '.work/self-dev/scripts/w1/Install-W1TestLauncher.ps1'
if (Test-Path -LiteralPath $sourceInstaller) {
    & (Join-Path $PSHOME 'pwsh.exe') -NoProfile -File $sourceInstaller
    exit $LASTEXITCODE
}
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$executable = & $node (Join-Path $PSScriptRoot 'prepare-windows-shell.mjs') (Join-Path $testRoot '.work/local-dev/test-app')
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the source Test runtime.' }
$entry = Join-Path $PSScriptRoot 'Start-W1Test.ps1'
$powershell = Join-Path $PSHOME 'pwsh.exe'
$backup = Join-Path $testRoot ('.work/local-dev/test-shortcut-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$destinations = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'W1 Harness Test.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'W1 Harness Test.lnk'))
$pinned = Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar/W1 Harness Test.lnk'
if (Test-Path -LiteralPath $pinned) { $destinations += $pinned }
$shell = New-Object -ComObject WScript.Shell
$index = 0
foreach ($destination in $destinations) {
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination (Join-Path $backup ($index.ToString() + '.lnk')) }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
    $shortcut = $shell.CreateShortcut($destination)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $entry + '"'
    $shortcut.WorkingDirectory = $testRoot
    $shortcut.IconLocation = $executable + ',0'
    $shortcut.Description = 'W1 source Test - applies queued builds after exit.'
    $shortcut.Save()
    $check = $shell.CreateShortcut($destination)
    if ($check.TargetPath -ne $powershell -or $check.Arguments -notlike ('*' + $entry + '*')) { throw 'Test shortcut verification failed.' }
    $index++
}
@{sourceRoot=$testRoot;entry=$entry;shortcuts=$destinations;backup=$backup} | ConvertTo-Json | Write-Output
