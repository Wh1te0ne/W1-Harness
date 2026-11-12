/**
 * Resize the pinned W1 Brand PNGs for Web installation. Each platform role
 * uses its designated source so the maskable safe zone and alpha are preserved.
 * @module render-app-icons
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const brandRoot = new URL('../../../assets/w1/brand/', import.meta.url)

/** Directory the generated PNGs are committed to. */
export const ICON_OUTPUT_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url))

/** Radius a platform mask is guaranteed to show, as a fraction of the icon edge. */
export const MASKABLE_SAFE_RADIUS_RATIO = 0.4

const sources = {
  any: 'app-icon-foreground.png',
  maskable: 'app-icon-maskable.png',
  apple: 'app-icon.png',
} as const

/** One Web install icon and the W1 Brand asset that supplies it. */
export interface AppIconVariant {
  /** File name inside `public/`. */
  readonly file: string
  /** Square edge in pixels. */
  readonly size: number
  /** Platform role, which determines the source's alpha and safe zone. */
  readonly kind: keyof typeof sources
}

/** The manifest icons and the iOS touch icon, in declaration order. */
export const APP_ICON_VARIANTS: readonly AppIconVariant[] = [
  { file: 'icon-192.png', size: 192, kind: 'any' },
  { file: 'icon-512.png', size: 512, kind: 'any' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'apple' },
]

/**
 * Verify and resize the PNGs from the pinned W1 Brand snapshot.
 * @returns One PNG per {@link APP_ICON_VARIANTS} entry, in declaration order.
 */
export async function renderAppIcons(): Promise<readonly { variant: AppIconVariant; png: Buffer }[]> {
  const pin: { version: string; product: string; files: Record<string, string> } = JSON.parse(
    await readFile(new URL('source.json', brandRoot), 'utf8'),
  )
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(pin.version) || pin.product !== 'harness') {
    throw new Error('Invalid W1 Brand pin')
  }
  const { default: sharp } = await import('sharp')
  return Promise.all(APP_ICON_VARIANTS.map(async (variant) => {
    const file = `dist/products/harness/light/${sources[variant.kind]}`
    const input = await readFile(new URL(`${pin.version}/${file}`, brandRoot))
    if (createHash('sha256').update(input).digest('hex') !== pin.files[file]) {
      throw new Error(`Pinned brand asset changed: ${file}`)
    }
    const png = await sharp(input).resize(variant.size, variant.size).png().toBuffer()
    return { variant, png }
  }))
}

async function main(): Promise<void> {
  const icons = await renderAppIcons()
  await Promise.all(icons.map(async ({ variant, png }) => {
    await writeFile(resolve(ICON_OUTPUT_DIRECTORY, variant.file), png)
  }))
  console.info(`app icons: wrote ${icons.map(icon => icon.variant.file).join(', ')} to ${ICON_OUTPUT_DIRECTORY}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
