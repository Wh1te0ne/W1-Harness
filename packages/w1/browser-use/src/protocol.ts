/** Validated commands exchanged with the owned desktop process. */
import { z } from 'zod'

const tab = z.string().min(1).max(128)
const ref = z.string().min(1).max(128)
const url = z.string().min(1).max(8192)
/** Commands contain no script, filesystem path, or arbitrary protocol method. */
export const browserCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('open'), url }),
  z.object({ action: z.literal('read'), tab }),
  z.object({ action: z.literal('navigate'), tab, url }),
  z.object({ action: z.literal('click'), tab, ref }),
  z.object({ action: z.literal('fill'), tab, ref, text: z.string().max(20000) }),
  z.object({ action: z.literal('press'), tab, key: z.enum(['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']) }),
  z.object({ action: z.literal('scroll'), tab, direction: z.enum(['up', 'down']), pixels: z.number().int().min(1).max(2000).default(600) }),
  z.object({ action: z.literal('screenshot'), tab }),
  z.object({ action: z.literal('back'), tab }),
])
/** Parsed command, after defaults and validation. */
export type BrowserCommand = z.infer<typeof browserCommandSchema>
/** Chrome transport also owns user pairing and revocation; neither grants implicit access. */
export const chromeCommandSchema = z.union([
  z.object({ action: z.literal('list'), query: z.string().max(200).optional() }).strict(), browserCommandSchema,
  z.object({ action: z.literal('connect') }).strict(), z.object({ action: z.literal('disconnect') }).strict()])
/**
 * Validated operations accepted by the external Chrome transport.
 */
export type ChromeCommand = z.infer<typeof chromeCommandSchema>
/** Text and optional JPEG returned by the desktop, prior to durable attachment storage. */
export const browserResultSchema = z.object({ text: z.string().max(100000), screenshot: z.string().max(8000000).optional() })
/** Provider result validated again at the Host IPC boundary. */
export type BrowserResult = z.infer<typeof browserResultSchema>
/** Per-call transport bounds supplied by the desktop composition. */
export interface BrowserLimits {
  /** Deadline for one desktop browser operation, in milliseconds. */
  readonly timeoutMs: number
  /** Maximum page text retained in one observation. */
  readonly maxTextChars: number
  /** Maximum actionable elements retained in one observation. */
  readonly maxElements: number
}
