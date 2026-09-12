import { test, expect } from 'bun:test';
import { mkdtemp, rm, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Shutdown fixture timed out');
    await Bun.sleep(10);
  }
}

test('disconnect, reconnect and graceful handler shutdown release locks and workspace handles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb-shutdown-'));
  const moved = root + '-moved';
  try {
    // Starting a second process with the same root proves restart after exit.
    for (let attempt = 0; attempt < 2; attempt++) {
      let stdout = '', stderr = '';
      const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('test') });
      const port = reservation.port; reservation.stop(true);
      const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/shutdown.ts'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, BUN_BURNER_HOST: '127.0.0.1', BUN_BURNER_PORT: String(port),
          BUN_BURNER_SYNC_ENABLED: 'true', BUN_BURNER_SYNC_ROOT: root, BUN_BURNER_SYNC_SERVER: 'home' },
        stdout: 'pipe', stderr: 'pipe', ipc() {},
      });
      const collect = async (stream: ReadableStream<Uint8Array>, append: (s: string) => void) => {
        for await (const chunk of stream) append(new TextDecoder().decode(chunk));
      };
      const streams = [collect(child.stdout, s => stdout += s), collect(child.stderr, s => stderr += s)];
      let socket: WebSocket | undefined;
      try {
        await until(() => stdout.includes('listening on'));
        const url = stdout.match(/ws:\/\/127\.0\.0\.1:\d+/)![0];
        for (let connection = 0; connection < 2; connection++) {
          let scans = 0;
          socket = new WebSocket(url);
          socket.onmessage = ({ data }) => {
            const q = JSON.parse(String(data));
            if (q.method === 'getAllFiles') scans++;
            socket!.send(JSON.stringify({ jsonrpc: '2.0', id: q.id, result: [] }));
          };
          await until(() => scans > 0);
          expect(await readFile(join(root, '.bun-burner', 'lock'), 'utf8')).toBe(String(child.pid));
          if (connection === 0) {
            socket.close();
            await until(async () => !(await Bun.file(join(root, '.bun-burner', 'lock')).exists()));
          }
        }
        child.send('shutdown');
        await until(() => child.exitCode !== null);
        expect(await child.exited).toBe(0);
        await Promise.all(streams);
        expect(stderr).toBe('');
        expect(await Bun.file(join(root, '.bun-burner', 'lock')).exists()).toBe(false);
        await rename(root, moved); await rename(moved, root);
      } finally {
        socket?.close();
        if (child.exitCode === null) child.kill();
        await child.exited; await Promise.all(streams);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(moved, { recursive: true, force: true });
  }
}, 20000);
