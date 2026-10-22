import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { defaultConfig, applyConfigPatch, sanitizeConfig } from '../lib/store.js'
import { DEFAULT_PRICE_TABLE, DEFAULT_PRICE_TABLE_CNY, correctCurrentDeepSeekPrices, providerPriceEntryFor, priceAt, costOf } from '../lib/pricing.js'
import { manualPriceKey, validManualPrice } from '../lib/manual-prices.js'

const el = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== null && v !== undefined && v !== false) })
const React = { createElement: el, Fragment: 'fragment', useState: init => [typeof init === 'function' ? init() : init, () => {}], useEffect() {}, useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn() }
const primitives = { Tooltip: 'tooltip' }
const sourceDir = new URL('../src/client/', import.meta.url)
let main
const source = readdirSync(sourceDir).filter(x => x.endsWith('.js')).sort().map(x => readFileSync(new URL(x, sourceDir), 'utf8')).join('\n')
runInNewContext(source.replace('    exports.apply = apply', '    exports.test = { makeStore, resolveClientPrice, normalizeClientPrice, TodayUsageSummary, SidebarFooter, CostSection, makeT };\n    exports.apply = apply'), {
  window: { __ModuleLoader__: { load: ({ factory }) => { main = factory(name => name === 'react' ? React : primitives) } } },
  setTimeout, clearTimeout, setInterval, clearInterval, console, URL, Date,
})
const client = main.test
const t = client.makeT('zh')
let custom
runInNewContext(readFileSync(new URL('../src/custom/index.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load: ({ factory }) => { custom = factory(() => React) } } },
})
const views = custom.createComponents({ manualPriceKey, validManualPrice, resolveClientPrice: client.resolveClientPrice, normalizeClientPrice: client.normalizeClientPrice, wawaPricePreset: () => ({}), formatMoneyUsd: String, formatTokens: String })
const all = tree => typeof tree === 'object' && tree ? [tree, ...tree.children.flatMap(all)] : []
const text = tree => typeof tree === 'object' && tree ? typeof tree.type === 'function' ? text(tree.type(tree.props)) : tree.children.map(text).join(' ') : String(tree)

test('known DeepSeek channel snapshots resolve vendor reference prices on host and client', () => {
  const config = defaultConfig()
  for (const [model, family] of [['deepseek-v4-1-flash-261017', 'deepseek-v4.1-flash'], ['deepseek-v4-flash-ga-260731', 'deepseek-v4-flash']]) {
    const host = providerPriceEntryFor('deepseek-volc', model, config.prices)
    const clientRate = client.resolveClientPrice('deepseek-volc', model, config)
    assert.equal(host.priced, true)
    assert.equal(clientRate.priced, true)
    assert.equal(host.entry.cacheMiss, config.prices.models[family].cacheMiss)
    assert.equal(clientRate.entry.cacheMiss, host.entry.cacheMiss)
    assert.equal(providerPriceEntryFor('deepseek-volc', model, config.prices, { mode: 'exact' }).priced, false)
    assert.equal(client.resolveClientPrice('deepseek-volc', model, { ...config, priceMatch: 'exact' }).priced, false)
    config.prices.manual['deepseek-volc:' + model] = { currency: 'CNY', input: 7, cachedInput: .1, output: 9 }
    assert.equal(providerPriceEntryFor('deepseek-volc', model, config.prices).entry.cacheMiss, 7)
    assert.equal(client.resolveClientPrice('deepseek-volc', model, config).entry.cacheMiss, 7)
  }
  for (const model of ['deepseek-v4-1-flash-unknown', 'deepseek-v4-flash-ga-260731:free', 'doubao-seed-evolving']) {
    assert.equal(providerPriceEntryFor('deepseek-volc', model, config.prices).priced, false)
    assert.equal(client.resolveClientPrice('deepseek-volc', model, config).priced, false)
  }
})

test('official USD and CNY tariffs distinguish Flash, Pro and peak hours', () => {
  for (const [table, flash, pro] of [[DEFAULT_PRICE_TABLE, .15, .66], [DEFAULT_PRICE_TABLE_CNY, 1, 4.5]]) {
    const peak = { enabled: true, effectiveAt: '2026-08-01T00:00:00Z', windows: [{ start: 1, end: 4 }, { start: 6, end: 10 }] }
    for (const [model, price] of [['deepseek-flash', flash], ['deepseek-v4-pro', pro]]) {
      assert.equal(costOf({ input: 1e6 }, table.models[model], Date.parse('2026-10-21T01:00:00Z'), peak), price * 2)
      assert.equal(costOf({ input: 1e6 }, table.models[model], Date.parse('2026-10-21T04:00:00Z'), peak), price)
      assert.equal(costOf({ input: 1e6 }, table.models[model], Date.parse('2026-10-24T01:00:00Z'), peak), price)
    }
  }
})

test('host and client do not price Doubao through a provider name containing deepseek', () => {
  const config = defaultConfig()
  for (const provider of ['deepseek-volc', 'deepseek-official']) {
    assert.equal(providerPriceEntryFor(provider, 'doubao-seed-evolving', config.prices).priced, false)
    assert.equal(client.resolveClientPrice(provider, 'doubao-seed-evolving', config).priced, false)
  }
  const key = 'deepseek-volc:doubao-seed-evolving'
  config.prices.manual[key] = { currency: 'CNY', input: 3, cachedInput: 1, output: 9 }
  assert.equal(client.resolveClientPrice('deepseek-volc', 'doubao-seed-evolving', config).entry.output, 9)
  assert.equal(providerPriceEntryFor('deepseek-volc', 'doubao-seed-evolving', config.prices).entry.output, 9)
})

test('Pro correction starts at activation and preserves custom prices and prior history', () => {
  const prices = structuredClone(DEFAULT_PRICE_TABLE)
  const augustPro = DEFAULT_PRICE_TABLE.models['deepseek-v4-pro']
  const old = { ...structuredClone(augustPro), ...structuredClone(prices.models['deepseek-v4.1-flash']), legacyBase: augustPro.legacyBase,
    rateHistory: [{ before: '2026-09-14T04:00:00Z', cacheHit: .022, cacheMiss: .66, output: 1.98, offPeak: augustPro.offPeak, peak: augustPro.peak }] }
  prices.models['deepseek-v4-pro'] = old
  const at = Date.parse('2026-10-21T10:00:00Z')
  assert.deepEqual(correctCurrentDeepSeekPrices(prices, at), ['deepseek-v4-pro'])
  assert.equal(priceAt(prices.models['deepseek-v4-pro'], at - 1).cacheMiss, .15)
  assert.equal(priceAt(prices.models['deepseek-v4-pro'], at).cacheMiss, .66)
  assert.equal(priceAt(prices.models['deepseek-v4-pro'], Date.parse('2026-09-01')).cacheMiss, .66)
  assert.deepEqual(correctCurrentDeepSeekPrices(prices, at + 1), [])
  prices.models['deepseek-v4-pro'].cacheMiss = 7
  assert.deepEqual(correctCurrentDeepSeekPrices(prices, at + 2), [])
})

test('today summary includes cache tokens once, per-model amounts, and opens usage', () => {
  const config = { ...defaultConfig(), activeLocale: 'zh-CN', currency: 'USD', symbol: '$', exchangeRate: 1, decimals: 2 }
  const today = { input: 100, cacheRead: 200, cacheWrite: 300, output: 400, reasoning: 999, cost: 3, apiCost: 2, estimatedCalls: 9, stalePriceCalls: 2, byProviderModel: { 'provider:model-a': { input: 100, output: 400, cacheRead: 200, cacheWrite: 300, apiCost: 2, estimatedCalls: 9 } } }
  let opened = 0
  const tree = client.TodayUsageSummary({ state: { config, today }, wide: true, api: { openUsage: () => opened++ } })
  assert.match(text(tree), /今日费用/)
  assert.match(text(tree), /今日 Token/)
  const tooltip = all(tree).find(node => node.type === 'tooltip')
  assert.match(text(tooltip.props.label), /1,000 Token/)
  assert.match(text(tooltip.props.label), /provider:model-a/)
  assert.match(text(tooltip.props.label), /\$2/)
  assert.doesNotMatch(text(tree)+text(tooltip.props.label), /待核对/)
  all(tree).find(node => node.type === 'button').props.onClick()
  assert.equal(opened, 1)
})

test('sidebar keeps the daily summary and removes peak strips with and without a budget', () => {
  for (const enabled of [false, true]) for (const wide of [false, true]) {
    const config = defaultConfig()
    config.budget.enabled = enabled
    config.codexQuotaEnabled = false
    config.codingPlans = {}
    config.goQuota = { enabled: false }
    const row = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0, apiCost: 0 }
    const state = { config, today: row, month: row, total: row, meta: { now: Date.parse('2026-10-21T02:00:00Z') } }
    const tree = client.SidebarFooter({ useCost: () => ({ state }), wide, api: { openUsage() {} } })
    assert.equal(all(tree).filter(node => node.type?.name === 'TodayUsageSummary').length, 1)
    for (const node of all(tree)) {
      const rendered = typeof node.type === 'function' ? node.type(node.props) : node
      assert.equal(all(rendered).some(child => /Peak(Strip|Rail)/.test(child.type?.name ?? '')), false)
    }
  }
})

test('a late snapshot cannot overwrite a price save or synchronization result',()=>{const state=revision=>({state:{config:{prices:{book:{revision}}}}});const store=client.makeStore(state(1));store.set(state(3));store.set(state(2));assert.equal(store.getSnapshot().state.config.prices.book.revision,3);store.set(state(4));assert.equal(store.getSnapshot().state.config.prices.book.revision,4)})
