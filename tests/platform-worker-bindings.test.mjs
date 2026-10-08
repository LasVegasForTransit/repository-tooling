import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveManifestAccount } from '../packages/cli/src/lib/platform/index.mjs';
import * as manifests from '../packages/cli/src/lib/platform/manifest.mjs';
import { known, unknown, observePlatform } from '../packages/cli/src/lib/platform/observe.mjs';
import { planPlatform, readiness } from '../packages/cli/src/lib/platform/plan.mjs';
import { readyState, sampleManifest } from './support/platform.mjs';

const analyticsEngine = [{ binding: 'EVENTS', name: 'lvbt_events' }];
const rateLimits = [
  { binding: 'EVENT_LIMITER', namespace: '1001', simple: { limit: 30, period: 60 } },
];
function requirements() {
  const manifest = {
    ...sampleManifest(),
    analyticsEngine: structuredClone(analyticsEngine),
    rateLimits: structuredClone(rateLimits),
  };
  const state = readyState();
  state.config.value.analyticsEngine = structuredClone(analyticsEngine);
  state.config.value.rateLimits = structuredClone(rateLimits);
  state.worker.value.analyticsEngine = structuredClone(analyticsEngine);
  state.worker.value.rateLimits = structuredClone(rateLimits);
  return { manifest, state };
}
function items(context) {
  return planPlatform({ ...context, configPath: 'cloudflare.config.ts' });
}

test('Worker resource declarations validate and reject contradictory or duplicate binding identities', () => {
  const { manifest } = requirements();
  delete manifest.cloudflare.zone.id;
  manifest.cloudflare.zone.idEnv = 'CLOUDFLARE_ZONE_ID';
  assert.deepEqual(manifests.validateManifest(manifest), []);
  for (const change of [
    (value) => {
      value.cloudflare.zone.id = 'b'.repeat(32);
    },
    (value) => {
      delete value.cloudflare.zone.idEnv;
    },
    (value) => {
      value.rateLimits[0].namespace = '0';
    },
    (value) => {
      value.rateLimits[0].simple.period = 7;
    },
    (value) => {
      value.analyticsEngine.push({ binding: 'EVENTS', name: 'other_events' });
    },
    (value) => {
      value.rateLimits[0].binding = 'EVENTS';
    },
  ]) {
    const invalid = structuredClone(manifest);
    change(invalid);
    assert.ok(manifests.validateManifest(invalid).length > 0);
  }
});

test('zone selectors use only the declared environment value and never mutate the manifest', () => {
  const { manifest } = requirements();
  delete manifest.cloudflare.zone.id;
  manifest.cloudflare.zone.idEnv = 'APP_ZONE_ID';
  const resolved = manifests.resolveManifestZone(manifest, {
    APP_ZONE_ID: 'c'.repeat(32),
    CLOUDFLARE_ZONE_ID: 'd'.repeat(32),
  });
  assert.equal(resolved.cloudflare.zone.id, 'c'.repeat(32));
  assert.equal(manifest.cloudflare.zone.id, undefined);
  for (const env of [{}, { CLOUDFLARE_ZONE_ID: 'd'.repeat(32) }, { APP_ZONE_ID: 'bad' }])
    assert.throws(() => manifests.resolveManifestZone(manifest, env), /APP_ZONE_ID.*32/);
});

