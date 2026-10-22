/** Parse the documented arithmetic subset; unrecognized rules are never executed or guessed. */
const NUMBER = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
function tier(text) {
  const match = text.trim().match(/^tier\("([^"\\]{1,120})",\s*([^()]*)\)$/)
  if (!match) throw Error('不支持的分档价格表达式')
  const fields = {p:'input',c:'output',cr:'cachedInput',cc:'cacheWrite',cc1h:'cacheWrite1h'}
  const rate = {currency:'CNY',input:0,output:0,cachedInput:0,cacheWrite:0,cacheWrite1h:0}
  const seen=new Set()
  for(const term of match[2].split('+')) {
    const m=term.trim().match(new RegExp('^(p|c|cr|cc|cc1h)\\s*\\*\\s*('+NUMBER+')$'))
    if(!m||seen.has(m[1]))throw Error('不支持的价格项')
    seen.add(m[1]);rate[fields[m[1]]]=Number(m[2])
  }
  if(!seen.has('p')||!seen.has('c'))throw Error('输入或输出价格缺失')
  return rate
}
export function parseVxTariff(expression) {
  if(typeof expression!=='string'||expression.length>4096)throw Error('价格表达式无效')
  let text=expression.trim(),multiplier
  const factor=text.match(/^\((tier\(.+\))\)\s*\*\s*\(param\("output_config\.effort"\)\s*==\s*"max"\s*\?\s*([0-9.]+)\s*:\s*1\)$/)
  if(factor){text=factor[1];multiplier=Number(factor[2]);if(!Number.isFinite(multiplier)||multiplier<=0||multiplier>100)throw Error('参数倍率无效')}
  const split=text.match(/^len\s*(<=|<)\s*(\d+)\s*\?\s*(tier\(.+\))\s*:\s*(tier\(.+\))$/)
  const rate=tier(split?split[3]:text)
  if(split){const threshold=Number(split[2])-(split[1]==='<'?1:0);if(!Number.isSafeInteger(threshold)||threshold<=0)throw Error('上下文阈值无效');rate.longContext={...tier(split[4]),aboveInputTokens:threshold};delete rate.longContext.currency}
  if(multiplier!==undefined)rate.effortMultiplier=multiplier
  return rate
}
export function parseVxCatalog(data,group) {
  if(data?.success!==true||!Array.isArray(data.data)||!data.data.length||data.data.length>20000)throw Error('VX 价目响应无效')
  const ratio=data.group_ratio?.[group]
  if(!Number.isFinite(ratio)||ratio<=0||ratio>100)throw Error('VX 分组或倍率缺失')
  const models={},errors={}
  const scale=rate=>{for(const key of ['input','output','cachedInput','cacheWrite','cacheWrite1h'])rate[key]*=ratio;if(rate.longContext)scale(rate.longContext)}
  for(const row of data.data){
    if(!Array.isArray(row.enable_groups)||!row.enable_groups.includes(group))continue
    const id=row.model_name
    if(typeof id!=='string'||!id||id==='__proto__'||id==='constructor')continue
    if(Object.hasOwn(models,id)||Object.hasOwn(errors,id)){delete models[id];errors[id]='同模型出现重复价格';continue}
    try{if(row.billing_mode!=='tiered_expr')throw Error('当前计费模式尚未支持');const rate=parseVxTariff(row.billing_expr);scale(rate);models[id]=rate}
    catch(error){errors[id]=error.message}
  }
  if(!Object.keys(models).length)throw Error('未取得该分组的有效价格')
  return {models,errors,version:String(data.pricing_version??''),group,currency:'CNY'}
}
