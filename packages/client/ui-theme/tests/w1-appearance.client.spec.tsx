// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { appearanceTokens, createW1Appearance, validateAppearance, W1_DEFAULT } from '../src/client/w1-appearance.ts'
import { W1AppearanceControls } from '../src/client/W1Appearance.tsx'
import { W1_PRESETS } from '../src/client/w1-presets.ts'
import type { W1Appearance } from '../src/client/w1-appearance.ts'
import type { ThemeSettings } from '../src/theme-settings.ts'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
const controllers: ReturnType<typeof createW1Appearance>[] = []
const settings = (appearance: W1Appearance | null = null): ThemeSettings => ({ appearance, preference:'system',fontSize:14,codeFontSize:11,terminalFontSize:13,textFontFamily:'',codeFontFamily:'',terminalFontFamily:'' })
const selected = validateAppearance({ ...W1_PRESETS[0]!, preset: W1_PRESETS[0]!.id, css: 'body { --test: 1 }' })
const saved = () => JSON.parse(localStorage.getItem('w1.appearance.v1') ?? 'null') as W1Appearance
const settle = () => act(async () => { await Promise.resolve()
  await Promise.resolve() })
afterEach(() => { cleanup()
  controllers.splice(0).forEach((c)=>{ c.dispose() })
  localStorage.clear()
  delete document.body.dataset.w1Appearance })
