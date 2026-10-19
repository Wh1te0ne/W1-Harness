import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { join, resolve, dirname, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { preparedProjectMatches } from '../prepared-project.mjs'
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-prepared-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'w1-prepared-'))
    rmSync(root, { recursive: true, force: true })
  })
  const put = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data)) }
  const app = join(root, 'apps/desktop'), runtime = join(root, 'runtime'), electron = join(root, 'electron.exe')
  put(join(app, 'lib/main.js'), '')
  put(join(root, 'apps/desktop-host/lib/index.js'), '')
  put(join(runtime, 'runtime.json'), {})
  put(join(app, 'package.json'), { version: '1.0.0' })
  put(join(app, 'node_modules/pnpm/package.json'), { version: '11.0.0' })
  put(electron, 'fixture binary')
  const descriptor = join(app, '.desktop-build/development/project/desktop-runtime.json')
  const release = { version: '1.0.0', nodeVersion: '24.21.0', pnpmVersion: '11.0.0', hostProtocolVersion: 4 }
  put(descriptor, { release })
  let probes = 0
  const options = { root, runtime, electron, cacheDirectory: join(root, 'cache'), hostProtocolVersion: 4,
    probeNodeVersion: () => { probes++; return '24.21.0' } }
  return { options, put, app, descriptor, release, probes: () => probes }
}
test('reuses the Electron version probe until the executable changes', t => {
  const f = fixture(t)
  assert.equal(preparedProjectMatches(f.options), true)
  assert.equal(preparedProjectMatches(f.options), true)
  assert.equal(f.probes(), 1)
  const changed = new Date(Date.now() + 10000)
  utimesSync(f.options.electron, changed, changed)
  assert.equal(preparedProjectMatches(f.options), true)
  assert.equal(f.probes(), 2)
})
test('invalidates prepared links for each release field instead of silently reusing stale links', t => {
  const f = fixture(t)
  for (const key of ['version', 'nodeVersion', 'pnpmVersion', 'hostProtocolVersion']) {
    f.put(f.descriptor, { release: { ...f.release, [key]: key === 'hostProtocolVersion' ? 5 : '999.0.0' } })
    assert.equal(preparedProjectMatches(f.options), false, key)
  }
  f.put(f.descriptor, { release: f.release })
  f.put(join(f.app, 'package.json'), { version: '1.1.0' })
  assert.equal(preparedProjectMatches(f.options), false)
})
test('missing built artifacts stop startup and a missing link descriptor requests preparation', t => {
  const f = fixture(t)
  rmSync(f.descriptor)
  assert.equal(preparedProjectMatches(f.options), false)
  rmSync(join(f.options.runtime, 'runtime.json'))
  assert.throws(() => preparedProjectMatches(f.options), /prepared artifact missing/)
})
