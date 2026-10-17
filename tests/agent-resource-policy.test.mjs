import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncResourcePolicy, resourcePolicyProblems } from '../standards/agent-resource-policy.ts';

const source = 'standards/agent-resource-policy.md';
const target = '.lvbt/agent-resource-policy.md';
const policy = await readFile(new URL(`../${source}`, import.meta.url), 'utf8').catch(
  () => 'policy v1\n',
);
const bundle = { files: { [source]: policy } };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-resource-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('policy migration previews, preserves project instructions, repairs drift and is idempotent', async (t) => {
  const root = await fixture(t);
  const original = '# Project rules\n\nKeep project-specific checks.\n';
  await writeFile(path.join(root, 'AGENTS.md'), original);
  await writeFile(path.join(root, 'CLAUDE.md'), original);
  const preview = await syncResourcePolicy(root, bundle, true);
  assert.deepEqual(preview.sort(), [target, 'AGENTS.md', 'CLAUDE.md'].sort());
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), original);
  await assert.rejects(readFile(path.join(root, target)));
  await syncResourcePolicy(root, bundle, false);
  assert.equal(await readFile(path.join(root, target), 'utf8'), policy);
  assert.match(
    await readFile(path.join(root, 'AGENTS.md'), 'utf8'),
    /Keep project-specific checks/,
  );
  assert.deepEqual(await syncResourcePolicy(root, bundle, true), []);
  await writeFile(path.join(root, target), 'divergent policy');
  assert.match((await resourcePolicyProblems(root, policy)).join('\n'), /differs/);
  await syncResourcePolicy(root, bundle, false);
  assert.deepEqual(await resourcePolicyProblems(root, policy), []);
});

test('missing or divergent references are detected and repaired without erasing adjacent sections', async (t) => {
  const root = await fixture(t);
  assert.match((await resourcePolicyProblems(root, policy)).join('\n'), /AGENTS.md/);
  await writeFile(
    path.join(root, 'AGENTS.md'),
    '# Project\n\n## Shared resource policy\n\nOld text.\n\n## Product rules\n\nPreserve this.\n',
  );
  await syncResourcePolicy(root, bundle, false);
  assert.match(
    await readFile(path.join(root, 'AGENTS.md'), 'utf8'),
    /## Product rules\n\nPreserve this/,
  );
  await assert.rejects(readFile(path.join(root, 'CLAUDE.md')));
  await writeFile(path.join(root, 'AGENTS.md'), '# Project\n');
  assert.match((await resourcePolicyProblems(root, policy)).join('\n'), /reference/);
});

