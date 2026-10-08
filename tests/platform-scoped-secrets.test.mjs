import assert from 'node:assert/strict';
import test from 'node:test';
import { validateManifest } from '../packages/cli/src/lib/platform/manifest.mjs';
import { planPlatform } from '../packages/cli/src/lib/platform/plan.mjs';
import { applyPlan, rotateSecrets } from '../packages/cli/src/lib/platform/apply.mjs';
import { storeFed } from '../packages/cli/src/lib/platform/apply-steps.mjs';
import { readyState, sampleManifest } from './support/platform.mjs';
function setup() {
  const manifest = sampleManifest();
  manifest.secrets = [
    {
      name: 'DEPLOY_TOKEN',
      purpose: 'Production publishing.',
      targets: ['github:production'],
      steps: ['Copy the approved production token.'],
      afterSet: 'Verify the production credential consumer.',
    },
    {
      name: 'DEPLOY_TOKEN',
      purpose: 'Preview publishing.',
      targets: ['github:preview'],
      steps: ['Copy the separate preview token.'],
      afterSet: 'Verify the preview credential consumer.',
    },
  ];
  manifest.turnstile = [];
  manifest.access = [];
  manifest.email = [];
  const state = readyState();
  state.github.value.environments = ['production', 'preview'];
  state.github.value.secrets = { production: [], preview: [] };
  const writes = [],
    outputs = [],
    answers = ['fixture-production-token', 'fixture-preview-token'];
  const context = {
    manifest,
    state,
    configPath: 'wrangler.jsonc',
    directory: '/repo',
    values: new Map(),
    handled: new Set(),
    shown: new Set(),
    created: { widgets: new Map(), apps: new Map() },
    io: {
      write: (value) => outputs.push(value),
      confirm: (question) =>
        Promise.resolve(!question.includes('Show') && !question.includes('Open')),
      askHidden: () => Promise.resolve(answers.shift()),
    },
    run: (command, args, options) => {
      writes.push({ command, args, value: options.input });
      return { status: 0, stdout: '', stderr: '' };
    },
  };
  return { manifest, state, context, writes, outputs, answers };
}
function planned(context) {
  return planPlatform({
    manifest: context.manifest,
    state: context.state,
    configPath: context.configPath,
  });
}

test('same secret name is permitted only for explicit disjoint target groups', () => {
  const { manifest } = setup();
  assert.deepEqual(validateManifest(manifest), []);
  for (const change of [
    (value) => {
      value.secrets[1].targets.push('github:production');
    },
    (value) => {
      delete value.secrets[0].targets;
    },
    (value) => {
      value.secrets[1].targets = ['github:preview', 'github:preview'];
    },
  ]) {
    const invalid = structuredClone(manifest);
    change(invalid);
    assert.ok(validateManifest(invalid).length > 0);
  }
});
test('scoped setup asks independently and sends each value only to its declared environment', async () => {
  const run = setup();
  const entries = planned(run.context).filter((entry) =>
    entry.id.startsWith('secret:DEPLOY_TOKEN:'),
  );
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 2);
  await applyPlan(run.context, entries);
  assert.deepEqual(
    run.writes.map((write) => [write.args[write.args.indexOf('--env') + 1], write.value]),
    [
      ['production', 'fixture-production-token'],
      ['preview', 'fixture-preview-token'],
    ],
  );
  assert.equal(run.outputs.join('').includes('fixture-production-token'), false);
  assert.equal(run.outputs.join('').includes('fixture-preview-token'), false);
  assert.ok(run.outputs.join('').includes('production credential consumer'));
  assert.ok(run.outputs.join('').includes('preview credential consumer'));
});
test('readiness never borrows an observed secret name from another environment', () => {
  const run = setup();
  run.state.github.value.secrets.production = ['DEPLOY_TOKEN'];
  const entries = planned(run.context);
  assert.equal(
    entries.find((entry) => entry.id === 'secret:DEPLOY_TOKEN:github:production').status,
    'ok',
  );
  assert.equal(
    entries.find((entry) => entry.id === 'secret:DEPLOY_TOKEN:github:preview').status,
    'missing',
  );
});
test('named rotation handles every declared scope independently', async () => {
  const run = setup();
  await rotateSecrets(run.context, ['DEPLOY_TOKEN']);
  assert.deepEqual(
    run.writes.map((write) => [write.args[write.args.indexOf('--env') + 1], write.value]),
    [
      ['production', 'fixture-production-token'],
      ['preview', 'fixture-preview-token'],
    ],
  );
});
test('storage metadata and disclosure policy are selected by name AND target', async () => {
  const run = setup();
  run.manifest.secrets[0].sensitive = false;
  run.context.io.ask = () => Promise.resolve('fixture-public-setting');
  run.answers.splice(0, 1);
  await applyPlan(
    run.context,
    planned(run.context).filter((entry) => entry.id.startsWith('secret:DEPLOY_TOKEN:')),
  );
  assert.ok(run.outputs.join('').includes('fixture-public-setting'));
  assert.equal(run.outputs.join('').includes('fixture-preview-token'), false);
  assert.equal(run.writes[1].value, 'fixture-preview-token');
});

