import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { syncCatalog } from '../standards/catalog.ts';
import { retireCommitScopes } from '../standards/commit-scopes.ts';
import {
  OWNED_FILES,
  SEEDED_FILES,
  ownedFileDrift,
  syncOwnedFiles,
  syncPluginRef,
} from '../standards/owned-files.ts';

const root = path.resolve(import.meta.dirname, '..');
const reference = 'examples/with-astro';

async function exampleFiles() {
  const files = {};
  for (const name of [...OWNED_FILES, ...SEEDED_FILES, '.claude/settings.json'])
    files[`${reference}/${name}`] = await readFile(path.join(root, reference, name), 'utf8');
  files['packages/cli/catalog.json'] = await readFile(
    path.join(root, 'packages/cli/catalog.json'),
    'utf8',
  );
  return files;
}

async function bundle(release = 'v9.9.9') {
  return {
    formatVersion: 1,
    preset: 'lvbt-web',
    release,
    commit: 'a'.repeat(40),
    files: await exampleFiles(),
    executables: OWNED_FILES.filter((name) => name.startsWith('.githooks/')).map(
      (name) => `${reference}/${name}`,
    ),
  };
}

async function repository(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-owned-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('every example carries identical owned and seeded files', async () => {
  for (const name of [...OWNED_FILES, ...SEEDED_FILES]) {
    const expected = await readFile(path.join(root, reference, name), 'utf8');
    for (const example of ['basic', 'with-vite-react'])
      assert.equal(
        await readFile(path.join(root, 'examples', example, name), 'utf8'),
        expected,
        `${example}/${name} must match ${reference}`,
      );
  }
});

test('an update restores edited owned files, seeds missing ones, and removes shadowing configs', async (t) => {
  const directory = await repository(t);
  await mkdir(path.join(directory, '.githooks'), { recursive: true });
  await writeFile(path.join(directory, '.githooks/pre-commit'), '#!/bin/sh\necho custom\n');
  await writeFile(path.join(directory, 'prettier.config.js'), 'export default {};\n');
  await writeFile(path.join(directory, '.prettierrc.json'), '{}\n');
  const incoming = await bundle();

  const planned = await syncOwnedFiles(directory, incoming, true);
  assert.ok(planned.includes('.githooks/pre-commit'));
  assert.ok(planned.includes('.github/workflows/standard-update.yml'));
  assert.ok(planned.includes('.prettierrc.json'));
  assert.equal(
    await readFile(path.join(directory, '.githooks/pre-commit'), 'utf8'),
    '#!/bin/sh\necho custom\n',
    'a dry run writes nothing',
  );

  await syncOwnedFiles(directory, incoming, false);
  assert.equal(
    await readFile(path.join(directory, '.githooks/pre-commit'), 'utf8'),
    incoming.files[`${reference}/.githooks/pre-commit`],
  );
  assert.ok(((await stat(path.join(directory, '.githooks/pre-commit'))).mode & 0o111) !== 0);
  await assert.rejects(readFile(path.join(directory, '.prettierrc.json')));
  assert.deepEqual(
    await syncOwnedFiles(directory, incoming, false),
    [],
    'a second run changes nothing',
  );
});

test('a seeded workflow the repository already has is never rewritten', async (t) => {
  const directory = await repository(t);
  const workflow = path.join(directory, '.github/workflows/standard-update.yml');
  await mkdir(path.dirname(workflow), { recursive: true });
  await writeFile(workflow, 'name: Standard update\n');
  const changed = await syncOwnedFiles(directory, await bundle(), false);
  assert.ok(!changed.includes('.github/workflows/standard-update.yml'));
  assert.equal(await readFile(workflow, 'utf8'), 'name: Standard update\n');
});

test('the plugin ref follows the installed release, and check reports drift', async (t) => {
  const directory = await repository(t);
  await mkdir(path.join(directory, '.claude'));
  const settings = (
    await readFile(path.join(root, reference, '.claude/settings.json'), 'utf8')
  ).replace(/"ref": "[^"]*"/, '"ref": "v0.1.0"');
  await writeFile(path.join(directory, '.claude/settings.json'), settings);
  assert.deepEqual(await syncPluginRef(directory, await bundle('v9.9.9'), false), [
    '.claude/settings.json',
  ]);
  assert.match(
    await readFile(path.join(directory, '.claude/settings.json'), 'utf8'),
    /"ref": "v9\.9\.9"/,
  );
  assert.deepEqual(await syncPluginRef(directory, await bundle(null), false), []);

  const vendored = path.join(directory, '.lvbt/web-platform', reference);
  for (const name of OWNED_FILES) {
    await mkdir(path.dirname(path.join(vendored, name)), { recursive: true });
    await writeFile(path.join(vendored, name), `${name}\n`);
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), `${name}\n`);
  }
  assert.deepEqual(await ownedFileDrift(directory, 'v9.9.9'), []);
  await writeFile(path.join(directory, '.editorconfig'), 'root = false\n');
  assert.deepEqual(await ownedFileDrift(directory, 'v1.0.0'), [
    ".editorconfig differs from the standard's copy.",
    '.claude/settings.json loads the contribution plugin from v9.9.9, not v1.0.0.',
  ]);
});

test('shared catalog entries take the release version and keep their formatting', async (t) => {
  const directory = await repository(t);
  const catalog = JSON.parse(
    await readFile(path.join(root, 'packages/cli/catalog.json'), 'utf8'),
  ).catalog;
  const workspace = [
    'packages:',
    "  - 'apps/*'",
    'catalog:',
    "  '@types/node': ^20.0.0 # pinned for the worker",
    '  eslint: 9.0.0',
    '  left-pad: 1.3.0',
    'minimumReleaseAge: 1440',
    '',
  ].join('\n');
  await writeFile(path.join(directory, 'pnpm-workspace.yaml'), workspace);
  assert.deepEqual(await syncCatalog(directory, await bundle(), false), ['pnpm-workspace.yaml']);
  assert.equal(
    await readFile(path.join(directory, 'pnpm-workspace.yaml'), 'utf8'),
    workspace
      .replace('^20.0.0', catalog['@types/node'])
      .replace('eslint: 9.0.0', `eslint: ${catalog.eslint}`),
  );
  assert.deepEqual(await syncCatalog(directory, await bundle(), false), []);
});

test('ci is removed from a repository scope list and nothing else is', async (t) => {
  const directory = await repository(t);
  await mkdir(path.join(directory, '.lvbt'));
  await writeFile(path.join(directory, '.lvbt/commit-scopes.txt'), '# scopes\nsite\nci\ndocs\n');
  assert.deepEqual(await retireCommitScopes(directory, false), ['.lvbt/commit-scopes.txt']);
  assert.equal(
    await readFile(path.join(directory, '.lvbt/commit-scopes.txt'), 'utf8'),
    '# scopes\nsite\ndocs\n',
  );
  assert.deepEqual(await retireCommitScopes(directory, false), []);
});
