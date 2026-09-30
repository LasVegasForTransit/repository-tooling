import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve(import.meta.dirname, '../packages/cli/src/cli.mjs');

test('production bootstrap can reach platform setup without a cf login', async () => {
  const repository = await mkdtemp(path.join(tmpdir(), 'lvbt-cf-bootstrap-'));
  try {
    const bin = path.join(repository, 'bin');
    await mkdir(bin);
    await mkdir(path.join(repository, 'node_modules'));
    await mkdir(path.join(repository, '.lvbt'));
    await writeFile(
      path.join(repository, 'package.json'),
      JSON.stringify({
        packageManager: 'pnpm@11.25.0',
        engines: { node: `>=${process.versions.node}` },
      }),
    );
    await writeFile(path.join(repository, '.lvbt/commit-scopes.txt'), 'tooling\n');
    await writeFile(path.join(repository, 'cloudflare.config.ts'), 'export default {};\n');
    const fakePnpm = path.join(bin, 'pnpm');
    await writeFile(
      fakePnpm,
      '#!/bin/sh\ncase "$1" in\n  --version) echo 11.25.0;;\n  install) exit 0;;\n  exec) if [ "$CLOUDFLARE_API_TOKEN" = "invalid-test-only" ]; then echo \'{"authenticated":true,"tokenValid":false}\'; else echo \'{"authenticated":false,"error":"Not logged in"}\'; fi;;\nesac\n',
    );
    await chmod(fakePnpm, 0o755);
    const git = (...args) => spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    assert.equal(git('config', '--local', 'core.hooksPath', '.githooks').status, 0);
    const env = { ...process.env, CI: '1', PATH: `${bin}:${process.env.PATH}` };
    const run = (...args) =>
      spawnSync(process.execPath, [cli, ...args], { cwd: repository, env, encoding: 'utf8' });

    const normal = run('preflight');
    assert.equal(normal.status, 1);
    assert.match(normal.stdout, /FAIL\s+Cloudflare cf\s+cf is not signed in/);
    const invalidToken = spawnSync(process.execPath, [cli, 'preflight'], {
      cwd: repository,
      env: { ...env, CLOUDFLARE_API_TOKEN: 'invalid-test-only' },
      encoding: 'utf8',
    });
    assert.equal(invalidToken.status, 1);
    assert.match(invalidToken.stdout, /FAIL\s+Cloudflare cf/);

    const production = run('bootstrap', '--production');
    assert.equal(production.status, 2);
    assert.match(production.stdout, /WARN\s+Cloudflare cf/);
    assert.doesNotMatch(production.stdout, /FAIL\s+Cloudflare cf/);
    assert.match(production.stderr, /needs a terminal/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
