import { test, expect } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, rm, chmod, mkdir, writeFile, readFile, lstat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalFiles } from '../src/sync/local.ts';
import { runSync } from '../src/sync/run.ts';
import { syncFailureMessage } from '../src/sync/errors.ts';
import { BitburnerClient } from '../src/bitburner/client.ts';
import { RpcClient } from '../src/rpc/client.ts';
import { denyWindowsWrites } from './fixtures/windows-acl.ts';

console.info(`Filesystem test platform: ${process.platform} ${process.arch}`);
async function fixture() { return mkdtemp(join(tmpdir(), 'bb-filesystem-')); }
function apiFixture() {
  const methods: string[] = [];
  const rpc = new RpcClient({ send(message) {
    const q = JSON.parse(message); methods.push(q.method);
    if (q.method !== 'getAllFiles') throw new Error(`Unexpected remote operation: ${q.method}`);
    queueMicrotask(() => rpc.handleMessage(JSON.stringify({jsonrpc:'2.0',id:q.id,result:[]})));
  }});
  return { api: new BitburnerClient(rpc), methods };
}

test('missing configured root fails during sync initialization without creation or remote calls', async () => {
  const parent=await fixture(); const root=join(parent,'missing'); const {api,methods}=apiFixture();
  try {
    await rejects(runSync(api,{root,server:'home'},new AbortController().signal,()=>{}), (e:any) => e.code === 'ENOENT');
    await rejects(lstat(root), (e:any) => e.code === 'ENOENT');
    expect(methods).toEqual([]);
  } finally { await rm(parent,{recursive:true,force:true}); }
});

test('a file cannot be used as the configured root',async()=>{
  const parent=await fixture();const root=join(parent,'file');await writeFile(root,'unchanged');
  try{await rejects(LocalFiles.create(root,'home'),(e:any)=>e.code==='ENOTDIR');expect(await readFile(root,'utf8')).toBe('unchanged');}
  finally{await rm(parent,{recursive:true,force:true});}
});

// chmod cannot reliably construct an ACL-denied directory on Windows, or deny root on Unix.
const canDeny = process.platform !== 'win32' && process.getuid?.() !== 0;
if (!canDeny) console.info('POSIX permission fixture skipped; Windows uses a separate non-admin ACL fixture.');
test.skipIf(!canDeny)('unwritable root fails without remote calls or a substitute workspace',async()=>{
  const root=await fixture();const {api,methods}=apiFixture();
  try{
    await chmod(root,0o555);
    await rejects(runSync(api,{root,server:'home'},new AbortController().signal,()=>{}),(e:any)=>['EACCES','EPERM'].includes(e.code));
    expect(methods).toEqual([]);
    await rejects(lstat(join(root,'.bun-burner')));
  }finally{await chmod(root,0o700);await rm(root,{recursive:true,force:true});}
});

test('vanished owned lock cleanup is benign but other unlink errors surface',async()=>{
  const root=await fixture();
  try{
    const local=await LocalFiles.create(root,'home');const release=await local.lock();
    await rm(join(root,'.bun-burner','lock'));await release();
    await mkdir(join(root,'.bun-burner','lock'));
    await rejects(release(),(e:any)=>typeof e.code==='string'&&e.code!=='ENOENT');
  }finally{await rm(root,{recursive:true,force:true});}
});

test.skipIf(process.platform !== 'win32')('Windows ACL-denied root fails without creation or remote calls', async () => {
  const root = await fixture(); const { api, methods } = apiFixture();
  let restore: (() => Promise<void>) | undefined;
  try {
    restore = await denyWindowsWrites(root);
    await rejects(runSync(api, { root, server: 'home' }, new AbortController().signal, () => {}),
      (e: any) => ['EACCES', 'EPERM'].includes(e.code));
    expect(methods).toEqual([]);
    await rejects(lstat(join(root, '.bun-burner')), (e: any) => e.code === 'ENOENT');
  } finally { await restore?.(); await rm(root, { recursive: true, force: true }); }
}, 10000);

