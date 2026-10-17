/** Export W1 Fold artwork from the canonical SVG using the desktop's locked Sharp dependency. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const sharp = require('sharp')
const root = new URL('../../assets/w1/', import.meta.url)
const output = new URL('exports/', root)
await mkdir(output, { recursive: true })
const master = await readFile(new URL('mark.svg', root), 'utf8')
const content = master.match(/  <g[\s\S]*<\/g>/)[0]
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n${body}\n</svg>\n`
const dark = svg(`<g fill="#17191F">${content}</g>`)
const light = svg(`<g fill="#FFFFFF">${content}</g>`)
const app = svg(`<rect x="16" y="16" width="480" height="480" rx="104" fill="#17191F"/>\n<g fill="#FFFFFF" transform="translate(51.2 51.2) scale(.8)">${content}</g>`)
const variants = { 'mark-dark': dark, 'mark-light': light, 'app-icon': app }
for (const [name, source] of Object.entries(variants)) {
  await writeFile(new URL(`${name}.svg`, output), source)
  for (const size of [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await sharp(Buffer.from(source)).resize(size, size).png().toFile(fileURLToPath(new URL(`${name}-${size}.png`, output)))
  }
}

// ICO stores lossless PNG frames; 0 in each dimension byte means 256 pixels.
const sizes = [16, 20, 24, 32, 48, 64, 128, 256]
const frames = await Promise.all(sizes.map((size) => readFile(new URL(`app-icon-${size}.png`, output))))
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
await writeFile(new URL('app-icon.ico', output), Buffer.concat([header, ...frames]))

const panel = (x, background, foreground) => `<rect x="${x}" y="100" width="360" height="370" rx="24" fill="${background}"/><g transform="translate(${x + 24} 120) scale(.61)" fill="${foreground}">${content}</g>`
let preview = `<rect width="1200" height="760" fill="#F1F2F4"/><text x="40" y="55" font-family="Arial" font-size="28" fill="#17191F">W1 / FOLD — v1.0</text>`
preview += panel(40, '#FFFFFF', '#17191F') + panel(420, '#17191F', '#FFFFFF')
preview += `<g transform="translate(820 130) scale(.64)">${app.replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`
preview += `<text x="40" y="525" font-family="Arial" font-size="18" fill="#17191F">Actual pixel sizes / 16 · 20 · 24 · 32 · 48 · 64 · 128</text>`
let x = 55
for (const size of sizes.slice(0, -1)) {
  preview += `<g transform="translate(${x} 560) scale(${size / 512})">${app.replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`
  preview += `<text x="${x}" y="720" font-family="Arial" font-size="14" fill="#555">${size}</text>`
  x += size + 48
}
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">${preview}</svg>`
await sharp(Buffer.from(board)).png().toFile(fileURLToPath(new URL('preview.png', root)))
console.log('Exported W1 Fold: 3 SVG variants, 30 PNGs, 8-frame ICO, preview.')
