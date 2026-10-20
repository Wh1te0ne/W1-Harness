/** `goal` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'review.reviewing': '正在复核完成情况',
  'review.needs-work': '复核发现尚有未完成项',
  'review.insufficient-evidence': '待补充验收证据',
  'review.runtime-error': '完成复核未通过执行',
  'phase.active': '进行中的目标',
  'phase.active.disarmed': '已暂停的目标',
  'phase.paused': '已暂停的目标',
  'phase.blocked': '受阻的目标',
  'objective.aria': '目标内容',
  'commandInput.aria': '指令输入',
  'action.save': '保存目标',
  'action.cancel': '取消编辑',
  'action.pause': '暂停目标',
  'action.resume': '恢复目标',
  'action.edit': '编辑目标',
  'action.clear': '清除目标',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'review.reviewing': 'Reviewing completion',
  'review.needs-work': 'Review found remaining work',
  'review.insufficient-evidence': 'Verification evidence needed',
  'review.runtime-error': 'Completion review unavailable',
  'phase.active': 'Ongoing Goal',
  'phase.active.disarmed': 'Inactive Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<GoalKey, string>