test('root disappearance during running sync pauses with the original scan error and no remote mutation',async()=>{
  const root=await fixture();const {api,methods}=apiFixture();const controller=new AbortController();
  const failure=runSync(api,{root,server:'home'},controller.signal,()=>{}).then(()=>{throw new Error('Unexpected completion');},e=>e);
  try{
    const deadline=Date.now()+3000;
    while(methods.length===0){if(Date.now()>deadline)throw new Error('Sync did not start');await Bun.sleep(10);}
    await rm(root,{recursive:true});
    const error=await failure;
    expect(error.code).toBe('ENOENT');expect(error.syscall).not.toBe('unlink');
    expect(methods.every(m=>m==='getAllFiles')).toBe(true);
    await rejects(lstat(root));
    expect(syncFailureMessage(error,root)).toContain('No remote deletion');
  }finally{controller.abort();await failure;await rm(root,{recursive:true,force:true});}
});

test('writes and reads do not treat a vanished configured root as a new workspace',async()=>{
  const root=await fixture();const local=await LocalFiles.create(root,'home');const release=await local.lock();
  await rm(root,{recursive:true});
  await rejects(local.read('nested/source.ts'),(e:any)=>e.code==='ENOENT');
  await rejects(local.write('nested/source.ts','source'),(e:any)=>e.code==='ENOENT');
  await release();await rejects(lstat(root));
});

test('cleanup failure does not mask the scan error when the root is replaced by a file', async () => {
  const parent = await fixture(); const root = join(parent, 'root'); const moved = join(parent, 'moved');
  await mkdir(root);
  const { api, methods } = apiFixture(); const controller = new AbortController();
  const failure = runSync(api, { root, server: 'home' }, controller.signal, () => {}).then(() => undefined, e => e);
  try {
    const deadline = Date.now() + 3000;
    while (!(await Bun.file(join(root, '.bun-burner', 'state.json')).exists())) {
      if (Date.now() > deadline) throw new Error('Sync did not settle');
      await Bun.sleep(10);
    }
    await rename(root, moved); await writeFile(root, 'replacement');
    const error = await failure;
    expect(error.code).toBe('ENOTDIR');
    expect(error.syscall).not.toBe('unlink');
    expect(methods.every(m => m === 'getAllFiles')).toBe(true);
    expect(await readFile(root, 'utf8')).toBe('replacement');
  } finally { controller.abort(); await failure; await rm(parent, { recursive: true, force: true }); }
});

test('nested game paths map through host path APIs without changing source',async()=>{
  const root=await fixture();
  try{const local=await LocalFiles.create(root,'home');const source='\uFEFFconst x: string = "🦊";\r\n';
    if (process.platform === 'win32') expect(root).toMatch(/^[A-Za-z]:\\/);
    await local.write('nested/source.ts',source);
    expect(await readFile(join(root,'nested','source.ts'),'utf8')).toBe(source);
    expect((await local.snapshot()).get('nested/source.ts')).toBe(source);
    await rejects(local.write('nested\\source.ts','invalid'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('filesystem diagnostics classify codes without parsing platform messages',()=>{
  for(const [code,help] of [['ENOENT','Create or restore'],['EACCES','Check permissions'],['EPERM','Check permissions'],['ENOTDIR','must be a directory']] as const){
    const error=Object.assign(new Error('OS-specific text'),{code,path:join('workspace','child')});
    const result=syncFailureMessage(error,'C:\\scripts');
    expect(result).toContain('C:\\scripts');expect(result).toContain(help);expect(result).toContain(code);
    expect(result).toContain('restart Bun Burner');expect(result).not.toContain('at ');
  }
  const error=Object.assign(new Error('device unavailable'),{code:'EIO',path:'/volume'});
  expect(syncFailureMessage(error,'/root')).toContain('device unavailable');
  expect(syncFailureMessage(error,'/root')).toContain('EIO');
  expect(syncFailureMessage(error,'/root')).toContain('/volume');
});

test('a secondary lock cleanup failure preserves the original sync failure', async () => {
  const root = await fixture();
  const rpc = new RpcClient({ send(message) {
    const q = JSON.parse(message);
    void (async () => {
      const lock = join(root, '.bun-burner', 'lock');
      await rm(lock); await mkdir(lock);
      rpc.handleMessage(JSON.stringify({ jsonrpc: '2.0', id: q.id, error: { code: -32000, message: 'original sync failure' } }));
    })();
  } });
  try {
    await rejects(runSync(new BitburnerClient(rpc), { root, server: 'home' }, new AbortController().signal, () => {}),
      (e: any) => e.message.includes('original sync failure'));
  } finally { rpc.disconnect(); await rm(root, { recursive: true, force: true }); }
});
