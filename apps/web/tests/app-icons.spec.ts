/** Generated and committed Web install icon dimensions. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_ICON_VARIANTS, ICON_OUTPUT_DIRECTORY, renderAppIcons,
} from '../scripts/render-app-icons.ts'
import { pngSize } from './png-size.ts'

describe('web install icons', () => {
  it('ships every declared variant at its declared edge', async () => {
    for (const variant of APP_ICON_VARIANTS) {
      expect(pngSize(await readFile(join(ICON_OUTPUT_DIRECTORY, variant.file))))
        .toEqual([variant.size, variant.size])
    }
  })

  it('resizes the pinned source for each declared variant', async () => {
    const generated = await renderAppIcons()
    expect(generated.map(({ variant }) => variant)).toEqual(APP_ICON_VARIANTS)
    for (const { variant, png } of generated) {
      expect(pngSize(png)).toEqual([variant.size, variant.size])
    }
  })

  it('rejects non-PNG bytes and incomplete image headers', () => {
    expect(() => pngSize(Buffer.from('<svg/>'))).toThrow(/PNG IHDR/)
    expect(() => pngSize(Buffer.alloc(33))).toThrow(/PNG IHDR/)
  })
})
