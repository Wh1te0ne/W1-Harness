// A deliberately bounded mobile projection; storage and model credentials stay on the host.
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => part?.type === 'text' ? part.text : part?.type === 'image' ? '[图片]' : part?.type === 'file' ? '[文件]' : '').join('\n');
}
export function projectEvent(event) {
  const data = event.data ?? {}; let role, text;
  if (event.type === 'user/message') { role = 'user'; text = textOf(data.content); }
  else if (event.type === 'assistant/message') { role = 'assistant'; text = textOf(data.message?.content); }
  else if (event.type === 'tool/call') { role = 'tool'; text = `调用 ${data.name ?? '工具'}\n${String(data.arguments ?? '').slice(0, 2400)}`; }
  else if (event.type === 'tool/result') { role = 'tool'; text = `${data.error ? '工具出错' : '工具结果'}\n${textOf(data.content ?? data.message?.content).slice(0, 4000)}`; }
  else if (event.type === 'turn/end') { role = 'status'; text = '本轮结束'; }
  else if (event.type === 'approval/asked') { role = 'status'; text = '任务正在请求授权，请在电脑端处理'; }
  else return null;
  return { seq: event.seq, time: event.time, role, text: (text || '[无文本内容]').slice(0, 30_000), surfaceOp: event.surfaceOp };
}
export function streamText(records = []) { return records.map(r => r.type === 'text-chunks' ? r.texts.join('') : r.type === 'chunk' && r.chunk?.type === 'text-delta' ? r.chunk.text : '').join(''); }
export function projectFrame(frame) {
  if (frame.type === 'snapshot') return { type: 'snapshot', cursor: frame.cursor, hasMore: frame.hasMore,
    messages: frame.records.map(r => projectEvent(r.event)).filter(Boolean),
    live: streamText(frame.assistantStream?.activeAttempt?.stream), title: frame.projections?.values?.title ?? '' };
  if (frame.type === 'assistant-stream') {
    const f = frame.frame; return { type: 'live', operation: f.type, text: f.type === 'chunk' && f.chunk?.type === 'text-delta' ? f.chunk.text : '' };
  }
  return { type: 'event', message: projectEvent(frame.event), cursor: frame.event.seq };
}
