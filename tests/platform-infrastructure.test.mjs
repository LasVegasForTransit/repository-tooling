import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { known, observePlatform, unknown } from '../packages/cli/src/lib/platform/observe.mjs';
import { planPlatform, readiness } from '../packages/cli/src/lib/platform/plan.mjs';
import { readyState, sampleManifest } from './support/platform.mjs';

function requirements() {
  const manifest = sampleManifest();
  manifest.cloudflare.domains = ['example.org', 'www.example.org'];
  manifest.github.variables = [
    {
      name: 'PUBLIC_JOIN_URL',
      purpose: 'The public join link.',
      value: 'https://example.org/join',
    },
  ];
  const state = readyState();
  state.domains = known(
    manifest.cloudflare.domains.map((hostname) => ({
      hostname,
      service: 'example',
      zone_id: 'b'.repeat(32),
    })),
  );
  state.github.value.variables = known({ PUBLIC_JOIN_URL: 'https://example.org/join' });
  return { manifest, state };
}
function items(context) {
  return planPlatform({ ...context, configPath: 'apps/site/wrangler.jsonc' });
}

test('production readiness checks both public domain ownership and public build variables', () => {
  const plan = items(requirements());
  assert.equal(plan.find((item) => item.id === 'domain:www.example.org')?.status, 'ok');
  assert.equal(plan.find((item) => item.id === 'github:variable:PUBLIC_JOIN_URL')?.status, 'ok');
  assert.equal(readiness(plan).ready, true);
});

test('missing and conflicting public domains block readiness without offering a takeover', () => {
  const context = requirements();
  context.state.domains.value = [
    { hostname: 'example.org', service: 'another-worker', zone_id: 'b'.repeat(32) },
  ];
  const plan = items(context);
  const conflict = plan.find((item) => item.id === 'domain:example.org');
  assert.equal(conflict?.status, 'mismatch');
  assert.equal(conflict.action, undefined);
  assert.equal(plan.find((item) => item.id === 'domain:www.example.org')?.status, 'missing');
  assert.equal(readiness(plan).ready, false);
});

test('unreadable provider domains are unknown and never treated as safe to attach', () => {
  const context = requirements();
  context.state.domains = unknown('permission denied', 'unauthorized');
  const domain = items(context).find((item) => item.id === 'domain:example.org');
  assert.equal(domain?.status, 'unknown');
  assert.equal(domain.action, undefined);
});

test('a missing or different public build value fails readiness without overwriting it', () => {
  const context = requirements();
  context.state.github.value.variables.value.PUBLIC_JOIN_URL = 'https://wrong.example.org';
  const variable = items(context).find((item) => item.id === 'github:variable:PUBLIC_JOIN_URL');
  assert.equal(variable?.status, 'mismatch');
  assert.equal(variable.action.type, 'manual');
  delete context.state.github.value.variables.value.PUBLIC_JOIN_URL;
  assert.equal(items(context).find((item) => item.id === variable.id)?.status, 'missing');
});

test('provider inventory reads paged custom domains and repository variables without writes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-infrastructure-'));
  try {
    const { manifest } = requirements();
    for (const field of ['d1', 'r2', 'turnstile', 'access', 'email', 'secrets', 'vars'])
      manifest[field] = [];
    await writeFile(path.join(directory, 'wrangler.jsonc'), JSON.stringify({ name: 'example' }));
    const calls = [];
    const state = await observePlatform({
      manifest,
      directory,
      apis: {
        wrangler: {
          get: async () => ({ bindings: [] }),
          list: async (endpoint) => {
            calls.push(endpoint);
            return [{ hostname: 'www.example.org', service: 'example', zone_id: 'b'.repeat(32) }];
          },
        },
      },
      run: (command, args) => {
        calls.push([command, ...args]);
        return {
          status: 0,
          stdout: JSON.stringify([{ name: 'PUBLIC_JOIN_URL', value: 'https://example.org/join' }]),
          stderr: '',
        };
      },
      resolve: async () => [],
    });
    assert.equal(state.domains?.ok, true);
    assert.equal(state.domains.value[0].hostname, 'www.example.org');
    assert.equal(state.github.value.variables.value.PUBLIC_JOIN_URL, 'https://example.org/join');
    assert.deepEqual(calls, [
      `accounts/${manifest.cloudflare.accountId}/workers/domains`,
      ['gh', 'variable', 'list', '--repo', 'LasVegasForTransit/example', '--json', 'name,value'],
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an environment-only account selector is checked in that environment, independently of repository variables', () => {
  const context = requirements();
  context.manifest.github.variables = [
    {
      name: 'CLOUDFLARE_ACCOUNT_ID',
      environment: 'production',
      purpose: 'The deploy account.',
      from: 'cloudflare.accountId',
    },
  ];
  context.state.github.value.variables.value.CLOUDFLARE_ACCOUNT_ID =
    context.manifest.cloudflare.accountId;
  const id = 'github:variable:production:CLOUDFLARE_ACCOUNT_ID';
  assert.equal(items(context).find((entry) => entry.id === id)?.status, 'missing');
  context.state.github.value.variables.value['production:CLOUDFLARE_ACCOUNT_ID'] =
    context.manifest.cloudflare.accountId;
  assert.equal(items(context).find((entry) => entry.id === id)?.status, 'ok');
});

test('duplicate domain ownership records block readiness without proposing a change', () => {
  const context = requirements();
  context.state.domains.value.push(context.state.domains.value[0]);
  const domain = items(context).find((entry) => entry.id === 'domain:example.org');
  assert.equal(domain.status, 'mismatch');
  assert.equal(domain.action, undefined);
});
