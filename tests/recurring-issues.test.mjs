import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import {
  fixture,
  liveFixture,
  report,
  config,
  owned,
  remote,
  body,
} from './recurring-fixtures.mjs';

const recurring = await import('../packages/cli/src/lib/contributions/recurring.mjs').catch(
  () => ({}),
);
test('trusted recurring evidence previews configured template ownership and pin without mutation', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function', 'recurring helper route is missing');
  const setup = await fixture();
  const preview = await recurring.reportRecurring({ ...setup, dryRun: true });
  assert.equal(preview.actions[0].action, 'create');
  assert.equal(preview.actions[0].title, 'Weekly analytics report');
  assert.equal(preview.actions[0].pin, true);
  assert.deepEqual(
    preview.actions[0].labels,
    owned.labels.map((value) => value.name),
  );
  assert.match(preview.actions[0].body, /Seven days: 12 visits/);
  assert.match(preview.actions[0].body, /Verified run: 100 \(attempt 1\)/);
  assert.match(preview.actions[0].body, /artifacts\/777/);
  assert.equal(
    setup.calls.some((call) => ['create', 'edit', 'close', 'reopen', 'graphql'].includes(call[2])),
    false,
  );
});
test('PR, foreign branch, wrong attempt, forged artifact and newer trusted evidence fail before writes', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const options of [
    { remote: { ...remote, event: 'pull_request' } },
    { remote: { ...remote, head_branch: 'topic' } },
    { remote: { ...remote, run_attempt: 2 } },
    { artifact: { ...report(), commit: 'b'.repeat(40) } },
    { latest: [{ ...remote, id: 101 }] },
  ]) {
    const setup = await fixture(report(), options);
    await assert.rejects(
      recurring.reportRecurring({ ...setup, dryRun: true }),
      /trusted|artifact|stale/i,
    );
    assert.equal(
      setup.calls.some((call) => call[1] === 'issue'),
      false,
    );
  }
});
test('only explicit verified resolution closes; errors and missing results cannot clear issues', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const status of ['error', 'skipped']) {
    const setup = await fixture(report(status), { issues: [owned] });
    assert.deepEqual((await recurring.reportRecurring({ ...setup, dryRun: true })).actions, []);
  }
  const missing = await fixture({ ...report(), results: [] }, { issues: [owned] });
  assert.deepEqual((await recurring.reportRecurring({ ...missing, dryRun: true })).actions, []);
  const setup = await fixture(report('resolved'), { issues: [owned] });
  assert.equal(
    (await recurring.reportRecurring({ ...setup, dryRun: true })).actions[0].action,
    'close',
  );
  const reopened = await fixture(report(), { issues: [{ ...owned, state: 'CLOSED' }] });
  assert.equal(
    (await recurring.reportRecurring({ ...reopened, dryRun: true })).actions[0].action,
    'reopen',
  );
});
test('ambiguous ownership, newer issue evidence and malformed body block the complete batch', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const issues of [
    [owned, { ...owned, number: 8 }],
    [{ ...owned, body: 'Verified run: 101 (attempt 1).' }],
  ]) {
    const setup = await fixture(report(), { issues });
    await assert.rejects(recurring.reportRecurring({ ...setup, dryRun: true }), /multiple|stale/i);
  }
  for (const invalidBody of ['no template headings', `${body}<!-- hidden -->`]) {
    const value = report();
    value.results[0].body = invalidBody;
    const setup = await fixture(value);
    await assert.rejects(
      recurring.reportRecurring({ ...setup, dryRun: true }),
      /section|metadata/i,
    );
  }
});
test('real helper boundary upserts, reopens, resolves and verifies the requested pin', async () => {
  for (const [initial, status, expectedAction, expectedState] of [
    [undefined, 'open', 'create', 'OPEN'],
    [owned, 'open', 'update', 'OPEN'],
    [{ ...owned, state: 'CLOSED' }, 'open', 'reopen', 'OPEN'],
    [owned, 'resolved', 'close', 'CLOSED'],
  ]) {
    const setup = await liveFixture(initial);
    await writeFile(setup.input, JSON.stringify(report(status)));
    const result = await recurring.reportRecurring(setup);
    assert.equal(result.actions[0].action, expectedAction);
    const stored = JSON.parse(await readFile(setup.state, 'utf8'));
    assert.equal(stored.issue.state, expectedState);
    assert.equal(stored.issue.number, 7);
    assert.equal(stored.issue.title, 'Weekly analytics report');
    assert.match(stored.issue.body, /Verified run: 100 \(attempt 1\)/);
    assert.equal(stored.pinned, status === 'open');
  }
});
test('reporting fails when GitHub stores different content instead of claiming success', async () => {
  const setup = await liveFixture(owned, true);
  await assert.rejects(recurring.reportRecurring(setup), /stored.*differently/i);
  assert.equal(JSON.parse(await readFile(setup.state, 'utf8')).pinned, false);
});
test('explicit adoption preserves only a unique legacy bot issue older than the trusted run', async () => {
  const legacy = {
    ...owned,
    labels: [{ name: 'analytics-report' }],
    author: { login: 'github-actions[bot]', is_bot: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const adopt = {
    contributions: {
      recurring: { weekly: { ...config.contributions.recurring.weekly, adoptExisting: true } },
    },
  };
  const setup = await fixture(report(), {
    issues: [legacy],
    remote: { ...remote, run_started_at: '2026-10-02T00:00:00Z' },
    trustedConfig: adopt,
  });
  const result = await recurring.reportRecurring({ ...setup, config: adopt, dryRun: true });
  assert.equal(result.actions[0].action, 'update');
  assert.equal(result.actions[0].number, 7);
  for (const issues of [
    [legacy, { ...legacy, number: 8 }],
    [{ ...legacy, updatedAt: '2026-10-03T00:00:00Z' }],
    [{ ...legacy, author: { login: 'person', is_bot: false } }],
    [{ ...legacy, labels: [...legacy.labels, { name: 'audit-owned' }] }],
  ]) {
    const blocked = await fixture(report(), {
      issues,
      remote: { ...remote, run_started_at: '2026-10-02T00:00:00Z' },
      trustedConfig: adopt,
    });
    await assert.rejects(
      recurring.reportRecurring({ ...blocked, config: adopt, dryRun: true }),
      /multiple|stale|bot|ownership/i,
    );
  }
});

test('explicit live adoption retains the stable number and verifies labels and pin', async () => {
  const legacy = {
    ...owned,
    labels: [{ name: 'analytics-report' }],
    author: { login: 'github-actions[bot]', is_bot: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const adopt = {
    contributions: {
      recurring: { weekly: { ...config.contributions.recurring.weekly, adoptExisting: true } },
    },
  };
  const setup = await liveFixture(legacy, false, adopt);
  const result = await recurring.reportRecurring({ ...setup, config: adopt });
  assert.equal(result.actions[0].number, 7);
  const stored = JSON.parse(await readFile(setup.state, 'utf8'));
  assert.equal(stored.issue.number, 7);
  assert.equal(stored.pinned, true);
  assert.deepEqual(
    new Set(stored.issue.labels.map(({ name }) => name)),
    new Set(owned.labels.map(({ name }) => name)),
  );
});
test('local and PR executors cannot replay trusted evidence to write recurring issues', async () => {
  for (const environment of [{}, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    const setup = await liveFixture();
    await assert.rejects(
      recurring.reportRecurring({ ...setup, environment }),
      /execution|executor|workflow/i,
    );
    assert.equal(JSON.parse(await readFile(setup.state, 'utf8')).issue, undefined);
  }
});
test('local declarations cannot replace the configuration owned by the verified commit', async () => {
  const setup = await fixture();
  const altered = {
    contributions: {
      recurring: {
        weekly: { ...config.contributions.recurring.weekly, title: 'Unreviewed replacement title' },
      },
    },
  };
  await assert.rejects(
    recurring.reportRecurring({ ...setup, config: altered, dryRun: true }),
    /configuration|declaration|commit/i,
  );
});
test('recurring declarations and existing owned issues cannot claim foreign automation ownership', async () => {
  for (const name of [
    'audit-owned',
    'audit:links',
    'target:production',
    'other-owned',
    'Audit-Owned',
  ]) {
    const changed = {
      contributions: {
        recurring: { weekly: { ...config.contributions.recurring.weekly, labels: [name] } },
      },
    };
    const setup = await fixture(report(), { trustedConfig: changed });
    await assert.rejects(
      recurring.reportRecurring({ ...setup, config: changed, dryRun: true }),
      /declaration|ownership/i,
    );
    const claimed = await fixture(report(), {
      issues: [{ ...owned, labels: [...owned.labels, { name }] }],
    });
    await assert.rejects(recurring.reportRecurring({ ...claimed, dryRun: true }), /ownership/i);
  }
});
test('reviewed mixed-case labels adopt the same legacy issue and quoted runs cannot poison later evidence', async () => {
  const mixed = {
    contributions: {
      recurring: {
        weekly: {
          ...config.contributions.recurring.weekly,
          labels: ['Analytics-Report'],
          adoptExisting: true,
        },
      },
    },
  };
  const legacy = {
    ...owned,
    labels: [{ name: 'analytics-report' }],
    author: { login: 'github-actions[bot]', is_bot: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const setup = await fixture(report(), { issues: [legacy], trustedConfig: mixed });
  assert.equal(
    (await recurring.reportRecurring({ ...setup, config: mixed, dryRun: true })).actions[0].number,
    7,
  );
  const quoted = await fixture(report(), {
    issues: [
      {
        ...owned,
        body: 'The report quoted Verified run: 99999 (attempt 1).\n\nVerified run: 88888 (attempt 1).\n\nContribution owner: LVBT recurring weekly automation.\n\nVerified run: 99 (attempt 1).\n\nWorkflow: previous.',
      },
    ],
  });
  assert.equal(
    (await recurring.reportRecurring({ ...quoted, dryRun: true })).actions[0].action,
    'update',
  );
});
