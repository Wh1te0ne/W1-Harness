/** One configured source; never silently substitute a different rate or a value of one. */
export async function fetchUsdCny(fetcher = fetch) {
  const response = await fetcher('https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ecb', {signal:AbortSignal.timeout(12000)})
  if (!response.ok) throw new Error('汇率获取失败，保留上次有效汇率')
  const data = await response.json()
  const dateMs = Date.parse(data.date)
  if (data.base !== 'USD' || data.quote !== 'CNY' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
    || !Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0,10) !== data.date
    || !Number.isFinite(data.rate) || data.rate <= 0 || data.rate >= 100 || dateMs > Date.now()+86400000)
    throw new Error('汇率来源返回无效数据，未应用')
  return {rate:data.rate,date:data.date,source:'Frankfurter / ECB'}
}
