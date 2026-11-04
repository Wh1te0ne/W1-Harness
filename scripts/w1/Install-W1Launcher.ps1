param()
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $root '.work/local-dev/launcher'
$install = Join-Path $env:USERPROFILE '.w1-harness-app'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$node = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$pwsh = (Get-Command pwsh -CommandType Application | Select-Object -First 1).Source
$icon = Join-Path $root 'assets/w1/exports/app-icon.ico'
New-Item -ItemType Directory -Path $output,$install -Force | Out-Null
& $node (Join-Path $PSScriptRoot 'prepare-windows-shell.mjs') $install
if ($LASTEXITCODE -ne 0) { throw 'W1 desktop runtime preparation failed.' }
$candidate = Join-Path $output 'W1 Harness.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output "/win32icon:$icon" "/out:$candidate" /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'W1Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'W1 launcher compilation failed.' }
$executable = Join-Path $install 'W1 Harness.exe'
if (-not (Test-Path -LiteralPath $executable) -or (Get-FileHash -LiteralPath $candidate).Hash -ne (Get-FileHash -LiteralPath $executable).Hash) {
  if (Test-Path -LiteralPath $executable) {
    $backup = Join-Path $install ('backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath $executable -Destination $backup
  }
  Copy-Item -LiteralPath $candidate -Destination $executable -Force
}
@{ProjectRoot=$root;PowerShell=$pwsh;Node=$node} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $install 'launcher.json') -Encoding utf8NoBOM
$env:W1_LAUNCHER_INSTALL_DIRECTORY = $install
Remove-Item Env:ELECTRON_RUN_AS_NODE,Env:ELECTRON_OVERRIDE_DIST_PATH -ErrorAction SilentlyContinue
$electron = & $node -e "console.log(require(process.argv[1]))" (Join-Path $root 'apps/desktop/node_modules/electron')
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the prepared Electron runtime.' }
$setup = Start-Process -FilePath $electron -ArgumentList ('"' + (Join-Path $PSScriptRoot 'install-shortcuts.cjs') + '"') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $output 'shortcuts-stdout.log') -RedirectStandardError (Join-Path $output 'shortcuts-stderr.log')
if ($setup.ExitCode -ne 0) { throw "Shortcut installation failed; see $output/shortcuts-stderr.log" }
# Notify Explorer after replacing the shortcut's explicit icon location.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class W1ShortcutIconRefresh {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern void SHChangeNotify(uint change, uint flags, string item1, IntPtr item2);
}
'@
$shortcuts = Get-Content -LiteralPath (Join-Path $output 'shortcuts.json') -Raw | ConvertFrom-Json
foreach ($shortcut in $shortcuts.shortcuts) {
  [W1ShortcutIconRefresh]::SHChangeNotify(0x2000,0x1005,$shortcut.path,[IntPtr]::Zero)
}
Write-Output "W1 launcher installed: $executable"
Write-Output 'Desktop and Start Menu shortcuts are ready. Pin W1 Harness from its shortcut or running window.'
