/** Local equivalent of the workspace Host defaults for packages without their own config. */
import { defineConfig } from 'tsdown'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
export default defineConfig({
  cwd: process.cwd(),
  entry: { index: resolve('lib/types/index.js'),
    ...existsSync('lib/types/startup.js') ? { startup: resolve('lib/types/startup.js') } : {} },
  outDir: 'lib', format: ['esm'], platform: 'node',
  target: 'es2024', fixedExtension: false, dts: false, clean: false,
})
