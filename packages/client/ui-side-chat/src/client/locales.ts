export const zh = {
  copy: '复制', copied: '已复制', copyFailed: '复制失败，请选择文字后复制', footnotes: '脚注',
  title: '侧边聊天', description: '随时提问，不打断主会话',
  hint: '侧边聊天是临时聊天，关闭标签或应用后会消失。',
  context: '已参考打开时的主会话 · {count} 条消息', mode: '仅聊天', newChat: '新建侧边聊天',
  placeholder: '和 W1 一起工作', send: '发送', stop: '停止侧边回复',
  opening: '正在准备侧边聊天…', thinking: '正在回复…', stopped: '已停止侧边回复',
  requestFailed: '侧边聊天暂时不可用，你的消息已保留', errorDetails: '查看错误详情',
  closeTitle: '关闭侧边聊天？', closeDescription: '这个侧边聊天将被删除，且无法恢复。你确定吗？',
  cancel: '取消', closeConfirm: '关闭侧边聊天',
} satisfies Record<string, string>
export type SideKey = keyof typeof zh
export const en: Record<SideKey, string> = {
  copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed. Select the text to copy it.', footnotes: 'Footnotes',
  title: 'Side chat', description: 'Ask without interrupting the main chat',
  hint: 'Side chats are temporary and disappear when the tab or app closes.',
  context: 'References the main chat at opening · {count} messages', mode: 'Chat only', newChat: 'New side chat',
  placeholder: 'Work with W1', send: 'Send', stop: 'Stop side response',
  opening: 'Preparing side chat…', thinking: 'Responding…', stopped: 'Side response stopped',
  requestFailed: 'Side chat is unavailable. Your message has been kept.', errorDetails: 'View error details',
  closeTitle: 'Close side chat?', closeDescription: 'This side chat will be deleted and cannot be recovered. Are you sure?',
  cancel: 'Cancel', closeConfirm: 'Close side chat',
}
