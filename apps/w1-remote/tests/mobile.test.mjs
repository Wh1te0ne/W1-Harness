import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { projectEvent, projectFrame } from '../presentation.mjs';
import { createTranscript } from '../mobile/transcript.mjs';

const events = JSON.parse(await readFile(new URL('./fixtures/mobile-session.json', import.meta.url), 'utf8'));
const projected = events.map(projectEvent);
const html = await readFile(new URL('../mobile/index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../mobile/app.mjs', import.meta.url), 'utf8');
const snapshot = (records = events) => projectFrame({ type: 'snapshot', records: records.map(event => ({ event })), cursor: 6, hasMore: true });
const chunk = (type, text, name) => projectFrame({ type: 'assistant-stream', frame: { type: 'chunk', chunk: { type, text, name } } });

test('recorded session preserves thinking, tool output and final reply without empty assistant bubbles', () => {
  assert.deepEqual(projected.map(({ role, text, reasoning }) => ({ role, text, reasoning })), [
    { role: 'user', text: '检查灯的状态', reasoning: '' },
    { role: 'assistant', text: '', reasoning: '先读取设备状态。' },
    { role: 'tool', text: '调用 pwsh\n{"command":"Get-Light"}', reasoning: '' },
    { role: 'tool', text: '工具结果\n状态：已开启\n亮度：50%', reasoning: '' },
    { role: 'assistant', text: '灯已开启，亮度为 50%。', reasoning: '' },
    { role: 'status', text: '本轮结束', reasoning: '' },
  ]);
  const toolOnly = projectEvent({ type: 'assistant/message', seq: 7, data: { message: { content: [{ type: 'tool-call', name: 'write' }] } } });
  assert.equal(toolOnly.role, 'hidden');
  assert.equal(projectEvent({ type: 'request/context', data: { secret: 'not user-facing' } }), null);
});

test('tool failures and empty or truncated results remain explicit', () => {
  const result = content => projectEvent({ type: 'tool/result', data: { message: { isError: true, content } } });
  assert.equal(result([{ type: 'text', text: 'permission denied' }]).text, '工具出错\npermission denied');
  assert.match(result([]).text, /没有文本输出/);
  const text = result([{ type: 'text', text: 'x'.repeat(13_000) }]).text;
  assert.match(text, /已截断/); assert.ok(text.length < 12_100);
});

test('reconnect snapshot includes packed/raw reasoning and tool preparation state', () => {
  const frame = projectFrame({ type: 'snapshot', cursor: 1, records: [], assistantStream: { activeAttempt: { stream: [
    { type: 'reasoning-chunks', texts: ['先', '检查'] },
    { type: 'chunk', chunk: { type: 'reasoning-delta', text: '设备' } },
    { type: 'text-chunks', texts: ['正在处理'] },
    { type: 'tool-call-chunks', name: 'pwsh', args: ['{}'] },
  ] } } });
  assert.equal(frame.reasoning, '先检查设备'); assert.equal(frame.live, '正在处理');
  assert.equal(frame.progress, '正在准备调用 pwsh');
  assert.equal(chunk('reasoning-delta', '正在检查').reasoning, '正在检查');
  assert.equal(chunk('tool-call-delta', '', 'write').progress, '正在准备调用 write');
});

