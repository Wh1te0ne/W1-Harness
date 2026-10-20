/** Typed expectations for the synthetic browser observations. */
import { z } from 'zod'

const pageSchema = z.object({ tab: z.union([z.string(), z.number()]), page: z.object({
  elements: z.array(z.object({ ref: z.string(), value: z.string().optional() })),
}) })
const listSchema = z.object({ connected: z.boolean(),
  tabs: z.array(z.object({ tab: z.string(), title: z.string(), enabled: z.boolean() })) })
export const pageResult = (text: string) => pageSchema.parse(JSON.parse(text))
export const listResult = (text: string) => listSchema.parse(JSON.parse(text))
export const inviteResult = (text: string) => z.object({ connectionCode: z.string() }).parse(JSON.parse(text))
