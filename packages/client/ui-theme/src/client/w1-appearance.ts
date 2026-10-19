/** W1 appearance presets and automatically saved, local-only customization. */
import type { ThemeRuntime, ThemeTokenOverrides } from './index.ts'
import { W1_PRESETS } from './w1-presets.ts'

export interface W1Palette { accent: string; surface: string; ink: string }
export interface W1Appearance { preset: string; light: W1Palette; dark: W1Palette; css: string }
export interface W1AppearanceSnapshot { saved: W1Appearance; message: string }
export const W1_DEFAULT: W1Appearance = { preset: 'w1', light: { accent: '#4d6bfe', surface: '#ffffff', ink: '#171717' }, dark: { accent: '#7c8dff', surface: '#1b1b1c', ink: '#eeeeee' }, css: '' }
const KEY = 'w1.appearance.v1'
const hex = /^#[\da-f]{6}$/iu
/** Validate persisted/imported colors and local stylesheet input before applying it. */
export function validateAppearance(value: unknown): W1Appearance {
  if (typeof value !== 'object' || value === null) throw new Error('外观配置格式不正确')
  const item = value as Record<string, unknown>
  if (typeof item.preset !== 'string' || !['w1', ...W1_PRESETS.map(p => p.id), 'custom'].includes(item.preset)) throw new Error('未知主题')
  if (typeof item.css !== 'string' || item.css.length > 20_000 || /@import|url\s*\(/iu.test(item.css)) throw new Error('CSS 最多 20,000 字，不支持 @import 或外部资源 url()')
  const palette = (mode: string): W1Palette => {
    const input = item[mode]
    if (typeof input !== 'object' || input === null) throw new Error('缺少配色')
    const colors = input as Record<string, unknown>
    for (const key of ['accent', 'surface', 'ink']) if (typeof colors[key] !== 'string' || !hex.test(colors[key])) throw new Error('颜色请使用 #RRGGBB 格式')
    return { accent: String(colors.accent), surface: String(colors.surface), ink: String(colors.ink) }
  }
  return { preset: item.preset, light: palette('light'), dark: palette('dark'), css: item.css }
}
/** Map three primary colors to W1's existing light/dark token layer. */
export function appearanceTokens(value: W1Appearance): ThemeTokenOverrides {
  if (value.preset === 'w1') return {}
  const tokens: ThemeTokenOverrides = {}
  for (const mode of ['light', 'dark'] as const) {
    const { accent, surface, ink } = value[mode]
    const mix = (percent: number) => `color-mix(in srgb, ${ink} ${percent}%, ${surface})`
    const colors: Record<string, string> = {
      '--dsw-alias-bg-base': surface, '--dsw-alias-bg-layer-1': surface,
      '--dsw-alias-bg-layer-2': surface, '--dsw-alias-bg-layer-3': mix(3),
      '--dsw-alias-bg-module-platform': mix(3), '--dsw-alias-bg-overlay': mix(7),
      '--dsw-alias-label-primary': ink, '--dsw-alias-label-secondary': mix(66),
      '--dsw-alias-label-tertiary': mix(48), '--dsw-alias-label-caption': mix(48),
      '--dsw-alias-border-l2': mix(15), '--dsw-alias-border-l4': mix(15),
      '--dsw-alias-interactive-bg-hover': mix(6), '--dsw-alias-interactive-bg-active': mix(11),
      '--dsw-alias-state-business-primary': accent, '--dsw-focus-ring-color': accent,
      '--dsw-alias-link': accent, '--dsw-alias-state-business-tertiary': `color-mix(in srgb, ${accent} 12%, ${surface})`,
      '--dsw-alias-markdown-code-block': mix(3), '--dsw-alias-markdown-code-block-banner': mix(5),
      '--dsw-alias-markdown-inline-code': mix(5), '--dsw-alias-menu-icon': ink, '--dsw-alias-bg-module-accent': `color-mix(in srgb, ${accent} 12%, ${surface})`,
    }
    for (const [key, color] of Object.entries(colors)) { tokens[key] ??= { light: '', dark: '' }; tokens[key][mode] = color }
  }
  return tokens
}
/** Own one immediately applied theme layer and persist valid edits for the plugin lifetime. */
export function createW1Appearance(
  theme: Pick<ThemeRuntime, 'overrideTokens'>, storage?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  try { storage ??= globalThis.localStorage } catch { /* Storage may be unavailable in restricted documents. */ }
  let saved = structuredClone(W1_DEFAULT)
  try {
    const raw = storage?.getItem(KEY)
    if (raw) saved = validateAppearance(JSON.parse(raw))
  } catch { /* Keep the recoverable default for invalid saved data. */ }
  let snapshot: W1AppearanceSnapshot = { saved, message: '' }
  const listeners = new Set<() => void>()
  let retract: (() => void) | undefined
  const style = typeof document === 'undefined' ? undefined : document.createElement('style')
  if (style) { style.dataset.w1Appearance = 'custom'; document.head.append(style) }
  const publish = () => { for (const listener of listeners) listener() }
  const apply = (value: W1Appearance) => { const old = retract; retract = theme.overrideTokens('w1-appearance', appearanceTokens(value)); old?.(); if (style) style.textContent = value.css }
  const update = (value: W1Appearance, message = '已自动保存') => {
    const next = validateAppearance(value)
    if (!storage) throw new Error('无法保存外观：本地存储不可用')
    storage.setItem(KEY, JSON.stringify(next))
    saved = next
    apply(saved)
    snapshot = { saved, message }
    publish()
  }
  apply(saved)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    update: (value: W1Appearance) => { update(value) },
    reset: () => { update(structuredClone(W1_DEFAULT), '已恢复 W1 默认外观') },
    dispose() { retract?.(); style?.remove(); listeners.clear() },
  }
}
export type W1AppearanceController = ReturnType<typeof createW1Appearance>
