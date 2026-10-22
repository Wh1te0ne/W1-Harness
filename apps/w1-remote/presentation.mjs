// A deliberately bounded mobile projection; storage and model credentials stay on the host.
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => part?.type === 'text' ? part.text : part?.type === 'image' ? '[图片]' : part?.type === 'file' ? '[文件]' : '').filter(Boolean).join('\n');
}
function bounded(text, limit = 30_000) {
  return text.length > limit ? text.slice(0, limit) + '\n[内容过长，已截断；完整内容请在电脑查看]' : text;
}
export function projectEvent(event) {
  const data = event.data ?? {}; let role, text, reasoning = '', kind, callId;
  if (event.type === 'user/message') { role = 'user'; text = textOf(data.content); }
  else if (event.type === 'assistant/message') {
    role = 'assistant'; text = textOf(data.message?.content);
    reasoning = (data.message?.content ?? []).filter(part => part.type === 'reasoning').map(part => part.text).join('\n');
    // Tool-only steps already have separate call events; keep their surface metadata without an empty bubble.
    if (!text.trim() && !reasoning.trim()) role = 'hidden';
  }
  else if (event.type === 'tool/call') { role = 'tool'; kind = 'call'; callId = data.callId; text = `调用 ${data.name ?? '工具'}\n${bounded(String(data.arguments ?? ''), 2400)}`; }
  else if (event.type === 'tool/result') {
    role = 'tool'; kind = 'result'; callId = data.message?.toolCallId ?? data.message?.source?.callId;
    text = `${data.error || data.message?.isError ? '工具出错' : '工具结果'}\n${bounded(textOf(data.content ?? data.message?.content), 12_000) || '工具已返回，没有文本输出'}`;
  }
  else if (event.type === 'turn/end') { role = 'status'; text = '本轮结束'; }
  else if (event.type === 'approval/asked') { role = 'status'; text = '任务正在请求授权，请在电脑端处理'; }
  else return null;
  return { seq: event.seq, time: event.time, role, text: bounded(text || ''), reasoning: bounded(reasoning), kind, callId, surfaceOp: event.surfaceOp };
}
export function streamText(records = [], channel = 'text') { return bounded(records.map(r => r.type === `${channel}-chunks` ? r.texts.join('') : r.type === 'chunk' && r.chunk?.type === `${channel}-delta` ? r.chunk.text : '').join('')); }
function progress(chunk) {
  if (chunk?.type === 'reasoning-delta') return '正在思考';
  if (chunk?.type === 'text-delta') return '正在回复';
  if (chunk?.type === 'tool-call-delta') return `正在准备调用${chunk.name ? ' ' + chunk.name : '工具'}`;
  return '';
}
export function projectFrame(frame) {
  if (frame.type === 'snapshot') {
    const attempt = frame.assistantStream?.activeAttempt, records = attempt?.stream ?? [];
    const last = records.findLast(r => ['text-chunks', 'reasoning-chunks', 'tool-call-chunks'].includes(r.type) || progress(r.chunk));
    const chunk = last?.type === 'chunk' ? last.chunk : last ? { type: last.type.replace('-chunks', '-delta'), name: last.name } : undefined;
    return { type: 'snapshot', cursor: frame.cursor, hasMore: frame.hasMore,
      messages: frame.records.map(r => projectEvent(r.event)).filter(Boolean),
      live: streamText(records), reasoning: streamText(records, 'reasoning'), progress: attempt ? progress(chunk) || '正在处理' : '',
      title: frame.projections?.values?.title ?? '' };
  }
  if (frame.type === 'assistant-stream') {
    const f = frame.frame; return { type: 'live', operation: f.type,
      text: f.type === 'chunk' && f.chunk?.type === 'text-delta' ? f.chunk.text : '',
      reasoning: f.type === 'chunk' && f.chunk?.type === 'reasoning-delta' ? f.chunk.text : '',
      progress: f.type === 'start' ? '正在处理' : progress(f.chunk) };
  }
  return { type: 'event', message: projectEvent(frame.event), cursor: frame.event.seq };
}
