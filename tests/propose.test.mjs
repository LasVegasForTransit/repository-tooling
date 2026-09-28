import assert from 'node:assert/strict';
import test from 'node:test';

import { proposeRelease } from '../standards/propose.ts';

const entry = { name: 'example', requiredStatus: 'Validate', kind: 'consumer' };

/** A runner that records every command and answers from a table of canned outputs. */
function fakeRunner(answers) {
  const calls = [];
  const runner = (command, args) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    for (const [pattern, answer] of answers) {
      if (!pattern.test(line)) continue;
      if (answer instanceof Error) throw answer;
      return answer;
    }
    return '';
  };
  return { calls, runner };
}

const options = (runner, overrides = {}) => ({
  source: '/nonexistent/source',
  tooling: '/nonexistent/tooling',
  target: '/nonexistent/target',
  entry,
  tag: 'v0.5.0',
  changed: false,
  from: 'v0.4.5',
  runner,
  ...overrides,
});

const openUpdate = JSON.stringify([
  { number: 7, headRefName: 'automation/repository-standard-v0.5.0' },
]);

test('an unchanged checkout closes its update only when the default branch has the release', async () => {
  const behind = fakeRunner([
    [/^gh pr list --state open/, openUpdate],
    [/web-platform\.json/, JSON.stringify({ release: 'v0.4.5' })],
  ]);
  await proposeRelease(options(behind.runner));
  assert.ok(!behind.calls.some((call) => call.startsWith('gh pr close')));

  const current = fakeRunner([
    [/^gh pr list --state open/, openUpdate],
    [/web-platform\.json/, JSON.stringify({ release: 'v0.5.0' })],
  ]);
  await proposeRelease(options(current.runner));
  assert.ok(current.calls.some((call) => call.startsWith('gh pr close 7')));
});

test('a branch GitHub deleted is pushed afresh and a failed dispatch is reported, not thrown', async (t) => {
  const exitCode = process.exitCode;
  t.after(() => {
    process.exitCode = exitCode;
  });
  const { calls, runner } = fakeRunner([
    [/^gh pr list --state open/, '[]'],
    [/^git ls-remote --heads/, ''],
    [/^gh pr list --head/, JSON.stringify([{ number: 12 }])],
    [/^gh workflow run ci\.yml/, new Error('no workflow_dispatch trigger')],
  ]);
  const outcome = await proposeRelease(
    options(runner, { changed: true, from: 'v0.5.0', tag: 'v0.5.1' }),
  );
  assert.equal(outcome, 'example: #12');
  const forget = calls.findIndex((call) => call.startsWith('git update-ref -d'));
  const push = calls.findIndex((call) => call.startsWith('git push --force-with-lease'));
  assert.ok(forget !== -1 && forget < push, 'the stale tracking ref is forgotten before the push');
  assert.ok(
    calls.some((call) => call === 'gh pr merge 12 --auto --rebase'),
    'a patch merges itself',
  );
  assert.equal(process.exitCode, 1);
});
