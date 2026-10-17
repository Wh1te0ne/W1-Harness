import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultConfig, sanitizeConfig, applyConfigPatch, Ledger, zeroDay } from '../lib/store.js'
import { withoutOfficialBalance } from '../lib/w1-policy.js'

test('old settings and attempted re-enablement cannot restore the official wallet', () => {
  const old = { ...defaultConfig(), hideOfficialBalance: false, balance: { ...defaultConfig().balance, display: 'both', reconcile: true } }
  const config = sanitizeConfig(old)
  const saved = applyConfigPatch(config, { hideOfficialBalance: false, balance: { display: 'both', reconcile: true } })
  assert.deepEqual(saved.errors, [])
  for (const value of [withoutOfficialBalance(old), config, saved.config]) {
    assert.equal(value.hideOfficialBalance, true)
    assert.equal(value.balance.display, 'off')
    assert.equal(value.balance.reconcile, false)
    assert.deepEqual(value.prices, old.prices)
    assert.deepEqual(value.budget, old.budget)
  }
  assert.equal(old.balance.display, 'both')
})

test('account removal preserves recorded usage and costs without writing a ledger', () => {
  const day = { ...zeroDay('2026-10-16'), input: 12345, output: 321, cost: 2.5, apiCost: 2.5, calls: 7 }
  const days = { '2026-10-16': day }
  const ledger = new Ledger(defaultConfig(), days, 'unused-private-ledger.json')
  const totals = ledger.sumDays(undefined)
  assert.equal(totals.input, 12345)
  assert.equal(totals.output, 321)
  assert.equal(totals.cost, 2.5)
  assert.equal(totals.calls, 7)
  assert.equal(ledger.config.balance.display, 'off')
  assert.deepEqual(ledger.days, days)
})
