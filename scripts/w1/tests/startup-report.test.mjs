import test from 'node:test'
import assert from 'node:assert/strict'
import { startupReporter } from '../startup-report.mjs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('records bounded phase progress without private launch environment', () => {
  const events = []
  const report = startupReporter(Date.now() - 1000, value => events.push(value))
  report('publish-progress', { phase: 'validate', completed: 0, total: 100 })
  for (let completed = 1; completed <= 100; completed++) report('publish-progress', { phase: 'validate', completed, total: 100 })
  assert.equal(events.length, 2)
  assert.equal(events.at(-1).completed, 100)
  assert.ok(events.at(-1).elapsedMs >= 1000)
  assert.deepEqual(Object.keys(events[0]).sort(), ['completed', 'elapsedMs', 'phase', 'stage', 'total'])
})

test('the progress helper offers a headless caption check', { skip: process.platform !== 'win32' }, () => {
  const script = fileURLToPath(new URL('../Show-W1Startup.ps1', import.meta.url))
  const output = execFileSync('C:/Program Files/PowerShell/7/pwsh.exe',
    ['-NoProfile', '-File', script, '-CheckStage', 'host-profile-start'],
    { encoding: 'utf8', windowsHide: true })
  assert.match(output, /正在加载服务与插件/)
  const compiled = execFileSync('C:/Program Files/PowerShell/7/pwsh.exe',
    ['-NoProfile', '-File', script, '-ValidateOnly'],
    { encoding: 'utf8', windowsHide: true })
  assert.match(compiled, /startup-ui-compiled/)
})
