/** W1 companion adapter over the same controllers used by the desktop. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-api-workspace-controller'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { RemoteHost, type RemoteAdapter } from '@w1h/remote/host'
import { projectEvent, projectFrame } from '@w1h/remote/presentation'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { join } from 'node:path'

function stringArgument(args: Record<string, unknown>, key: string, max = 160): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`无效参数：${key}`)
  return value
}

/** Bind the bounded phone API to the live desktop controllers. */
export function createW1RemoteAdapter(ctx: Context): RemoteAdapter {
  const sessions = ctx.get('sessionController')
  const workspaces = ctx.get('workspaceController')
  if (sessions === undefined || workspaces === undefined) throw new Error('W1 会话服务尚未就绪')
  return {
    async invoke(action, args) {
      const signal = AbortSignal.timeout(25_000)
      if (action === 'catalog') {
        const controller = new AbortController()
        const iterator = workspaces.follow(controller.signal)[Symbol.asyncIterator]()
        try {
          const [list, opening] = await Promise.all([sessions.list({}, signal), iterator.next()])
          if (opening.done || opening.value.type !== 'baseline') throw new Error('项目列表暂不可用')
          const baseline = opening.value.value
          const visible = list.items.filter(item => !baseline.archivedSessionIds.includes(item.sessionId) && item.origin !== 'subagent')
          return { projects: baseline.items.map(item => ({ id: item.workspaceId, title: item.title, sessionIds: item.sessionIds })),
            sessions: visible.map(item => ({ id: item.sessionId, title: item.projections?.values.title || '新会话', running: item.running, updatedAt: item.updatedAt })) }
        } finally { controller.abort(); await iterator.return?.() }
      }
      if (action === 'create') return sessions.create({ workspaceId: stringArgument(args, 'workspaceId') as WorkspaceId })
      const sessionId = SessionId(stringArgument(args, 'sessionId'))
      if (action === 'prompt') {
        const mode = args.mode === 'steer' ? 'steer' : 'queue'
        return sessions.prompt({ sessionId, requestId: stringArgument(args, 'requestId') as SessionRequestId,
          mode, content: [{ type: 'text', text: stringArgument(args, 'text', 32_000) }],
          ...(typeof args.clientTimeZone === 'string' ? { clientTimeZone: args.clientTimeZone.slice(0, 100) } : {}) }, signal)
      }
      if (action === 'cancel') return sessions.cancel({ sessionId })
      if (action === 'page') {
        if (!Number.isSafeInteger(args.throughSeq) || Number(args.throughSeq) < 0 || !Number.isSafeInteger(args.beforeSeq) || Number(args.beforeSeq) < 0) throw new Error('历史游标无效')
        const value = await sessions.page({ address: { kind: 'session', sessionId }, throughSeq: Number(args.throughSeq), beforeSeq: Number(args.beforeSeq), maxMessages: 20 }, signal)
        return { messages: value.records.map(record => projectEvent(record.event)).filter(Boolean), hasMore: value.hasMore }
      }
      throw new Error('手机端不支持此操作')
    },
    async *follow(args, signal) {
      const sessionId = SessionId(stringArgument(args, 'sessionId'))
      for await (const frame of sessions.follow({ address: { kind: 'session', sessionId }, maxMessages: 20, assistantStream: true }, signal)) yield projectFrame(frame)
    },
  }
}

/** Install a disabled-by-default remote connector; its private state never enters the project. */
export async function installW1Remote(ctx: Context): Promise<RemoteHost> {
  const remote = new RemoteHost({ path: join(resolveDshHome(), 'remote', 'devices.json'), adapter: createW1RemoteAdapter(ctx) })
  await remote.start()
  ctx.effect(() => () => { remote.stop() })
  return remote
}
