import { expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import product from '../w1-product.json' with { type: 'json' }
import { readInstallerLocales, renderInstallerStrings } from '../scripts/installer-locales.mjs'

it('packages the W1 product identity and repository independently of DSH packages', () => {
  const config = createElectronBuilderConfig({ DSH_DESKTOP_UNSIGNED: '1' }, 'win32', 'x64')
  expect(config.appId).toBe(product.appId)
  expect(config.productName).toBe(product.name)
  expect(config.extraMetadata.version).toBe(product.version)
  expect(config.extraMetadata.w1hVersion).toBe(product.version)
  expect(config.extraMetadata.w1hUpstreamTag).toBe(product.upstreamTag)
  expect(config.extraMetadata.w1hUpdateChannel).toBe('latest')
  expect(config.publish).toEqual([{ provider: 'github', owner: 'Wh1te0ne', repo: 'W1-Harness',
    channel: 'latest', releaseType: 'release' }])
  expect(config.win.forceCodeSigning).toBe(false)
  expect(config.protocols).toEqual([{ name: product.name, schemes: [product.protocol] }])
}, 30_000)

it('uses W1 ownership and launch text in every generated installer language', () => {
  const locales = readInstallerLocales()
  for (const locale of locales) {
    for (const key of ['INSTALLER_LAUNCH_FAILED', 'INSTALLER_RUNNING', 'INSTALLER_PATH_OWNERSHIP']) {
      expect(locale.strings[key]).toContain(product.name)
    }
  }
  expect(renderInstallerStrings(locales)).not.toContain('DeepSeek Harness')
})
