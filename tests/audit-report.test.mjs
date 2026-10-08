import assert from 'node:assert/strict';
import test from 'node:test';
const audit = await import('../packages/cli/src/lib/audit/report.mjs').catch(() => ({}));
import { repository, report, remoteRun, fixture, liveFixture } from './audit-fixtures.mjs';

test('verified failure previews one helper-owned bug with reproduction and artifact links', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const setup = await fixture(report());
  const result = await audit.reportAudit({ ...setup, dryRun: true, config: {} });
  assert.equal(result.actions[0].action, 'create');
  assert.deepEqual(result.actions[0].labels, [
    'bug',
    'audit-owned',
    'audit:links',
    'target:production',
  ]);
  assert.match(result.actions[0].title, /Links audit fails in production/);
  assert.match(
    result.actions[0].body,
    /# Steps to reproduce[\s\S]*pnpm audit:links[\s\S]*# Expected behavior[\s\S]*# Actual behavior[\s\S]*HTTP 404[\s\S]*# Additional context/,
  );
  assert.doesNotMatch(result.actions[0].body, /<!--/);
  assert.match(result.actions[0].body, /actions\/runs\/100\/artifacts\/777/);
});

test('untrusted events, forged evidence, and stale runs are rejected before issue mutation', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  for (const options of [
    { run: { ...remoteRun, event: 'pull_request' } },
    { artifact: { ...report(), commit: 'b'.repeat(40) } },
    { latest: [{ ...remoteRun, id: 101 }, remoteRun] },
  ]) {
    const setup = await fixture(report(), options);
    await assert.rejects(
      audit.reportAudit({ ...setup, dryRun: true, config: {} }),
      /trusted|artifact|stale|event/i,
    );
    assert.equal(
      setup.calls.some((call) => call[1] === 'issue'),
      false,
    );
  }
});

test('failed check reopens only its matching issue and errors never close issues', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const issue = {
    number: 7,
    title: 'Links audit fails in production',
    body: 'Verified run: 99 (attempt 1).',
    state: 'CLOSED',
    labels: [{ name: 'audit-owned' }, { name: 'audit:links' }, { name: 'target:production' }],
    url: `https://github.com/${repository}/issues/7`,
  };
  const failed = await fixture(report(), { issues: [issue] });
  assert.equal(
    (await audit.reportAudit({ ...failed, dryRun: true, config: {} })).actions[0].action,
    'reopen',
  );
  const errored = await fixture(report('error'), { issues: [issue] });
  assert.deepEqual((await audit.reportAudit({ ...errored, dryRun: true, config: {} })).actions, []);
  const passing = await fixture(report('pass'), { issues: [{ ...issue, state: 'OPEN' }] });
  assert.equal(
    (await audit.reportAudit({ ...passing, dryRun: true, config: {} })).actions[0].action,
    'close',
  );
});

test('newer issue evidence and duplicate audit-owned issues block mutations', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const issue = {
    number: 7,
    body: 'Verified run: 101 (attempt 1).',
    state: 'OPEN',
    labels: [{ name: 'audit-owned' }, { name: 'audit:links' }, { name: 'target:production' }],
  };
  const stale = await fixture(report(), { issues: [issue] });
  await assert.rejects(audit.reportAudit({ ...stale, dryRun: true, config: {} }), /stale/);
  const duplicate = await fixture(report(), {
    issues: [
      { ...issue, body: '' },
      { ...issue, number: 8, body: '' },
    ],
  });
  await assert.rejects(
    audit.reportAudit({ ...duplicate, dryRun: true, config: {} }),
    /multiple|duplicate/i,
  );
});

test('reporting rejects hidden metadata in findings before previewing issue updates', async () => {
  const value = report();
  value.results[0].findings[0].diagnostic = 'HTTP 404 <!-- hidden -->';
  const setup = await fixture(value);
  await assert.rejects(
    audit.reportAudit({ ...setup, dryRun: true, config: {} }),
    /hidden metadata/i,
  );
});

