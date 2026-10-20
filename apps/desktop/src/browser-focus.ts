/**
 * Fixed product-document helper; prevents guest automation from taking the user's editor focus.
 * @param token - Operation identity, allowing concurrent guests to share the guard.
 * @param begin - Acquire the guard when true, release this operation when false.
 */
export function browserFocusOperation(token: string, begin: boolean): void {
  const state = globalThis as typeof globalThis & {
    w1BrowserFocus?: { tokens: Set<string>; active: HTMLElement | undefined; listener: (event: FocusEvent) => void } | undefined
  }
  if (begin) {
    if (!state.w1BrowserFocus) {
      const guard = {
        tokens: new Set<string>(),
        active: document.activeElement instanceof HTMLElement && document.activeElement.tagName !== 'WEBVIEW'
          ? document.activeElement : undefined,
        listener: (_event: FocusEvent): void => {},
      }
      guard.listener = (event) => {
        if (!(event.target instanceof HTMLElement)) return
        if (event.target.tagName !== 'WEBVIEW') { guard.active = event.target; return }
        if (guard.active?.isConnected) guard.active.focus({ preventScroll: true })
      }
      state.w1BrowserFocus = guard
      document.addEventListener('focus', guard.listener, true)
    }
    state.w1BrowserFocus.tokens.add(token)
  } else {
    const guard = state.w1BrowserFocus
    if (!guard) return
    guard.tokens.delete(token)
    if (!guard.tokens.size) {
      document.removeEventListener('focus', guard.listener, true)
      delete state.w1BrowserFocus
    }
  }
}