async function mobile(t) {
  const dom = new JSDOM(html, { url: 'https://mobile.test/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  let client, watchId;
  class FakeClient {
    constructor(options) { this.notify = options.notify; this.connected = true; client = this; }
    async request(action, args, id) {
      if (action === 'catalog') return { projects: [{ id: 'p', title: '家', sessionIds: ['s','other'] }], sessions: [
        { id: 's', title: '检查设备', running: true, updatedAt: 1 },
        { id: 'other', title: '另一个会话', running: false, updatedAt: 1 },
      ] };
      if (action === 'watch') { watchId = id; return {}; }
      if (action === 'page') return { messages: [{ seq: 0, role: 'user', text: '更早的消息' }], hasMore: false };
      return {};
    }
  }
  const context = dom.getInternalVMContext();
  const remote = new SyntheticModule(['RemoteClient'], function () { this.setExport('RemoteClient', FakeClient); }, { context });
  const view = new SyntheticModule(['createTranscript'], function () { this.setExport('createTranscript', createTranscript); }, { context });
  const app = new SourceTextModule(source, { context });
  await app.link(specifier => specifier === './client.mjs' ? remote : view);
  await app.evaluate();
  client.notify({ type: 'connected', hostName: '测试电脑' });
  await new Promise(resolve => setImmediate(resolve));
  dom.window.document.querySelector('.session').click();
  return {
    document: dom.window.document,
    frame(frame) { client.notify({ type: 'event', id: watchId, frame }); },
    async openOther() {
      dom.window.document.getElementById('back').click();
      dom.window.document.querySelectorAll('.session')[1].click();
    },
  };
}

test('actual mobile app retains opened and closed details, focus, and inner scroll across stream/reconnect/pagination', async t => {
  const app = await mobile(t), doc = app.document;
  app.frame(snapshot());
  const details = doc.querySelector('[data-seq="4"] details');
  const summary = details.querySelector('summary');
  details.open = true; summary.focus(); details.querySelector('.message-body').scrollTop = 17;
  const thinking = doc.querySelector('[data-seq="2"] details'); thinking.open = true;
  for (let i = 0; i < 30; i++) app.frame(chunk('reasoning-delta', '进展'));
  assert.equal(doc.querySelector('[data-seq="4"] details'), details);
  assert.equal(details.open, true); assert.equal(thinking.open, true);
  assert.equal(doc.activeElement, summary);
  assert.equal(details.querySelector('.message-body').scrollTop, 17);
  assert.match(doc.getElementById('live').textContent, /正在思考.*进展/s);
  app.frame(snapshot());
  assert.equal(doc.querySelector('[data-seq="4"] details'), details); assert.equal(details.open, true);
  await doc.getElementById('older').onclick();
  assert.equal(details.open, true);
  assert.match(doc.getElementById('history').textContent, /更早的消息/);
  details.open = false;
  app.frame(chunk('text-delta', '继续回复'));
  assert.equal(details.open, false);
  assert.match(doc.querySelector('[data-seq="4"] .tool-preview').textContent, /状态：已开启 亮度：50%/);
  assert.equal(details.querySelector('.message-body').textContent, '状态：已开启\n亮度：50%');
});

test('actual mobile app renders live progress, clears committed thinking, and resets disclosures between sessions', async t => {
  const app = await mobile(t), doc = app.document;
  app.frame(snapshot(events.slice(0, 1)));
  app.frame(projectFrame({ type: 'assistant-stream', frame: { type: 'start' } }));
  assert.match(doc.getElementById('live').textContent, /正在处理/);
  app.frame(chunk('reasoning-delta', '检查状态'));
  app.frame(chunk('tool-call-delta', '', 'pwsh'));
  assert.match(doc.getElementById('live').textContent, /准备调用 pwsh/);
  app.frame(projectFrame({ type: 'event', event: events[1] }));
  assert.equal(doc.getElementById('live').classList.contains('hidden'), true);
  app.frame(projectFrame({ type: 'event', event: events[2] }));
  assert.match(doc.getElementById('live').textContent, /正在执行 pwsh/);
  app.frame(projectFrame({ type: 'event', event: events[3] }));
  assert.match(doc.getElementById('live').textContent, /工具已返回/);
  app.frame(projectFrame({ type: 'event', event: events[5] }));
  assert.equal(doc.getElementById('live').classList.contains('hidden'), true);
  doc.querySelector('[data-seq="4"] details').open = true;
  await app.openOther(); app.frame(snapshot());
  assert.equal(doc.querySelector('[data-seq="4"] details').open, false);
});

test('mobile renders tool output as text and honors replacement even for hidden steps', t => {
  const dom = new JSDOM('<div id="history"></div><article id="live"><label></label><div></div></article>');
  t.after(() => dom.window.close());
  const doc = dom.window.document, view = createTranscript(doc.getElementById('history'), doc.getElementById('live'));
  view.render([{ seq: 1, role: 'tool', text: '工具结果\n<script>alert(1)</script>\nline two' }]);
  assert.equal(doc.querySelector('script'), null);
  assert.match(doc.querySelector('.message-body').textContent, /<script>/);
  view.render([{ seq: 1, role: 'tool', text: 'old' }, { seq: 2, role: 'hidden', surfaceOp: { op: 'replace', startSeq: 1, endSeq: 1 } }]);
  assert.equal(doc.getElementById('history').children.length, 0);
});
