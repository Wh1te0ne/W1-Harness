/** Resolve the exact tariff for one reported call, preserving uncertainty instead of inventing usage. */
export function callPrice(resolved,tokens,billingParameters) {
  if(!resolved?.priced)return resolved
  let entry=resolved.entry,estimated=false
  const write=Math.max(0,Number(tokens?.cacheWrite)||0),write1h=tokens?.cacheWrite1h
  const selected=entry.longContext && (tokens?.input??0)+(tokens?.cacheRead??0)+write>entry.longContext.aboveInputTokens?entry.longContext:entry
  if(write>0&&(selected.cacheWriteUnspecified||selected.cacheWriteExtended))estimated=true
  if(write>0&&selected.cacheWrite1h!==undefined&&selected.cacheWrite1h!==selected.cacheWrite
    &&!(Number.isFinite(write1h)&&write1h>=0&&write1h<=write))estimated=true
  if(entry.effortMultiplier!==undefined){
    if(!billingParameters||!Object.hasOwn(billingParameters,'outputConfigEffort'))return {...resolved,priced:false,entry:null,reason:'缺少请求参数，无法确定动态倍率'}
    const factor=billingParameters.outputConfigEffort==='max'?entry.effortMultiplier:1
    const multiply=rate=>({...rate,...Object.fromEntries(['cacheMiss','cacheHit','output','cacheWrite','cacheWrite1h'].filter(k=>rate[k]!==undefined).map(k=>[k,rate[k]*factor])),...(rate.longContext?{longContext:multiply(rate.longContext)}:{})})
    entry=multiply(entry)
  }
  return {...resolved,entry,estimated}
}
