import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { queuePackageBuild, publishPendingBuilds } from '../pending-builds.mjs'
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-pending-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'w1-pending-'))
    rmSync(root, { recursive: true, force: true })
  })
  const target = 'packages/client/example'
  const stage = join(root, '.work/local-dev/pending-artifacts/one')
  const active = join(root, target, 'lib/client.js')
  const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
  put(active, 'old')
  put(join(stage, 'client.js'), 'new')
  put(join(stage, 'client.chunk.js'), 'new chunk')
  return { root, target, stage, active, put }
}
test('build completion leaves active files alone and promotion waits until W1 is closed', t => {
  const f = fixture(t)
  queuePackageBuild(f.root, f.target, f.stage)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
  assert.throws(() => publishPendingBuilds(f.root, () => true), /Exit W1/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
  assert.equal(publishPendingBuilds(f.root, () => false), 1)
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
  assert.equal(readFileSync(join(dirname(f.active), 'client.chunk.js'), 'utf8'), 'new chunk')
  assert.equal(publishPendingBuilds(f.root, () => { throw Error('should not probe') }), 0)
})
test('partial builds are ignored and only the latest completed build is queued', t => {
  const f = fixture(t)
  assert.equal(publishPendingBuilds(f.root, () => false), 0)
  queuePackageBuild(f.root, f.target, f.stage)
  const next = join(f.root, '.work/local-dev/pending-artifacts/two')
  f.put(join(next, 'client.js'), 'newest')
  queuePackageBuild(f.root, f.target, next)
  publishPendingBuilds(f.root, () => false)
  assert.equal(readFileSync(f.active, 'utf8'), 'newest')
})
test('changed queued bytes stop startup before any active file is modified', t => {
  const f = fixture(t)
  queuePackageBuild(f.root, f.target, f.stage)
  f.put(join(f.stage, 'client.chunk.js'), 'incomplete')
  assert.throws(() => publishPendingBuilds(f.root, () => false), /changed after completion/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
  assert.equal(existsSync(join(f.root, '.work/local-dev/pending-builds/packages-client-example.json')), true)
})
test('rejects destinations outside package build output', t => {
  const f = fixture(t)
  assert.throws(() => queuePackageBuild(f.root, '../other', f.stage), /package target/)
  queuePackageBuild(f.root, f.target, f.stage)
  const manifest = join(f.root, '.work/local-dev/pending-builds/packages-client-example.json')
  const item = JSON.parse(readFileSync(manifest, 'utf8'))
  item.entries[0].file = '../outside.js'
  f.put(manifest, JSON.stringify(item))
  assert.throws(() => publishPendingBuilds(f.root, () => false), /escapes/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
})
