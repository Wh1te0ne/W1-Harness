const React = require('react');
const h = React.createElement;
const inject = ['connection', 'remote', 'sessions', 'uiSession', 'uiWorkspace', 'slots', 'locale'];
const LABELS = { complete: '任务已结束', error: '任务发生错误', approval: '等待你的审批', question: '等待你的回答' };
const DEFAULTS = { enabled: true, backgroundOnly: true, complete: true, error: true, approval: true, question: true, system: true, flash: true, badge: true, showTitle: false };
const STORAGE_KEY = 'w1.notifications.preferences.v1';

function apply(ctx) {
  const bridge = globalThis.dshDesktop?.notifications;
  if (!bridge) return;
  const state = new ReminderState();
  let prefs = { ...DEFAULTS };
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('dsh-task-notifier.preferences.v1') || '{}'); for (const key of Object.keys(DEFAULTS)) if (typeof saved[key] === 'boolean') prefs[key] = saved[key]; } catch {}
  let alive = true, nativeStatus = '尚未检查', notificationStatus = '';
  let generation = ctx.connection.generation.getSnapshot();
  let baselinePending = ctx.sessions.list.getSnapshot().phase !== 'ready';
  const listeners = new Set(), timers = new Map(), notifications = new Map();
  let nativeTimer, testTimer, attentionRequested = false, nativeChain = Promise.resolve();
  let badgeTestTimer, badgeTest = false;
  const attention = new Map(), interactionTimers = new Map(), history = [];
  const isDesktop = !!window.dshDesktop && /Win/.test(navigator.platform);
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  const selected = () => ctx.uiSession.adapter.current.getSnapshot()?.key;
  let snapshot;
  const refreshSnapshot = () => { snapshot = {prefs, nativeStatus, notificationStatus, count:state.count, history:[...history], unread:[...state.unread.values()].sort((a,b)=>b.time-a.time).map(item=>({...item,title:ctx.sessions.list.getSnapshot().byId[item.id]?.title || '会话'}))}; };
  const publish = () => { refreshSnapshot(); for (const f of listeners) f(); };
  const store = {getSnapshot:()=>snapshot,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);}};
  const rows = () => Object.values(ctx.sessions.list.getSnapshot().byId);
  const closeNotification = id => { notifications.delete(id); void bridge.close(id).catch(()=>{}); };
  const cancelCompletion = id => { clearTimeout(timers.get(id)); timers.delete(id); };

  function record(event, action) {
    history.unshift({ time: new Date().toLocaleTimeString(), id: event.id, kind: event.kind, action });
    if (history.length > 50) history.length = 50;
    publish();
  }
  function validEvent(event) {
    const row = ctx.sessions.list.getSnapshot().byId[event.id];
    if (!row || !prefs.enabled || !prefs[event.kind]) return false;
    if (event.kind === 'complete') return !row.parentId && row.origin !== 'subagent' && state.running.get(event.id) === false && !state.pending.has(event.id);
    if (event.kind === 'error') return state.failures.has(event.id);
    return state.pending.get(event.id) === event.key && ctx.uiSession.sessionStatus.getSnapshot().get(event.id)?.pendingInteraction?.key === event.key;
  }
  function pruneAttention() {
    let changed = false;
    for (const [id, event] of attention) if (!validEvent(event)) {
      attention.delete(id); closeNotification(id); record(event, '撤销：原因已失效'); changed = true;
    }
    return changed;
  }
  function cancelInteraction(id) { clearTimeout(interactionTimers.get(id)); interactionTimers.delete(id); }
  function clearDelayed() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const timer of interactionTimers.values()) clearTimeout(timer);
    interactionTimers.clear();
  }
  function nativeSync({ flash = false, focus = false, probe = false } = {}) {
    nativeChain = nativeChain.catch(()=>{}).then(async()=>{
      if(!alive)return false;
      pruneAttention();
      const count=prefs.enabled&&prefs.badge?Math.min(9999,badgeTest?Math.max(1,state.count):state.count):0;
      const result=await bridge.sync({count,flash:flash&&(attentionRequested||attention.size>0)&&prefs.enabled&&prefs.flash&&!foreground(),focus,probe,badge:badgeImage(count)});
      nativeStatus=result.supported?'已连接 W1 原生任务栏提醒':'当前系统不支持任务栏提醒';
      return result.supported;
    }).catch(()=>{nativeStatus='任务栏提醒失败，请重试';return false;}).finally(()=>{if(alive)publish();});
    return nativeChain;
  }
  function updateNative(flash) {
    if (flash === false) { attentionRequested = false; attention.clear(); }
    clearTimeout(nativeTimer);
    nativeTimer = setTimeout(() => nativeSync({ flash: true }), 100);
  }
  function acknowledge() {
    if (!foreground()) return;
    const id = selected();
    if (state.acknowledge(id)) { closeNotification(id); publish(); }
    updateNative(false);
  }
  function returnedToDsh() {
    if (!foreground()) return;
    clearTimeout(testTimer);
    cancelBadgeTest();
    acknowledge();
  }
  function cancelBadgeTest() { clearTimeout(badgeTestTimer); badgeTest = false; }
  function openSession(id) {
    window.focus();
    if (id !== 'test') ctx.uiWorkspace.openSession(id);
    nativeSync({ focus: true });
    // Navigation is asynchronous; the main binding subscription acknowledges
    // only after the requested session actually becomes visible.
  }
  function showSystem(event) {
    if(!prefs.system){notificationStatus='系统通知开关已关闭';publish();return;}
    const row=ctx.sessions.list.getSnapshot().byId[event.id];
    const body=event.id==='test'?'这是一条测试通知，不代表真实任务完成。':prefs.showTitle&&typeof row?.title==='string'?row.title:'点击返回对应会话';
    const token={}; notifications.set(event.id,token);
    notificationStatus='正在投递系统通知…';publish();
    void bridge.show({id:event.id,title:LABELS[event.kind]||'通知测试',body:body.slice(0,500)}).then(result=>{
      if(!alive||notifications.get(event.id)!==token)return;
      notificationStatus=result.status==='shown'?'Windows 已报告显示；横幅仍受系统勿扰设置影响。':result.status==='unsupported'?'当前系统不支持通知':result.status==='cancelled'?'提醒已撤销':result.status==='unconfirmed'?'系统尚未确认显示，请检查 Windows 通知设置。':'系统通知投递失败：'+(result.message||'未知错误');
      publish();
    }).catch(()=>{if(alive){notificationStatus='系统通知调用失败，请重试';publish();}});
  }
  function deliver(event) {
    if (!alive || !event) return;
    if (!validEvent(event)) { record(event, '跳过：子任务、已恢复或提醒已失效'); return; }
    const active = foreground();
    if (!(active && selected() === event.id)) { state.add(event); publish(); }
    const alert = !prefs.backgroundOnly || !active;
    if (alert) showSystem(event);
    if (alert && !active && prefs.flash) attention.set(event.id, event);
    record(event, active ? '记录提醒（窗口在前台）' : '记录后台提醒');
    updateNative();
  }
  function seed() {
    clearDelayed();
    if (attention.size || attentionRequested) updateNative(false);
    state.baseline(rows());
    for (const [id, item] of ctx.uiSession.sessionStatus.getSnapshot()) if (item.pendingInteraction) state.pending.set(id, item.pendingInteraction.key);
  }
  seed();
  ctx.remote.$on('api-session/status', (id, running) => {
    if (running) cancelCompletion(id);
    if (!generation || baselinePending) return;
    const event = state.status(id, running);
    if (running) { pruneAttention(); updateNative(); }
    if (event) { cancelCompletion(id); timers.set(id, setTimeout(() => { timers.delete(id); deliver(event); }, 500)); }
  });
  ctx.remote.$on('api-session/error', id => {
    cancelCompletion(id);
    if (!generation || baselinePending || state.failures.has(id)) return;
    deliver(state.error(id));
  });
  ctx.remote.$on('api-session/removed', id => { cancelCompletion(id); cancelInteraction(id); state.remove(id); pruneAttention(); closeNotification(id); publish(); updateNative(); });
  ctx.effect(() => ctx.uiSession.sessionStatus.subscribe(() => {
    if (!generation || baselinePending) return;
    for (const [id, item] of ctx.uiSession.sessionStatus.getSnapshot()) {
      const event = state.interaction(id, item.pendingInteraction);
      if (event) {
        cancelCompletion(id); cancelInteraction(id);
        interactionTimers.set(id, setTimeout(() => { interactionTimers.delete(id); deliver(event); }, 500));
      } else if (!item.pendingInteraction) cancelInteraction(id);
    }
    for (const id of state.pending.keys()) if (!ctx.uiSession.sessionStatus.getSnapshot().has(id)) { cancelInteraction(id); state.interaction(id, null); }
    pruneAttention(); updateNative();
  }));
  ctx.effect(() => ctx.sessions.list.subscribe(() => {
    const list = ctx.sessions.list.getSnapshot();
    if (list.phase !== 'ready') return;
    if (baselinePending) { seed(); baselinePending = false; }
    for (const row of Object.values(list.byId)) if (!state.running.has(row.id)) state.running.set(row.id, row.running);
    let removed = false;
    for (const id of state.unread.keys()) if (!list.byId[id]) { state.remove(id); closeNotification(id); removed = true; }
    const revoked = pruneAttention();
    if (removed || revoked) { publish(); updateNative(); }
    acknowledge();
  }));
  ctx.effect(() => ctx.connection.generation.subscribe(() => {
    generation = ctx.connection.generation.getSnapshot();
    baselinePending = true;
    seed(); // reconnect is a baseline, never a synthetic completion
  }));
  ctx.effect(() => ctx.uiSession.adapter.current.subscribe(acknowledge));
  ctx.effect(() => {
    window.addEventListener('focus', returnedToDsh);
    document.addEventListener('visibilitychange', returnedToDsh);
    return () => { window.removeEventListener('focus', returnedToDsh); document.removeEventListener('visibilitychange', returnedToDsh); };
  });
  function setPreference(key, value) {
    prefs = { ...prefs, [key]: value };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { notificationStatus = '浏览器存储不可用，设置仅本次有效'; }
    if (!prefs.enabled) { clearDelayed(); state.unread.clear(); for (const id of notifications.keys()) closeNotification(id); }
    if (!prefs.enabled || !prefs.flash) { clearTimeout(testTimer); attentionRequested = false; attention.clear(); }
    if (!prefs.enabled || !prefs.badge) cancelBadgeTest();
    pruneAttention();
    publish(); updateNative();
  }
  function testBadge() {
    if (!isDesktop || !prefs.enabled || !prefs.badge) { nativeStatus = '请在 Windows 桌面客户端启用任务提醒和数字角标。'; publish(); return; }
    cancelBadgeTest();
    badgeTest = true;
    updateNative();
    badgeTestTimer = setTimeout(() => { cancelBadgeTest(); updateNative(); }, 5000);
  }
  function testTaskbar() {
    clearTimeout(testTimer);
    if (!isDesktop) { nativeStatus = '任务栏测试仅用于 Windows 桌面客户端'; publish(); return; }
    if (!prefs.enabled || !prefs.flash) { nativeStatus = '请先启用任务提醒和任务栏高亮。'; publish(); return; }
    nativeStatus = '5 秒后测试任务栏高亮，请切到其他应用；切回 W1 后停止。'; publish();
    testTimer = setTimeout(async () => {
      if (!alive) return;
      if (foreground()) { nativeStatus = 'W1 仍在前台，本次未启动高亮。请重新测试并在 5 秒内切到其他应用。'; publish(); return; }
      attentionRequested = true;
      await nativeSync({ flash: true });
    }, 5000);
  }
  refreshSnapshot();
  ctx.effect(()=>ctx.locale.register('w1-notifications',NOTIFICATION_COPY),'w1-notifications: dictionaries');
  ctx.effect(()=>bridge.onClick(id=>{if(alive)openSession(id);}), 'w1-notifications: notification clicks');
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'w1-notifications',order:70,locale:'w1-notifications',label:()=>ctx.locale.bind('w1-notifications')('title'),
    inject:()=>({hooks:{reminder:store},setPreference,testSystem:()=>showSystem({id:'test',kind:'test'}),testTaskbar,testBadge,openSession,
      clearUnread:()=>{clearTimeout(testTimer);cancelBadgeTest();clearDelayed();state.unread.clear();for(const id of notifications.keys())closeNotification(id);publish();updateNative(false);}})},NotificationSettings));
  ctx.effect(() => () => {
    alive = false; clearTimeout(nativeTimer); clearTimeout(testTimer); cancelBadgeTest();
    clearDelayed();
    for (const id of notifications.keys()) closeNotification(id);
    listeners.clear();
    void bridge.sync({count:0,flash:false,focus:false,probe:false,badge:null}).catch(()=>{});
  });
  acknowledge();
}
