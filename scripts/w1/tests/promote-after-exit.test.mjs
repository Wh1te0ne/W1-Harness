import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { applyPreparedPromotion, BOOTSTRAP_SOURCES } from '../promote-after-exit.mjs'
import { resumePromotion } from '../resume-promotion.mjs'
import { installPromotionBootstrap } from '../install-promotion-bootstrap.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-promotion-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'w1-promotion-'))
    rmSync(root, { recursive: true, force: true })
  })
  const id = randomUUID(), directory = join(root, '.work/daily-updates', id)
  const file = 'packages/client/demo/src/index.ts', target = 'packages/client/demo'
  const put = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value) }
  put(join(root, file), 'old source')
  put(join(directory, 'backup', file), 'old source')
  put(join(directory, 'sources', file), 'new source')
  put(join(root, target, 'lib/index.js'), 'old bundle')
  put(join(root, target, 'lib/types/protocol.js'), 'retained')
  put(join(directory, 'bundles', target, 'index.js'), 'new bundle')
  put(join(directory, 'runtime-backup', target, 'index.js'), 'old bundle')
  mkdirSync(join(root, 'scripts/w1'), { recursive: true })
  copyFileSync(fileURLToPath(new URL('../pending-builds.mjs', import.meta.url)), join(root, 'scripts/w1/pending-builds.mjs'))
  put(join(directory, 'manifest.json'), JSON.stringify({
    id, dailyRoot: root,
    sources: [{ file, before: hash('old source'), sha256: hash('new source') }],
    bundles: [{ target, entries: [{ file: 'index.js', sha256: hash('new bundle'), before: hash('old bundle') }] }],
  }))
  return { root, id, directory, file, target, put }
}

test('never changes a running daily application', async t => {
  const f = fixture(t)
  await assert.rejects(applyPreparedPromotion(f.directory, () => true), /Exit W1/)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'old source')
  assert.equal(existsSync(join(f.root, '.work/local-dev/promotion.lock')), false)
})
test('detects daily edits and altered candidates before changing any file', async t => {
  const f = fixture(t)
  f.put(join(f.root, f.file), 'someone else edited')
  await assert.rejects(applyPreparedPromotion(f.directory, () => false), /Daily source changed/)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'someone else edited')
  f.put(join(f.root, f.file), 'old source')
  f.put(join(f.directory, 'bundles', f.target, 'index.js'), 'tampered')
  await assert.rejects(applyPreparedPromotion(f.directory, () => false), /Candidate bundle changed/)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'old source')
})
test('applies source and bundles after exit while retaining runtime subpaths and backups', async t => {
  const f = fixture(t)
  assert.equal(await applyPreparedPromotion(f.directory, () => false), 1)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'new source')
  assert.equal(readFileSync(join(f.root, f.target, 'lib/index.js'), 'utf8'), 'new bundle')
  assert.equal(readFileSync(join(f.root, f.target, 'lib/types/protocol.js'), 'utf8'), 'retained')
  assert.equal(readFileSync(join(f.directory, 'backup', f.file), 'utf8'), 'old source')
  assert.equal(JSON.parse(readFileSync(join(f.directory, 'status.json'), 'utf8')).phase, 'applied')
  assert.equal(existsSync(join(f.root, '.work/local-dev/promotion.lock')), false)
})

test('a cold launch resumes a persisted handoff after its waiting process is gone', async t => {
  const f = fixture(t)
  f.put(join(f.root, '.work/local-dev/pending-promotion.json'), JSON.stringify({ id: f.id }))
  f.put(join(f.directory, 'status.json'), JSON.stringify({ phase: 'waiting-for-exit', pid: 99999999, sourceApplied: false }))
  assert.equal(await resumePromotion(f.root, () => false), 1)
  assert.equal(await resumePromotion(f.root, () => false), 0)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'new source')
})

test('a cold launch refuses an interrupted publication instead of overwriting its recovery state', async t => {
  const f = fixture(t)
  f.put(join(f.root, '.work/local-dev/pending-promotion.json'), JSON.stringify({ id: f.id }))
  f.put(join(f.directory, 'status.json'), JSON.stringify({ phase: 'applying-source', sourceApplied: false }))
  await assert.rejects(resumePromotion(f.root, () => false), /needs recovery/)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'old source')
})

test('installs only the launch entry now and applies the rest on the next cold launch', async t => {
  const f = fixture(t)
  const manifestFile = join(f.directory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  for (const file of BOOTSTRAP_SOURCES) {
    f.put(join(f.root, file), 'old launcher')
    f.put(join(f.directory, 'backup', file), 'old launcher')
    f.put(join(f.directory, 'sources', file), 'new launcher')
    manifest.sources.push({ file, before: hash('old launcher'), sha256: hash('new launcher') })
  }
  f.put(manifestFile, JSON.stringify(manifest))
  f.put(join(f.directory, 'status.json'), JSON.stringify({ phase: 'prepared', sourceApplied: false }))
  const installed = installPromotionBootstrap(f.directory)
  assert.equal(installed.at(-1), 'scripts/w1/Start-W1.ps1')
  assert.equal(readFileSync(join(f.root, 'scripts/w1/Start-W1.ps1'), 'utf8'), 'new launcher')
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'old source')
  assert.equal(readFileSync(join(f.root, f.target, 'lib/index.js'), 'utf8'), 'old bundle')
  assert.equal(JSON.parse(readFileSync(join(f.root, '.work/local-dev/pending-promotion.json'), 'utf8')).id, f.id)
  installPromotionBootstrap(f.directory)
  await assert.rejects(resumePromotion(f.root, () => true), /Exit W1/)
  assert.equal(await resumePromotion(f.root, () => false), 1)
  assert.equal(readFileSync(join(f.root, f.target, 'lib/index.js'), 'utf8'), 'new bundle')
})

test('preinstallation cannot authorize edits to application code', async t => {
  const f = fixture(t)
  const file = join(f.directory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  manifest.sources[0].preinstalled = true
  f.put(file, JSON.stringify(manifest))
  await assert.rejects(applyPreparedPromotion(f.directory, () => false), /Unsupported bootstrap source/)
  assert.equal(readFileSync(join(f.root, f.file), 'utf8'), 'old source')
})
