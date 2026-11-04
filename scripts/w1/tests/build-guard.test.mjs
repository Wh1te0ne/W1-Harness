import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { buildInPlace } from '../build-guard.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-guard-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'w1-guard-'))
    rmSync(root, { recursive: true, force: true })
  })
  const output = join(root, 'lib')
  const put = (relative, text) => {
    const path = join(output, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  put('main.js', 'old main')
  put('nested/chunk.js', 'old chunk')
  return { root, output, backup: output + '.w1-prev', put }
}

test('a successful build keeps its output and leaves no backup', t => {
  const f = fixture(t)
  buildInPlace(f.output, () => {
    writeFileSync(join(f.output, 'main.js'), 'new main')
    rmSync(join(f.output, 'nested'), { recursive: true })
  })
  assert.equal(readFileSync(join(f.output, 'main.js'), 'utf8'), 'new main')
  assert.equal(existsSync(join(f.output, 'nested')), false)
  assert.equal(existsSync(f.backup), false)
})

test('a failed build restores the previous output directory', t => {
  const f = fixture(t)
  assert.throws(() => buildInPlace(f.output, () => {
    writeFileSync(join(f.output, 'main.js'), 'half written')
    writeFileSync(join(f.output, 'nested/chunk.js'), 'half written')
    throw new Error('tsdown failed')
  }), /tsdown failed/)
  assert.equal(readFileSync(join(f.output, 'main.js'), 'utf8'), 'old main')
  assert.equal(readFileSync(join(f.output, 'nested/chunk.js'), 'utf8'), 'old chunk')
  assert.equal(existsSync(f.backup), false)
})

test('a build that deletes its output without replacing it is undone', t => {
  const f = fixture(t)
  assert.throws(() => buildInPlace(f.output, () => rmSync(f.output, { recursive: true })),
    /removed its output directory without writing a replacement/)
  assert.equal(readFileSync(join(f.output, 'main.js'), 'utf8'), 'old main')
  assert.equal(existsSync(f.backup), false)
})

test('a first build has nothing to restore', t => {
  const f = fixture(t)
  rmSync(f.output, { recursive: true })
  assert.throws(() => buildInPlace(f.output, () => { throw new Error('first build failed') }), /first build failed/)
  assert.equal(existsSync(f.output), false)
  assert.equal(existsSync(f.backup), false)
  buildInPlace(f.output, () => { mkdirSync(f.output); writeFileSync(join(f.output, 'main.js'), 'new main') })
  assert.equal(readFileSync(join(f.output, 'main.js'), 'utf8'), 'new main')
  assert.equal(existsSync(f.backup), false)
})

test('a stale backup from an interrupted run is replaced, not reused', t => {
  const f = fixture(t)
  mkdirSync(f.backup, { recursive: true })
  writeFileSync(join(f.backup, 'main.js'), 'stale backup')
  buildInPlace(f.output, () => writeFileSync(join(f.output, 'main.js'), 'new main'))
  assert.equal(readFileSync(join(f.output, 'main.js'), 'utf8'), 'new main')
  assert.equal(existsSync(f.backup), false)
})
