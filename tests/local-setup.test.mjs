import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const cli = path.resolve(import.meta.dirname, '../packages/cli/src/cli.mjs');
async function fixture(run) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-local-'));
  try {
    await mkdir(path.join(cwd, 'bin'));
    await mkdir(path.join(cwd, '.lvbt'));
    await mkdir(path.join(cwd, 'node_modules'));
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        engines: { node: `>=${process.versions.node}` },
        packageManager: 'pnpm@11.25.0',
      }),
    );
    await writeFile(path.join(cwd, '.lvbt/commit-scopes.txt'), 'tooling\n');
    await writeFile(path.join(cwd, '.env.example'), 'API_KEY=\nPUBLIC_URL=https://example.org\n');
    await writeFile(
      path.join(cwd, '.lvbt/tooling.json'),
      JSON.stringify({
        version: 1,
        local: {
          env: [{ example: '.env.example', file: '.env.local' }],
          optional: [{ name: 'API_KEY', purpose: 'Optional integration' }],
        },
      }),
    );
    await writeFile(path.join(cwd, 'cloudflare.config.ts'), 'export default {};');
    const fake = path.join(cwd, 'bin/pnpm');
    await writeFile(
      fake,
      '#!/bin/sh\ncase "$1" in\n--version) echo 11.25.0;;\ninstall) echo install >> calls;;\n*) echo unexpected >> calls; exit 99;;\nesac\n',
    );
    await chmod(fake, 0o755);
    const git = (...args) => spawnSync('git', args, { cwd });
    git('init', '-q');
    git('config', '--local', 'core.hooksPath', '.githooks');
    const exec = (...args) =>
      spawnSync(process.execPath, [cli, ...args], {
        cwd,
        env: { ...process.env, CI: '', PATH: `${cwd}/bin:${process.env.PATH}` },
        encoding: 'utf8',
      });
    await run({ cwd, exec });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
test('local bootstrap needs no publishing login and preserves existing values on repeat', () =>
  fixture(async ({ cwd, exec }) => {
    const first = exec('bootstrap');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.equal(
      await readFile(path.join(cwd, '.env.local'), 'utf8'),
      await readFile(path.join(cwd, '.env.example'), 'utf8'),
    );
    await writeFile(path.join(cwd, '.env.local'), 'API_KEY=local-private-value\n');
    const second = exec('bootstrap');
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.equal(
      await readFile(path.join(cwd, '.env.local'), 'utf8'),
      'API_KEY=local-private-value\n',
    );
    assert.doesNotMatch(second.stdout, /local-private-value/);
    assert.equal(await readFile(path.join(cwd, 'calls'), 'utf8'), 'install\ninstall\n');
  }));
test('local preflight reports missing environment without writing it or asking for cloud login', () =>
  fixture(async ({ cwd, exec }) => {
    const result = exec('preflight');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /bootstrap/);
    assert.doesNotMatch(result.stdout, /Cloudflare|GitHub CLI/);
    await assert.rejects(readFile(path.join(cwd, '.env.local')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(cwd, 'calls')), { code: 'ENOENT' });
  }));
test('bootstrap rejects unsupported Node before dependency installation', () =>
  fixture(async ({ cwd, exec }) => {
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ engines: { node: '^99.0.0' }, packageManager: 'pnpm@11.25.0' }),
    );
    const result = exec('bootstrap');
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /Node/);
    await assert.rejects(readFile(path.join(cwd, 'calls')), { code: 'ENOENT' });
  }));
test('local preflight detects a changed installed lockfile without writing a new fingerprint', () =>
  fixture(async ({ cwd, exec }) => {
    assert.equal(exec('bootstrap').status, 0);
    const stamp = await readFile(path.join(cwd, 'node_modules/.lvbt-install.json'), 'utf8');
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.1\n');
    const report = exec('preflight');
    assert.equal(report.status, 1);
    assert.match(report.stdout, /installed tree.*does not match/);
    assert.match(report.stdout, /fix: pnpm bootstrap/);
    assert.equal(await readFile(path.join(cwd, 'node_modules/.lvbt-install.json'), 'utf8'), stamp);
  }));
test('setup-record refuses to bless an existing tree outside the pnpm install lifecycle', () =>
  fixture(async ({ cwd, exec }) => {
    const result = exec('setup-record');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /only from pnpm postinstall/);
    await assert.rejects(readFile(path.join(cwd, 'node_modules/.lvbt-install.json')), {
      code: 'ENOENT',
    });
  }));
