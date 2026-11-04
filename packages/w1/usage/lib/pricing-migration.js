import {existsSync, readFileSync, copyFileSync, mkdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {createPriceBook, validPriceBook} from './price-book.js'
import {writeLedger} from './ledger-persistence.js'

/** Called only while holding the ledger lock, before any runtime consumes the new monetary basis. */
export function migrateLedgerCny(path, now = Date.now()) {
  if (!existsSync(path)) return false
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  if (raw.config?.prices?.book?.version === 1) {
    if (!validPriceBook(raw.config.prices.book)) throw new Error('Invalid persisted price versions; original ledger preserved')
    return false
  }
  if (raw.version !== 1) throw new Error('Unsupported ledger; currency migration not applied')
  const config = raw.config, book = createPriceBook(config, now)
  const factor = config.currency === 'CNY' && config.exchangeRate > 0 ? config.exchangeRate : book.fx[0].rate
  const backup = join(dirname(path), 'pricing-backups', 'before-cny-' + now + '.json')
  mkdirSync(dirname(backup), {recursive:true});copyFileSync(path, backup, 1)
  const convert = value => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (['cost','apiCost','ledgerCost'].includes(key) && typeof child === 'number') value[key] = child * factor
      else if (child && typeof child === 'object') convert(child)
    }
  }
  for (const key of ['days','archivedDays','planSamples','planHourBuckets']) convert(raw[key])
  raw.balanceRef = null
  book.migration = {at:now,factor,backup,status:'historical-audit-required'}
  config.prices.book = book
  config.prices.manual = {}
  config.currency = 'CNY';config.symbol = '¥';config.exchangeRate = 1
  config.pricingCurrency = 'CNY';config.priceMatch = 'exact';config.priceOverrides = {}
  // These old migrations re-price all history using today's mutable catalog. The new audit replaces them.
  raw.migrations ??= []
  raw.pricingMigration = {at:now, factor, backup, status:'historical-audit-required'}
  writeLedger(path, raw)
  return true
}
