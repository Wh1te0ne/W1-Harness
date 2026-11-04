/** Human-readable transcript export from the complete, validated Session log. */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionLogSnapshot } from '@deepseek-ai/dsh-session-query'

function textContent(content: readonly ContentBlock[]): string {
  return content.flatMap((block) => {
    if (block.type === 'text') return [block.text]
    if (block.type === 'file') return [`[附件：${block.attachment.name}]`]
    if (block.type === 'image') return ['[图片附件]']
    return []
  }).join('\n\n')
}

/** Preserve user/assistant text and code fences; omit tools, reasoning, and injected context. */
export function sessionMarkdown(snapshot: SessionLogSnapshot): string {
  const sections: string[] = []
  for (const event of snapshot.events) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      sections.push(`## 用户\n\n${textContent(event.data.content)}`)
    } else if (event.type === 'assistant/message') {
      const text = textContent(event.data.message.content)
      if (text) sections.push(`## 助手\n\n${text}`)
    }
  }
  return sections.join('\n\n---\n\n') + '\n'
}
