    // New settings are loaded only when opened, using DSH's package-local chunks.
    let customSettingsPromise
    function CustomSettingsView({ screen, ...props }) {
      const [views, setViews] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        let active = true
        if (!customSettingsPromise) customSettingsPromise = (typeof require.async === 'function'
          ? require.async('./client.custom.js').then(module => module.createComponents({ QuotasSection, BudgetPanel, PeakPanel, manualPriceKey, validManualPrice, resolveClientPrice, wawaPricePreset, formatMoneyUsd, formatTokens, version: USAGE_MANAGER_VERSION }))
          : Promise.reject(new Error('此页面需要 DSH 0.2.0-rc.2 或更高版本'))).catch(error => { customSettingsPromise = null; throw error })
        customSettingsPromise.then(value => { if (active) setViews(value) }, error => { if (active) setError(error.message) })
        return () => { active = false }
      }, [])
      return views ? el(views[screen], props) : el('p', { className: error ? 'cm-msg err' : 'cm-note' }, error || '加载设置…')
    }
    function CompactSettings(props) { return el(CustomSettingsView, { ...props, screen: 'settings' }) }
    function ManualPricesPanel(props) { return el(CustomSettingsView, { ...props, screen: 'prices' }) }
    function UsageOverview(props) { return el(CustomSettingsView, { ...props, screen: 'overview' }) }
