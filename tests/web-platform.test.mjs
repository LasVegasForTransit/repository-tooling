import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyPreset, verifyPreset, fingerprint } from '../standards/web-platform.ts';
import { readCommit, readRelease } from '../standards/web-platform-source.ts';

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

test('records an unpublished preset by commit without assigning a release', () =>
  fixture(async (root) => {
    await applyPreset(root, {
      ...preset({ 'catalog.json': '{"node":"24.20.0"}\n' }),
      release: null,
    });

    const metadata = await verifyPreset(root);
    assert.equal(metadata.release, null);
    assert.equal(metadata.commit, 'a'.repeat(40));
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
    assert.deepEqual(plan, {
      added: ['new.txt'],
      changed: ['shared.txt'],
      removed: ['old.txt'],
      consumerChanged: [],
    });
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
    assert.deepEqual(await applyPreset(root, next), {
      added: [],
      changed: [],
      removed: [],
      consumerChanged: [],
    });
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform/old')), { code: 'ENOENT' });
  }));

test('migrates only legacy platform package references', () =>
  fixture(async (root) => {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@lvbt/brand': 'workspace:*',
          '@lvbt/cli': 'file:.lvbt/web-platform/packages/cli',
        },
      }),
    );
    await writeFile(path.join(root, 'prettier.config.mjs'), "import '@lvbt/prettier-config';\n");
    const plan = await applyPreset(root, preset({ 'catalog.json': '{}' }));
    assert.deepEqual(plan.consumerChanged, ['package.json', 'prettier.config.mjs']);
    assert.match(
      await readFile(path.join(root, 'package.json'), 'utf8'),
      /@lasvegasfortransit\/cli/,
    );
    assert.match(await readFile(path.join(root, 'package.json'), 'utf8'), /"@lvbt\/brand"/);
    assert.match(
      await readFile(path.join(root, 'prettier.config.mjs'), 'utf8'),
      /@lasvegasfortransit\/prettier-config/,
    );
  }));

test('adds missing Playwright output rules to the consumer .gitignore once', () =>
  fixture(async (root) => {
    const own = 'node_modules/\n# The site keeps its own test results.\ntest-results/';
    await writeFile(path.join(root, '.gitignore'), own);
    execFileSync('git', ['init', '--quiet', root]);
    const ignored = (file) =>
      spawnSync('git', ['-C', root, 'check-ignore', '--quiet', file]).status === 0;

    const planned = await applyPreset(root, preset({ 'catalog.json': '{}' }), true);
    assert.deepEqual(planned.consumerChanged, ['.gitignore']);
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), own);

    const applied = await applyPreset(root, preset({ 'catalog.json': '{}' }));
    assert.deepEqual(applied.consumerChanged, ['.gitignore']);
    const updated = await readFile(path.join(root, '.gitignore'), 'utf8');
    assert.ok(updated.startsWith(`${own}\n`), 'the consumer keeps its own lines');
    assert.equal(updated.split('\n').filter((line) => line === 'test-results/').length, 1);
    for (const file of [
      'apps/site/test-results/home-desktop/trace.zip',
      'apps/site/playwright-report/index.html',
      'apps/site/blob-report/report.zip',
      'apps/site/playwright/.cache/index.js',
    ]) {
      assert.ok(ignored(file), `${file} must be ignored`);
    }
    assert.ok(!ignored('apps/site/tests/e2e/home.spec.ts'), 'tests stay tracked');

    const repeated = await applyPreset(root, preset({ 'catalog.json': '{}' }));
    assert.deepEqual(repeated.consumerChanged, []);
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), updated);
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

test('reads an unpublished preset only from an exact commit', () =>
  fixture(async (root) => {
    const repository = path.join(root, 'source.git');
    execFileSync(
      'git',
      ['clone', '--bare', '--shared', new URL('..', import.meta.url).pathname, repository],
      { stdio: 'pipe' },
    );
    const commit = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    const bundle = readCommit(repository, commit);
    assert.equal(bundle.release, null);
    assert.equal(bundle.commit, commit);
    assert.ok(bundle.files['packages/cli/catalog.json']);
    assert.throws(() => readCommit(repository, 'main'), /full commit/i);
  }));

test('web profiles preserve immutable Worker version previews', async () => {
  for (const file of [
    'examples/with-astro/apps/site/wrangler.jsonc',
    'examples/with-vite-react/apps/app/wrangler.jsonc',
  ]) {
    const config = await readFile(path.join(new URL('..', import.meta.url).pathname, file), 'utf8');
    assert.match(config, /"preview_urls": true/);
  }
});

test('the updater accepts either a release or an exact commit, never both', () =>
  fixture(async (root) => {
    const repository = new URL('..', import.meta.url).pathname;
    const commit = execFileSync('git', ['-C', repository, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const cli = path.join(repository, 'standards/web-platform-cli.ts');
    const development = spawnSync(
      process.execPath,
      [cli, 'update', '--root', root, '--source', repository, '--commit', commit, '--json'],
      { encoding: 'utf8' },
    );
    assert.equal(development.status, 0, development.stderr);
    assert.equal(JSON.parse(development.stdout).release, null);

    const ambiguous = spawnSync(
      process.execPath,
      [
        cli,
        'update',
        '--root',
        root,
        '--source',
        repository,
        '--release',
        'v0.3.1',
        '--commit',
        commit,
        '--json',
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(ambiguous.status, 0);
    assert.match(JSON.parse(ambiguous.stderr).error, /either --release or --commit/i);
  }));
