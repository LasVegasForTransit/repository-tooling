import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  scalarSection,
  updateOverrides,
  overrideProblems,
} from '../packages/cli/src/lib/check/workspace-policy.mjs';
import { applyPreset } from '../standards/web-platform.ts';
import { checkContract } from '../packages/cli/src/lib/check/contract.mjs';

const overrides = {
  sharp: '0.35.5',
  'undici@>=7 <8': '7.29.1',
  braces: 'npm:@dieub/braces-depth-guard@3.0.3-pn.3',
};
const bundle = {
  formatVersion: 1,
  preset: 'lvbt-web',
  release: 'v0.7.0',
  commit: 'a'.repeat(40),
  files: { 'packages/cli/catalog.json': JSON.stringify({ overrides }) },
};
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-workspace-policy-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('one parser understands quoted/spaced selectors and aliases as literal scalar values', () => {
  const source = `packages:\n  - apps/*\noverrides: # policy\n  'undici@>=7 <8': '7.29.1' # retained\n  "package > child": "npm:fork@1.2.3"\n  braces: npm:@dieub/braces-depth-guard@3.0.3-pn.3\ncatalog:\n  '@types/node': 24.13.3\n`;
  assert.deepEqual(scalarSection(source, 'overrides').entries, {
    'undici@>=7 <8': '7.29.1',
    'package > child': 'npm:fork@1.2.3',
    braces: overrides.braces,
  });
  assert.deepEqual(scalarSection(source, 'catalog').entries, { '@types/node': '24.13.3' });
});

test('canonical replacements preserve app-only overrides, unrelated fields and comments exactly', () => {
  const source = `packages:\n  - apps/*\n# product\noverrides:\n  sharp: 0.35.4 # product rationale\n  'undici@>=7 <8': '7.0.0'\n  'product > child': npm:my-fork@1.0.0 # app only\nallowBuilds:\n  esbuild: true\n`;
  const expected = source
    .replace('sharp: 0.35.4', 'sharp: 0.35.5')
    .replace("'7.0.0'", "'7.29.1'")
    .replace('allowBuilds:', `  "braces": "${overrides.braces}"\nallowBuilds:`);
  assert.equal(updateOverrides(source, overrides), expected);
  assert.equal(updateOverrides(expected, overrides), expected);
  assert.deepEqual(overrideProblems(expected, overrides), []);
  assert.deepEqual(overrideProblems(source, overrides), [
    'pnpm-workspace.yaml overrides "sharp" is "0.35.4"; shared audited policy requires "0.35.5".',
    'pnpm-workspace.yaml overrides "undici@>=7 <8" is "7.0.0"; shared audited policy requires "7.29.1".',
    `pnpm-workspace.yaml overrides "braces" is missing; shared audited policy requires "${overrides.braces}".`,
  ]);
});

test('literal quoted ranges, Git fragments and CRLF remain unchanged alongside new shared pins', () => {
  const source =
    'packages:\r\n  - apps/*\r\noverrides:\r\n  custom: "*" # all supported versions\r\n  fork: github:org/fork#reviewed\r\n  "product > child": "^1 || ^2"';
  const updated = updateOverrides(source, { sharp: overrides.sharp });
  assert.ok(updated.startsWith(source + '\r\n'));
  assert.deepEqual(scalarSection(updated, 'overrides').entries, {
    custom: '*',
    fork: 'github:org/fork#reviewed',
    'product > child': '^1 || ^2',
    sharp: overrides.sharp,
  });
  assert.equal(updateOverrides(updated, { sharp: overrides.sharp }), updated);
});

test('unsupported or ambiguous controlled YAML fails with section and line before any update', () => {
  for (const source of [
    'overrides: {}\n',
    'overrides:#comment\n',
    'overrides\n',
    'overrides: &policy\n  sharp: 1\n',
    'overrides:\n  sharp: *pin\n',
    'overrides:\n  ? sharp: 1\n',
    'overrides:\n  - sharp: 1\n',
    'overrides:\n  <<: "merge-policy"\n',
    'overrides:\n  sharp # comment: 0.35.4\n',
    'overrides:\n  product: -\n',
    'overrides:\n  product: ?\n',
    'overrides:\n  product: :\n',
    'overrides:\n  sharp:\n    nested: 1\n',
    'overrides:\n  sharp: 1\n  sharp: 2\n',
    'overrides:\n  sharp: 1\noverrides:\n  other: 2\n',
    'overrides:\n\tsharp: 1\n',
    'catalog:\n  vite: [8]\n',
    'overrides:\n  "sharp: 1\n',
    'overrides:\n  sharp: "1" trailing\n',
  ])
    assert.throws(
      () => updateOverrides(source, overrides),
      /pnpm-workspace\.yaml.*(?:catalog|overrides).*line \d+/,
    );
});

