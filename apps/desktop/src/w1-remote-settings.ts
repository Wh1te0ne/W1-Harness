/** Phone management exposed only through the primary product renderer's validated IPC. */
import { clipboard } from 'electron'
import { pairingQr } from '@w1h/remote/qr'

/** Validate a management operation and render its locally generated pairing code as an image. */
export async function manageW1Remote(
  action: unknown, value: unknown, manage: (action: string, value?: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (typeof action !== 'string' || !['status', 'configure', 'pair', 'approve', 'reject', 'revoke', 'copy'].includes(action)) throw new Error('无效的远程设置操作')
  const result = await manage(action === 'copy' ? 'status' : action, value)
  if (typeof result !== 'object' || result === null) return result
  const state = result as Record<string, unknown>
  const pairing = state.pairing
  const url = typeof pairing === 'object' && pairing !== null && 'url' in pairing && typeof pairing.url === 'string' ? pairing.url : undefined
  if (action === 'copy') { if (!url) throw new Error('配对信息已过期，请重新生成二维码'); await clipboard.writeText(url); return null }
  return { ...state, qrDataUrl: url ? 'data:image/svg+xml;base64,' + Buffer.from(pairingQr(url)).toString('base64') : null }
}
