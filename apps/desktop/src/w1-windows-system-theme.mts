/** Windows shell theme selection for desktop runtime and shortcut installation. */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * Read the taskbar and notification area's Windows theme preference.
 * @param fallback - Electron's preference when Windows has no readable shell setting.
 * @returns Whether Windows shell surfaces use a dark background.
 */
export function readW1WindowsSystemDark(fallback: boolean): boolean {
  const registry = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
  const result = spawnSync(registry, [
    'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme',
  ], { encoding: 'utf8', windowsHide: true, timeout: 1_000 })
  if (result.status !== 0) return fallback
  const value = /^[ \t]*SystemUsesLightTheme[ \t]+REG_DWORD[ \t]+0x0*([01])[ \t]*\r?$/im.exec(result.stdout)?.[1]
  return value === undefined ? fallback : value === '0'
}