test('live helper boundary creates, updates, reopens, and closes one stored owned issue', async () => {
  const owned = {
    number: 7,
    title: 'Old finding',
    body: 'Verified run: 99 (attempt 1).',
    state: 'OPEN',
    labels: [
      { name: 'bug' },
      { name: 'audit-owned' },
      { name: 'audit:links' },
      { name: 'target:production' },
    ],
    url: `https://github.com/${repository}/issues/7`,
  };
  for (const [status, initial, expectedAction, expectedState] of [
    ['fail', undefined, 'create', 'OPEN'],
    ['fail', owned, 'update', 'OPEN'],
    ['fail', { ...owned, state: 'CLOSED' }, 'reopen', 'OPEN'],
    ['pass', owned, 'close', 'CLOSED'],
  ]) {
    const setup = await liveFixture(report(status), initial);
    const result = await audit.reportAudit({ ...setup, config: {} });
    assert.equal(result.actions[0].action, expectedAction);
    const stored = JSON.parse(
      await (await import('node:fs/promises')).readFile(setup.state, 'utf8'),
    ).issue;
    assert.equal(stored.state, expectedState);
    assert.equal(stored.number, 7);
    assert.equal(stored.title, 'Links audit fails in production');
    assert.match(stored.body, /Verified run: 100 \(attempt 1\)/);
    assert.match(stored.body, status === 'pass' ? /now passes/ : /HTTP 404/);
    assert.deepEqual(
      stored.labels.map((label) => label.name),
      ['bug', 'audit-owned', 'audit:links', 'target:production'],
    );
  }
});
test('audit writes cannot replay trusted evidence from a local or PR executor', async () => {
  for (const environment of [{}, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    const setup = await liveFixture(report());
    await assert.rejects(
      audit.reportAudit({ ...setup, config: {}, environment }),
      /executor|execution|workflow/i,
    );
    assert.equal(
      JSON.parse(await (await import('node:fs/promises')).readFile(setup.state, 'utf8')).issue,
      undefined,
    );
  }
});
test('audit artifact selection must match declarations at the verified source commit', async () => {
  const setup = await fixture(report());
  await assert.rejects(
    audit.reportAudit({
      ...setup,
      dryRun: true,
      config: {
        audits: { workflow: '.github/workflows/audits.yml', artifactName: 'lvbt-audit-report' },
      },
    }),
    /configuration|declaration|commit/i,
  );
});
test('an audit-owned result cannot mutate a pull request or another automation owner', async () => {
  const issue = {
    number: 7,
    body: '',
    state: 'OPEN',
    labels: ['audit-owned', 'audit:links', 'target:production'].map((name) => ({ name })),
  };
  const pullRequest = await fixture(report('pass'), {
    issues: [{ ...issue, pull_request: { url: 'https://github.com/example/pull/7' } }],
  });
  assert.deepEqual(
    (await audit.reportAudit({ ...pullRequest, config: {}, dryRun: true })).actions,
    [],
  );
  const ambiguous = await fixture(report(), {
    issues: [{ ...issue, labels: [...issue.labels, { name: 'recurring-owned' }] }],
  });
  await assert.rejects(audit.reportAudit({ ...ambiguous, config: {}, dryRun: true }), /ownership/i);
});
test('quoted run identifiers cannot make actual older audit evidence appear stale', async () => {
  const issue = {
    number: 7,
    body: 'The finding quoted Verified run: 99999 (attempt 1).\n\nVerified run: 88888 (attempt 1).\n\nAudit owner: LVBT shared audit automation.\n\nVerified run: 99 (attempt 1).\n\nWorkflow: previous.',
    state: 'OPEN',
    labels: ['audit-owned', 'audit:links', 'target:production'].map((name) => ({ name })),
  };
  const setup = await fixture(report(), { issues: [issue] });
  assert.equal(
    (await audit.reportAudit({ ...setup, config: {}, dryRun: true })).actions[0].action,
    'update',
  );
});

test('CRLF audit evidence blocks older runs and attempts before issue updates', async () => {
  for (const previous of ['101 (attempt 1)', '100 (attempt 2)']) {
    const setup = await fixture(report(), {
      issues: [
        {
          number: 7,
          state: 'OPEN',
          body: `Audit owner: LVBT shared audit automation.\r\n\r\nVerified run: ${previous}.\r\n\r\nWorkflow: previous.`,
          labels: ['audit-owned', 'audit:links', 'target:production'].map((name) => ({ name })),
        },
      ],
    });
    await assert.rejects(audit.reportAudit({ ...setup, config: {}, dryRun: true }), /stale/);
    assert.equal(
      setup.calls.some((call) => ['edit', 'close', 'reopen', 'create'].includes(call[2])),
      false,
    );
  }
});
