// User-supplied Wawa screenshots, 2026-10-14. Left-hand discounted amounts
// are CNY / 1M tokens despite the site's dollar sign. Never apply another discount.
export function wawaPricePreset(configuredModels, existing = {}) {
  const rate = (input, output, cachedInput, cacheWrite, cacheWrite1h = cacheWrite) =>
    ({ currency: 'CNY', input, output, cachedInput, cacheWrite, cacheWrite1h, cacheWriteTtl: '5m' })
  const claude = {
    'claude-fable-5-1': rate(11, 55, .275, 13.75),
    'claude-fable-5': rate(11, 55, 1.1, 13.75),
    'claude-opus-5': rate(5.5, 27.5, .55, 6.875),
    'claude-opus-4-7': rate(5.5, 27.5, .55, 6.875),
    'claude-opus-4-6': rate(5.5, 27.5, .55, 6.875),
    // Screenshot's "Claude Opus 4.8" is a display name; no unverified ID alias.
    'claude-opus-5-5': rate(4.4, 22, .22, 5.5, 8.8),
    'claude-sonnet-4-6': rate(3.3, 16.5, .33, 4.125),
    'claude-sonnet-5-5': { ...rate(3.3, 16.5, .33, 4.125, 6.6),
      longContext: { aboveInputTokens: 200000, input: 6.6, output: 24.75, cachedInput: .66, cacheWrite: 8.25, cacheWrite1h: 13.2 } },
    'claude-sonnet-5': rate(2.2, 11, .22, 2.75),
    'claude-haiku-5-5': rate(.275, 1.375, .033, .33, .55),
  }
  const gemini = {
    'gemini-3.8-flash-high': rate(.1875, .9375, .01875, 0),
    'gemini-3.8-flash': rate(.1875, .9375, .01875, 0),
    'gemini-3.1-flash-image': rate(.125, .75, 0, 0),
    'gemini-4-argon': rate(.5, 2.5, .025, .045),
  }
  const additions = {}
  for (const { provider, model } of configuredModels ?? []) {
    const channel = String(provider).trim().toLowerCase().replace(/^llm-/, '')
    const catalog = channel === 'wawa-zz-claudemax' ? claude : channel === 'wawa-zz-gemini' ? gemini : null
    const key = channel + ':' + model
    if (catalog && Object.hasOwn(catalog, model) && !Object.hasOwn(existing, key)) additions[key] = catalog[model]
  }
  return additions
}
