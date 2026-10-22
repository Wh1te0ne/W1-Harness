import { afterEach,expect,it,vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { createBillingCapture } from '../src/billing-usage.ts'
import { assemble } from './assemble.ts'
import { anthropicFrame,anthropicTextEvents,closeMockServers,mockServer } from './mock-server.ts'
afterEach(async()=>{vi.unstubAllEnvs();await closeMockServers()})
it('preserves SSE bytes across chunk boundaries and reads only valid billing scalars',async()=>{
  const wire='data: '+JSON.stringify({ usage:{ cache_creation:{ ephemeral_1h_input_tokens:7 } } })+'\n\ndata: [DONE]\n\n'
  const bytes=new TextEncoder().encode(wire)
  const capture=createBillingCapture(async()=>new Response(new ReadableStream({ start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close()} }),{ headers:{ 'content-type':'text/event-stream' } }))
  capture.onPayload({ output_config:{ effort:'max' },messages:[{ secret:'not retained' }] })
  expect(await(await capture.fetch('http://local.test')).text()).toBe(wire)
  expect(capture.decorate({ inputTokens:1,outputTokens:1,cacheWriteTokens:10 })).toEqual({ inputTokens:1,outputTokens:1,cacheWriteTokens:10,cacheWrite1hTokens:7,billingParameters:{ outputConfigEffort:'max' } })
  expect(capture.decorate({ inputTokens:1,outputTokens:1,cacheWriteTokens:6 })).not.toHaveProperty('cacheWrite1hTokens')
})
it('maps actual Anthropic 1h usage and effort through the provider and BlockAssembler',async()=>{
  vi.stubEnv('PI_TEST_KEY','test-key')
  const events=[anthropicFrame({ type:'message_start',message:{ id:'msg_1',type:'message',role:'assistant',model:'m',content:[],stop_reason:null,stop_sequence:null,usage:{ input_tokens:3,output_tokens:1,cache_creation_input_tokens:10,cache_read_input_tokens:2,cache_creation:{ ephemeral_5m_input_tokens:3,ephemeral_1h_input_tokens:7 } } } }),...anthropicTextEvents.slice(1)]
  const server=await mockServer([{ events }]),ctx=new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi,{ providers:{ 'vx-api-high':{ apiKeyEnv:'PI_TEST_KEY',api:'anthropic-messages',baseURL:server.url,reasoning:'max',compat:{ forceAdaptiveThinking:true },models:[{ id:'m',reasoningEfforts:{ off:null,max:'max' } }] } } })
  const result=await assemble(ctx,{ provider:'vx-api-high',model:'m',reasoningEffort:ReasoningEffortId('max'),messages:[] })
  expect(result.usage).toMatchObject({ cacheWriteTokens:10,cacheWrite1hTokens:7,billingParameters:{ outputConfigEffort:'max' } })
  expect(server.requests[0]).toMatchObject({ output_config:{ effort:'max' } })
})
