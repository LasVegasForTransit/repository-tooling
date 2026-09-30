import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cfDeployArguments,
  deployables,
  wranglerDeployArguments,
} from '../packages/cli/src/lib/operate.mjs';

const commit = 'a'.repeat(40);

test('deploy records exact commit provenance and refuses conflicting remote changes', () => {
  assert.deepEqual(wranglerDeployArguments(commit, false), [
    'exec',
    'wrangler',
    'deploy',
    '--strict',
    '--message',
    `Commit ${commit}`,
  ]);
});

test('dry-run keeps provenance and adds the Wrangler dry-run flag', () => {
  assert.deepEqual(wranglerDeployArguments(commit, true), [
    'exec',
    'wrangler',
    'deploy',
    '--strict',
    '--message',
    `Commit ${commit}`,
    '--dry-run',
  ]);
});

test('deploy provenance requires a full Git commit', () => {
  assert.throws(() => wranglerDeployArguments('main', false), /full Git commit/);
  assert.throws(() => cfDeployArguments('main', false), /full Git commit/);
});

test('cf deploy records exact commit provenance without Wrangler-only flags', () => {
  assert.deepEqual(cfDeployArguments(commit, false), [
    'exec',
    'cf',
    'deploy',
    '--message',
    `Commit ${commit}`,
  ]);
  assert.deepEqual(cfDeployArguments(commit, true), [
    'exec',
    'cf',
    'deploy',
    '--message',
    `Commit ${commit}`,
    '--dry-run',
  ]);
});

test('a cf config takes precedence over a retained Wrangler config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-deploy-'));
  try {
    await mkdir(path.join(root, 'apps', 'site'), { recursive: true });
    await writeFile(path.join(root, 'apps', 'site', 'wrangler.jsonc'), '{}');
    await writeFile(path.join(root, 'apps', 'site', 'cloudflare.config.ts'), 'export default {};');
    assert.deepEqual(await deployables(root), [{ directory: 'apps/site', tool: 'cf' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a manifest pointing at a sibling cf project suppresses its Wrangler mirror', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-deploy-'));
  try {
    await mkdir(path.join(root, 'apps', 'site'), { recursive: true });
    await mkdir(path.join(root, 'apps', 'deploy'), { recursive: true });
    await writeFile(path.join(root, 'apps', 'site', 'wrangler.jsonc'), '{}');
    await writeFile(
      path.join(root, 'apps', 'deploy', 'cloudflare.config.ts'),
      'export default {};',
    );
    await writeFile(
      path.join(root, 'apps', 'site', 'platform.json'),
      JSON.stringify({ cloudflare: { cloudflareConfig: '../deploy/cloudflare.config.ts' } }),
    );
    assert.deepEqual(await deployables(root), [
      { directory: 'apps/deploy', tool: 'cf', source: 'apps/site' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing canonical cf config never falls back to a Wrangler mirror', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-deploy-'));
  try {
    await mkdir(path.join(root, 'apps', 'site'), { recursive: true });
    await writeFile(path.join(root, 'apps', 'site', 'wrangler.jsonc'), '{}');
    await writeFile(
      path.join(root, 'apps', 'site', 'platform.json'),
      JSON.stringify({ cloudflare: { cloudflareConfig: '../deploy/cloudflare.config.ts' } }),
    );
    await assert.rejects(deployables(root), /canonical cf config.*missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deploy rejects a cf config filename that cf would not discover', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-deploy-'));
  try {
    const site = path.join(root, 'apps', 'site');
    await mkdir(site, { recursive: true });
    await writeFile(path.join(site, 'production.config.ts'), 'export default {};');
    await writeFile(
      path.join(site, 'platform.json'),
      JSON.stringify({ cloudflare: { cloudflareConfig: 'production.config.ts' } }),
    );
    await assert.rejects(deployables(root), /cloudflare\.config\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
