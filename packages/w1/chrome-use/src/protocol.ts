/** Bounded wire messages shared by the local bridge and extension. */
import { z } from 'zod'
import { browserCommandSchema, browserResultSchema } from '@deepseek-ai/dsh-w1-browser-use/protocol'

export const tabSchema = z.object({
  id: z.number().int().nonnegative(), url: z.string().max(8192), title: z.string().max(200),
  enabled: z.boolean(), owner: z.string().max(256).optional(),
}).strict()
export type SharedTab = z.infer<typeof tabSchema>
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.literal(2), tabs: z.array(tabSchema).max(200) }).strict(),
  z.object({ type: z.literal('state'), tabs: z.array(tabSchema).max(200) }).strict(),
  z.object({ type: z.literal('result'), id: z.string().max(64), result: browserResultSchema.optional(), error: z.string().max(1000).optional() }).strict(),
  z.object({ type: z.literal('pong') }).strict(),
])
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), version: z.literal(2) }).strict(),
  z.object({ type: z.literal('command'), session: z.string().min(1).max(256), id: z.string().max(64), command: browserCommandSchema }).strict(),
  z.object({ type: z.literal('release'), session: z.string().min(1).max(256) }).strict(),
  z.object({ type: z.literal('cancel'), id: z.string().max(64) }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
])

/** Only ordinary web pages may be shared, navigated or controlled. */
export function webOrigin(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Only HTTP/HTTPS pages without URL credentials are supported')
  return parsed.origin
}
