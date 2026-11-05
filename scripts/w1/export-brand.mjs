/** Derive platform sizes from the pinned W1 Brand product assets. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const sharp = require('sharp')
const root = new URL('../../assets/w1/', import.meta.url)
const output = new URL('exports/', root)
await mkdir(output, { recursive: true })
const pinned = JSON.parse(await readFile(new URL('brand/source.json', root), 'utf8'))
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(pinned.version) || pinned.product !== 'harness') throw new Error('Invalid W1 Brand pin')
async function asset(name) {
  const bytes = await readFile(new URL(`brand/${pinned.version}/${name}`, root))
  if (createHash('sha256').update(bytes).digest('hex') !== pinned.files[name]) throw new Error(`Pinned brand asset changed: ${name}`)
  return bytes
}
const master = await asset('src/brand/w1-fold.svg')
await writeFile(new URL('mark.svg', root), master)
const dark = (await asset('dist/brand/light/w1-mark.svg')).toString()
const light = (await asset('dist/brand/dark/w1-mark.svg')).toString()
const appLight = (await asset('dist/products/harness/light/app-icon.svg')).toString()
const appDark = (await asset('dist/products/harness/dark/app-icon.svg')).toString()
const appPng = { light: await asset('dist/products/harness/light/app-icon.png'), dark: await asset('dist/products/harness/dark/app-icon.png') }
const variants = { 'mark-dark': dark, 'mark-light': light, 'app-icon': appLight, 'app-icon-light': appLight, 'app-icon-dark': appDark }
for (const [name, source] of Object.entries(variants)) {
  await writeFile(new URL(`${name}.svg`, output), source)
  for (const size of [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    const input = name.startsWith('app-icon') ? appPng[name === 'app-icon-dark' ? 'dark' : 'light'] : Buffer.from(source)
    const destination = new URL(`${name}-${size}.png`, output)
    if (name.startsWith('app-icon') && size === 1024) await writeFile(destination, input)
    else await sharp(input).resize(size, size).png().toFile(fileURLToPath(destination))
  }
}

// Render the transparent delivery images directly from vectors at their target density.
for (const [name, source] of [['mark-dark', dark], ['mark-light', light]]) {
  await sharp(Buffer.from(source), { density: 1152 }).resize(8192, 8192).png()
    .toFile(fileURLToPath(new URL(`${name}-8192.png`, output)))
}

// ICO stores lossless PNG frames; 0 in each dimension byte means 256 pixels.
const sizes = [16, 20, 24, 32, 48, 64, 128, 256]
for (const name of Object.keys(variants)) {
const frames = await Promise.all(sizes.map((size) => readFile(new URL(`${name}-${size}.png`, output))))
const header = Buffer.alloc(6 + 16 * sizes.length)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
frames.forEach((frame, i) => {
  const entry = 6 + 16 * i
  header[entry] = sizes[i] % 256
  header[entry + 1] = sizes[i] % 256
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(new URL(`${name}.ico`, output), Buffer.concat([header, ...frames]))
}

// Product copies share the canonical artwork; immutable release directories are not touched.
for (const [source, target] of [
  ['mark-dark.ico', '../../apps/desktop/resources/w1-mark-dark.ico'],
  ['mark-light.ico', '../../apps/desktop/resources/w1-mark-light.ico'],
  ['app-icon-dark.ico', '../../apps/desktop/resources/w1-app-dark.ico'],
  ['app-icon-light.ico', '../../apps/desktop/resources/w1-app-light.ico'],
  ['mark-dark.svg', '../../packages/w1/chrome-use/extension/mark.svg'],
]) await copyFile(new URL(source, output), new URL(target, root))
for (const size of [16, 32, 48, 128]) {
  await copyFile(new URL(`app-icon-dark-${size}.png`, output), new URL(`../../packages/w1/chrome-use/extension/app-icon-${size}.png`, root))
}
for (const size of [16, 32, 128]) {
  await copyFile(new URL(`app-icon-dark-${size}.png`, output), new URL(`../../packages/w1/chrome-use/extension/icon-${size}.png`, root))
}
await writeFile(new URL('../../apps/w1-remote/mobile/mark.svg', root), master)
await copyFile(new URL('app-icon-dark-1024.png', output), new URL('../../apps/w1-remote/android/app/src/main/res/drawable/w1_icon.png', root))

const logos = {}
for (const theme of ['light', 'dark']) {
  const logo = await asset(`dist/products/harness/${theme}/interface-logo.svg`)
  logos[theme] = 'data:image/svg+xml;base64,' + logo.toString('base64')
  await writeFile(new URL(`interface-logo-${theme}.svg`, output), logo)
  await writeFile(new URL(`wordmark-${theme}.svg`, output), await asset(`dist/products/harness/${theme}/wordmark.svg`))
  await writeFile(new URL(`../../apps/w1-remote/mobile/interface-logo-${theme}.svg`, root), logo)
}
const config = JSON.parse((await asset('brand.json')).toString())
const width = config.policy.interfaceMinimumWidthPx
const height = width * config.layout.interface.canvas[1] / config.layout.interface.canvas[0]
await writeFile(new URL('../../packages/client/ui-brand-official/src/client/brand-assets.ts', root),
  `/** W1 Brand ${pinned.version}; generated by scripts/w1/export-brand.mjs from the pinned SVGs. */\n\n/** Paired interface assets and their minimum display dimensions. */\nexport const harnessLogo = {\n  light: '${logos.light}',\n  dark: '${logos.dark}',\n  width: ${width},\n  height: ${height},\n} as const\n`)
await writeFile(new URL('preview.png', root), await asset('dist/previews/harness-light-dark.png'))
await writeFile(new URL('../../apps/web/public/favicon.svg', root), appLight)
await writeFile(new URL('../../apps/web/public/favicon-dark.svg', root), appDark)
const webManifestUrl = new URL('../../apps/web/public/manifest.webmanifest', root)
const webManifest = JSON.parse(await readFile(webManifestUrl, 'utf8'))
Object.assign(webManifest, { name: 'W1 Harness', short_name: 'W1 Harness' })
await writeFile(webManifestUrl, JSON.stringify(webManifest, null, 2) + '\n')
execFileSync(process.execPath, ['--import', 'tsx/esm', fileURLToPath(new URL('../../apps/web/scripts/render-app-icons.ts', root))],
  { cwd: fileURLToPath(new URL('../..', root)), stdio: 'inherit', windowsHide: true })
console.log(`Exported W1 Harness from W1 Brand ${pinned.version}: paired logos, platform PNG/ICO sizes and product copies.`)
