import { describe, expect, it } from 'vitest'
import { renderReleaseNotes } from '../src/release-notes.ts'

describe('upstream release-note rendering', () => {
  it('renders mixed Markdown and HTML headings, lists, anchors and changelog links', () => {
    const notes = renderReleaseNotes('[中文](#cn) | [English](#en)\n\n<h3 id="cn">新增功能</h3>\n\n- 支持 **新模型**\n- 支持 `Search API`\n\n<h3 id="en">New features</h3>\n\n[Full changelog](https://github.com/deepseek-ai/deepseek-harness/compare/rc.1...rc.2)')
    expect(notes).toMatchSnapshot()
    expect(notes.html).toContain('<h3 id="w1-release-cn">新增功能</h3>')
    expect(notes.html).toContain('href="#w1-release-cn"')
    expect(notes.html).toContain('<li>支持 <strong>新模型</strong></li>')
  })

  it('removes executable markup, remote resources, DOM ids and unsafe destinations', () => {
    const notes = renderReleaseNotes('<h3 id="actions" onclick="attack()">Notes</h3>\n\n<script>attack()</script><iframe src="https://example.com"></iframe><img src="https://example.com/pixel" onerror="attack()">\n\n[bad](javascript:attack) [file](file:///C:/private) [relative](//example.com) [credentials](https://user:password@example.com/) [safe](https://example.com/notes)')
    expect(notes.links).toEqual(['https://example.com/notes'])
    expect(notes.html).not.toMatch(/<script|<iframe|<img|onclick|onerror|javascript:|file:|password|id="actions"/u)
    expect(notes.html).toContain('id="w1-release-actions"')
    expect(notes.html).toContain('href="https://example.com/notes"')
  })

  it('keeps long notes beyond the old dialog excerpt and renders tables and code', () => {
    const notes = renderReleaseNotes(`${'Paragraph. '.repeat(200)}\n\n| Change | Status |\n| --- | --- |\n| Search | Ready |\n\n\`\`\`js\nconst value = '<safe>';\n\`\`\`\n\nFinal paragraph.`)
    expect(notes.html).toContain('<table>')
    expect(notes.html).toContain('&lt;safe&gt;')
    expect(notes.html).toContain('Final paragraph.')
  })
})
