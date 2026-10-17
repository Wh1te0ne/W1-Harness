/** Render upstream Markdown as inert HTML with an explicit list of external links. */
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

/** Sanitized release text and the exact HTTP(S) links a user may open. */
export interface ReleaseNotes {
  readonly html: string
  readonly links: readonly string[]
}

/**
 * Preserve release-note typography without scripts, remote images or embedded documents.
 * @param markdown - Untrusted upstream release body.
 * @returns Sanitized markup and allowed external destinations; fragment links stay in the dialog.
 */
export function renderReleaseNotes(markdown: string): ReleaseNotes {
  const links = new Set<string>()
  const html = sanitizeHtml(marked.parse(markdown, { async: false, gfm: true }), {
    allowedTags: ['p', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'del',
      'blockquote', 'pre', 'code', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: { a: ['href', 'title'], h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'] },
    allowedSchemes: ['https', 'http'],
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attributes) => ({ tagName, attribs: { ...attributes,
        ...(attributes.id === undefined ? {} : { id: `w1-release-${attributes.id}` }) } }),
      a: (tagName, attributes) => {
        const href = attributes.href
        if (href?.startsWith('#')) return { tagName, attribs: { ...attributes, href: `#w1-release-${href.slice(1)}` } }
        if (href !== undefined && /^https?:\/\//iu.test(href)) {
          const url = URL.parse(href)
          if (url !== null && url.username === '' && url.password === '') {
            links.add(url.href)
            return { tagName, attribs: { ...attributes, href: url.href } }
          }
        }
        return { tagName: 'span', attribs: {} }
      },
    },
  })
  return { html, links: [...links] }
}
