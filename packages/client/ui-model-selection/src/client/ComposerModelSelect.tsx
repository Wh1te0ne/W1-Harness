import type { InjectFace, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'

/** Bind the main composer's directory to the same picker used by side chats. */
export function ComposerModelSelect({ locked, available, useModelDirectory, load, select, renderFactorySlot }:
  Pick<PropsRuntime<'conversation.input.model'>, 'locked'> & InjectFace<ModelSelectInjected> & PropsRenderFactories) {
  const state = useModelDirectory(snapshot => snapshot)
  return renderFactorySlot('model.selector', { locked, available, state, load, select })
}
