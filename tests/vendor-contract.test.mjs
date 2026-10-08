import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkContract } from '../packages/cli/src/lib/check/contract.mjs';
import { updateOverrides } from '../packages/cli/src/lib/check/workspace-policy.mjs';

const { overrides } = JSON.parse(
  await readFile(new URL('../packages/cli/catalog.json', import.meta.url), 'utf8'),
);

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-vendor-contract-'));
  try {
    await writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      updateOverrides('packages:\n  - apps/*\n', overrides),
    );
    await mkdir(path.join(root, 'apps/app'), { recursive: true });
    await mkdir(path.join(root, '.lvbt/web-platform/packages/cli'), { recursive: true });
    await writeFile(
      path.join(root, '.lvbt/web-platform/packages/cli/package.json'),
      JSON.stringify({ name: '@lasvegasfortransit/cli' }),
    );
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        dependencies: { '@lasvegasfortransit/cli': 'file:.lvbt/web-platform/packages/cli' },
      }),
    );
    await writeFile(
      path.join(root, 'apps/app/package.json'),
      JSON.stringify({
        dependencies: { '@lasvegasfortransit/cli': 'file:../../.lvbt/web-platform/packages/cli' },
      }),
    );
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('accepts the canonical vendored package from root and nested importers', () =>
  fixture(async (root) => {
    assert.deepEqual(checkContract({ cwd: root }).lines, []);
  }));

test('rejects arbitrary file dependencies and mismatched vendor package names', () =>
  fixture(async (root) => {
    await writeFile(
      path.join(root, 'apps/app/package.json'),
      JSON.stringify({ dependencies: { '@lasvegasfortransit/cli': 'file:../../somewhere/cli' } }),
    );
    assert.equal(checkContract({ cwd: root }).ok, false);
    await writeFile(
      path.join(root, '.lvbt/web-platform/packages/cli/package.json'),
      JSON.stringify({ name: '@other/cli' }),
    );
    assert.equal(checkContract({ cwd: root }).lines.length, 2);
  }));

test('a repository may add catalog entries and is warned when it re-pins a shared one', () =>
  fixture(async (root) => {
    const standard = JSON.parse(
      await readFile(new URL('../packages/cli/catalog.json', import.meta.url), 'utf8'),
    ).catalog;
    const workspace = (eslint) =>
      updateOverrides(
        `packages:\n  - apps/*\ncatalog:\n  eslint: ${eslint}\n  left-pad: 1.3.0\n`,
        overrides,
      );
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), workspace(standard.eslint));
    assert.deepEqual(checkContract({ cwd: root }).lines, []);
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), workspace('^9.0.0'));
    const result = checkContract({ cwd: root });
    assert.equal(result.ok, true, 'a re-pinned shared entry only warns until v0.6.0');
    assert.deepEqual(result.lines, [
      `warning: pnpm-workspace.yaml pins "eslint" to "^9.0.0"; the standard's catalog has "${standard.eslint}" (from v0.6.0 this fails)`,
    ]);
  }));
