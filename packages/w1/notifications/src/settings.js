const {Button:NotificationButton,Switch:NotificationSwitch}=require('@deepseek-ai/dsh-client-ui-primitives');
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
  const option=key=>h('div',{key,className:'w1-notification-option'},
    h('span',null,t(key)),h(NotificationSwitch,{label:t(key),checked:view.prefs[key],onChange:checked=>setPreference(key,checked)}));
  const button=(key,onClick)=>h(NotificationButton,{size:'sm',variant:'outline',onClick},t(key));
  const card=(...children)=>h('div',{className:'w1-notification-card'},...children);
  return h('section',{className:'w1-notification-settings'},
    h('style',null,`
      .w1-notification-settings{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
      .w1-notification-settings h2{font-size:22px;font-weight:550;margin:0 0 4px}
      .w1-notification-settings h3{font-size:13px;font-weight:550;margin:8px 0 0}
      .w1-notification-settings p{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);margin:0 0 8px}
      .w1-notification-card{border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0 14px}
      .w1-notification-option{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;font-size:13px}
      .w1-notification-option+.w1-notification-option{border-top:1px solid var(--dsw-alias-border-l2)}
      .w1-notification-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
      .w1-notification-settings summary{font-size:13px;line-height:30px;cursor:pointer}
      .w1-notification-history{font-size:12px;line-height:1.7;overflow-wrap:anywhere}
      .w1-notification-unread{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
    `),
    h('h2',null,t('title')),h('p',null,t('intro')),card(option('enabled')),
    h('h3',null,t('events')),card(...['complete','error','approval','question'].map(option)),
    h('h3',null,t('delivery')),card(...['system','backgroundOnly','flash','badge','showTitle'].map(option)),
    h('div',{className:'w1-notification-actions'},button('test',testSystem),button('testFlash',testTaskbar),button('testBadge',testBadge)),
    h('p',null,t('note')),
    h('details',null,h('summary',null,t('diagnostics')),h('p',null,view.notificationStatus),h('p',null,view.nativeStatus),
      ...view.history.map((item,index)=>h('div',{key:index,className:'w1-notification-history'},item.time+' · '+item.action+' · '+(LABELS[item.kind]||item.kind)))),
    h('h3',null,t('unread')+' · '+view.count),view.unread.length?h('div',{className:'w1-notification-actions'},button('clear',clearUnread)):h('p',null,t('empty')),
    h('div',{className:'w1-notification-unread'},...view.unread.map(item=>h(NotificationButton,{key:item.id,size:'sm',variant:'outline',onClick:()=>openSession(item.id)},item.title+' · '+(LABELS[item.kind]||item.kind)+' ('+item.count+')'))),
    h('p',null,t('memory')));
}
