import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlan, rotateSecrets } from '../packages/cli/src/lib/platform/apply.mjs';
import { readyState, sampleManifest } from './support/platform.mjs';

function setup({ reveal = false, failGithub = false } = {}) {
  const secret = {
    name: 'WEBHOOK_SECRET',
    purpose: 'Checks a partner webhook.',
    generate: true,
    targets: ['worker', 'github:production'],
    afterSet: 'Paste the same value into the partner webhook Authorization header.',
  };
  const manifest = sampleManifest();
  manifest.secrets = [secret];
  const events = [];
  const outputs = [];
  const context = {
    manifest,
    state: readyState(),
    directory: '/repo/apps/site',
    values: new Map(),
    handled: new Set(),
    shown: new Set(),
    io: {
      write: (value) => {
        outputs.push(value);
        events.push({ output: value });
      },
      confirm: async (question, defaultValue) => {
        events.push({ question, defaultValue });
        return question.includes('Show') ? reveal : true;
      },
    },
    run: (command, args, options) => {
      events.push({ command, args, input: options.input });
      return failGithub && command === 'gh'
        ? { status: 1, stdout: '', stderr: 'permission denied' }
        : { status: 0, stdout: '', stderr: '' };
    },
  };
  const items = secret.targets.map((target) => ({
    status: 'missing',
    label: `${secret.name} on ${target}`,
    action: { type: 'secret.put', secret, target, source: { type: 'generate' } },
  }));
  return { context, secret, items, events, output: () => outputs.join('') };
}

test('external consumer instructions follow every successful write and default to hiding the value', async () => {
  const setupRun = setup();
  await applyPlan(setupRun.context, setupRun.items);
  const writes = setupRun.events.filter((event) => event.command);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].input, writes[1].input);
  const instruction = setupRun.events.findIndex((event) =>
    event.output?.includes('partner webhook Authorization'),
  );
  assert.ok(instruction > setupRun.events.findLastIndex((event) => event.command));
  assert.ok(!setupRun.output().includes(writes[0].input));
  const reveal = setupRun.events.find((event) => event.question?.includes('Show'));
  assert.equal(reveal?.defaultValue, false);
  await applyPlan(setupRun.context, setupRun.items);
  assert.equal(setupRun.output().split(setupRun.secret.afterSet).length - 1, 1);
});

test('an explicitly accepted one-time copy reveals the exact value stored everywhere', async () => {
  const setupRun = setup({ reveal: true });
  await applyPlan(setupRun.context, setupRun.items);
  const stored = setupRun.events.find((event) => event.command).input;
  assert.equal(setupRun.output().split(stored).length - 1, 1);
});

test('a failed target cannot disclose a credential or claim external setup is ready', async () => {
  const setupRun = setup({ reveal: true, failGithub: true });
  await applyPlan(setupRun.context, setupRun.items);
  const stored = setupRun.events.find((event) => event.command).input;
  assert.ok(!setupRun.output().includes(stored));
  assert.ok(!setupRun.output().includes(setupRun.secret.afterSet));
  assert.ok(!setupRun.events.some((event) => event.question?.includes('Show')));
});

test('rotation gives external instructions only after all targets receive the replacement', async () => {
  const setupRun = setup({ reveal: true });
  await rotateSecrets(setupRun.context, ['WEBHOOK_SECRET']);
  const writes = setupRun.events.filter((event) => event.command);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].input, writes[1].input);
  assert.ok(setupRun.output().includes(setupRun.secret.afterSet));
  assert.equal(setupRun.output().split(writes[0].input).length - 1, 1);
});

test('partial rotation never offers a one-time credential copy', async () => {
  const setupRun = setup({ reveal: true, failGithub: true });
  await rotateSecrets(setupRun.context, ['WEBHOOK_SECRET']);
  const stored = setupRun.events.find((event) => event.command).input;
  assert.ok(!setupRun.output().includes(stored));
  assert.ok(!setupRun.output().includes(setupRun.secret.afterSet));
});
