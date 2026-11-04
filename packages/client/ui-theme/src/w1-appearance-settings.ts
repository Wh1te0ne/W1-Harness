import z from '@deepseek-ai/schemastery'
import { W1_PRESETS } from './w1-presets.ts'

/**
 * Primary accent, surface and foreground colors for one application mode.
 */
export interface W1Palette {
  /** Primary accent color in #RRGGBB notation. */
  accent: string
  /** Base background color in #RRGGBB notation. */
  surface: string
  /** Primary foreground color in #RRGGBB notation. */
  ink: string
}
/**
 * Persisted W1 theme selection, mode palettes and local stylesheet.
 */
export interface W1Appearance {
  /** Selected built-in preset ID, or custom for edited palettes. */
  preset: string
  /** Colors used when the application is in light mode. */
  light: W1Palette
  /** Colors used when the application is in dark mode. */
  dark: W1Palette
  /** Local stylesheet, limited to 20,000 characters without imports or resource URLs. */
  css: string
}
/**
 * Default W1 appearance used before a valid local override exists.
 */
export const W1_DEFAULT: W1Appearance = { preset: 'w1', light: { accent: '#4d6bfe', surface: '#ffffff', ink: '#171717' }, dark: { accent: '#7c8dff', surface: '#1b1b1c', ink: '#eeeeee' }, css: '' }
const hex = /^#[\da-f]{6}$/iu
/**
 * Validate persisted/imported colors and local stylesheet input before applying it.
 * @param value - Stored or imported appearance settings to validate or project.
 * @returns Validated appearance settings with normalized mode palettes.
 */
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
/**
 * Map three primary colors to W1's existing light/dark token layer.
 * @param value - Stored or imported appearance settings to validate or project.
 * @returns Light and dark overrides for the existing theme tokens.
 */
export function appearanceTokens(value: W1Appearance): Record<string, { light: string; dark: string }> {
  if (value.preset === 'w1') return {}
  const tokens: Record<string, { light: string; dark: string }> = {}
  for (const mode of ['light', 'dark'] as const) {
    const { accent, surface, ink } = value[mode]
    const mix = (percent: number) => `color-mix(in srgb, ${ink} ${percent}%, ${surface})`
    const linear = (offset: number) => {
      const channel = Number.parseInt(accent.slice(offset, offset + 2), 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    }
    const luminance = linear(1) * 0.2126 + linear(3) * 0.7152 + linear(5) * 0.0722
    const onAccent = luminance > 0.179 ? '#000000' : '#ffffff'
    const colors: Record<string, string> = {
      '--dsw-alias-bg-base': surface, '--dsw-alias-bg-layer-1': surface,
      '--dsw-alias-bg-layer-2': surface, '--dsw-alias-bg-layer-3': mix(3),
      '--dsw-alias-bg-module-platform': mix(3), '--dsw-alias-bg-overlay': mix(7),
      '--dsw-alias-label-primary': ink, '--dsw-alias-label-secondary': mix(66),
      '--dsw-alias-label-tertiary': mix(48), '--dsw-alias-label-caption': mix(48),
      '--dsw-alias-border-l2': mix(15), '--dsw-alias-border-l4': mix(15),
      '--dsw-alias-interactive-bg-hover': mix(6), '--dsw-alias-interactive-bg-active': mix(11),
      '--dsw-alias-state-business-primary': accent, '--dsw-focus-ring-color': accent,
      '--dsw-alias-button-info-fill': accent,
      '--dsw-alias-button-info-hover': `color-mix(in srgb, ${accent} 88%, ${onAccent === '#ffffff' ? '#000000' : '#ffffff'})`,
      '--dsw-alias-button-info-foreground': onAccent,
      '--dsw-specific-bubble': `color-mix(in srgb, ${accent} 12%, ${surface})`,
      '--dsw-specific-bubble-highlight': `color-mix(in srgb, ${accent} 24%, ${surface})`,
      '--dsw-alias-link': accent, '--dsw-alias-state-business-tertiary': `color-mix(in srgb, ${accent} 12%, ${surface})`,
      '--dsw-alias-markdown-code-block': mix(3), '--dsw-alias-markdown-code-block-banner': mix(5),
      '--dsw-alias-markdown-inline-code': mix(5), '--dsw-alias-menu-icon': ink, '--dsw-alias-bg-module-accent': `color-mix(in srgb, ${accent} 12%, ${surface})`,
    }
    for (const [key, color] of Object.entries(colors)) { tokens[key] ??= { light: '', dark: '' }; tokens[key][mode] = color }
  }
  return tokens
}

/** Palette and CSS validated equally at the Host and browser boundaries. */
export const W1AppearanceSchema: z<W1Appearance> = z.object({
  preset: z.union(['w1', ...W1_PRESETS.map(p => p.id), 'custom']).required(),
  light: z.object({
    accent: z.string().pattern(hex).required(), surface: z.string().pattern(hex).required(), ink: z.string().pattern(hex).required(),
  }).required(),
  dark: z.object({
    accent: z.string().pattern(hex).required(), surface: z.string().pattern(hex).required(), ink: z.string().pattern(hex).required(),
  }).required(),
  css: z.string().pattern(/^(?![\s\S]*(?:@import|url\s*\())[\s\S]{0,20000}$/iu).required(),
})
