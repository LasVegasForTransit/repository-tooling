import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readCloudflareConfig,
  validateManifest,
} from '../packages/cli/src/lib/platform/manifest.mjs';
import { planPlatform } from '../packages/cli/src/lib/platform/plan.mjs';
import { scriptedIo } from './support/platform.mjs';

test('a primary preview manifest selects only its config, deployed Worker, vars and secrets', async () => {
  const { observePlatform } = await import('../packages/cli/src/lib/platform/observe.mjs');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-primary-preview-'));
  try {
    for (const format of ['cf', 'wrangler']) {
      const manifest = {
        version: 1,
        name: 'preview',
        cloudflare: {
          accountId: 'a'.repeat(32),
          zone: { name: 'example.org', id: 'b'.repeat(32) },
          worker: 'example-preview',
          environment: 'preview',
        },
        secrets: [
          {
            name: 'SIGNING_KEY',
            purpose: 'Preview signing',
            use: 'live',
            url: 'https://dash.cloudflare.com/',
            steps: ['Retrieve the separately approved preview credential.'],
          },
        ],
        vars: [{ name: 'MODE', purpose: 'Preview mode', use: 'live' }],
      };
      assert.deepEqual(validateManifest(manifest), []);
      const file = format === 'cf' ? 'cloudflare.config.ts' : 'wrangler.jsonc';
      if (format === 'cf') {
        manifest.cloudflare.cloudflareConfig = file;
        await writeFile(
          path.join(directory, file),
          "export default ({isPreview})=>({worker:{name:isPreview?'example-preview':'example',env:{MODE:{type:'text',value:isPreview?'preview':'production'}}}});",
        );
      } else {
        manifest.cloudflare.wranglerConfig = file;
        await writeFile(
          path.join(directory, file),
          JSON.stringify({
            name: 'example',
            vars: { MODE: 'production' },
            env: { preview: { name: 'example-preview', vars: { MODE: 'preview' } } },
          }),
        );
      }
      const calls = [];
      const apis = {
        wrangler: {
          get: async (endpoint) => {
            calls.push(endpoint);
            assert.ok(endpoint.includes('/scripts/example-preview/'));
            return endpoint.endsWith('/secrets')
              ? [{ name: 'SIGNING_KEY' }]
              : { bindings: [{ type: 'plain_text', name: 'MODE', text: 'preview' }] };
          },
        },
      };
      const state = await observePlatform({
        manifest,
        directory,
        apis,
        run: () => {
          throw new Error('no commands');
        },
        resolve: async () => [],
      });
      assert.equal(state.config.value.name, 'example-preview');
      assert.equal(state.config.value.vars.MODE, 'preview');
      assert.deepEqual(state.worker.value.secrets, ['SIGNING_KEY']);
      const plan = planPlatform({ manifest, state, configPath: file });
      assert.equal(plan.find((entry) => entry.id === 'config').status, 'ok');
      assert.equal(plan.find((entry) => entry.id === 'var:MODE').status, 'ok');
      assert.equal(plan.find((entry) => entry.id === 'secret:SIGNING_KEY:worker').status, 'ok');
      assert.equal(calls.length, 2);
      apis.wrangler.get = async () => {
        throw new Error('Preview unavailable');
      };
      const unavailable = await observePlatform({
        manifest,
        directory,
        apis,
        run: () => {
          throw new Error('no commands');
        },
        resolve: async () => [],
      });
      assert.equal(
        planPlatform({ manifest, state: unavailable, configPath: file }).find(
          (entry) => entry.id === 'worker',
        ).status,
        'unknown',
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an explicit production mode is never evaluated as preview', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-primary-production-'));
  try {
    const file = path.join(directory, 'cloudflare.config.mjs');
    await writeFile(
      file,
      "export default ({isPreview})=>({worker:{name:isPreview?'preview':'production',env:{}}});",
    );
    assert.equal((await readCloudflareConfig(file, { mode: 'production' })).name, 'production');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('primary preview secret writes preserve explicit Worker and environment without production calls', async () => {
  const { storeSecret, cf } = await import('../packages/cli/src/lib/platform/apply-steps.mjs');
  const calls = [];
  const context = {
    manifest: {
      cloudflare: { accountId: 'a'.repeat(32), worker: 'example-preview', environment: 'preview' },
      secrets: [],
    },
    directory: '/repo',
    handled: new Set(),
    io: scriptedIo(),
    run: (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    },
  };
  await storeSecret(context, 'SIGNING_KEY', 'worker', 'preview-value');
  assert.deepEqual(calls[0], [
    'pnpm',
    'exec',
    'wrangler',
    'secret',
    'put',
    'SIGNING_KEY',
    '--name',
    'example-preview',
    '--env',
    'preview',
  ]);
  context.manifest.cloudflare.cloudflareConfig = 'cloudflare.config.ts';
  cf(context, ['d1', 'create', '--name', 'preview-db']);
  assert.deepEqual(calls[1], [
    'pnpm',
    'exec',
    'cf',
    'd1',
    'create',
    '--name',
    'preview-db',
    '--mode',
    'preview',
  ]);
});
