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

function scopedR2() {
  const context = scoped();
  context.manifest.r2.push({
    binding: 'PHOTOS',
    name: 'example-photos-preview',
    environment: 'preview',
  });
  context.state.config.value.environments.preview.value.r2 = [
    { binding: 'PHOTOS', name: 'example-photos-preview' },
  ];
  context.state.r2.value.push('example-photos-preview');
  return context;
}

test('R2 readiness uses the explicitly declared deployment environment', () => {
  const context = scopedR2();
  assert.deepEqual(validateManifest(context.manifest), []);
  const plan = planPlatform(context);
  assert.equal(plan.find((entry) => entry.id === 'r2:example-photos').status, 'ok');
  assert.equal(plan.find((entry) => entry.id === 'r2:example-photos-preview').status, 'ok');
  context.manifest.r2[0].environment = 'production';
  context.state.config.value.environments.production = known({ r2: context.state.config.value.r2 });
  assert.deepEqual(validateManifest(context.manifest), []);
  assert.equal(
    planPlatform(context).find((entry) => entry.id === 'r2:example-photos').status,
    'ok',
  );
  context.manifest.r2[1].environment = '../preview';
  assert.ok(validateManifest(context.manifest).length);
});

test('R2 preview config never borrows a ready production binding', () => {
  const context = scopedR2();
  context.state.config.value.environments.preview.value.r2[0].name = 'example-photos';
  const mismatch = planPlatform(context).find((entry) => entry.id === 'r2:example-photos-preview');
  assert.equal(mismatch.status, 'mismatch');
  assert.match(mismatch.next, /preview/);
  delete context.state.config.value.environments.preview;
  const missingConfig = planPlatform(context).find(
    (entry) => entry.id === 'r2:example-photos-preview',
  );
  assert.equal(missingConfig.status, 'unknown');
  assert.equal(missingConfig.action, undefined);
  context.state.r2.value.pop();
  const missingBucket = planPlatform(context).find(
    (entry) => entry.id === 'r2:example-photos-preview',
  );
  assert.equal(missingBucket.status, 'missing');
  assert.deepEqual(missingBucket.action, { type: 'r2.create', name: 'example-photos-preview' });
});

test('R2-only inventories read preview config in both cf and Wrangler modes with no provider writes', async () => {
  const { observePlatform } = await import('../packages/cli/src/lib/platform/observe.mjs');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-preview-r2-'));
  try {
    for (const format of ['cf', 'wrangler']) {
      const context = scopedR2();
      context.manifest.r2[0].environment = 'production';
      context.manifest.d1 = [];
      context.manifest.github = undefined;
      context.manifest.secrets = [];
      context.manifest.turnstile = [];
      context.manifest.access = [];
      context.manifest.email = [];
      let file;
      if (format === 'cf') {
        file = 'cloudflare.config.mjs';
        context.manifest.cloudflare.cloudflareConfig = file;
        await writeFile(
          path.join(directory, file),
          "export default ({mode})=>({worker:{name:mode==='preview'?'example-preview':'example',env:{PHOTOS:{type:'r2',name:mode==='preview'?'example-photos-preview':'example-photos'}}}});",
        );
      } else {
        file = 'wrangler.jsonc';
        context.manifest.cloudflare.wranglerConfig = file;
        await writeFile(
          path.join(directory, file),
          JSON.stringify({
            name: 'example',
            r2_buckets: [{ binding: 'PHOTOS', bucket_name: 'example-photos' }],
            env: {
              production: {
                name: 'example',
                r2_buckets: [{ binding: 'PHOTOS', bucket_name: 'example-photos' }],
              },
              preview: {
                name: 'example-preview',
                r2_buckets: [{ binding: 'PHOTOS', bucket_name: 'example-photos-preview' }],
              },
            },
          }),
        );
      }
      const calls = [];
      const state = await observePlatform({
        manifest: context.manifest,
        directory,
        apis: {
          wrangler: {
            get: async (endpoint) => {
              calls.push(endpoint);
              return [];
            },
          },
        },
        run: () => {
          throw new Error('no command or provider mutations');
        },
        resolve: async () => [],
      });
      assert.equal(state.config.value.environments.production.value.r2[0].name, 'example-photos');
      assert.equal(
        state.config.value.environments.preview.value.r2[0].name,
        'example-photos-preview',
      );
      assert.equal(
        planPlatform({ ...context, state, configPath: file }).find(
          (entry) => entry.id === 'r2:example-photos-preview',
        ).status,
        'ok',
      );
      assert.deepEqual(
        calls.filter((endpoint) => endpoint.includes('/r2/')),
        [
          `accounts/${context.manifest.cloudflare.accountId}/r2/buckets/example-photos`,
          `accounts/${context.manifest.cloudflare.accountId}/r2/buckets/example-photos-preview`,
        ],
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
