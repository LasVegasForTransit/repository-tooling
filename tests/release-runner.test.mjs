import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRelease } from '../packages/cli/src/lib/release/runner.mjs';

test('artifact-only manifest generation reaches the signing command without app configuration', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-release-runner-'));
  try {
    await assert.rejects(runRelease({ cwd, mode: 'attestation', args: ['manifest'] }), (error) => {
      assert.doesNotMatch(error.message, /Configure release/);
      return true;
    });
    await assert.rejects(
      runRelease({ cwd, mode: 'attestation', args: ['verify'] }),
      /Configure release/,
    );
    await assert.rejects(
      runRelease({ cwd, mode: 'worker-release', args: ['activate'] }),
      /Configure release/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('release uses the CLI-owned TypeScript runtime without a consumer executable', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-release-no-root-tsx-'));
  const originalPath = process.env.PATH;
  try {
    const platform = path.join(cwd, 'node_modules/@lasvegasfortransit/web-platform');
    await mkdir(platform, { recursive: true });
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
    await writeFile(
      path.join(platform, 'package.json'),
      JSON.stringify({
        name: '@lasvegasfortransit/web-platform',
        type: 'module',
        exports: { './release': './release.ts' },
      }),
    );
    await writeFile(path.join(platform, 'release.ts'), 'export {};');
    await writeFile(
      path.join(platform, 'release-command.ts'),
      `
      import { writeFileSync } from 'node:fs';
      import path from 'node:path';
      const args: string[] = process.argv.slice(2);
      writeFileSync(path.join(args[1], 'observed.json'), JSON.stringify(args));
    `,
    );
    process.env.PATH = path.join(cwd, 'no-executables');
    await runRelease({ cwd, mode: 'attestation', args: ['manifest', '--output', 'proof.json'] });
    assert.deepEqual(JSON.parse(await readFile(path.join(cwd, 'observed.json'), 'utf8')), [
      'attestation',
      cwd,
      'manifest',
      '--output',
      'proof.json',
    ]);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(cwd, { recursive: true, force: true });
  }
});
