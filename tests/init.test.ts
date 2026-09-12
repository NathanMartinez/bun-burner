import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('init help has no side effects and concurrent initialization never overwrites configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb-init-'));
  const run = async (...args: string[]) => {
    const child = Bun.spawn([process.execPath, 'run', 'init', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, output: out + err };
  };
  try {
    await mkdir(join(root, 'tools'));
    await copyFile(new URL('../tools/init.ts', import.meta.url), join(root, 'tools', 'init.ts'));
    await copyFile(new URL('../.env.example', import.meta.url), join(root, '.env.example'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { init: 'bun run tools/init.ts' } }));
    for (const flag of ['--help', '-h']) {
      const result = await run(flag);
      expect(result.code).toBe(0); expect(result.output).toContain('never overwritten');
      expect(result.output).toContain('ws://127.0.0.1:12525');
      expect(await Bun.file(join(root, '.env')).exists()).toBe(false);
    }
    expect((await run('--unknown')).code).toBe(1);
    expect(await Bun.file(join(root, '.env')).exists()).toBe(false);
    const results = await Promise.all([run(), run()]);
    expect(results.every(r => r.code === 0)).toBe(true);
    expect(results.filter(r => r.output.includes('Bun Burner initialized.')).length).toBe(1);
    expect(results.filter(r => r.output.includes('Existing .env preserved.')).length).toBe(1);
    const example = await readFile(join(root, '.env.example'));
    expect(await readFile(join(root, '.env'))).toEqual(example);
    expect(example.toString()).toContain('BUN_BURNER_SYNC_ENABLED=false');
    await writeFile(join(root, '.env'), '# user configuration\r\nBUN_BURNER_SYNC_ENABLED=false\r\n');
    const before = await readFile(join(root, '.env'));
    expect((await run()).output).toContain('Existing .env preserved.');
    expect(await readFile(join(root, '.env'))).toEqual(before);
    expect((await import('node:fs')).existsSync(join(root, 'scripts'))).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
