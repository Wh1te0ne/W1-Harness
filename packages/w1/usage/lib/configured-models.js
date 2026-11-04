// Only public catalog metadata is projected. Connection settings and credentials
// are never enumerated or sent to the browser.
const catalogs = new WeakMap()
export async function configuredModels(ctx, force = false) {
  const llm = ctx?.get?.('llm')
  if (!llm?.listProviders || !llm?.listModels) return []
  const cached = catalogs.get(llm)
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.promise
  const promise = (async () => {
    const providers = llm.listProviders()
    const results = await Promise.allSettled(providers.slice(0, 100).map(async item => {
      const provider = typeof item === 'string' ? item : item.id
      if (typeof provider !== 'string' || !provider) return []
      let timer
      try {
        const rows = await Promise.race([
          llm.listModels(provider),
          new Promise(resolve => { timer = setTimeout(() => resolve([]), 1500) }),
        ])
        return rows.filter(row => typeof row.id === 'string' && row.id).slice(0, 1000)
          .map(row => ({ provider, model: row.id }))
      } finally { clearTimeout(timer) }
    }))
    return results.flatMap(result => result.status === 'fulfilled' ? result.value : []).slice(0, 3000)
  })().catch(() => [])
  catalogs.set(llm, { at: Date.now(), promise })
  return promise
}
