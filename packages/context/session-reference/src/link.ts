/** W1 conversation links shared by the desktop carrier, clipboard, and reference resolver. */
export type SessionLinkScheme = 'w1-harness' | 'w1-harness-test'

/** Encode one opaque Session ID for the selected W1 environment. */
export function encodeSessionLink(id: string, scheme: SessionLinkScheme): string {
  if (!id) throw new Error('Session ID is empty')
  return `${scheme}://session/${encodeURIComponent(id).replace(/[.!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

/** Decode a canonical conversation link, rejecting foreign profiles and extra URL fields. */
export function decodeSessionLink(link: string, scheme: SessionLinkScheme): string {
  const prefix = `${scheme}://session/`
  if (!link.startsWith(prefix)) throw new Error('This conversation link belongs to another W1 environment')
  const id = decodeURIComponent(link.slice(prefix.length))
  if (encodeSessionLink(id, scheme) !== link) throw new Error('Invalid W1 conversation link')
  return id
}
