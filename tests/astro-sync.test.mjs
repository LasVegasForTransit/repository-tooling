import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkContract } from '../packages/cli/src/lib/check/contract.mjs';
import { applyPreset } from '../standards/web-platform.ts';

const sourceRoot = new URL('..', import.meta.url).pathname;
const example = (name, file) => readFile(path.join(sourceRoot, 'examples', name, file), 'utf8');

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-astro-sync-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

/**
 * A consumer from before the sync task: an Astro site and a plain library in a workspace, with
 * the turbo.json every example shipped until now (the React example still ships it).
 */
async function consumer(root, { astro = true } = {}) {
  await writeFile(
    path.join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - apps/*\n  - packages/*\n',
  );
  await writeJson(path.join(root, 'package.json'), { name: 'consumer', private: true });
  await mkdir(path.join(root, 'apps/site'), { recursive: true });
  await mkdir(path.join(root, 'packages/ui'), { recursive: true });
  await writeJson(path.join(root, 'apps/site/package.json'), {
    name: '@example/site',
    scripts: { build: 'astro build', lint: 'eslint .', 'check-types': 'astro check' },
    dependencies: astro ? { astro: 'catalog:' } : { vite: 'catalog:' },
  });
  await writeJson(path.join(root, 'packages/ui/package.json'), {
    name: '@example/ui',
    scripts: { lint: 'eslint .' },
  });
  await writeFile(path.join(root, 'turbo.json'), await example('with-vite-react', 'turbo.json'));
}

const preset = { formatVersion: 1, preset: 'lvbt-web', release: 'v1.0.0', commit: 'a'.repeat(40) };

test('the update wires an Astro package to generate its types before lint', () =>
  fixture(async (root) => {
    await consumer(root);
    const before = await readFile(path.join(root, 'turbo.json'), 'utf8');

    const planned = await applyPreset(root, { ...preset, files: { 'catalog.json': '{}' } }, true);
    assert.deepEqual(planned.consumerChanged, ['apps/site/package.json', 'turbo.json']);
    assert.equal(await readFile(path.join(root, 'turbo.json'), 'utf8'), before);

    const applied = await applyPreset(root, { ...preset, files: { 'catalog.json': '{}' } });
    assert.deepEqual(applied.consumerChanged, ['apps/site/package.json', 'turbo.json']);
    const site = await json(path.join(root, 'apps/site/package.json'));
    assert.equal(site.scripts.sync, 'astro sync');
    assert.deepEqual(Object.keys(site.scripts), ['build', 'lint', 'sync', 'check-types']);
    assert.equal((await json(path.join(root, 'packages/ui/package.json'))).scripts.sync, undefined);
    // The migrated file is byte for byte the Astro example's, so it passes Prettier too.
    assert.equal(
      await readFile(path.join(root, 'turbo.json'), 'utf8'),
      await example('with-astro', 'turbo.json'),
    );
    assert.deepEqual(checkContract({ cwd: root }).lines, []);

    const repeated = await applyPreset(root, { ...preset, files: { 'catalog.json': '{}' } });
    assert.deepEqual(repeated.consumerChanged, []);
  }));

test('the update leaves a repository without Astro alone', () =>
  fixture(async (root) => {
    await consumer(root, { astro: false });
    const before = await readFile(path.join(root, 'turbo.json'), 'utf8');
    const applied = await applyPreset(root, { ...preset, files: { 'catalog.json': '{}' } });
    assert.deepEqual(applied.consumerChanged, []);
    assert.equal(await readFile(path.join(root, 'turbo.json'), 'utf8'), before);
  }));

test('the contract names each missing piece of the Astro sync wiring', () =>
  fixture(async (root) => {
    await consumer(root);
    const { ok, lines } = checkContract({ cwd: root });
    assert.equal(ok, false);
    assert.equal(lines.length, 3);
    assert.ok(lines.some((line) => line.startsWith('apps/site/package.json has no "sync"')));
    assert.ok(lines.includes('turbo.json has no "sync" task'));
    assert.ok(lines.includes('turbo.json does not run "sync" before "lint"'));
  }));

test('the contract asks nothing of a repository without Astro', () =>
  fixture(async (root) => {
    await consumer(root, { astro: false });
    assert.deepEqual(checkContract({ cwd: root }).lines, []);
  }));