test('canonical migration is read-only when planned, adds only audited pins and repeats without changes', () =>
  fixture(async (root) => {
    const source = 'packages:\n  - apps/*\noverrides:\n  custom: npm:fork@1.0.0\n';
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), source);
    const plan = await applyPreset(root, bundle, true);
    assert.ok(plan.consumerChanged.includes('pnpm-workspace.yaml'));
    assert.equal(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'), source);
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
    await applyPreset(root, bundle);
    const updated = await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    assert.equal(scalarSection(updated, 'overrides').entries.custom, 'npm:fork@1.0.0');
    assert.deepEqual(overrideProblems(updated, overrides), []);
    assert.deepEqual((await applyPreset(root, bundle, true)).consumerChanged, []);
  }));

test('malformed controlled YAML stops every consumer and vendor write during planning', () =>
  fixture(async (root) => {
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'overrides:\n  sharp: {version: 1}\n');
    await writeFile(path.join(root, '.gitignore'), 'product-cache\n');
    await mkdir(path.join(root, 'apps'));
    await assert.rejects(applyPreset(root, bundle), /overrides.*line 2/);
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'product-cache\n');
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
  }));

test('a comment hiding an override colon aborts planning without altering any file', () =>
  fixture(async (root) => {
    const source = 'packages:\n  - apps/*\noverrides:\n  sharp # comment: 0.35.4\n';
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), source);
    await writeFile(path.join(root, '.gitignore'), 'product-cache\n');
    await assert.rejects(applyPreset(root, bundle), /overrides, line 4/);
    assert.equal(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'), source);
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'product-cache\n');
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
  }));

test('bare YAML indicators fail before writes while quoted removal overrides remain literal', () =>
  fixture(async (root) => {
    assert.equal(scalarSection("overrides:\n  product: '-'\n", 'overrides').entries.product, '-');
    for (const indicator of ['-', '?', ':', '#comment', '@bad', '`bad', ',', '%bad', 'bad:']) {
      const source = `packages:\n  - apps/*\noverrides:\n  product: ${indicator}\n`;
      await writeFile(path.join(root, 'pnpm-workspace.yaml'), source);
      await writeFile(path.join(root, '.gitignore'), 'product-cache\n');
      await assert.rejects(applyPreset(root, bundle), /overrides, line 4/);
      assert.equal(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'), source);
      assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'product-cache\n');
      await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
    }
    for (const key of ['`bad', '%bad', ',bad']) {
      await writeFile(path.join(root, 'pnpm-workspace.yaml'), `overrides:\n  ${key}: 1.2.3\n`);
      await assert.rejects(applyPreset(root, bundle), /overrides, line 2/);
      await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
    }
  }));

test('contract warns for 0.7, enforces 0.8, and reports exact differing or missing shared pins', () =>
  fixture(async (root) => {
    const { overrides: standard } = JSON.parse(
      await readFile(new URL('../packages/cli/catalog.json', import.meta.url), 'utf8'),
    );
    await writeFile(path.join(root, 'package.json'), '{}');
    const source = 'packages:\n  - apps/*\n' + updateOverrides('', standard);
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), source);
    assert.deepEqual(checkContract({ cwd: root }).lines, []);
    await mkdir(path.join(root, '.lvbt'));
    const changed = source.replace('"sharp": "0.35.5"', '"sharp": "0.35.4"');
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), changed);
    for (const [release, ok, prefix] of [
      ['v0.7.0', true, 'warning'],
      ['v0.8.0', false, 'error'],
    ]) {
      await writeFile(path.join(root, '.lvbt/web-platform.json'), JSON.stringify({ release }));
      const result = checkContract({ cwd: root });
      assert.equal(result.ok, ok);
      assert.deepEqual(result.lines, [
        `${prefix}: pnpm-workspace.yaml overrides "sharp" is "0.35.4"; shared audited policy requires "0.35.5". Run pnpm standards:update (required from v0.8.0).`,
      ]);
    }
    await writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\noverrides:\n  sharp: {version: 1}\n',
    );
    const result = checkContract({ cwd: root });
    assert.equal(result.ok, false);
    assert.match(result.lines[0], /overrides, line 4/);
  }));