test('resource-fed Worker credentials never populate a separate same-name GitHub declaration', async () => {
  const run = setup();
  run.manifest.secrets = [
    { name: 'TURNSTILE_SECRET', purpose: 'Worker bot verification.', targets: ['worker'] },
    {
      name: 'TURNSTILE_SECRET',
      purpose: 'Separate preview integration.',
      targets: ['github:preview'],
      steps: ['Copy the preview integration credential.'],
    },
  ];
  run.manifest.turnstile = sampleManifest().turnstile;
  assert.deepEqual(validateManifest(run.manifest), []);
  await storeFed(run.context, 'TURNSTILE_SECRET', 'fixture-fed-worker');
  await applyPlan(
    run.context,
    planned(run.context).filter((entry) => entry.id === 'secret:TURNSTILE_SECRET:github:preview'),
  );
  assert.equal(run.writes[0].value, 'fixture-fed-worker');
  assert.equal(run.writes[1].value, 'fixture-production-token');
  assert.equal(run.writes[1].args[run.writes[1].args.indexOf('--env') + 1], 'preview');
});

test('generation shares within one explicit group and never across declarations', async () => {
  const run = setup();
  run.manifest.secrets[0].targets.push('worker');
  for (const secret of run.manifest.secrets) secret.generate = true;
  await applyPlan(
    run.context,
    planned(run.context).filter((entry) => entry.id.startsWith('secret:DEPLOY_TOKEN:')),
  );
  assert.equal(run.writes.length, 3);
  assert.equal(run.writes[0].value, run.writes[1].value);
  assert.notEqual(run.writes[0].value, run.writes[2].value);
  assert.equal(run.outputs.join('').includes(run.writes[2].value), false);
});

test('observation inventories both target scopes independently and retains secret names only', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { observePlatform } = await import('../packages/cli/src/lib/platform/observe.mjs');
  const run = setup();
  for (const field of ['d1', 'r2', 'turnstile', 'access', 'email', 'vars'])
    run.manifest[field] = [];
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-scoped-observation-'));
  const calls = [];
  try {
    await writeFile(path.join(directory, 'wrangler.jsonc'), '{"name":"example"}');
    const state = await observePlatform({
      manifest: run.manifest,
      directory,
      apis: {},
      resolve: () => Promise.resolve([]),
      run: (command, args) => {
        calls.push([command, ...args]);
        return {
          status: 0,
          stderr: '',
          stdout: JSON.stringify(
            args[0] === 'api' ? {} : [{ name: 'DEPLOY_TOKEN', value: 'must-not-be-retained' }],
          ),
        };
      },
    });
    assert.deepEqual(state.github.value.secrets, {
      production: ['DEPLOY_TOKEN'],
      preview: ['DEPLOY_TOKEN'],
    });
    assert.equal(JSON.stringify(state).includes('must-not-be-retained'), false);
    assert.equal(calls.filter((call) => call.includes('--env')).length, 2);
    assert.equal(
      calls.some((call) => call.includes('set') || call.includes('--method')),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
