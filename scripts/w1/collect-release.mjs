/** Collect immutable W1 assets only after matching the updater's hashes to the actual installer. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const root = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const yaml = require('js-yaml')
const product = JSON.parse(readFileSync(join(root, 'apps/desktop/w1-product.json'), 'utf8'))
const channel = product.version.includes('-') ? product.version.split('-')[1].split('.')[0] : 'latest'
const artifacts = join(root, 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts')
const feed = yaml.load(readFileSync(join(artifacts, `${channel}.yml`), 'utf8'))
if (feed.version !== product.version || !Array.isArray(feed.files) || !feed.files.length) throw new Error('W1 update metadata mismatch')
for (const file of feed.files) {
  if (typeof file.url !== 'string' || /[/\\]/u.test(file.url)) throw new Error('Expected a local release asset name')
  const bytes = readFileSync(join(artifacts, file.url))
  if (bytes.length !== file.size || createHash('sha512').update(bytes).digest('base64') !== file.sha512) {
    throw new Error('Installer does not match updater metadata')
  }
}
const delivery = join(root, 'releases', product.version)
if (existsSync(delivery)) throw new Error('Release directory already exists; published versions are immutable')
const output = join(root, '.work/release-collection', randomUUID())
mkdirSync(output, { recursive: true })
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replaceAll('\r\n', '\n')
const heading = `## ${product.version}\n`
const start = changelog.indexOf(heading)
if (start < 0) throw new Error('CHANGELOG has no section for the release version')
const next = changelog.indexOf('\n## ', start + heading.length)
const notes = changelog.slice(start, next < 0 ? undefined : next).trim() + '\n'
const releaseNotes = notes
  .replaceAll('](docs/', '](https://github.com/Wh1te0ne/W1-Harness/blob/main/docs/')
writeFileSync(join(output, 'RELEASE_NOTES.md'), releaseNotes)
const updateAssets = new Set([`${channel}.yml`, ...feed.files.flatMap(file =>
  [file.url, ...existsSync(join(artifacts, `${file.url}.blockmap`)) ? [`${file.url}.blockmap`] : []])])
for (const file of updateAssets) {
  copyFileSync(join(artifacts, file), join(output, file))
}
// Installed alpha/beta clients keep their old feed name until they install the numbered release.
if (channel === 'latest') {
  for (const previous of ['alpha', 'beta']) copyFileSync(join(output, 'latest.yml'), join(output, `${previous}.yml`))
}
const chrome = JSON.parse(readFileSync(join(root, 'packages/w1/chrome-use/extension/manifest.json'), 'utf8'))
const extension = join(root, 'releases/w1-chrome', chrome.version)
if (!existsSync(join(extension, 'manifest.json'))) throw new Error('Build the Chrome extension before collecting assets')
execFileSync('tar', ['-a', '-cf', join(output, `w1-chrome-${chrome.version}.zip`), '-C', extension, '.'], { windowsHide: true })
const relay = join(root, 'apps/w1-remote')
const relayVersion = JSON.parse(readFileSync(join(relay, 'package.json'), 'utf8')).version
const mobileVersion = /versionName\s+['"](\d+\.\d+\.\d+)['"]/u.exec(readFileSync(join(relay, 'android/app/build.gradle'), 'utf8'))?.[1]
if (!mobileVersion || !/^\d+\.\d+\.\d+$/u.test(relayVersion)) throw new Error('Invalid companion component version')
const relayPayload = join(root, '.work/relay-publication', randomUUID())
mkdirSync(relayPayload, { recursive: true })
for (const name of ['Dockerfile', 'compose.yaml', '.dockerignore', 'package.json', 'relay.mjs', 'crypto.mjs']) {
  copyFileSync(join(relay, name), join(relayPayload, name))
}
writeFileSync(join(relayPayload, 'README.md'), readFileSync(join(relay, 'README.md'), 'utf8')
  .replaceAll('](../../docs/', '](https://github.com/Wh1te0ne/W1-Harness/blob/main/docs/'))
execFileSync('tar', ['-a', '-cf', join(output, `w1-relay-${relayVersion}.zip`), '-C', relayPayload, '.'], { windowsHide: true })
const apkName = `W1-Harness-Mobile-${mobileVersion}.apk`
const apk = join(root, `.work/deliveries/w1-mobile-${mobileVersion}`, apkName)
if (existsSync(apk)) copyFileSync(apk, join(output, apkName))
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
const runtimeCommit = process.env.W1_RUNTIME_SOURCE_COMMIT ?? commit
if (!/^[a-f0-9]{40}$/u.test(runtimeCommit)) throw new Error('Runtime source commit must be a full commit ID')
writeFileSync(join(output, 'components.json'), JSON.stringify({ product: product.version, upstream: product.upstreamTag, commit, runtimeCommit,
  chrome: chrome.version, mobile: existsSync(apk) ? mobileVersion : null, relay: relayVersion, relayProtocol: 1,
  platform: 'win32', arch: 'x64', authenticode: false }, null, 2) + '\n')
const sums = readdirSync(output).sort().map(name => `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}`)
writeFileSync(join(output, 'SHA256SUMS'), sums.join('\n') + '\n')
mkdirSync(join(root, 'releases'), { recursive: true })
if (existsSync(delivery)) throw new Error('A concurrent collector already created this version')
renameSync(output, delivery)
console.info(`Collected verified release assets: ${delivery}`)