function setup({ ready=true,value=null,storage=localStorage }:{
  ready?:boolean
  value?:W1Appearance|null
  storage?:Pick<Storage,'getItem'|'setItem'> }={}) {
  const host=stubConfigForm<ThemeSettings>(),theme={ overrideTokens:vi.fn(()=>vi.fn()) }
  if(ready)host.publish({ status:'ready',writable:true,revision:3,value:settings(value) })
  const set=vi.fn<ConfigForm<ThemeSettings>['set']>(async (_field,value)=>{host.publish({ value:settings(validateAppearance(value)),revision:4 })
    return true})
  host.scope.set=set
  const controller=createW1Appearance(theme,host.scope,storage)
  controllers.push(controller)
  return { host:{ ...host,set },theme,controller }
}
it('applies each palette to send, stop and bubble colors in both modes',()=>{
  for(const p of W1_PRESETS){const t=appearanceTokens({ ...p,preset:p.id,css:'' })
    for(const mode of ['light','dark'] as const){expect(t['--dsw-alias-button-info-fill']?.[mode]).toBe(p[mode].accent)
      expect(t['--dsw-specific-bubble']?.[mode]).toContain(p[mode].accent)}}
  expect(appearanceTokens(W1_DEFAULT)).toEqual({})
})
it('saves selection through the Host and restores it with an empty browser cache',async()=>{
  const { controller,host }=setup()
  render(<W1AppearanceControls controller={controller}/>)
  fireEvent.change(screen.getByRole('combobox',{ name:'主题' }),{ target:{ value:selected.preset } })
  expect(host.set).toHaveBeenCalledWith('appearance',expect.objectContaining({ preset:selected.preset }))
  await settle()
  expect(saved().preset).toBe(selected.preset)
  const stored=host.scope.getSnapshot().value!.appearance!
  localStorage.clear()
  const restarted=setup({ value:stored })
  expect(restarted.controller.getSnapshot().saved).toEqual(stored)
  act(()=>{ restarted.controller.reset() })
  await settle()
  expect(restarted.host.set).toHaveBeenCalledWith('appearance',W1_DEFAULT)
  expect(saved()).toEqual(W1_DEFAULT)
})
it('migrates legacy storage only after an empty durable section arrives and fences its revision',async()=>{
  localStorage.setItem('w1.appearance.v1',JSON.stringify(selected))
  const { controller,host }=setup({ ready:false })
  expect(controller.getSnapshot().saved).toEqual(selected)
  expect(host.mutate).not.toHaveBeenCalled()
  host.publish({ status:'ready',writable:true,revision:7,value:settings() })
  await settle()
  expect(host.mutate).toHaveBeenCalledExactlyOnceWith([{ op:'set',path:['appearance'],value:selected }],7)
  host.publish({ value:settings() })
  expect(host.mutate).toHaveBeenCalledTimes(1)
})
it('a loaded Host value wins over a stale local cache and synchronizes the open form',async()=>{
  localStorage.setItem('w1.appearance.v1',JSON.stringify(selected))
  const { controller,host }=setup({ ready:false })
  render(<W1AppearanceControls controller={controller}/>)
  act(()=>{ host.publish({ status:'ready',writable:true,revision:5,value:settings(W1_DEFAULT) }) })
  await waitFor(()=>{ expect(screen.getByRole<HTMLSelectElement>('combobox',{ name:'主题' }).value).toBe('w1') })
  expect(host.mutate).not.toHaveBeenCalled()
  expect(saved()).toEqual(W1_DEFAULT)
})
it('read failures retain valid colors and never write defaults',()=>{
  localStorage.setItem('w1.appearance.v1',JSON.stringify(selected))
  const { host,controller }=setup({ ready:false })
  host.publish({ status:'unavailable' })
  expect(controller.getSnapshot().saved).toEqual(selected)
  expect(host.set).not.toHaveBeenCalled()
  expect(host.mutate).not.toHaveBeenCalled()
})
it('failed Host writes restore the last durable value without reporting success',async()=>{
  const { host,controller }=setup({ value:selected })
  host.set.mockRejectedValue(new Error('offline'))
  controller.reset()
  await settle()
  expect(controller.getSnapshot().saved).toEqual(selected)
  expect(controller.getSnapshot().message).toContain('保存失败')
  expect(saved()).toEqual(selected)
})
it('earlier acknowledgements cannot replace a later edit',async()=>{
  const { host,controller }=setup({ value:W1_DEFAULT })
  let first!:(v:boolean)=>void,second!:(v:boolean)=>void
  host.set.mockImplementationOnce(()=>new Promise<boolean>((r)=>{first=r}))
    .mockImplementationOnce(()=>new Promise<boolean>((r)=>{second=r}))
  controller.update(selected)
  const next={ ...selected,css:'body { --test: 2 }' }
  controller.update(next)
  first(true)
  await settle()
  expect(controller.getSnapshot().saved).toEqual(next)
  expect(controller.getSnapshot().message).toContain('正在保存')
  second(true)
  await settle()
  expect(saved()).toEqual(next)
})
it('a migration conflict adopts the newer Host preference instead of overwriting it',async()=>{
  localStorage.setItem('w1.appearance.v1',JSON.stringify(selected))
  const { host,controller }=setup({ ready:false })
  host.mutate.mockImplementation(async()=>{host.publish({ value:settings(W1_DEFAULT) })
    return false})
  host.publish({ status:'ready',writable:true,revision:9,value:settings() })
  await settle()
  expect(controller.getSnapshot().saved).toEqual(W1_DEFAULT)
  expect(host.mutate).toHaveBeenCalledTimes(1)
})
it('a later rejected edit keeps the earlier accepted palette in both runtime and cache',async()=>{
  const { host,controller }=setup({ value:W1_DEFAULT })
  let accept!:(v:boolean)=>void,reject!:(e:Error)=>void
  host.set.mockImplementationOnce(()=>new Promise<boolean>((r)=>{accept=r}))
    .mockImplementationOnce(()=>new Promise<boolean>((_r,j)=>{reject=j}))
  controller.update(selected)
  controller.reset()
  accept(true)
  await settle()
  reject(Error('offline'))
  await settle()
  expect(controller.getSnapshot().saved).toEqual(selected)
  expect(saved()).toEqual(selected)
})
it('Host persistence works when localStorage is unavailable',async()=>{
  const { controller,host }=setup({ storage:{ getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')} } })
  controller.update(selected)
  await settle()
  expect(host.set).toHaveBeenCalled()
  expect(controller.getSnapshot().message).toBe('已自动保存')
})
it('keeps incomplete color drafts and rejects external CSS without writing it',async()=>{
  const { controller,host }=setup()
  render(<W1AppearanceControls controller={controller}/>)
  const field=screen.getByRole('textbox',{ name:'强调色色值' })
  fireEvent.change(field,{ target:{ value:'#123456' } })
  await settle()
  fireEvent.change(field,{ target:{ value:'#123' } })
  expect(saved().light.accent).toBe('#123456')
  fireEvent.blur(field)
  expect(screen.getByRole('alert').textContent).toContain('#RRGGBB')
  fireEvent.click(screen.getByText('高级 · 自定义 CSS'))
  const css=screen.getByRole('textbox',{ name:'自定义 CSS' })
  fireEvent.change(field,{ target:{ value:'#abcdef' } })
  await settle()
  fireEvent.change(css,{ target:{ value:'body { --test: 1 }' } })
  await settle()
  const calls=host.set.mock.calls.length
  fireEvent.change(css,{ target:{ value:'@import "https://example.test/x.css"' } })
  expect(host.set).toHaveBeenCalledTimes(calls)
  expect(saved().css).toContain('--test: 1')
})
it('boot snapshot keeps the saved palette while Host settings are loading',()=>{
  document.body.dataset.w1Appearance=JSON.stringify(selected)
  const { controller }=setup({ ready:false })
  expect(controller.getSnapshot().saved).toEqual(selected)
})
it('validates all presets and disposes subscriptions and CSS without deleting saved settings',async()=>{
  for(const p of W1_PRESETS)expect(validateAppearance({ ...p,preset:p.id,css:'' }).preset).toBe(p.id)
  const { controller,host }=setup()
  controller.update(selected)
  await settle()
  controller.dispose()
  expect(host.listenerCount()).toBe(0)
  expect(saved()).toEqual(selected)
  expect(document.querySelector('[data-w1-appearance="custom"]')).toBeNull()
})
