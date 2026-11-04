/** Query the selected daily runtime without touching other W1/test installations. */
import { execFileSync } from 'node:child_process'

export function isW1Running() {
  if (!process.env.W1_DESKTOP_EXECUTABLE) throw new Error('Select the W1 runtime through Start-W1.ps1 before publication')
  const output = execFileSync('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoProfile', '-Command',
    "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='W1 Harness.exe'\" | Where-Object { $_.ExecutablePath -eq $env:W1_DESKTOP_EXECUTABLE }).Count"],
  { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  const count = Number(output.trim())
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Could not determine whether W1 is running')
  return count > 0
}
