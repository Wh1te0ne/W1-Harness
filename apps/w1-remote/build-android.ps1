param(
  [string]$Sdk = 'D:\Toolchains\Android\android\android-sdk',
  [string]$Java = 'D:\Tools\jdk-17.0.20.1+1',
  [string]$Gradle = 'D:\Tools\gradle-8.10.2\bin\gradle.bat'
)
$ErrorActionPreference = 'Stop'
$remoteRoot = $PSScriptRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $remoteRoot '..\..'))
$assets = Join-Path $remoteRoot 'android\app\src\main\assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Get-ChildItem -LiteralPath (Join-Path $remoteRoot 'mobile') -File | Copy-Item -Destination $assets -Force
foreach ($file in @('crypto.mjs','client.mjs')) { Copy-Item -LiteralPath (Join-Path $remoteRoot $file) -Destination $assets -Force }
$iconDir = Join-Path $remoteRoot 'android\app\src\main\res\drawable'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot 'apps\desktop\resources\icon-windows.png') -Destination (Join-Path $iconDir 'w1_icon.png') -Force
Set-Content -LiteralPath (Join-Path $remoteRoot 'android\local.properties') -Value ('sdk.dir=' + $Sdk.Replace('\','/')) -Encoding utf8
$env:JAVA_HOME = $Java
$env:ANDROID_HOME = $Sdk
& $Gradle -p (Join-Path $remoteRoot 'android') assembleDebug --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
$output = Join-Path $repoRoot '.work\deliveries\w1-remote-0.1.0'
New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -LiteralPath (Join-Path $remoteRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $output 'W1-Harness-Mobile-0.1.0.apk') -Force
Write-Output (Join-Path $output 'W1-Harness-Mobile-0.1.0.apk')
