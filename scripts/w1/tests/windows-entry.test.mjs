import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareWindowsEntry } from '../prepare-windows-entry.mjs';
const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url));
const builder = createRequire(require.resolve('app-builder-lib/package.json'));
const asar = builder('@electron/asar');

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'w1-shell-entry-'));
  t.after(() => { if (!resolve(root).startsWith(resolve(tmpdir())+'\\w1-shell-entry-')) throw Error('Unexpected cleanup target'); rmSync(root,{recursive:true,force:true}); });
  const originalDir = join(root,'original'), shell = join(root,'shell');
  mkdirSync(originalDir); mkdirSync(join(shell,'resources'),{recursive:true});
  writeFileSync(join(originalDir,'package.json'), JSON.stringify({type:'module',main:'main.js'}));
  writeFileSync(join(originalDir,'main.js'), 'export const original = true;\n');
  const original = join(root,'upstream.asar');
  await asar.createPackage(originalDir,original);
  writeFileSync(join(shell,'resources','default_app.asar'),readFileSync(original));
  return {shell,original};
}
test('the managed entry preserves the original loader and repeated checks do not rewrite it',async t=>{
  const {shell,original}=await fixture(t); const before=readFileSync(original);
  assert.equal((await prepareWindowsEntry(shell,original,asar)).changed,true);
  assert.deepEqual(readFileSync(original),before);
  assert.deepEqual(readFileSync(join(shell,'resources','w1-electron-default.asar')),before);
  const entry=join(shell,'resources','default_app.asar');const modified=statSync(entry).mtimeMs;
  const manifest=JSON.parse(asar.extractFile(entry,'package.json').toString());assert.equal(manifest.main,'main.mjs');
  assert.equal((await prepareWindowsEntry(shell,original,asar)).changed,false);
  assert.equal(statSync(entry).mtimeMs,modified);
});
test('an unrelated default application is refused and left intact',async t=>{
  const {shell,original}=await fixture(t);const entry=join(shell,'resources','default_app.asar');writeFileSync(entry,'unrelated data');
  await assert.rejects(()=>prepareWindowsEntry(shell,original,asar),/unrecognized/);
  assert.equal(readFileSync(entry,'utf8'),'unrelated data');
});
test('an unexpected original-loader backup is never overwritten',async t=>{
  const {shell,original}=await fixture(t);const backup=join(shell,'resources','w1-electron-default.asar');writeFileSync(backup,'unexpected backup');
  await assert.rejects(()=>prepareWindowsEntry(shell,original,asar),/does not match/);
  assert.equal(readFileSync(backup,'utf8'),'unexpected backup');
});
