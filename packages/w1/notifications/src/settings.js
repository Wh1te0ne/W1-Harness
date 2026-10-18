const NOTIFICATION_COPY = {
  zh: { title:'通知', intro:'任务结束、出错或等待你处理时提醒。', events:'提醒内容', delivery:'提醒方式', enabled:'启用任务提醒', backgroundOnly:'仅在 W1 处于后台时弹出通知', complete:'任务结束', error:'任务出错', approval:'等待审批', question:'等待回答', system:'Windows 系统通知', flash:'任务栏高亮', badge:'任务栏未读数字', showTitle:'在系统通知中显示会话标题', test:'测试系统通知', testFlash:'5 秒后测试高亮', testBadge:'测试数字角标', clear:'全部标为已读', unread:'未读提醒', diagnostics:'通知状态与最近提醒', empty:'没有未读提醒', note:'“任务结束”也包括手动停止。测试通知不会增加未读数。Windows 勿扰模式和系统通知开关会影响横幅显示。', memory:'未读计数在本次运行内保留；只有查看对应会话时才清除该会话的计数。' },
  en: { title:'Notifications', intro:'Get notified when a task ends, fails, or needs your input.', events:'Events', delivery:'Delivery', enabled:'Enable task notifications', backgroundOnly:'Only notify while W1 is in the background', complete:'Task ended', error:'Task failed', approval:'Approval needed', question:'Answer needed', system:'Windows notifications', flash:'Taskbar highlight', badge:'Unread taskbar count', showTitle:'Include the conversation title', test:'Test notification', testFlash:'Test highlight in 5 seconds', testBadge:'Test taskbar count', clear:'Mark all as read', unread:'Unread reminders', diagnostics:'Delivery status and recent events', empty:'No unread reminders', note:'Task ended includes manual stops. Tests do not add unread items. Windows Do Not Disturb and notification settings may suppress banners.', memory:'Unread counts last for this app run. Viewing a conversation clears only its own count.' }
};
function badgeImage(count) {
  if(!count)return null;
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  const context=canvas.getContext('2d'); if(!context)return null;
  context.fillStyle='#dc424d';context.beginPath();context.arc(16,16,16,0,Math.PI*2);context.fill();
  context.fillStyle='#fff';context.font='bold '+(count>99?12:count>9?16:20)+'px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(count>99?'99+':String(count),16,17);
  return canvas.toDataURL('image/png');
}
function NotificationSettings({useReminder,setPreference,testSystem,testTaskbar,testBadge,openSession,clearUnread,t}) {
  const view=useReminder(value=>value);
  const option=key=>h('label',{key,className:'w1-notification-option'},h('span',null,t(key)),h('input',{type:'checkbox',checked:view.prefs[key],onChange:event=>setPreference(key,event.target.checked)}));
  const button=(key,onClick)=>h('button',{type:'button',onClick},t(key));
  return h('section',{className:'w1-notification-settings'},
    h('style',null,'.w1-notification-settings{padding:16px 22px;color:var(--dsw-alias-label-primary);font:14px/1.6 inherit}.w1-notification-settings h2{font-size:20px;margin:0 0 6px}.w1-notification-settings h3{font-size:14px;margin:20px 0 8px}.w1-notification-settings p{font-size:12px;opacity:.72}.w1-notification-option{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:34px}.w1-notification-option input{accent-color:var(--dsw-alias-label-primary);width:16px;height:16px}.w1-notification-settings button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);padding:6px 10px;border-radius:8px;cursor:pointer;margin:5px 6px 5px 0}.w1-notification-settings button:hover{background:var(--dsw-alias-interactive-bg-hover)}.w1-notification-history{font-size:12px;overflow-wrap:anywhere}.w1-notification-note{max-width:600px}'),
    h('h2',null,t('title')),h('p',null,t('intro')),option('enabled'),
    h('h3',null,t('events')),...['complete','error','approval','question'].map(option),
    h('h3',null,t('delivery')),...['system','backgroundOnly','flash','badge','showTitle'].map(option),
    h('div',null,button('test',testSystem),button('testFlash',testTaskbar),button('testBadge',testBadge)),
    h('p',{className:'w1-notification-note'},t('note')),
    h('details',null,h('summary',null,t('diagnostics')),h('p',null,view.notificationStatus),h('p',null,view.nativeStatus),
      ...view.history.map((item,index)=>h('div',{key:index,className:'w1-notification-history'},item.time+' · '+item.action+' · '+(LABELS[item.kind]||item.kind)))),
    h('h3',null,t('unread')+' · '+view.count),view.unread.length?button('clear',clearUnread):h('p',null,t('empty')),
    ...view.unread.map(item=>h('div',{key:item.id},h('button',{type:'button',onClick:()=>openSession(item.id)},item.title+' · '+(LABELS[item.kind]||item.kind)+' ('+item.count+')'))),h('p',null,t('memory')));
}
