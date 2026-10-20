/**
 * Observe a trusted click at the intended target in the fixed isolated world.
 * @param token - Operation identity.
 * @param point - Arms observation at this point; omission reads and clears the receipt.
 * @returns whether the target received a trusted click, or null after document replacement.
 */
export function clickReceipt(token: string, point?: { x: number; y: number }): { observed: boolean | null } {
  const world = globalThis as typeof globalThis & {
    w1ClickReceipt?: { token: string; observed: boolean; listener: (event: MouseEvent) => void } | undefined
  }
  const previous = world.w1ClickReceipt
  if (previous) document.removeEventListener('click', previous.listener, true)
  delete world.w1ClickReceipt
  if (!point) return { observed: previous?.token === token ? previous.observed : null }
  const target = document.elementFromPoint(point.x, point.y)
  const receipt = { token, observed: false, listener: (_event: MouseEvent): void => {} }
  receipt.listener = (event) => {
    if (event.isTrusted && target !== null && event.composedPath().includes(target)) receipt.observed = true
  }
  world.w1ClickReceipt = receipt
  document.addEventListener('click', receipt.listener, true)
  return { observed: false }
}
