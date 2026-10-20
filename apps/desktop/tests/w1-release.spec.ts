import { expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import product from '../w1-product.json' with { type: 'json' }

it('packages the W1 product identity and repository independently of DSH packages', () => {
  const config = createElectronBuilderConfig({ DSH_DESKTOP_UNSIGNED: '1' }, 'win32', 'x64')
  expect(config.appId).toBe(product.appId)
  expect(config.extraMetadata.version).toBe(product.version)
  expect(config.extraMetadata.w1hVersion).toBe(product.version)
  expect(config.extraMetadata.w1hUpstreamTag).toBe(product.upstreamTag)
  expect(config.extraMetadata.w1hUpdateChannel).toBe('alpha')
  expect(config.publish).toEqual([{ provider: 'github', owner: 'Wh1te0ne', repo: 'W1-Harness',
    channel: 'alpha', releaseType: 'prerelease' }])
  expect(config.win.forceCodeSigning).toBe(false)
  expect(config.protocols).toEqual([{ name: product.name, schemes: [product.protocol] }])
}, 30_000)
