const t = name => chrome.i18n.getMessage(name)
for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n)
const element = id => document.getElementById(id)
let current = { enabled: true, connected: false }
let busy = false
let queued
function render(state) {
  current = state
  const mode = state.connected ? 'connected' : state.enabled ? state.status === 'update' ? 'update' : 'waiting' : 'paused'
  element('label').textContent = t(mode)
  element('title').textContent = t(mode + 'Title')
  element('description').textContent = t(mode + 'Description')
  element('dot').className = 'dot ' + (state.connected ? 'online' : state.enabled ? '' : 'paused')
  element('total').textContent = state.connected ? String(state.total) : '—'
  element('controlled').textContent = state.connected ? String(state.controlled) : '—'
  element('toggle').textContent = t(state.enabled ? 'pauseConnection' : 'enableConnection')
  element('reconnect').hidden = !state.enabled
  element('tabs').replaceChildren()
  for (const tab of state.tabs) {
    const row = document.createElement('li')
    const label = document.createElement('span')
    label.textContent = tab.title || new URL(tab.url).hostname
    label.title = new URL(tab.url).origin
    const pause = document.createElement('button')
    pause.textContent = t(tab.enabled ? 'pauseTab' : 'resumeTab')
    pause.onclick = () => run({ action: 'pause', id: tab.id, paused: tab.enabled })
    row.append(label, pause)
    element('tabs').append(row)
  }
}
async function run(message, silent = false) {
  if (busy) { if (!silent) queued = message; return }
  busy = true
  if (!silent) for (const button of document.querySelectorAll('button')) button.disabled = true
  try {
    const response = await chrome.runtime.sendMessage(message)
    if (!response?.ok) throw new Error(response?.error || t('unavailable'))
    render(response.value)
    element('status').hidden = true
  } catch (error) {
    element('status').hidden = false
    element('status').textContent = `${t('failed')}: ${error.message}`
  } finally {
    busy = false
    for (const button of document.querySelectorAll('button')) button.disabled = false
    if (queued) { const next = queued; queued = undefined; void run(next) }
  }
}
element('toggle').onclick = () => run({ action: 'enable', enabled: !current.enabled })
element('reconnect').onclick = () => run({ action: 'reconnect' })
void run({ action: 'status' })
const refresh = setInterval(() => { void run({ action: 'status' }, true) }, 1500)
window.addEventListener('pagehide', () => { clearInterval(refresh) }, { once: true })
