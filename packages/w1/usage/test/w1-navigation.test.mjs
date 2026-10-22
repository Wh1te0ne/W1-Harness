import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'

test('the lazy overview loads without a removed wallet component', async () => {
  let stateCalls=0, loaded, failure=''
  const stub=()=>null
  const context={
    useState:()=>[null,++stateCalls===1?value=>{loaded=value}:value=>{failure=value}],
    useEffect:effect=>effect(), el:stub, USAGE_MANAGER_VERSION:'test',
    require:{async:async()=>({createComponents:()=>({overview:stub})})},
    primitives:{},PRICE_BOOK:{},normalizeClientPrice:stub,QuotasSection:stub,BudgetPanel:stub,PeakPanel:stub,manualPriceKey:stub,
    validManualPrice:stub,resolveClientPrice:stub,wawaPricePreset:stub,formatMoneyUsd:stub,formatTokens:stub,
  }
  const source=readFileSync(new URL('../src/client/03-custom-settings.js',import.meta.url),'utf8')
  runInNewContext(source+'\nCustomSettingsView({screen:"overview"})',context)
  await setImmediate()
  assert.equal(failure,'')
  assert.equal(loaded?.overview,stub)
})