test('policy migration rejects symlinks before writing and skips bundles predating the policy', async (t) => {
  const root = await fixture(t);
  const outside = await fixture(t);
  await writeFile(path.join(outside, 'AGENTS.md'), 'unrelated');
  await symlink(path.join(outside, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  await assert.rejects(syncResourcePolicy(root, bundle, true), /symlink/);
  assert.equal(await readFile(path.join(outside, 'AGENTS.md'), 'utf8'), 'unrelated');
  assert.deepEqual(await syncResourcePolicy(root, { files: {} }, false), []);
  const other = await fixture(t);
  await mkdir(path.join(other, '.lvbt'));
  await symlink(outside, path.join(other, '.lvbt/agent-resource-policy.md'));
  await assert.rejects(syncResourcePolicy(other, bundle, true), /symlink/);
});

test('source and all example projects consume exactly the canonical policy text', async () => {
  const { resourcePolicyDrift } = await import('../standards/agent-resource-policy.ts');
  const { processFindings, inventoryPaths } = await import('../standards/process-contract.ts');
  const root = path.resolve(import.meta.dirname, '..');
  const canonical = await readFile(path.join(root, source), 'utf8');
  assert.match(canonical, /Policy version: 1\./);
  assert.ok(inventoryPaths([]).includes(target));
  assert.ok(inventoryPaths([]).includes(`.lvbt/web-platform/${source}`));
  for (const name of ['basic', 'with-astro', 'with-vite-react']) {
    const files = {};
    for (const file of [target, 'AGENTS.md'])
      files[file] = await readFile(path.join(root, 'examples', name, file), 'utf8');
    assert.deepEqual(resourcePolicyDrift(files, canonical), [], name);
    assert.equal(files[target], canonical, name);
  }
  const sourceFiles = {
    [source]: canonical,
    'AGENTS.md': await readFile(path.join(root, 'AGENTS.md'), 'utf8'),
  };
  assert.deepEqual(
    processFindings({
      name: 'repository-tooling',
      kind: 'source',
      files: sourceFiles,
      paths: Object.keys(sourceFiles),
    }),
    [],
  );
  const missing = processFindings({
    name: 'consumer',
    kind: 'consumer',
    files: { 'package.json': '{}' },
    paths: [],
  });
  assert.ok(
    missing.some(
      ({ rule, severity }) => rule === 'agent-resource-policy' && severity === 'warning',
    ),
  );
});

test('a newer CLI warns rather than fails when the adopted bundle predates the policy', async (t) => {
  const { checkStandard } = await import('../packages/cli/src/lib/check/standard.mjs');
  const root = await fixture(t);
  await mkdir(path.join(root, '.lvbt/web-platform/standards'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, '.lvbt/web-platform.json'), '{}');
  await writeFile(
    path.join(root, '.lvbt/web-platform/standards/web-platform.ts'),
    'export async function verifyPreset() { return { release: "v0.7.8" }; }',
  );
  await writeFile(
    path.join(root, '.lvbt/web-platform/standards/owned-files.ts'),
    'export async function ownedFileDrift() { return []; }',
  );
  const result = await checkStandard({ cwd: root });
  assert.equal(result.ok, true);
  assert.match(result.lines.join('\n'), /warning: adopt.*agent resource policy/);
});

test('the canonical preset updater installs the policy with verified provenance', async (t) => {
  const { applyPreset, verifyPreset } = await import('../standards/web-platform.ts');
  const root = await fixture(t);
  await applyPreset(root, {
    ...bundle,
    formatVersion: 1,
    preset: 'lvbt-web',
    release: null,
    commit: 'a'.repeat(40),
  });
  assert.equal((await verifyPreset(root)).commit, 'a'.repeat(40));
  assert.deepEqual(await resourcePolicyProblems(root), []);
  await writeFile(path.join(root, target), 'changed');
  assert.match((await resourcePolicyProblems(root)).join('\n'), /differs/);
});

test('every registered consumer receives the same policy release and bytes', async (t) => {
  const { applyPreset, verifyPreset } = await import('../standards/web-platform.ts');
  const registry = JSON.parse(
    await readFile(new URL('../standards/repositories.json', import.meta.url), 'utf8'),
  );
  const incoming = {
    ...bundle,
    formatVersion: 1,
    preset: 'lvbt-web',
    release: 'v0.7.9',
    commit: 'b'.repeat(40),
  };
  for (const entry of registry.repositories.filter(({ kind }) => kind !== 'source')) {
    const root = await fixture(t);
    await writeFile(
      path.join(root, 'AGENTS.md'),
      `# ${entry.name}\n\nKeep ${entry.name} checks.\n`,
    );
    await applyPreset(root, incoming);
    const metadata = await verifyPreset(root);
    assert.equal(metadata.release, incoming.release, entry.name);
    assert.equal(metadata.commit, incoming.commit, entry.name);
    assert.equal(await readFile(path.join(root, target), 'utf8'), policy, entry.name);
    assert.deepEqual(await resourcePolicyProblems(root), [], entry.name);
    assert.match(
      await readFile(path.join(root, 'AGENTS.md'), 'utf8'),
      new RegExp(`Keep ${entry.name} checks`),
    );
  }
});
