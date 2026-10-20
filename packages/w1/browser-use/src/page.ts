/** Fixed isolated-world page operations; model arguments are data only. */
export interface PageOperation {
  readonly action: 'read' | 'point' | 'fill' | 'scroll' | 'check-key'
  readonly epoch: string
  readonly maxTextChars: number
  readonly maxElements: number
  readonly ref?: string
  readonly text?: string
  readonly delta?: number
}

/**
 * Runs only in one guest's isolated world; all dependencies stay inside this function.
 * @param input - validated command.
 * @returns JSON-compatible page observation.
 */
export function pageOperation(input: PageOperation): object {
  const world = globalThis as typeof globalThis & { w1BrowserSnapshot?: { document: Document; refs: Map<string, Element> } | undefined }
  const fail = (code: string): never => { throw new Error(code) }
  const visible = (element: Element): boolean => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
  }
  if (input.action === 'read') {
    const refs = new Map<string, Element>()
    world.w1BrowserSnapshot = { document, refs }
    const elements: object[] = []
    const candidates = document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[role="checkbox"],[contenteditable="true"],[tabindex]')
    for (const element of candidates) {
      if (!visible(element) || element instanceof HTMLInputElement && element.type === 'hidden') continue
      if (elements.length >= input.maxElements) break
      const ref = `${input.epoch}:${elements.length + 1}`
      refs.set(ref, element)
      const label = element.getAttribute('aria-label') || (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? Array.from(element.labels ?? []).map(label => label.innerText).join(' ') || element.getAttribute('placeholder')
        : (element as HTMLElement).innerText) || element.getAttribute('title') || ''
      elements.push({ ref, tag: element.tagName.toLowerCase(), role: element.getAttribute('role'),
        label: label.slice(0, 300), type: element.getAttribute('type'),
        ...element instanceof HTMLInputElement && !['password', 'file'].includes(element.type)
          || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
          ? { value: element.value.slice(0, 300) } : {},
        ...element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type) ? { checked: element.checked } : {},
        disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' })
    }
    const body = document.querySelector('body')
    const result = { url: location.href.slice(0, 8192), title: document.title.slice(0, 500),
      text: body === null ? '' : body.innerText.slice(0, input.maxTextChars),
      elements, truncated: candidates.length > elements.length, frames: document.querySelectorAll('iframe').length }
    // Bound the encoded observation, including escaped strings and element metadata.
    while (JSON.stringify(result).length > 60000) {
      if (elements.length > 0) elements.pop()
      else result.text = result.text.slice(0, Math.floor(result.text.length / 2))
      result.truncated = true
    }
    return result
  }
  if (input.action === 'scroll') { window.scrollBy(0, input.delta ?? 0); return { delivered: true } }
  if (input.action === 'check-key') {
    let active = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (active instanceof HTMLIFrameElement) fail('unsupported-frame')
    if (active instanceof HTMLInputElement && ['password', 'file'].includes(active.type)) fail('sensitive-input')
    return { delivered: false }
  }
  const saved = world.w1BrowserSnapshot
  const element = saved?.document === document ? saved.refs.get(input.ref ?? '') : undefined
  if (element === undefined || !element.isConnected || !visible(element)) throw new Error('stale-element')
  const target = element
  if (target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') fail('disabled-element')
  if (target instanceof HTMLInputElement && ['password', 'file'].includes(target.type)) fail('sensitive-input')
  if (input.action === 'fill') {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      // The native setter is invoked with the target as its explicit receiver.
      // oxlint-disable-next-line typescript/unbound-method
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter === undefined || target.readOnly) throw new Error('unsupported-input')
      setter.call(target, input.text ?? '')
    } else if (target instanceof HTMLSelectElement) target.value = input.text ?? ''
    else if (target instanceof HTMLElement && target.isContentEditable) target.textContent = input.text ?? ''
    else fail('unsupported-input')
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    ;(target as HTMLElement).focus()
    world.w1BrowserSnapshot = undefined
    return { delivered: true }
  }
  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  const rect = target.getBoundingClientRect()
  const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2))
  const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
  const hit = document.elementFromPoint(x, y)
  if (hit === null || hit !== target && !target.contains(hit)) fail('occluded-element')
  world.w1BrowserSnapshot = undefined
  return { x: Math.round(x), y: Math.round(y) }
}
