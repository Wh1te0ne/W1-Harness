// Boots the shipped desktop profile with an isolated home and a deterministic LLM adapter.
import { mkdtemp, mkdir, writeFile, symlink, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRelay } from '../relay.mjs';
import { RemoteHost } from '../host.mjs';
import { RemoteClient } from '../client.mjs';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const scratch=await mkdtemp(join(root,'.work/remote-composition-'));
const home=join(scratch,'home'),project=join(scratch,'profile'),documents=join(scratch,'documents');
for(const p of [home,project,documents])await mkdir(p,{recursive:true});
process.env.DSH_HOME=home;process.env.DSH_AGENTS_HOME=join(home,'agents');
for(const key of ['DEEPSEEK_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY'])delete process.env[key];
await writeFile(join(project,'package.json'),await readFile(join(root,'apps/desktop/.desktop-build/development/project/package.json')));
await symlink(join(root,'apps/desktop/.desktop-build/development/project/node_modules'),join(project,'node_modules'),'junction');
await writeFile(join(project,'cordis.patch.yml'),`- id: workspace-controller\n  config:\n    documentsDirectory: '${documents.replaceAll('\\','/')}'\n- id: agent-default-model\n  config:\n    provider: w1-test\n    model: fixture\n- id: llm-deepseek\n  disabled: true\n- id: llm-deepseek-account\n  disabled: true\n`);
const boot=await import(pathToFileURL(join(root,'packages/boot/app-boot/lib/index.js')));
const {runProfile}=await import(pathToFileURL(join(root,'apps/cli/lib/profile-boot.js')));
const {LlmAdapter}=await import(pathToFileURL(join(root,'packages/llm/llm/lib/index.js')));
const {createW1RemoteAdapter}=await import(pathToFileURL(join(root,'apps/desktop-host/lib/types/w1-remote.js')));
const installAnchor=join(root,'apps/cli/package.json');
const profile=boot.loadProfileDirectory('dsh',project,installAnchor,{userLayer:false});
let running,remote,phone,relay,saved;const events=[];
async function until(fn){const start=Date.now();while(!fn()){if(Date.now()-start>15000)throw Error('Timed out');await new Promise(r=>setTimeout(r,30));}}
try{
 running=await runProfile({environment:boot.loadLayeredEnv('dsh',scratch),profile:'desktop',resolvedProfile:{profile,installAnchor},patchFiles:[],args:['--no-open','--host','127.0.0.1','--port','0']});
 class Fixture extends LlmAdapter{
   async listModels(){return[{provider:'w1-test',id:'fixture',name:'Fixture',contextWindow:32000,maxOutputTokens:256}];}
   async *stream(){yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:'手机消息已经由同一个 W1 Host 接收。'};yield{type:'block-end',index:0,block:{type:'text',text:'手机消息已经由同一个 W1 Host 接收。'}};yield{type:'finish',reason:{kind:'stop'}};}
 }
 running.ctx.llm.registerAdapter(['w1-test'],new Fixture());
 const workspace=await running.ctx.workspaceController.createProject({title:'远程联调测试',folderRoots:[{id:'main',path:documents}],primaryFolderId:'main'});
 relay=createRelay({port:0,host:'127.0.0.1'});const port=await relay.start();
 remote=new RemoteHost({path:join(home,'test-device.json'),adapter:createW1RemoteAdapter(running.ctx),development:true});await remote.start();
 await remote.manage('configure',{enabled:true,relay:`http://127.0.0.1:${port}`});await until(()=>remote.status==='online');
 phone=new RemoteClient({notify:e=>events.push(e),persist:async d=>{saved=d;},development:true});
 await phone.pair((await remote.manage('pair')).pairing.url,'Composition fixture');await until(()=>remote.snapshot().pending.length);await remote.manage('approve',{id:remote.snapshot().pending[0].id});await until(()=>phone.connected);
 const catalog=await phone.request('catalog');assert.ok(catalog.projects.some(p=>p.title==='远程联调测试'));
 const created=await phone.request('create',{workspaceId:workspace.workspace.workspaceId});await running.ctx.sessionController.selectModel({sessionId:created.sessionId,provider:'w1-test',model:'fixture'});
 await phone.request('watch',{sessionId:created.sessionId});const requestId=crypto.randomUUID();
 await phone.request('prompt',{sessionId:created.sessionId,requestId,text:'这是隔离的手机消息测试。',mode:'queue',clientTimeZone:'Asia/Shanghai'});
 await until(()=>events.some(e=>e.type==='event'&&e.frame.type==='event'&&e.frame.message?.role==='assistant'));
 const messages=events.filter(e=>e.type==='event'&&e.frame.type==='event').map(e=>e.frame.message).filter(Boolean);
 assert.ok(messages.some(m=>m.role==='user'&&m.text.includes('手机消息测试')));assert.ok(messages.some(m=>m.role==='assistant'&&m.text.includes('同一个 W1 Host')));
 await phone.request('prompt',{sessionId:created.sessionId,requestId,text:'这是隔离的手机消息测试。',mode:'queue'});
 phone.close();phone.resume(saved);await until(()=>phone.connected);events.length=0;await phone.request('watch',{sessionId:created.sessionId});await until(()=>events.some(e=>e.type==='event'&&e.frame.type==='snapshot'));
 const history=events.find(e=>e.type==='event'&&e.frame.type==='snapshot').frame.messages;
 assert.equal(history.filter(m=>m.role==='user'&&m.text.includes('手机消息测试')).length,1);
 await phone.request('cancel',{sessionId:created.sessionId});
 const result={passed:true,checks:['real desktop profile','project list','new session in project','prompt admission','live assistant response','same-host history','duplicate prompt idempotency','reconnect history','stop action'],syntheticHome:home};
 await writeFile(join(root,'.work/local-dev/remote-composition-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{phone?.close();remote?.stop();await relay?.close();await running?.shutdown.shutdown(0);}
