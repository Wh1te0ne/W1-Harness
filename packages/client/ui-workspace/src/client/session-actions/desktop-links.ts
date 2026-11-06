/** Narrow desktop capability used by workspace navigation and copy actions. */
export interface DesktopSessionLinks {
  create(id: string): Promise<string>
  resolve(link: string): Promise<string>
  pending(): Promise<{ id: string | null; scheme: 'w1-harness' | 'w1-harness-test' }>
  acknowledge(id: string): Promise<void>
  onOpen(listener: () => void): () => void
}

/**
 * Return the origin-restricted preload capability when running in W1 Desktop.
 * @returns the Desktop link capability, or undefined outside a compatible W1 window.
 */
export function desktopSessionLinks(): DesktopSessionLinks | undefined {
  return (globalThis as typeof globalThis & { dshDesktop?: { sessions?: DesktopSessionLinks } }).dshDesktop?.sessions
}
