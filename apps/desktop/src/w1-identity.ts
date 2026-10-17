/** Resolve W1-owned paths before Electron takes its single-instance lock or starts a Host. */
import { mkdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { App } from 'electron'
import type { W1Product } from './w1-upstream.ts'

/**
 * Isolate the fork from inherited DSH_HOME and Electron's scoped upstream package name.
 * @param application - Electron application before ready.
 * @returns W1 build identity; development-only overrides stay explicit to W1.
 */
export function configureW1Identity(application: App): W1Product {
  const product = JSON.parse(readFileSync(join(application.getAppPath(), 'w1-product.json'), 'utf8')) as W1Product
  const home = !application.isPackaged && process.env.W1_HOME !== undefined ? process.env.W1_HOME : join(application.getPath('home'), '.w1-harness')
  const userData = !application.isPackaged && process.env.W1_USER_DATA !== undefined ? process.env.W1_USER_DATA : join(application.getPath('appData'), product.name)
  if (!isAbsolute(home) || !isAbsolute(userData)) throw new Error('W1 data paths must be absolute')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  application.setName(product.name)
  application.setPath('userData', userData)
  application.setPath('sessionData', userData)
  if (process.platform === 'win32') application.setAppUserModelId(product.appId)
  process.env.DSH_HOME = home
  process.env.DSH_AGENTS_HOME = join(home, 'agents')
  mkdirSync(process.env.DSH_AGENTS_HOME, { recursive: true })
  process.env.W1_DOCUMENTS_DIR = join(home, 'projects')
  // Native compression plugins use XDG state and their own sidecar ports outside DSH_HOME.
  for (const [key, directory] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_STATE_HOME: 'state', XDG_CACHE_HOME: 'cache' })) {
    process.env[key] = join(home, 'xdg', directory)
  }
  process.env.BILI_CONFIG_FILE = join(home, 'xdg', 'config', 'billion-context', 'billion-context.json')
  process.env.BILI_SESSIONS_DIR = join(home, 'xdg', 'data', 'billion-context', 'sessions')
  process.env.BILI_ZONE_PORT = '28787'
  process.env.BILI_NATIVE_ATTACH_EXTERNAL = '0'
  delete process.env.BILLION_CONTEXT_ATTACH
  delete process.env.BILLION_CONTEXT_PROXY
  return product
}
