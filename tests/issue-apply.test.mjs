import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { reportAudit } from '../packages/cli/src/lib/audit/report.mjs';
import { reportRecurring } from '../packages/cli/src/lib/contributions/recurring.mjs';
import { liveFixture as auditFixture, report as auditReport } from './audit-fixtures.mjs';
import { liveFixture as recurringFixture, config, owned } from './recurring-fixtures.mjs';

async function changeState(setup, changes) {
  const value = JSON.parse(await readFile(setup.state, 'utf8'));
  await writeFile(setup.state, JSON.stringify({ ...value, ...changes }));
}
const labels = ['bug', 'audit-owned', 'audit:links', 'target:production'];

test('audit issue creation and update reuse case-insensitive GitHub labels and verify their stored names', async () => {
  for (const issue of [
    undefined,
    {
      number: 7,
      title: 'Old issue',
      body: 'Verified run: 99 (attempt 1).',
      state: 'OPEN',
      labels: labels.map((name) => ({ name: name.toUpperCase() })),
    },
  ]) {
    const setup = await auditFixture(auditReport(), issue);
    await changeState(setup, { labels: labels.map((name) => name.toUpperCase()) });
    const result = await reportAudit({ ...setup, config: {} });
    assert.equal(result.actions[0].number, 7);
    const stored = JSON.parse(await readFile(setup.state, 'utf8'));
    assert.equal(stored.labels.length, 4);
    assert.equal(stored.issue.labels.length, 4);
  }
});

test('mixed-case recurring adoption retains the existing issue, label inventory and pin', async () => {
  const declaration = {
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
  const setup = await recurringFixture(legacy, false, declaration);
  await changeState(setup, {
    labels: ['ENHANCEMENT', 'Recurring-Owned', 'Recurring:Weekly', 'analytics-report'],
  });
  const result = await reportRecurring({ ...setup, config: declaration });
  const stored = JSON.parse(await readFile(setup.state, 'utf8'));
  assert.equal(result.actions[0].number, 7);
  assert.equal(stored.labels.length, 4);
  assert.equal(stored.issue.labels.length, 4);
  assert.equal(stored.pinned, true);
});

test('invalid and truncated shared label inventories fail before issue creation for either route', async () => {
  for (const setup of [await auditFixture(auditReport()), await recurringFixture()]) {
    for (const inventory of [
      null,
      Array.from({ length: 1000 }, () => 'Existing'),
      [{ name: 123 }],
    ]) {
      await changeState(setup, { labels: inventory });
      const run = setup.config ? reportRecurring : reportAudit;
      await assert.rejects(
        run({ ...setup, ...(!setup.config ? { config: {} } : {}) }),
        /inventory|truncated/i,
      );
      assert.equal(JSON.parse(await readFile(setup.state, 'utf8')).issue, undefined);
    }
  }
});

test('audit writes fail when stored readback differs from the approved content', async () => {
  const setup = await auditFixture(auditReport(), {
    number: 7,
    title: 'Old issue',
    body: 'Verified run: 99 (attempt 1).',
    state: 'OPEN',
    labels: labels.map((name) => ({ name })),
  });
  await changeState(setup, { tamper: true });
  await assert.rejects(reportAudit({ ...setup, config: {} }), /stored|readback|preview/i);
});
