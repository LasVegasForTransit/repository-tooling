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
import { applyPlan } from '../packages/cli/src/lib/platform/apply.mjs';
import { namedInConfig } from '../packages/cli/src/lib/platform/apply-resources.mjs';
import { known } from '../packages/cli/src/lib/platform/observe.mjs';
import { sampleManifest, readyState, scriptedIo } from './support/platform.mjs';

function scoped() {
  const manifest = sampleManifest();
  manifest.d1.push({
    binding: 'DB',
    name: 'example-preview',
    migrations: 'migrations',
    environment: 'preview',
  });
  const state = readyState();
  state.config.value.environments = {
    preview: known({
      name: 'example-preview',
      d1: [{ binding: 'DB', name: 'example-preview', id: 'preview-db' }],
    }),
  };
  state.d1.value['example-preview'] = { id: 'preview-db', applied: known([]) };
  state.migrations['example-preview'] = known(['0001_first.sql']);
  return { manifest, state, configPath: 'apps/site/cloudflare.config.ts' };
}

test('a declared preview D1 database reads the preview binding instead of production DB', () => {
  const context = scoped();
  assert.deepEqual(validateManifest(context.manifest), []);
  const plan = planPlatform(context);
  assert.equal(plan.find((entry) => entry.id === 'd1:example-preview').status, 'ok');
  assert.equal(
    plan.find((entry) => entry.id === 'd1:example-preview:migrations').action.environment,
    'preview',
  );
});

test('preview migrations wait for the matching preview ID even while production is ready', async () => {
  const context = scoped();
  context.state.config.value.environments.preview.value.d1[0].id = 'wrong-id';
  assert.equal(
    planPlatform(context).find((entry) => entry.id === 'd1:example-preview:migrations').action,
    undefined,
  );
  assert.equal(
    await namedInConfig(
      { ...context, io: scriptedIo() },
      { name: 'example-preview', binding: 'DB', environment: 'preview' },
    ),
    false,
  );
  context.state.config.value.environments.preview.value.d1[0].id = 'preview-db';
  assert.equal(
    await namedInConfig(
      { ...context, io: scriptedIo() },
      { name: 'example-preview', binding: 'DB', environment: 'preview' },
    ),
    true,
  );
});

test('an unreadable preview config cannot borrow the production config', () => {
  const context = scoped();
  delete context.state.config.value.environments.preview;
  assert.equal(
    planPlatform(context).find((entry) => entry.id === 'd1:example-preview').status,
    'unknown',
  );
  assert.equal(
    planPlatform(context).find((entry) => entry.id === 'd1:example-preview:migrations').action,
    undefined,
  );
});

test('cf config readers evaluate a named deployment mode independently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-mode-'));
  try {
    const file = path.join(directory, 'cloudflare.config.mjs');
    await writeFile(
      file,
      "export default ({mode})=>({worker:{name:mode==='preview'?'example-preview':'example',env:{DB:{type:'d1',name:mode==='preview'?'example-preview':'example',id:mode==='preview'?'preview-db':'db-1'}}}});",
    );
    assert.equal((await readCloudflareConfig(file, { mode: 'preview' })).d1[0].id, 'preview-db');
    assert.equal((await readCloudflareConfig(file)).d1[0].id, 'db-1');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Wrangler migrations for a named environment receive an explicit environment flag', async () => {
  const context = scoped();
  const calls = [];
  Object.assign(context, {
    directory: '/repo/apps/site',
    io: scriptedIo(),
    run: (command, args) => {
      calls.push([command, ...args]);
      return { status: 0, stdout: '', stderr: '' };
    },
  });
  const entry = planPlatform(context).find((item) => item.id === 'd1:example-preview:migrations');
  await applyPlan(context, [entry]);
  assert.deepEqual(calls, [
    [
      'pnpm',
      'exec',
      'wrangler',
      'd1',
      'migrations',
      'apply',
      'example-preview',
      '--remote',
      '--env',
      'preview',
    ],
  ]);
});

test('inventory evaluates preview config separately and migrates the preview database by observed ID', async () => {
  const { observePlatform } = await import('../packages/cli/src/lib/platform/observe.mjs');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-preview-inventory-'));
  try {
    const context = scoped();
    context.manifest.cloudflare.cloudflareConfig = 'cloudflare.config.mjs';
    context.manifest.d1.forEach((database) => delete database.migrations);
    context.manifest.github = undefined;
    context.manifest.secrets = [];
    context.manifest.r2 = [];
    context.manifest.turnstile = [];
    context.manifest.access = [];
    context.manifest.email = [];
    await writeFile(
      path.join(directory, 'cloudflare.config.mjs'),
      "export default ({mode})=>({worker:{name:mode==='preview'?'example-preview':'example',env:{DB:{type:'d1',name:mode==='preview'?'example-preview':'example',id:mode==='preview'?'preview-db':'db-1'}}}});",
    );
    const state = await observePlatform({
      manifest: context.manifest,
      directory,
      apis: {
        wrangler: {
          get: async () => [],
          list: async () => [
            { name: 'example', uuid: 'db-1' },
            { name: 'example-preview', uuid: 'preview-db' },
          ],
        },
      },
      run: () => {
        throw new Error('no GitHub access needed');
      },
      resolve: async () => [],
    });
    assert.equal(state.config.value.environments.preview.value.d1[0].id, 'preview-db');
    assert.equal(
      planPlatform({ ...context, state }).find((entry) => entry.id === 'd1:example-preview').status,
      'ok',
    );
    context.manifest.d1[1].migrations = 'migrations';
    const calls = [];
    await applyPlan(
      {
        ...context,
        directory,
        io: scriptedIo(),
        run: (command, args) => {
          calls.push(args);
          return { status: 0, stdout: '', stderr: '' };
        },
      },
      [
        {
          status: 'missing',
          label: 'preview migrations',
          action: { type: 'd1.migrate', name: 'example-preview', environment: 'preview' },
        },
      ],
    );
    assert.equal(calls[0][5], 'preview-db');
    assert.notEqual(calls[0][5], context.state.d1.value.example.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
