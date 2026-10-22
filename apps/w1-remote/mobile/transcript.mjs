/** Update rows in place so streamed events do not reset disclosure, focus, or text selection. */
export function createTranscript(history, live) {
  const document = history.ownerDocument, rows = new Map();
  function element(tag, className, text = '') {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
  }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function createRow(message) {
    const article = element('article', message.role); article.dataset.seq = message.seq;
    const label = element('label', '', { user: '你', assistant: 'W1', status: '', tool: '执行记录' }[message.role] ?? '');
    const body = element('div', 'message-body'), preview = element('div', 'tool-preview');
    const details = element('details', ''), summary = element('summary', '');
    const thinking = element('details', 'thinking'), thinkingTitle = element('summary', '', '思考过程'), thinkingBody = element('div', 'message-body');
    thinking.append(thinkingTitle, thinkingBody);
    if (message.role === 'tool') { details.append(summary, body); article.append(preview, details); }
    else article.append(label, thinking, body);
    return { article, label, body, preview, details, summary, thinking, thinkingBody };
  }
  const liveLabel = live.querySelector('label'), liveBody = live.querySelector('div');
  const liveReasoning = element('div', 'message-body live-reasoning');
  live.insertBefore(liveReasoning, liveBody);
  return {
    reset() { rows.clear(); history.replaceChildren(); },
    render(messages, state = {}) {
      const surface = [];
      for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
        if (message.surfaceOp?.op === 'replace') {
          for (let i = surface.length - 1; i >= 0; i--) {
            if (surface[i].seq >= message.surfaceOp.startSeq && surface[i].seq <= message.surfaceOp.endSeq) surface.splice(i, 1);
          }
        }
        surface.push(message);
      }
      const visible = surface.filter(m => m.role !== 'hidden' && !(m.role === 'assistant' && m.text === '[无文本内容]'));
      const wanted = new Set(visible.map(m => m.seq));
      for (const [seq, row] of rows) if (!wanted.has(seq)) { row.article.remove(); rows.delete(seq); }
      let position = history.firstChild;
      for (const message of visible) {
        let row = rows.get(message.seq);
        if (!row || row.article.className !== message.role) {
          if (row?.article === position) position = row.article.nextSibling;
          row?.article.remove(); row = createRow(message); rows.set(message.seq, row);
        }
        if (row.article !== position) history.insertBefore(row.article, position);
        position = row.article.nextSibling;
        if (message.role === 'tool') {
          const newline = message.text.indexOf('\n');
          const title = newline < 0 ? message.text : message.text.slice(0, newline);
          const content = newline < 0 ? '' : message.text.slice(newline + 1);
          const excerpt = content.trim().replace(/\s+/g, ' ');
          setText(row.preview, excerpt.slice(0, 180) + (excerpt.length > 180 ? '…' : ''));
          row.preview.hidden = !excerpt;
          setText(row.summary, title + ' · 详情');
          setText(row.body, content || '没有文本输出');
        } else {
          setText(row.body, message.text ?? '');
          row.body.hidden = !message.text;
          setText(row.thinkingBody, message.reasoning ?? '');
          row.thinking.hidden = !message.reasoning;
          setText(row.label, message.reasoning && !message.text ? 'W1 · 思考过程' : { user: '你', assistant: 'W1', status: '' }[message.role] ?? '');
        }
      }
      live.classList.toggle('hidden', !state.text && !state.reasoning && !state.progress);
      setText(liveLabel, 'W1 · ' + (state.progress || '正在回复'));
      setText(liveBody, state.text ?? '');
      setText(liveReasoning, state.reasoning ?? '');
      liveReasoning.hidden = !state.reasoning;
    },
  };
}
