import { test, expect } from 'bun:test';
import { mkdtemp, rm, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { rejects } from 'node:assert/strict';

async function until(check:()=>boolean){const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Entrypoint test timed out');await Bun.sleep(10);}}
for(const mode of ["disabled", "missing", "permission"] as const) {
  const enabled = mode !== "disabled";
  const skipPermission = mode === "permission" && (process.platform === "win32" || process.getuid?.() === 0);
  test.skipIf(skipPermission)(`normal entrypoint sends no startup smoke RPC (${mode})`,async()=>{
    const parent=await mkdtemp(join(tmpdir(),'bb-entrypoint-test-'));const root=mode === 'permission' ? parent : join(parent,'missing');
    if(mode === 'permission') await chmod(root,0o555);
    const reservation=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('test')});
    const port=reservation.port;reservation.stop(true);
    const proc=Bun.spawn([process.execPath,'run','src/index.ts'],{
      cwd:fileURLToPath(new URL('..',import.meta.url)),
      env:{...process.env,BUN_BURNER_HOST:'127.0.0.1',BUN_BURNER_PORT:String(port),BUN_BURNER_SYNC_ENABLED:String(enabled),BUN_BURNER_SYNC_ROOT:root},
      stdout:'pipe',stderr:'pipe',
    });
    let stdout='',stderr='';
    const collect=async(stream:ReadableStream<Uint8Array>,append:(text:string)=>void)=>{const decoder=new TextDecoder();for await(const chunk of stream)append(decoder.decode(chunk,{stream:true}));};
    const streams=[collect(proc.stdout,s=>stdout+=s),collect(proc.stderr,s=>stderr+=s)];
    let socket:WebSocket|undefined;const messages:unknown[]=[];
    try{
      await until(()=>stdout.includes('listening on'));
      expect(stderr).toBe(''); // Initialization is deferred until a game connects.
      socket=new WebSocket(`ws://127.0.0.1:${port}`);socket.onmessage=e=>messages.push(e.data);
      await until(()=>stdout.includes('Bitburner connected'));
      if(enabled){
        await until(()=>stderr.includes('Sync paused'));
        expect(stderr).toContain(root);expect(stderr).toContain(mode === 'permission' ? 'EACCES' : 'ENOENT');expect(stderr).toContain('BUN_BURNER_SYNC_ROOT');
        expect(stderr).toContain('restart Bun Burner');expect(stderr).not.toContain('at async');
      }
      await Bun.sleep(150);expect(messages).toEqual([]);
      if(mode !== 'permission') await rejects(lstat(root));
    }finally{
      socket?.close();proc.kill();await proc.exited;await Promise.all(streams);if(mode === 'permission') await chmod(parent,0o700);await rm(parent,{recursive:true,force:true});
    }
  },10000);
}
