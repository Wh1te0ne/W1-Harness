import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerStartupRuntime, selectStartupRuntime, startupDirectoryDigest } from './startup-runtime.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const id = '588f84a6-491e-4d15-934a-c7d98bb50daa'
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-runtime-selection-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = join(root, '.work/local-dev/runtime-archives', id)
  mkdirSync(join(directory, 'app.asar.unpacked'), { recursive: true })
  mkdirSync(join(root, 'lib'))
  writeFileSync(join(root, 'lib/index.js'), 'one')
  writeFileSync(join(directory, 'app.asar'), 'archive')
  const manifest = { version: 1, inputs: [{ file: 'lib/index.js', sha256: hash('one') }],
    directories: [{ file: 'lib', sha256: startupDirectoryDigest(join(root, 'lib')) }], archiveSha256: hash('archive') }
  const save = () => { writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest)); registerStartupRuntime(root, id) }
  save()
  return { root, directory, manifest, save, expected: join(directory, 'app.asar/dsh') }
}

test('selects verified bytes, reuses validation, and accepts unchanged bytes with a new timestamp', t => {
  const f = fixture(t)
  assert.equal(selectStartupRuntime(f.root), f.expected)
  const first = readFileSync(join(f.directory, 'validated.json'), 'utf8')
  assert.equal(selectStartupRuntime(f.root), f.expected)
  assert.equal(readFileSync(join(f.directory, 'validated.json'), 'utf8'), first)
  utimesSync(join(f.root, 'lib/index.js'), new Date(), new Date(Date.now() + 2000))
  assert.equal(selectStartupRuntime(f.root), f.expected)
  assert.notEqual(readFileSync(join(f.directory, 'validated.json'), 'utf8'), first)
})

test('a published same-length update immediately stops selecting old code', t => {
  const f = fixture(t)
  assert.equal(selectStartupRuntime(f.root), f.expected)
  writeFileSync(join(f.root, 'lib/index.js'), 'two')
  const events = []
  assert.equal(selectStartupRuntime(f.root, event => events.push(event)), undefined)
  assert.deepEqual(events, [{ selected: false, reason: 'source-changed', file: 'lib/index.js' }])
})

test('a new output chunk invalidates the archive', t => {
  const f = fixture(t)
  assert.equal(selectStartupRuntime(f.root), f.expected)
  writeFileSync(join(f.root, 'lib/new.js'), 'new')
  assert.equal(selectStartupRuntime(f.root), undefined)
})

test('a frozen pending version is selected only after those bytes are installed', t => {
  const f = fixture(t)
  f.manifest.inputs[0].sha256 = hash('two'); f.save()
  assert.equal(selectStartupRuntime(f.root), undefined)
  writeFileSync(join(f.root, 'lib/index.js'), 'two')
  assert.equal(selectStartupRuntime(f.root), f.expected)
})

test('damaged archive and escaped manifest paths fail visibly', t => {
  const f = fixture(t)
  assert.equal(selectStartupRuntime(f.root), f.expected)
  writeFileSync(join(f.directory, 'app.asar'), 'corrupt')
  assert.throws(() => selectStartupRuntime(f.root), /checksum/)
  f.manifest.inputs[0].file = '../outside.js'; f.save()
  assert.throws(() => selectStartupRuntime(f.root), /escapes/)
})

test('no selected archive leaves the original startup path available', t => {
  const root = mkdtempSync(join(tmpdir(), 'w1-runtime-selection-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(selectStartupRuntime(root), undefined)
})
