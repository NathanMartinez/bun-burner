import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('verified push stops at failures and pushes normally only after every check passes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'bb-verify-'));
  const root = join(parent, 'repo'); const remote = join(parent, 'remote.git');
  const run = async (args: string[]) => {
    const child = Bun.spawn(args, { cwd: root, stdout: 'pipe', stderr: 'pipe',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Test Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } });
    const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { code, output: out + err };
  };
  const ok = async (args: string[]) => { const result = await run(args); if (result.code) throw new Error(result.output); return result.output.trim(); };
  try {
    await mkdir(join(root, 'tools'), { recursive: true });
    for (const name of ['verify.ts', 'verify-push.ts']) {
      await copyFile(new URL(`../tools/${name}`, import.meta.url), join(root, 'tools', name));
    }
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: {
      typecheck: 'bun run check.ts typecheck', 'typecheck:core': 'bun run check.ts core', 'typecheck:game': 'bun run check.ts game',
    } }));
    await writeFile(join(root, '.gitignore'), 'checks.log\nfail\n');
    await writeFile(join(root, 'check.ts'), `import { appendFile } from 'node:fs/promises';
const step = process.argv[2]; await appendFile('checks.log', step + '\\n');
if (await Bun.file('fail').exists() && step === 'typecheck') process.exit(7);
`);
    await writeFile(join(root, 'fixture.test.ts'), `import { test } from 'bun:test';
import { appendFile } from 'node:fs/promises';
test('fixture', async () => { await appendFile('checks.log', 'test\\n'); });
`);
    await ok(['git', 'init', '-b', 'main']);
    await ok(['git', 'add', '.']); await ok(['git', 'commit', '-m', 'fixture']);
    await ok(['git', 'init', '--bare', remote]);
    await ok(['git', 'remote', 'add', 'origin', remote]);
    await ok(['git', 'push', '-u', 'origin', 'main']);
    const original = await ok(['git', 'rev-parse', 'HEAD']);
    await writeFile(join(root, 'change.txt'), 'change\n');
    await ok(['git', 'add', 'change.txt']); await ok(['git', 'commit', '-m', 'pending']);

    await writeFile(join(root, 'change.txt'), 'trailing whitespace   \n');
    expect((await run([process.execPath, 'run', 'tools/verify-push.ts'])).code).not.toBe(0);
    expect(await Bun.file(join(root, 'checks.log')).exists()).toBe(false);
    expect(await ok(['git', '--git-dir', remote, 'rev-parse', 'refs/heads/main'])).toBe(original);

    await writeFile(join(root, 'change.txt'), 'change\n');
    await writeFile(join(root, 'fail'), '');
    expect((await run([process.execPath, 'run', 'tools/verify-push.ts'])).code).toBe(7);
    expect(await readFile(join(root, 'checks.log'), 'utf8')).toBe('test\ntypecheck\n');
    expect(await ok(['git', '--git-dir', remote, 'rev-parse', 'refs/heads/main'])).toBe(original);

    await rm(join(root, 'fail')); await rm(join(root, 'checks.log'));
    const passed = await run([process.execPath, 'run', 'tools/verify-push.ts']);
    expect(passed.code).toBe(0);
    expect(passed.output).toContain(`Verified on ${process.platform}`);
    expect(await readFile(join(root, 'checks.log'), 'utf8')).toBe('test\ntypecheck\ncore\ngame\n');
    expect(await ok(['git', '--git-dir', remote, 'rev-parse', 'refs/heads/main'])).toBe(await ok(['git', 'rev-parse', 'HEAD']));
  } finally { await rm(parent, { recursive: true, force: true }); }
}, 20000);
