param([string]$LogPath, [int]$OwnerPid, [string]$CheckStage, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Get-StartupCaption([string]$Stage, [string]$Phase, [int]$Completed = 0, [int]$Total = 0) {
  switch ($Stage) {
    'publish-start' { return '正在检查待更新内容…' }
    'publish-progress' {
      if ($Phase -eq 'validate') { return "正在校验更新 $Completed / $Total" }
      if ($Phase -eq 'publish') { return "正在应用更新 $Completed / $Total" }
      return '更新已就绪，正在启动…'
    }
    'project-refresh' { return '正在准备开发运行环境…' }
    'host-profile-start' { return '正在加载服务与插件…' }
    'host-profile-ready' { return '正在准备浏览器服务…' }
    'host-browser-ready' { return '正在准备远程服务…' }
    'host-remote-ready' { return '正在准备文档工具…' }
    'host-office-ready' { return '正在打开工作区…' }
    default { return '正在启动 W1 Harness…' }
  }
}
# A text-only entry for parser/localization tests; no desktop UI is constructed.
if ($PSBoundParameters.ContainsKey('CheckStage')) { Get-StartupCaption $CheckStage ''; return }
if (-not $ValidateOnly -and (-not $LogPath -or $OwnerPid -le 0)) { throw 'Startup progress requires its launch log and owner.' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.ComponentModel.Primitives -TypeDefinition @'
public sealed class W1StartupForm : System.Windows.Forms.Form {
  protected override bool ShowWithoutActivation { get { return true; } }
}
'@
if ($ValidateOnly) { 'startup-ui-compiled'; return }
$form = [W1StartupForm]::new()
$form.Text = 'W1 Harness'
$form.ClientSize = [Drawing.Size]::new(360, 108)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ShowInTaskbar = $false
$iconPath = Join-Path $PSScriptRoot '../../apps/desktop/resources/w1-app-light.ico'
if (Test-Path -LiteralPath $iconPath) { $form.Icon = [Drawing.Icon]::new($iconPath) }
$form.BackColor = [Drawing.SystemColors]::Window
$form.ForeColor = [Drawing.SystemColors]::WindowText
$label = [Windows.Forms.Label]::new()
$label.Text = '正在启动 W1 Harness…'
$label.Font = [Drawing.Font]::new('Microsoft YaHei UI', 10)
$label.SetBounds(22, 20, 320, 28)
$bar = [Windows.Forms.ProgressBar]::new()
$bar.Style = 'Marquee'
$bar.MarqueeAnimationSpeed = 30
$bar.SetBounds(22, 63, 316, 4)
$form.Controls.AddRange(@($label, $bar))
$timer = [Windows.Forms.Timer]::new()
$timer.Interval = 250
$watch = [Diagnostics.Stopwatch]::StartNew()
$timer.Add_Tick({
  if (-not (Get-Process -Id $OwnerPid -ErrorAction SilentlyContinue)) { $form.Close(); [Windows.Forms.Application]::ExitThread(); return }
  if (Test-Path -LiteralPath $LogPath) {
    foreach ($line in (Get-Content -LiteralPath $LogPath -Tail 32 -ErrorAction SilentlyContinue)) {
      if ($line -notmatch '^\[w1-startup\] (\{.*\})$') { continue }
      try {
        $phase = $Matches[1] | ConvertFrom-Json
        if ($phase.stage -eq 'workspace-shown') { $form.Close(); [Windows.Forms.Application]::ExitThread(); return }
        $label.Text = Get-StartupCaption $phase.stage $phase.phase $phase.completed $phase.total
      } catch { <# A concurrent log write may leave a partial final line. #> }
    }
  }
  if ($watch.ElapsedMilliseconds -gt 1200 -and -not $form.Visible) { $form.Show() }
})
$form.Add_FormClosed({ [Windows.Forms.Application]::ExitThread() })
$timer.Start()
try { [Windows.Forms.Application]::Run() }
finally { $timer.Dispose(); $form.Dispose() }
