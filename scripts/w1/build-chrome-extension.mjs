/** Bundle an unpacked MV3 extension; never install it or launch Chrome. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = join(root, 'packages/w1/chrome-use')
const stage = join(root, '.work/chrome-extension', randomUUID())
const manifest = JSON.parse(readFileSync(join(source, 'extension/manifest.json'), 'utf8'))
const delivery = resolve(root, 'releases/w1-chrome', manifest.version)
const stageOnly = process.argv.includes('--stage-only')
if (!stageOnly && existsSync(delivery)) throw new Error(`Immutable extension release already exists: ${delivery}`)
mkdirSync(stage, { recursive: true })
cpSync(join(source, 'extension'), stage, { recursive: true })
for (const file of new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])) {
  if (!existsSync(join(stage, file))) throw new Error(`Missing extension icon: ${file}`)
}
await build({ config: false, cwd: root, entry: { worker: join(source, 'src/worker.ts') }, outDir: stage,
  platform: 'browser', format: ['esm'], target: 'chrome116', fixedExtension: false, dts: false, clean: false,
  deps: { alwaysBundle: [/./u] }, outputOptions: { codeSplitting: false },
  alias: {
    '@deepseek-ai/dsh-w1-browser-use/page': join(root, 'packages/w1/browser-use/src/page.ts'),
    '@deepseek-ai/dsh-w1-browser-use/protocol': join(root, 'packages/w1/browser-use/src/protocol.ts'),
  },
})
const worker = readFileSync(join(stage, 'worker.js'), 'utf8')
if (/from\s+["'](?:node:|@deepseek-ai\/|zod)|\brequire\(/u.test(worker)) throw new Error('Extension contains an unbundled runtime import')
const digest = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)
const id = [...digest].flatMap(byte => [byte >> 4, byte & 15]).map(nibble => String.fromCharCode(97 + nibble)).join('')
if (!readFileSync(join(source, 'src/identity.ts'), 'utf8').includes(`chrome-extension://${id}`)) throw new Error('Extension identity does not match bridge origin')
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name
    return entry.isDirectory() ? files(join(directory, entry.name), relative + '/') : [relative]
  })
}
const checksums = Object.fromEntries(files(stage).map(file => [file, createHash('sha256').update(readFileSync(join(stage, file))).digest('hex')]))
writeFileSync(join(stage, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n')
if (!stageOnly) {
  mkdirSync(join(root, 'releases/w1-chrome'), { recursive: true })
  cpSync(stage, delivery, { recursive: true, errorOnExist: true, force: false })
}
console.info(`Chrome extension ${manifest.version} built (not installed): ${stageOnly ? stage : delivery}`)
console.info(`Extension id: ${id}`)
