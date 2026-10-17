/** Main-owned copy and responses; Escape is cancellation, never acceptance. */
const api = window.dshUpdateDialog
let view
let responding = false
function respond(index) {
  if (responding || view === undefined) return
  responding = true
  void api.respond(view.revision, index).catch(() => { responding = false })
}
document.getElementById('close').addEventListener('click', () => { respond(view.cancelId) })
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && view !== undefined) { event.preventDefault(); respond(view.cancelId) }
  if (event.key !== 'Tab') return
  const controls = [...document.querySelectorAll('button, #release-notes, #release-notes a[href], details:not([hidden]) > summary, details[open]:not([hidden]) > pre')]
    .filter(control => control.closest('[hidden]') === null)
  const current = controls.indexOf(document.activeElement)
  const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
    : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  event.preventDefault()
  controls[next].focus()
})
document.getElementById('release-notes').addEventListener('click', event => {
  const link = event.target.closest('a[href]')
  if (link === null) return
  event.preventDefault()
  const href = link.getAttribute('href')
  if (href.startsWith('#')) {
    const target = [...document.querySelectorAll('#release-notes [id]')].find(element => `#${element.id}` === href)
    target?.scrollIntoView({ block: 'nearest' })
  } else {
    void api.openLink(view.revision, href).catch(error => { console.error('Release link could not be opened', error) })
  }
})
function renderFacts(id, facts) {
  const container = document.getElementById(id)
  container.replaceChildren()
  for (const fact of facts) {
    const row = document.createElement('div')
    const label = document.createElement('dt')
    const value = document.createElement('dd')
    label.textContent = fact.label
    value.textContent = fact.value
    row.append(label, value)
    container.append(row)
  }
}
function render(state) {
  if (state === null) {
    responding = true
    document.body.classList.remove('visible')
    return
  }
  if (view !== undefined && state.revision <= view.revision) return
  responding = false
  view = state
  document.documentElement.lang = state.locale
  document.title = state.title
  document.getElementById('title').textContent = state.message
  document.getElementById('detail').textContent = state.detail
  document.getElementById('detail').hidden = state.detail === ''
  const release = state.release
  document.getElementById('dialog').classList.toggle('release-dialog', release !== undefined)
  document.getElementById('release').hidden = release === undefined
  document.getElementById('release').scrollTop = 0
  renderFacts('release-versions', release?.versions ?? [])
  renderFacts('release-facts', release?.facts ?? [])
  document.getElementById('release-notes-section').hidden = release?.notes === undefined
  document.getElementById('release-notes-label').textContent = release?.notes?.label ?? ''
  // Only main-process Markdown passed through the release-note sanitizer reaches this element.
  document.getElementById('release-notes').innerHTML = release?.notes?.html ?? ''
  document.getElementById('release-notes').scrollTop = 0
  document.getElementById('release-notice').textContent = release?.notice ?? ''
  document.getElementById('close').setAttribute('aria-label', state.closeLabel)
  document.getElementById('technical-details').hidden = state.technicalDetails === ''
  document.getElementById('technical-details-label').textContent = state.technicalDetailsLabel
  document.getElementById('technical-details-content').textContent = state.technicalDetails
  document.getElementById('technical-details').open = false
  document.getElementById('actions').replaceChildren()
  for (const [index, label] of state.buttons.entries()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.className = index === 0 ? 'primary' : 'secondary'
    button.addEventListener('click', () => { respond(index) })
    document.getElementById('actions').append(button)
  }
  document.querySelector('main').hidden = false
  document.getElementById('dialog').scrollTop = 0
  document.body.classList.add('visible')
  document.getElementById('dialog').focus()
}
let received = false
const unsubscribe = api.subscribe(state => { received = true; render(state) })
window.addEventListener('pagehide', unsubscribe, { once: true })
void api.status().then(state => { if (!received) render(state) })
