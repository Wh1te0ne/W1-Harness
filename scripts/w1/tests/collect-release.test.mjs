import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const work = join(repository, '.work')

function fixture(t, { mobile = true, validHash = true } = {}) {
  mkdirSync(work, { recursive: true })
  const root = mkdtempSync(join(work, 'release-assets-'))
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(work) + sep + 'release-assets-'))
    rmSync(root, { recursive: true, force: true })
  })
  const put = (relative, content) => {
    const file = join(root, relative)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  put('apps/desktop/package.json', '{}')
  put('apps/desktop/w1-product.json', JSON.stringify({ version: '0.2.0', upstreamTag: 'dsh-v0.2.1-rc.2' }))
  put('CHANGELOG.md', '# Releases\n\n## 0.2.0\n\nCurrent changes.\n\n## 0.1.0-alpha.4\n\nPrevious changes.\n')
  const executable = Buffer.from('installer fixture')
  const sha512 = createHash('sha512').update(executable).digest('base64')
  const artifacts = 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/'
  put(artifacts + 'w1.exe', executable)
  put(artifacts + 'w1.exe.blockmap', 'blockmap fixture')
  put(artifacts + 'latest.yml', JSON.stringify({ version: '0.2.0', files: [
    { url: 'w1.exe', size: executable.length, sha512: validHash ? sha512 : 'wrong' },
  ] }))
  put('packages/w1/chrome-use/extension/manifest.json', JSON.stringify({ version: '0.2.6' }))
  put('releases/w1-chrome/0.2.6/manifest.json', JSON.stringify({ version: '0.2.6' }))
  put('releases/w1-chrome/0.2.6/worker.js', '// extension fixture')
  put('apps/w1-remote/package.json', JSON.stringify({ version: '0.1.1' }))
  put('apps/w1-remote/android/app/build.gradle', "versionName '0.1.1'\n")
  for (const file of ['Dockerfile', 'compose.yaml', '.dockerignore', 'relay.mjs', 'crypto.mjs', 'README.md']) {
    put('apps/w1-remote/' + file, 'relay fixture')
  }
  if (mobile) put('.work/deliveries/w1-mobile-0.1.1/W1-Harness-Mobile-0.1.1.apk', 'mobile fixture')
  put('scripts/w1/collect-release.mjs', '')
  copyFileSync(join(repository, 'scripts/w1/collect-release.mjs'), join(root, 'scripts/w1/collect-release.mjs'))
  return { root, delivery: join(root, 'releases/0.2.0'), run: () => execFileSync(process.execPath,
    [join(root, 'scripts/w1/collect-release.mjs')], { cwd: root, windowsHide: true, encoding: 'utf8' }) }
}

test('numbered releases retain old-client feeds, current component versions and only their own notes', t => {
  const f = fixture(t)
  f.run()
  assert.deepEqual(readFileSync(join(f.delivery, 'alpha.yml')), readFileSync(join(f.delivery, 'latest.yml')))
  assert.deepEqual(readFileSync(join(f.delivery, 'beta.yml')), readFileSync(join(f.delivery, 'latest.yml')))
  const components = JSON.parse(readFileSync(join(f.delivery, 'components.json'), 'utf8'))
  assert.equal(components.mobile, '0.1.1')
  assert.equal(components.relay, '0.1.1')
  assert.ok(existsSync(join(f.delivery, 'W1-Harness-Mobile-0.1.1.apk')))
  assert.ok(!existsSync(join(f.delivery, 'W1-Harness-Mobile-0.1.0.apk')))
  assert.equal(readFileSync(join(f.delivery, 'RELEASE_NOTES.md'), 'utf8'), '## 0.2.0\n\nCurrent changes.\n')
  for (const line of readFileSync(join(f.delivery, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
    const [digest, name] = line.split('  ')
    assert.equal(createHash('sha256').update(readFileSync(join(f.delivery, name))).digest('hex'), digest)
  }
  const repeated = spawnSync(process.execPath, [join(f.root, 'scripts/w1/collect-release.mjs')], {
    cwd: f.root, windowsHide: true, encoding: 'utf8',
  })
  assert.notEqual(repeated.status, 0)
  assert.match(repeated.stderr, /published versions are immutable/)
})

test('missing optional mobile artifacts remain absent instead of falling back to an older APK', t => {
  const f = fixture(t, { mobile: false })
  f.run()
  assert.equal(JSON.parse(readFileSync(join(f.delivery, 'components.json'), 'utf8')).mobile, null)
})

test('a mismatched updater hash prevents creation of the release directory', t => {
  const f = fixture(t, { validHash: false })
  const result = spawnSync(process.execPath, [join(f.root, 'scripts/w1/collect-release.mjs')], {
    cwd: f.root, windowsHide: true, encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Installer does not match updater metadata/)
  assert.ok(!existsSync(f.delivery))
})
