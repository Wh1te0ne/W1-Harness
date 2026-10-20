import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { HOST_MODULE_RETRY_IMPORT } from '../src/host-module-retry.ts'

function run(failures: number, code: string) {
  const directory = mkdtempSync(join(tmpdir(), 'w1-host-read-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  const target = join(directory, 'fixture.mjs')
  writeFileSync(target, 'globalThis.started = (globalThis.started ?? 0) + 1; console.log(globalThis.started)')
  const fault = 'data:text/javascript,' + encodeURIComponent(`
    import { registerHooks } from 'node:module';
    let attempts = 0;
    registerHooks({load(url, context, next) {
      if (url.endsWith('/fixture.mjs') && attempts++ < ${failures}) throw Object.assign(new Error('fixture lock'), {code: '${code}'});
      return next(url, context);
    }});
  `)
  return spawnSync(process.execPath, ['--import', fault, '--import', HOST_MODULE_RETRY_IMPORT, target], {
    encoding: 'utf8', windowsHide: true, timeout: 5000,
  })
}

it('recovers transient module read locks without executing the module twice', () => {
  const result = run(2, 'EBUSY')
  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe('1')
})
it('reports persistent locks after a bounded retry and never hides other errors', () => {
  const locked = run(100, 'EBUSY')
  expect(locked.status).not.toBe(0)
  expect(locked.stderr).toContain('EBUSY')
  const missing = run(1, 'ENOENT')
  expect(missing.status).not.toBe(0)
  expect(missing.stderr).toContain('ENOENT')
})
