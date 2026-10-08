import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkInstall, recordInstall } from '../packages/cli/src/lib/install-fingerprint.mjs';

async function fixture(run) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-install-'));
  try {
    await mkdir(path.join(cwd, 'node_modules'));
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
const toolchain = { node: '24.20.0', pnpm: '11.25.0' };
test('successful installation records lockfile and actual Node/pnpm without any environment values', () =>
  fixture(async (cwd) => {
    recordInstall(cwd, toolchain);
    const stamp = await readFile(path.join(cwd, 'node_modules/.lvbt-install.json'), 'utf8');
    assert.equal(JSON.parse(stamp).node, toolchain.node);
    assert.equal(JSON.parse(stamp).pnpm, toolchain.pnpm);
    assert.equal(checkInstall(cwd, toolchain).ok, true);
  }));
test('read-only preflight fails after lockfile or supported toolchain changes without rewriting stamp', () =>
  fixture(async (cwd) => {
    recordInstall(cwd, toolchain);
    const file = path.join(cwd, 'node_modules/.lvbt-install.json');
    const before = await stat(file);
    assert.equal(checkInstall(cwd, { ...toolchain, node: '24.21.0' }).ok, false);
    assert.equal(checkInstall(cwd, { ...toolchain, pnpm: '11.26.0' }).ok, false);
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.1\n');
    const result = checkInstall(cwd, toolchain);
    assert.equal(result.ok, false);
    assert.equal(result.fix, 'pnpm bootstrap');
    assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  }));
test('unstamped 0.7 migration checkouts warn, but an existing legacy stale lockfile stamp fails', () =>
  fixture(async (cwd) => {
    assert.equal(checkInstall(cwd, toolchain).warning, true);
    await writeFile(path.join(cwd, 'node_modules/.lvbt-lockfile-hash'), 'old');
    assert.equal(checkInstall(cwd, toolchain).ok, false);
    const lock = await readFile(path.join(cwd, 'pnpm-lock.yaml'));
    await writeFile(
      path.join(cwd, 'node_modules/.lvbt-lockfile-hash'),
      createHash('sha256').update(lock).digest('hex'),
    );
    assert.equal(checkInstall(cwd, toolchain).ok, true);
    assert.equal(checkInstall(cwd, toolchain).warning, true);
  }));
test('a corrupt fingerprint fails instead of silently downgrading to migration warning', () =>
  fixture(async (cwd) => {
    await writeFile(path.join(cwd, 'node_modules/.lvbt-install.json'), 'not-json');
    assert.equal(checkInstall(cwd, toolchain).ok, false);
  }));
