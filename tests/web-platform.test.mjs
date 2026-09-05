import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyPreset, verifyPreset, fingerprint } from '../standards/web-platform.ts';
import { readRelease } from '../standards/web-platform-source.ts';

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-preset-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function preset(files) {
  return { formatVersion: 1, preset: 'lvbt-web', release: 'v1.0.0', commit: 'a'.repeat(40), files };
}

test('preserves executable hooks from the source release', () =>
  fixture(async (root) => {
    await applyPreset(root, {
      ...preset({ 'hooks/commit-msg': '#!/bin/sh\n' }),
      executables: ['hooks/commit-msg'],
    });
    assert.ok((await stat(path.join(root, '.lvbt/web-platform/hooks/commit-msg'))).mode & 0o111);
  }));

test('vendors exact bytes and verifies them without a source repository', () =>
  fixture(async (root) => {
    const bundle = preset({ 'catalog.json': '{"node":"24.20.0"}\n' });
    await applyPreset(root, bundle);
    assert.equal(
      await readFile(path.join(root, '.lvbt/web-platform/catalog.json'), 'utf8'),
      bundle.files['catalog.json'],
    );
    const metadata = await verifyPreset(root);
    assert.equal(metadata.contentHash, fingerprint(bundle.files));
    assert.equal(metadata.release, 'v1.0.0');
  }));

test('refuses to overwrite locally edited vendor files', () =>
  fixture(async (root) => {
    await applyPreset(root, preset({ 'catalog.json': '{}' }));
    await writeFile(path.join(root, '.lvbt/web-platform/catalog.json'), 'edited');
    await assert.rejects(verifyPreset(root), /integrity/i);
    await assert.rejects(applyPreset(root, preset({ 'catalog.json': 'new' })), /integrity/i);
  }));

test('dry run leaves files unchanged and reports additions, changes, and removals', () =>
  fixture(async (root) => {
    await applyPreset(root, preset({ 'old.txt': 'old', 'shared.txt': 'first' }));
    const plan = await applyPreset(
      root,
      preset({ 'new.txt': 'new', 'shared.txt': 'second' }),
      true,
    );
    assert.deepEqual(plan, { added: ['new.txt'], changed: ['shared.txt'], removed: ['old.txt'] });
    await verifyPreset(root);
    assert.equal(await readFile(path.join(root, '.lvbt/web-platform/shared.txt'), 'utf8'), 'first');
  }));

test('rejects traversal before creating files', () =>
  fixture(async (root) => {
    await assert.rejects(applyPreset(root, preset({ '../escape': 'bad' })), /path/i);
  }));

test('detects unexpected files', () =>
  fixture(async (root) => {
    await applyPreset(root, preset({ 'catalog.json': '{}' }));
    await mkdir(path.join(root, '.lvbt/web-platform/extra'));
    await writeFile(path.join(root, '.lvbt/web-platform/extra/file'), 'unexpected');
    await assert.rejects(verifyPreset(root), /integrity/i);
  }));

test('detects symbolic links rather than following them', () =>
  fixture(async (root) => {
    await applyPreset(root, preset({ 'catalog.json': '{}' }));
    const file = path.join(root, '.lvbt/web-platform/catalog.json');
    await rm(file);
    await writeFile(path.join(root, 'outside'), '{}');
    await symlink(path.join(root, 'outside'), file);
    await assert.rejects(verifyPreset(root), /integrity/i);
  }));

test('an applied update replaces removed files and is idempotent', () =>
  fixture(async (root) => {
    await applyPreset(root, preset({ old: 'old' }));
    const next = { ...preset({ new: 'new' }), release: 'v1.0.1' };
    await applyPreset(root, next);
    assert.equal((await verifyPreset(root)).release, 'v1.0.1');
    assert.deepEqual(await applyPreset(root, next), { added: [], changed: [], removed: [] });
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform/old')), { code: 'ENOENT' });
  }));

test('reads only a tagged commit and includes both web profiles', () =>
  fixture(async (root) => {
    const repository = path.join(root, 'source.git');
    execFileSync(
      'git',
      ['clone', '--bare', '--shared', new URL('..', import.meta.url).pathname, repository],
      { stdio: 'pipe' },
    );
    execFileSync('git', ['-C', repository, 'tag', 'v99.0.0', 'HEAD']);
    const bundle = readRelease(repository, 'v99.0.0');
    assert.match(bundle.commit, /^[a-f0-9]{40}$/);
    assert.ok(bundle.files['examples/with-astro/apps/site/astro.config.ts']);
    assert.ok(bundle.files['examples/with-vite-react/apps/app/vite.config.ts']);
    assert.throws(() => readRelease(repository, 'main'), /explicit version/);
  }));
