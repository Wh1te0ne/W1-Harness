/** Recovery copy is independent of the locale plugin, which may itself be reloading. */
const copy = {
  zh: {
    waiting: '界面暂时不可用', failed: '界面加载失败',
    detail: '正在等待界面恢复。若长时间未恢复，请重新加载界面或从应用菜单退出后重开。',
    reload: '重新加载界面',
  },
  en: {
    waiting: 'Interface temporarily unavailable', failed: 'Interface failed to load',
    detail: 'Waiting for the interface to recover. If it does not return, reload the interface or quit and reopen the app.',
    reload: 'Reload interface',
  },
}
/** Keep recovery visible without calling a disposed layout or resetting the Host. */
export function RootRecovery({ failed = false }: { failed?: boolean }) {
  const t = copy[document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en']
  return <div data-slot-error={failed ? 'root' : undefined} data-root-recovery role={failed ? 'alert' : 'status'}
    style={{ padding: '48px 24px', maxWidth: 560, margin: 'auto', font: 'inherit', color: 'var(--dsw-alias-label-primary)' }}>
    <h2 style={{ fontSize: 20 }}>{failed ? t.failed : t.waiting}</h2>
    <p style={{ fontSize: 14, lineHeight: 1.7 }}>{t.detail}</p>
    <button type="button" onClick={() => { window.location.reload() }}
      style={{ font: 'inherit', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>{t.reload}</button>
  </div>
}