test('cf and retained Wrangler configs preserve dataset and rate-limiter declarations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-worker-bindings-'));
  try {
    const cf = path.join(directory, 'cloudflare.config.ts');
    await writeFile(
      cf,
      `export default {worker:{name:'example',env:{EVENTS:{type:'analytics-engine-dataset',name:'lvbt_events'},EVENT_LIMITER:{type:'rate-limit',namespace:'1001',simple:{limit:30,period:60}},PRIVATE:{type:'secret'}}}};`,
    );
    const config = await manifests.readCloudflareConfig(cf);
    assert.deepEqual(config.analyticsEngine, analyticsEngine);
    assert.deepEqual(config.rateLimits, rateLimits);
    assert.equal(JSON.stringify(config).includes('PRIVATE'), false);
    const wrangler = path.join(directory, 'wrangler.jsonc');
    await writeFile(
      wrangler,
      JSON.stringify({
        name: 'example',
        analytics_engine_datasets: [{ binding: 'EVENTS', dataset: 'lvbt_events' }],
        unsafe: {
          bindings: [
            {
              type: 'ratelimit',
              name: 'EVENT_LIMITER',
              namespace_id: '1001',
              simple: { limit: 30, period: 60 },
            },
          ],
        },
      }),
    );
    const retained = manifests.readWranglerConfig(wrangler);
    assert.deepEqual(retained.analyticsEngine, analyticsEngine);
    assert.deepEqual(retained.rateLimits, rateLimits);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declared configuration alone cannot pass missing or conflicting deployed Worker resources', () => {
  const context = requirements();
  assert.equal(readiness(items(context)).ready, true);
  context.state.worker.value.analyticsEngine = [];
  context.state.worker.value.rateLimits[0].namespace = '2002';
  const plan = items(context);
  assert.equal(plan.find((entry) => entry.id === 'analyticsEngine:EVENTS')?.status, 'missing');
  assert.equal(plan.find((entry) => entry.id === 'rateLimits:EVENT_LIMITER')?.status, 'mismatch');
  assert.equal(readiness(plan).ready, false);
  for (const entry of plan.filter((entry) => /^(analyticsEngine|rateLimits):/.test(entry.id)))
    assert.equal(entry.action?.type, 'manual');
});

test('unreadable resources and duplicate live binding identities fail closed without provider mutation', () => {
  const context = requirements();
  context.state.worker = unknown('permission denied', 'unauthorized');
  const plan = items(context);
  assert.equal(plan.find((entry) => entry.id === 'analyticsEngine:EVENTS')?.status, 'unknown');
  assert.equal(plan.find((entry) => entry.id === 'rateLimits:EVENT_LIMITER')?.action, undefined);
  context.state.worker = known({
    ...readyState().worker.value,
    analyticsEngine: [analyticsEngine[0], analyticsEngine[0]],
    rateLimits,
  });
  assert.equal(
    items(context).find((entry) => entry.id === 'analyticsEngine:EVENTS')?.status,
    'mismatch',
  );
});

test('read-only deployed settings evidence captures actual binding names and limits', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-worker-observation-'));
  try {
    const { manifest } = requirements();
    for (const field of ['d1', 'r2', 'turnstile', 'access', 'email', 'secrets', 'vars'])
      manifest[field] = [];
    delete manifest.github;
    await writeFile(path.join(directory, 'wrangler.jsonc'), JSON.stringify({ name: 'example' }));
    const calls = [];
    const api = {
      get: (endpoint) => {
        calls.push(endpoint);
        return Promise.resolve(
          endpoint.endsWith('/secrets')
            ? []
            : {
                bindings: [
                  { name: 'EVENTS', type: 'analytics_engine', dataset: 'lvbt_events' },
                  {
                    name: 'EVENT_LIMITER',
                    type: 'ratelimit',
                    namespace_id: '1001',
                    simple: { limit: 30, period: 60 },
                  },
                ],
              },
        );
      },
      post: () => {
        throw new Error('Readiness cannot write to the provider.');
      },
    };
    const state = await observePlatform({
      manifest,
      directory,
      apis: { wrangler: api },
      run: () => {
        throw new Error('No GitHub requirements.');
      },
      resolve: () => Promise.resolve([]),
    });
    assert.equal(state.worker.ok, true);
    assert.deepEqual(state.worker.value.analyticsEngine, analyticsEngine);
    assert.deepEqual(state.worker.value.rateLimits, rateLimits);
    assert.deepEqual(calls, [
      `accounts/${manifest.cloudflare.accountId}/workers/scripts/example/settings`,
      `accounts/${manifest.cloudflare.accountId}/workers/scripts/example/secrets`,
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production identifier resolution checks zone selection even when the account is literal', () => {
  const { manifest } = requirements();
  delete manifest.cloudflare.zone.id;
  manifest.cloudflare.zone.idEnv = 'APP_ZONE_ID';
  assert.throws(() => resolveManifestAccount(manifest, {}), /APP_ZONE_ID.*32/);
  assert.equal(
    resolveManifestAccount(manifest, { APP_ZONE_ID: 'e'.repeat(32) }).cloudflare.zone.id,
    'e'.repeat(32),
  );
});
