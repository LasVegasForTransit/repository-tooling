import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncSetupEntrypoints } from '../standards/setup-entrypoints.ts';

const root = path.resolve(import.meta.dirname, '..');
const cli = 'node .lvbt/web-platform/packages/cli/src/cli.mjs';
const bundle = { files: { 'packages/cli/src/cli.mjs': 'available' } };
async function fixture(run) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-entrypoints-'));
  try {
    await mkdir(path.join(cwd, '.lvbt/web-platform/packages'), { recursive: true });
    await cp(path.join(root, 'packages/cli'), path.join(cwd, '.lvbt/web-platform/packages/cli'), {
      recursive: true,
      filter: (source) => !source.split(path.sep).includes('node_modules'),
    });
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        engines: { node: `^${process.versions.node}` },
        packageManager: 'pnpm@11.25.0',
        scripts: {
          bootstrap: 'lvbt bootstrap',
          preflight: 'lvbt preflight',
          postinstall: "node -e \"require('fs').writeFileSync('install-ran','yes')\"",
        },
      }),
    );
    await writeFile(
      path.join(cwd, '.npmrc'),
      '# Registry must survive\n@lasvegasfortransit:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${FAKE_REGISTRY_TOKEN}\npackage-import-method=clone\n',
    );
    await writeFile(
      path.join(cwd, 'pnpm-workspace.yaml'),
      'packages: []\n# Keep policy\nminimumReleaseAge: 1440\n',
    );
    spawnSync('git', ['init', '-q'], { cwd });
    await mkdir(path.join(cwd, '.lvbt'), { recursive: true });
    await writeFile(path.join(cwd, '.lvbt/commit-scopes.txt'), 'tooling\n');
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
async function tree(cwd) {
  const value = {};
  for (const entry of await readdir(cwd, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    value[entry.name] = entry.isDirectory()
      ? await tree(path.join(cwd, entry.name))
      : await readFile(path.join(cwd, entry.name), 'utf8');
  }
  return value;
}
function pnpm(cwd, command) {
  return spawnSync('pnpm', [command], { cwd, encoding: 'utf8', timeout: 20000 });
}

test('updater plans canonical Node setup entrypoints and preserves registry/auth settings', () =>
  fixture(async (cwd) => {
    const npmrc = await readFile(path.join(cwd, '.npmrc'), 'utf8');
    const before = await tree(cwd);
    assert.deepEqual(await syncSetupEntrypoints(cwd, bundle, true), [
      'package.json',
      'pnpm-workspace.yaml',
    ]);
    assert.deepEqual(await tree(cwd), before);
    await syncSetupEntrypoints(cwd, bundle);
    const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.bootstrap, `${cli} bootstrap`);
    assert.equal(manifest.scripts.preflight, `${cli} preflight`);
    assert.equal(await readFile(path.join(cwd, '.npmrc'), 'utf8'), npmrc);
    assert.match(
      await readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'),
      /^verifyDepsBeforeRun: false$/mu,
    );
    assert.deepEqual(await syncSetupEntrypoints(cwd, bundle), []);
  }));
test('real pnpm clean-checkout preflight runs without dependencies and writes nothing', () =>
  fixture(async (cwd) => {
    await syncSetupEntrypoints(cwd, bundle);
    const before = await tree(cwd);
    const result = pnpm(cwd, 'preflight');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /dependencies.*missing/);
    assert.doesNotMatch(result.stdout, /postinstall|Done in/);
    assert.deepEqual(await tree(cwd), before);
  }));
test('real pnpm bootstrap validates unsupported Node before install lifecycle', () =>
  fixture(async (cwd) => {
    await syncSetupEntrypoints(cwd, bundle);
    const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
    manifest.engines.node = '^99.0.0';
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify(manifest));
    const before = await tree(cwd);
    const result = pnpm(cwd, 'bootstrap');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Node|node/);
    assert.deepEqual(await tree(cwd), before);
  }));
test('real pnpm stale-checkout preflight leaves installed data and lockfile untouched', () =>
  fixture(async (cwd) => {
    await syncSetupEntrypoints(cwd, bundle);
    await mkdir(path.join(cwd, 'node_modules'));
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    await writeFile(path.join(cwd, 'node_modules/.lvbt-lockfile-hash'), 'stale');
    const before = await tree(cwd);
    const result = pnpm(cwd, 'preflight');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /installed tree.*different pnpm-lock/);
    assert.deepEqual(await tree(cwd), before);
  }));
