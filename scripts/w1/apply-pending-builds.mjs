/** Apply this worktree's queued package builds before an instance launches from it. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { publishPendingBuilds } from './pending-builds.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const pwsh = 'C:/Program Files/PowerShell/7/pwsh.exe'
/** An Electron instance launched from this worktree keeps its development user data inside it. */
const probe = [
  "$ErrorActionPreference = 'Stop'",
  "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('electron.exe','W1 Harness.exe') -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:W1_WORKTREE_ROOT,[StringComparison]::OrdinalIgnoreCase)) -or $_.CommandLine -like '*W1 Harness Test*') }).Count",
].join('\n')

/** Report whether an instance of this worktree already runs. */
function instanceRunning() {
  const output = execFileSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', probe], {
    encoding: 'utf8',
    env: { ...process.env, W1_WORKTREE_ROOT: root },
  })
  return Number(output.trim()) > 0
}

const applied = publishPendingBuilds(root, instanceRunning)
if (applied > 0) console.log(`Applied ${applied} queued package build(s) from this worktree.`)
