/** W1 palette and CSS persisted through the Host settings form. */
import type { ThemeRuntime } from './index.ts'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeSettings } from '../theme-settings.ts'
import { appearanceTokens, validateAppearance, W1_DEFAULT, type W1Appearance } from '../w1-appearance-settings.ts'
export { appearanceTokens, validateAppearance, W1_DEFAULT, type W1Appearance, type W1Palette } from '../w1-appearance-settings.ts'

/** Current appearance and the latest Host persistence status. */
export interface W1AppearanceSnapshot { saved: W1Appearance; message: string }
const KEY = 'w1.appearance.v1'

/**
 * Apply cached/bootstrap colors immediately, then adopt the Host value. Only a
 * successfully loaded, empty Host field may receive a fenced legacy migration.
 * Failed reads keep the last valid palette; writes are confirmed by the Host.
 * @param theme - Owner of the appearance token layer.
 * @param host - Shared, ordered Host settings form.
 * @param storage - Optional local migration source and last-good cache.
 * @returns Editing, subscription and disposal operations.
 */
export function createW1Appearance(
  theme: Pick<ThemeRuntime, 'overrideTokens'>, host: ConfigForm<ThemeSettings>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
): W1AppearanceController {
  try { storage ??= globalThis.localStorage } catch { /* Host persistence remains available. */ }
  let saved = structuredClone(W1_DEFAULT), legacy: W1Appearance | undefined, message = '正在读取外观设置…'
  try { const raw = storage?.getItem(KEY); if (raw) legacy = validateAppearance(JSON.parse(raw)) }
  catch { message = '本地配色无法读取，正在读取正式设置…' }
  if (legacy) saved = legacy
  try {
    const boot = typeof document === 'undefined' ? undefined : document.body.dataset.w1Appearance
    if (boot) saved = validateAppearance(JSON.parse(boot))
  } catch { /* Retain the validated local value while waiting for the Host. */ }
  let confirmed = saved, snapshot: W1AppearanceSnapshot = { saved, message }
  let disposed = false, migrationAttempted = false, generation = 0, pending = 0
  const listeners = new Set<() => void>()
  let retract: (() => void) | undefined
  const style = typeof document === 'undefined' ? undefined : document.createElement('style')
  if (style) { style.dataset.w1Appearance = 'custom'; document.head.append(style) }
  const publish = (message: string) => { snapshot = { saved, message }; for (const listener of listeners) listener() }
  const apply = (value: W1Appearance) => {
    const old = retract; retract = theme.overrideTokens('w1-appearance', appearanceTokens(value)); old?.()
    if (style) { style.textContent = value.css; document.querySelector('[data-w1-appearance="boot"]')?.remove() }
  }
  const cache = (value: W1Appearance) => {
    try { storage?.setItem(KEY, JSON.stringify(value)) } catch { /* The accepted Host value is durable. */ }
  }
  const adopt = () => {
    const state = host.getSnapshot()
    if (disposed || pending || state.status !== 'ready' || !state.value) return
    if (state.value.appearance == null) {
      if (legacy && state.writable && !migrationAttempted) {
        migrationAttempted = true
        write(legacy, '已迁移并保存外观', state.revision)
      } else if (!legacy) publish('')
      return
    }
    migrationAttempted = true
    try {
      const next = validateAppearance(state.value.appearance)
      confirmed = next
      if (JSON.stringify(next) !== JSON.stringify(saved)) { saved = next; apply(saved) }
      cache(next); publish('')
    } catch { publish('正式外观设置无效，保留上次有效配色') }
  }
  const write = (value: W1Appearance, success: string, revision?: number) => {
    const next = validateAppearance(value), state = host.getSnapshot()
    if (state.status !== 'ready' || !state.writable) throw new Error('外观设置暂时不可写，请等待连接恢复')
    const current = ++generation
    pending++; saved = next; apply(saved); publish('正在保存外观…')
    const operation = revision === undefined ? host.set('appearance', next)
      : host.mutate([{ op: 'set', path: ['appearance'], value: { ...next, light: { ...next.light }, dark: { ...next.dark } } }], revision)
    void operation.then((ok) => {
      pending--
      if (ok) { confirmed = next; cache(next) }
      if (disposed || current !== generation) return
      if (!ok) { saved = confirmed; apply(saved); adopt(); publish('外观未保存，已保留上次有效配色'); return }
      publish(success)
    }, () => {
      pending--
      if (disposed || current !== generation) return
      saved = confirmed; apply(saved); publish('外观保存失败，已保留上次有效配色；请在连接恢复后重试')
    })
  }
  apply(saved)
  const unsubscribe = host.subscribe(adopt)
  adopt()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: (value) => { write(value, '已自动保存') },
    reset: () => { write(structuredClone(W1_DEFAULT), '已恢复 W1 默认外观') },
    dispose() { disposed = true; unsubscribe(); retract?.(); style?.remove(); listeners.clear() },
  }
}
/** Operations for the Host-backed W1 appearance layer. */
export type W1AppearanceController = {
  readonly getSnapshot: () => W1AppearanceSnapshot
  readonly subscribe: (listener: () => void) => () => void
  readonly update: (value: W1Appearance) => void
  readonly reset: () => void
  readonly dispose: () => void
}
