import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkContract } from '../packages/cli/src/lib/check/contract.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-vendor-contract-'));
  try {
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    await mkdir(path.join(root, 'apps/app'), { recursive: true });
    await mkdir(path.join(root, '.lvbt/web-platform/packages/cli'), { recursive: true });
    await writeFile(
      path.join(root, '.lvbt/web-platform/packages/cli/package.json'),
      JSON.stringify({ name: '@lvbt/cli' }),
    );
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { '@lvbt/cli': 'file:.lvbt/web-platform/packages/cli' } }),
    );
    await writeFile(
      path.join(root, 'apps/app/package.json'),
      JSON.stringify({
        dependencies: { '@lvbt/cli': 'file:../../.lvbt/web-platform/packages/cli' },
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
      JSON.stringify({ dependencies: { '@lvbt/cli': 'file:../../somewhere/cli' } }),
    );
    assert.equal(checkContract({ cwd: root }).ok, false);
    await writeFile(
      path.join(root, '.lvbt/web-platform/packages/cli/package.json'),
      JSON.stringify({ name: '@other/cli' }),
    );
    assert.equal(checkContract({ cwd: root }).lines.length, 2);
  }));
