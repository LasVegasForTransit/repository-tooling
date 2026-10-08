import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkStandard } from '../packages/cli/src/lib/check/standard.mjs';
import { processFindings, inventoryPaths } from '../standards/process-contract.ts';
import { applyPreset, verifyPreset } from '../standards/web-platform.ts';

const source = new URL('..', import.meta.url).pathname;
const dependencies = ['.lvbt/web-platform.json', '.lvbt/tooling.json', '.github/workflows/**'];
const bundle = {
  formatVersion: 1,
  preset: 'lvbt-web',
  release: 'v0.7.0',
  commit: 'a'.repeat(40),
  files: { 'catalog.json': '{}' },
};
const json = (root, file, value) => writeFile(path.join(root, file), `${JSON.stringify(value)}\n`);
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-turbo-cache-'));
  try {
    await json(root, 'package.json', { name: 'cache-fixture', private: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('canonical update adds cache inputs without replacing product globals or task policies', () =>
  fixture(async (root) => {
    const original = {
      globalDependencies: ['product.json', dependencies[1]],
      globalEnv: ['PUBLIC_PRODUCT'],
      tasks: { validate: { cache: false, dependsOn: ['product'], inputs: ['own/**'] } },
    };
    await json(root, 'turbo.json', original);
    const before = await readFile(path.join(root, 'turbo.json'), 'utf8');
    const preview = await applyPreset(root, bundle, true);
    assert.deepEqual(preview.consumerChanged, ['turbo.json']);
    assert.equal(await readFile(path.join(root, 'turbo.json'), 'utf8'), before);
    await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
    await applyPreset(root, bundle);
    const updated = JSON.parse(await readFile(path.join(root, 'turbo.json'), 'utf8'));
    assert.deepEqual(updated.globalDependencies, [
      ...original.globalDependencies,
      dependencies[0],
      dependencies[2],
    ]);
    assert.deepEqual(updated.tasks, original.tasks);
    assert.deepEqual(updated.globalEnv, original.globalEnv);
    assert.deepEqual((await applyPreset(root, bundle, true)).consumerChanged, []);
  }));

test('malformed Turbo configuration aborts canonical migration before other consumer or vendor writes', () =>
  fixture(async (root) => {
    for (const invalid of [
      '{',
      'null',
      '{"globalDependencies":"wrong"}',
      '{"globalDependencies":[1]}',
    ]) {
      await writeFile(path.join(root, 'turbo.json'), invalid);
      await writeFile(path.join(root, '.gitignore'), 'product-cache\n');
      await assert.rejects(
        applyPreset(root, bundle),
        /turbo\.json.*(?:JSON|object|globalDependencies)/,
      );
      assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'product-cache\n');
      await assert.rejects(readFile(path.join(root, '.lvbt/web-platform.json')));
    }
  }));

test('local and inventoried cache diagnostics warn in 0.7 and enforce the adopted 0.8 release', () =>
  fixture(async (root) => {
    await json(root, 'turbo.json', { globalDependencies: [dependencies[0]], tasks: {} });
    for (const release of [null, 'v0.7.0', 'v0.8.0', 'v1.0.0']) {
      await applyPreset(root, {
        ...bundle,
        release,
        files: {
          'standards/web-platform.ts':
            'import {readFile} from "node:fs/promises"; import path from "node:path"; export async function verifyPreset(root) { return JSON.parse(await readFile(path.join(root,".lvbt/web-platform.json"),"utf8")); }',
          'standards/owned-files.ts': 'export async function ownedFileDrift() {return [];}',
        },
      });
      // Simulate app-owned configuration drifting after the updater installed its declaration.
      await json(root, 'turbo.json', { globalDependencies: [dependencies[0]], tasks: {} });
      const result = await checkStandard({ cwd: root });
      const enforced = release === 'v0.8.0' || release === 'v1.0.0';
      assert.equal(result.ok, !enforced);
      assert.match(
        result.lines.join('\n'),
        /turbo\.json.*\.lvbt\/tooling\.json.*\.github\/workflows/,
      );
      const metadata = await readFile(path.join(root, '.lvbt/web-platform.json'), 'utf8');
      const findings = processFindings({
        name: 'fixture',
        kind: 'consumer',
        paths: [],
        files: {
          'package.json': '{}',
          'turbo.json': await readFile(path.join(root, 'turbo.json'), 'utf8'),
          '.lvbt/web-platform.json': metadata,
        },
      }).filter(({ rule }) => rule === 'turbo-cache');
      assert.equal(findings.length, 1);
      assert.equal(findings[0].severity, enforced ? 'error' : 'warning');
    }
    assert.ok(inventoryPaths([]).includes('turbo.json'));
  }));

test('every shipped workspace template declares shared Turbo cache inputs', async () => {
  for (const example of ['basic', 'with-astro', 'with-vite-react']) {
    const config = JSON.parse(
      await readFile(path.join(source, 'examples', example, 'turbo.json'), 'utf8'),
    );
    assert.ok(
      dependencies.every((file) => config.globalDependencies?.includes(file)),
      example,
    );
  }
});

test('actual Turbo task hashes invalidate for standard metadata, tooling, and workflow changes', () =>
  fixture(async (root) => {
    await json(root, 'package.json', {
      name: 'cache-fixture',
      private: true,
      packageManager: 'pnpm@11.25.0',
    });
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    await writeFile(
      path.join(root, 'pnpm-lock.yaml'),
      'lockfileVersion: 9.0\nimporters:\n  .: {}\n  apps/site: {}\n',
    );
    await mkdir(path.join(root, 'apps/site'), { recursive: true });
    await json(root, 'apps/site/package.json', {
      name: 'site',
      scripts: { validate: 'node -e "0"' },
    });
    await json(root, 'turbo.json', { tasks: { validate: {} } });
    await mkdir(path.join(root, '.github/workflows'), { recursive: true });
    await writeFile(path.join(root, '.github/workflows/check.yml'), 'name: Check\n');
    await applyPreset(root, bundle);
    await json(root, '.lvbt/tooling.json', { version: 1 });
    const hash = async () => {
      const result = await promisify(execFile)(
        path.join(source, 'node_modules/.bin/turbo'),
        ['run', 'validate', '--dry=json'],
        {
          cwd: root,
          env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      const task = JSON.parse(result.stdout).tasks.find(({ taskId }) => taskId === 'site#validate');
      assert.ok(task?.hash);
      return task.hash;
    };
    let previous = await hash();
    await writeFile(path.join(root, 'unrelated.txt'), 'control\n');
    assert.equal(await hash(), previous, 'unrelated root file is not an application cache input');
    const originalMetadata = await verifyPreset(root);
    await applyPreset(root, {
      ...bundle,
      commit: 'b'.repeat(40),
      files: { 'catalog.json': '{"updated":true}' },
    });
    assert.notEqual((await verifyPreset(root)).contentHash, originalMetadata.contentHash);
    const updatedStandard = await hash();
    assert.notEqual(
      updatedStandard,
      previous,
      'verified shared snapshot metadata invalidates existing task hashes',
    );
    previous = updatedStandard;
    for (const [file, content] of [
      ['.lvbt/tooling.json', JSON.stringify({ version: 1, local: { command: ['changed'] } })],
      ['.github/workflows/check.yml', 'name: Changed gate\n'],
    ]) {
      await writeFile(path.join(root, file), content);
      const current = await hash();
      assert.notEqual(
        current,
        previous,
        `${file} must invalidate existing application task hashes`,
      );
      previous = current;
    }
  }));
