import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRelay } from '../relay.mjs';
import { RemoteHost } from '../host.mjs';
import { RemoteClient } from '../client.mjs';
import { secureChannel, randomToken, relayOrigin, decodePairing } from '../crypto.mjs';
import { projectFrame, projectEvent } from '../presentation.mjs';

async function until(fn, timeout = 6000) { const start=Date.now(); while(!fn()) { if(Date.now()-start>timeout)throw Error('Timed out');await new Promise(r=>setTimeout(r,20)); } }
test('encrypted channels reject tampering, replay and the wrong peer context', async()=>{
 const key=randomToken(),a=randomToken(),b=randomToken();const host=await secureChannel(key,a,b,'host:phone','host'),phone=await secureChannel(key,a,b,'host:phone','mobile');
 const frame=await phone.seal({secret:'private message'});assert.equal(JSON.stringify(frame).includes('private message'),false);
 assert.deepEqual(await host.open(frame),{secret:'private message'});await assert.rejects(()=>host.open(frame));
 const wrong=await secureChannel(key,a,b,'host:other','host');await assert.rejects(()=>wrong.open(frame));
 const next=await phone.seal({secret:'again'});next.data=(next.data[0]==='A'?'B':'A')+next.data.slice(1);await assert.rejects(()=>host.open(next));
});
test('non-HTTPS relay addresses and embedded credentials are refused',()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com/?token=x'])assert.throws(()=>relayOrigin(url));
 assert.equal(relayOrigin('https://w1hrelay.whiteone.cn:8112'),'https://w1hrelay.whiteone.cn:8112');
});
test('mobile history excludes internal model context and preserves live text',()=>{
 assert.equal(projectEvent({type:'request/context',data:{secret:'never forward'}}),null);
 assert.equal(projectEvent({type:'assistant/message',seq:4,data:{message:{content:[{type:'text',text:'hello'}]}}}).text,'hello');
 assert.equal(projectFrame({type:'snapshot',records:[],cursor:3,hasMore:false,assistantStream:{activeAttempt:{stream:[{type:'text-chunks',texts:['a','b']}]}}}).live,'ab');
});
test('real sockets pair with desktop consent, persist binding, stream and revoke',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'w1h-remote-test-'));const relay=createRelay({port:0,host:'127.0.0.1'});const port=await relay.start();let host,phone;
 t.after(async()=>{phone?.close();host?.stop();await relay.close();await rm(directory,{recursive:true,force:true});});
 let invocations=0;const adapter={async invoke(action,args){if(action==='prompt'){invocations++;return{accepted:true};}if(action==='catalog')return{projects:[],sessions:[{id:'synthetic',title:'fixture'}]};throw Error('Unsupported');},async *follow(args,signal){yield{type:'snapshot',messages:[{role:'assistant',text:'streamed fixture'}]};await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}};
 host=new RemoteHost({path:join(directory,'devices.json'),adapter,development:true});await host.start();await host.manage('configure',{enabled:true,relay:`http://127.0.0.1:${port}`});await until(()=>host.status==='online');
 const status=await host.manage('pair');const pair=decodePairing(status.pairing.url,true);assert.ok(pair.secret);let saved;const events=[];
 phone=new RemoteClient({notify:e=>events.push(e),persist:async d=>{saved=d;},development:true});await phone.pair(status.pairing.url,'Test phone');await until(()=>host.snapshot().pending.length===1);
 assert.equal(saved,undefined);assert.equal(phone.connected,false);await assert.rejects(()=>phone.request('catalog'));
 await host.manage('approve',{id:host.snapshot().pending[0].id});await until(()=>phone.connected);assert.equal(saved.hostName.length>0,true);
 assert.equal((await phone.request('catalog')).sessions[0].title,'fixture');await phone.request('watch',{sessionId:'synthetic'});await until(()=>events.some(e=>e.type==='event'));
 await phone.request('unwatch');await phone.request('prompt',{text:'hello'});assert.equal(invocations,1);
 await assert.rejects(()=>phone.request('arbitrary-method'),/Unsupported/);
 phone.close();host.stop();host=new RemoteHost({path:join(directory,'devices.json'),adapter,development:true});await host.start();await until(()=>host.status==='online');phone.resume(saved);await until(()=>phone.connected);
 assert.equal((await phone.request('catalog')).sessions[0].id,'synthetic');await host.manage('revoke',{id:saved.route});await until(()=>!phone.connected);assert.equal(JSON.parse(await readFile(join(directory,'devices.json'),'utf8')).devices.length,0);
});
