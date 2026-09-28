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

test('a branch GitHub deleted is pushed afresh, without hooks, and its held runs are approved', async () => {
  const { calls, runner } = fakeRunner([
    [/^gh pr list --state open/, '[]'],
    [/^git ls-remote --heads/, ''],
    [/^gh pr list --head/, JSON.stringify([{ number: 12 }])],
    [/^gh run list/, JSON.stringify([{ databaseId: 99, conclusion: 'action_required' }])],
  ]);
  const outcome = await proposeRelease(
    options(runner, { changed: true, from: 'v0.5.0', tag: 'v0.5.1' }),
  );
  assert.equal(outcome, 'example: #12');
  const forget = calls.findIndex((call) => call.startsWith('git update-ref -d'));
  const push = calls.findIndex((call) => call.includes(' push --force-with-lease'));
  assert.ok(forget !== -1 && forget < push, 'the stale tracking ref is forgotten before the push');
  assert.match(calls[push], /^git -c core\.hooksPath=\/dev\/null push/);
  assert.ok(calls.includes('gh pr merge 12 --auto --rebase'), 'a patch merges itself');
  assert.equal(
    calls.filter((call) => call === 'gh api -X POST repos/{owner}/{repo}/actions/runs/99/approve')
      .length,
    1,
    'each held run is approved once',
  );
});

test('a held run the token may not approve is reported, not thrown', async (t) => {
  const exitCode = process.exitCode;
  t.after(() => {
    process.exitCode = exitCode;
  });
  const { runner } = fakeRunner([
    [/^gh pr list --state open/, '[]'],
    [/^git ls-remote --heads/, ''],
    [/^gh pr list --head/, JSON.stringify([{ number: 12 }])],
    [/^gh run list/, JSON.stringify([{ databaseId: 99, conclusion: 'action_required' }])],
    [/^gh api -X POST/, new Error('Resource not accessible by integration')],
  ]);
  assert.equal(
    await proposeRelease(options(runner, { changed: true, from: 'v0.5.0', tag: 'v0.5.1' })),
    'example: #12',
  );
  assert.equal(process.exitCode, 1);
});
