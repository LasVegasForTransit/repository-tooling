import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyPreset } from '../standards/web-platform.ts';

import {
  OWNED_FILES,
  SEEDED_FILES,
  ownedFileDrift,
  seedFiles,
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

test('canonical updating repairs shared hooks while preserving app files and seeded workflows', async (t) => {
  const directory = await repository(t);
  await mkdir(path.join(directory, '.githooks'));
  await mkdir(path.join(directory, '.github/workflows'), { recursive: true });
  await writeFile(path.join(directory, '.githooks/pre-push'), 'bespoke hook');
  await writeFile(
    path.join(directory, '.github/workflows/standard-update.yml'),
    'existing maintainer workflow',
  );
  await writeFile(path.join(directory, 'product.txt'), 'app-owned value');
  const incoming = await bundle(null);
  const preview = await applyPreset(directory, incoming, true);
  assert.ok(preview.consumerChanged.includes('.githooks/pre-push'));
  assert.equal(await readFile(path.join(directory, '.githooks/pre-push'), 'utf8'), 'bespoke hook');
  await applyPreset(directory, incoming);
  assert.deepEqual(await ownedFileDrift(directory, null), []);
  assert.equal(await readFile(path.join(directory, 'product.txt'), 'utf8'), 'app-owned value');
  assert.equal(
    await readFile(path.join(directory, '.github/workflows/standard-update.yml'), 'utf8'),
    'existing maintainer workflow',
  );
  assert.deepEqual((await applyPreset(directory, incoming, true)).consumerChanged, []);
});

test('owned file restoration rejects ancestor symlinks before updating any consumer files', async (t) => {
  const directory = await repository(t);
  const external = await repository(t);
  await writeFile(path.join(external, 'pre-push'), 'unrelated external hook');
  await symlink(external, path.join(directory, '.githooks'));
  const incoming = await bundle(null);
  await assert.rejects(applyPreset(directory, incoming), /\.githooks.*symlink/);
  assert.equal(await readFile(path.join(external, 'pre-push'), 'utf8'), 'unrelated external hook');
  await assert.rejects(readFile(path.join(directory, '.lvbt/web-platform.json')));
});

test('plugin and seeded workflow publication never follows consumer symlinks', async (t) => {
  const directory = await repository(t);
  const external = await repository(t);
  const settings = (await bundle()).files[`${reference}/.claude/settings.json`];
  await writeFile(path.join(external, 'settings.json'), settings);
  await mkdir(path.join(directory, '.claude'));
  await symlink(
    path.join(external, 'settings.json'),
    path.join(directory, '.claude/settings.json'),
  );
  await assert.rejects(syncPluginRef(directory, await bundle(), false), /settings.json.*symlink/);
  assert.equal(await readFile(path.join(external, 'settings.json'), 'utf8'), settings);
  await mkdir(path.join(directory, '.github/workflows'), { recursive: true });
  await symlink(
    path.join(external, 'missing.yml'),
    path.join(directory, '.github/workflows/standard-update.yml'),
  );
  await assert.rejects(seedFiles(directory, await bundle(), false), /standard-update.yml.*symlink/);
  await assert.rejects(readFile(path.join(external, 'missing.yml')));
});

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

test('an update adds the Standard update workflow once and never rewrites it', async (t) => {
  const directory = await repository(t);
  const incoming = await bundle();
  assert.deepEqual(await seedFiles(directory, incoming, true), SEEDED_FILES);
  await assert.rejects(readFile(path.join(directory, SEEDED_FILES[0])), 'a dry run writes nothing');

  assert.deepEqual(await seedFiles(directory, incoming, false), SEEDED_FILES);
  assert.equal(
    await readFile(path.join(directory, SEEDED_FILES[0]), 'utf8'),
    incoming.files[`${reference}/${SEEDED_FILES[0]}`],
  );
  await writeFile(path.join(directory, SEEDED_FILES[0]), 'name: Standard update\n');
  assert.deepEqual(await seedFiles(directory, incoming, false), []);
  assert.equal(
    await readFile(path.join(directory, SEEDED_FILES[0]), 'utf8'),
    'name: Standard update\n',
  );
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
  await writeFile(path.join(directory, 'prettier.config.js'), 'export default {};\n');
  await writeFile(path.join(directory, '.prettierrc.json'), '{}\n');
  assert.deepEqual(await ownedFileDrift(directory, 'v1.0.0'), [
    ".editorconfig differs from the standard's copy.",
    ".prettierrc.json replaces the organization's prettier.config.js.",
    '.claude/settings.json loads the contribution plugin from v9.9.9, not v1.0.0.',
  ]);
});
