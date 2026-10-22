import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { queuePackageBuild, publishPendingBuilds, recoverPendingBuilds } from '../pending-builds.mjs'
const journalPath = root => join(root, '.work/local-dev/pending-builds/apply-journal.json')
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

test('desktop and Host bundles use the same stopped-only publication', t => {
  const f = fixture(t)
  for (const target of ['apps/desktop', 'apps/desktop-host']) queuePackageBuild(f.root, target, f.stage)
  assert.throws(() => publishPendingBuilds(f.root, () => true), /Exit W1/)
  assert.equal(publishPendingBuilds(f.root, () => false), 2)
  assert.equal(readFileSync(join(f.root, 'apps/desktop/lib/client.js'), 'utf8'), 'new')
  assert.throws(() => queuePackageBuild(f.root, 'apps/other', f.stage), /Expected/)
})

test('the web frontend is published to dist only after W1 has stopped', t => {
  const f = fixture(t)
  const active = join(f.root, 'apps/web/dist/client.js')
  f.put(active, 'old web')
  queuePackageBuild(f.root, 'apps/web', f.stage)
  assert.equal(readFileSync(active, 'utf8'), 'old web')
  assert.throws(() => publishPendingBuilds(f.root, () => true), /Exit W1/)
  assert.equal(readFileSync(active, 'utf8'), 'old web')
  assert.equal(publishPendingBuilds(f.root, () => false), 1)
  assert.equal(readFileSync(active, 'utf8'), 'new')
  assert.equal(existsSync(join(f.root, 'apps/web/lib')), false)
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
  assert.throws(() => queuePackageBuild(f.root, '../other', f.stage), /package or desktop/)
  queuePackageBuild(f.root, f.target, f.stage)
  const manifest = join(f.root, '.work/local-dev/pending-builds/packages-client-example.json')
  const item = JSON.parse(readFileSync(manifest, 'utf8'))
  item.entries[0].file = '../outside.js'
  f.put(manifest, JSON.stringify(item))
  assert.throws(() => publishPendingBuilds(f.root, () => false), /escapes/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
})
test('a failed publication restores earlier destinations and keeps the queue for retry', t => {
  const f = fixture(t)
  const queue = join(f.root, '.work/local-dev/pending-builds')
  f.put(join(f.root, 'packages/zeta'), 'file where the output directory belongs')
  queuePackageBuild(f.root, f.target, f.stage)
  queuePackageBuild(f.root, 'packages/zeta/block', f.stage)
  assert.throws(() => publishPendingBuilds(f.root, () => false), /ENOTDIR|EEXIST|ENOENT/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
  assert.equal(existsSync(join(f.root, 'packages/client/example/lib.w1-prev')), false)
  assert.equal(existsSync(join(f.root, 'packages/client/example/lib.w1-next')), false)
  assert.equal(existsSync(journalPath(f.root)), false)
  assert.equal(existsSync(join(queue, 'packages-client-example.json')), true)
  assert.equal(existsSync(join(queue, 'packages-zeta-block.json')), true)
  rmSync(join(f.root, 'packages/zeta'), { force: true })
  assert.equal(publishPendingBuilds(f.root, () => false), 2)
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
  assert.equal(existsSync(join(f.root, 'packages/client/example/lib.w1-prev')), false)
  assert.equal(existsSync(f.stage), true)
})
test('an interrupted swap is undone before the next launch reads build output', t => {
  const f = fixture(t)
  const lib = dirname(f.active)
  renameSync(lib, lib + '.w1-prev')
  f.put(join(lib, 'client.js'), 'new')
  f.put(join(lib + '.w1-next', 'client.js'), 'new')
  f.put(journalPath(f.root), JSON.stringify({
    version: 1, state: 'swapped',
    batches: [{ target: f.target, destination: 'packages/client/example/lib', stage: '.work/local-dev/pending-artifacts/one', state: 'swapped' }],
  }))
  assert.equal(recoverPendingBuilds(f.root, () => false), 1)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
  assert.equal(existsSync(lib + '.w1-prev'), false)
  assert.equal(existsSync(lib + '.w1-next'), false)
  assert.equal(existsSync(journalPath(f.root)), false)
})
test('a publication recorded as committed keeps its new output and drops the backup', t => {
  const f = fixture(t)
  const lib = dirname(f.active)
  renameSync(lib, lib + '.w1-prev')
  f.put(join(lib, 'client.js'), 'new')
  f.put(journalPath(f.root), JSON.stringify({
    version: 1, state: 'committed',
    batches: [{ target: f.target, destination: 'packages/client/example/lib', stage: '.work/local-dev/pending-artifacts/one', state: 'committed' }],
  }))
  assert.equal(recoverPendingBuilds(f.root, () => false), 0)
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
  assert.equal(existsSync(lib + '.w1-prev'), false)
  assert.equal(existsSync(journalPath(f.root)), false)
})

test('a partial overlay preserves omitted runtime files and never overwrites its backup inode', t => {
  const f = fixture(t)
  const runtime = join(dirname(f.active), 'types/protocol.js')
  f.put(runtime, 'runtime subpath')
  queuePackageBuild(f.root, f.target, f.stage)
  publishPendingBuilds(f.root, () => false)
  assert.equal(readFileSync(runtime, 'utf8'), 'runtime subpath')
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
})

test('identical output is validated but not replaced', t => {
  const f = fixture(t)
  f.put(f.active, 'new')
  f.put(join(dirname(f.active), 'client.chunk.js'), 'new chunk')
  const before = statSync(f.active)
  queuePackageBuild(f.root, f.target, f.stage)
  const progress = []
  publishPendingBuilds(f.root, () => false, event => progress.push(event))
  assert.equal(statSync(f.active).ino, before.ino)
  assert.equal(statSync(f.active).mtimeMs, before.mtimeMs)
  assert.equal(progress.at(-1).skipped, 1)
  assert.equal(progress.at(-1).changed, 0)
})

test('recovery refuses an active W1 and validates every destination before deleting anything', t => {
  const f = fixture(t)
  const lib = dirname(f.active)
  renameSync(lib, lib + '.w1-prev')
  f.put(join(lib, 'client.js'), 'new')
  const record = { version: 1, state: 'swapped', batches: [
    { target: f.target, destination: 'packages/client/example/lib', state: 'swapped' },
  ] }
  f.put(journalPath(f.root), JSON.stringify(record))
  assert.throws(() => recoverPendingBuilds(f.root, () => true), /Exit W1/)
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
  record.batches.push({ target: f.target, destination: '../outside', state: 'swapped' })
  f.put(journalPath(f.root), JSON.stringify(record))
  assert.throws(() => recoverPendingBuilds(f.root, () => false), /escapes/)
  assert.equal(readFileSync(f.active, 'utf8'), 'new')
  assert.equal(readFileSync(join(lib + '.w1-prev', 'client.js'), 'utf8'), 'old')
})

test('another launch cannot enter publication while the owner is alive', t => {
  const f = fixture(t)
  queuePackageBuild(f.root, f.target, f.stage)
  f.put(join(f.root, '.work/local-dev/apply.lock'), String(process.pid))
  assert.throws(() => publishPendingBuilds(f.root, () => false), /already in progress/)
  assert.equal(readFileSync(f.active, 'utf8'), 'old')
})
