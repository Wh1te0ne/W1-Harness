/** `approval` namespace dictionaries. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  failed: '审批未提交，请重试。',
  scope: '仅授权本次操作',
  waiting: '等待审批',
  'detail.aria': '审批详情',
  'detail.show': '查看操作详情',
  escalation: '工具 {toolName} 请求越权执行',
  reject: '拒绝',
  allowOnce: '允许一次',
} satisfies Record<string, string>

/** Approval dictionary key union. */
export type ApprovalKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  failed: 'Approval was not submitted. Please try again.',
  scope: 'This operation only',
  waiting: 'Waiting for approval',
  'detail.aria': 'Approval details',
  'detail.show': 'View operation details',
  escalation: 'Tool {toolName} requests privileged execution',
  reject: 'Reject',
  allowOnce: 'Allow once',
} satisfies Record<ApprovalKey, string>
