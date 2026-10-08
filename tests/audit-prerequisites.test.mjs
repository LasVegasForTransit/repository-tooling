import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reportAudit } from '../packages/cli/src/lib/audit/report.mjs';
import { executionJobs, fixture, report } from './audit-fixtures.mjs';

test('a failed prerequisite cannot recover audit-owned issues even with a passing uploaded report', async () => {
  for (const name of [
    'Checkout executed source',
    'Setup Node + pnpm',
    'Install product audit browser',
    'Build local audit inputs',
    'Install pinned link checker',
  ]) {
    for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
      const jobs = executionJobs();
      jobs.jobs[0].steps.find((step) => step.name === name).conclusion = conclusion;
      const setup = await fixture(report('pass'), { jobs });
      await assert.rejects(
        reportAudit({ ...setup, config: {}, dryRun: true }),
        /prerequisite|execution/i,
      );
      assert.equal(
        setup.calls.some((call) => call[1] === 'issue'),
        false,
      );
    }
  }
});

test('missing, ambiguous, incomplete or foreign execution evidence cannot reconcile issues', async () => {
  const cases = {
    missing: (jobs) => {
      jobs.jobs = [];
    },
    duplicate: (jobs) => {
      jobs.jobs.push(structuredClone(jobs.jobs[0]));
    },
    truncated: (jobs) => {
      jobs.total_count = 101;
    },
    'foreign-run': (jobs) => {
      jobs.jobs[0].run_id = 101;
    },
    'foreign-sha': (jobs) => {
      jobs.jobs[0].head_sha = 'b'.repeat(40);
    },
    incomplete: (jobs) => {
      jobs.jobs[0].status = 'in_progress';
    },
    'audit-skipped': (jobs) => {
      jobs.jobs[0].steps[6].conclusion = 'skipped';
    },
    'upload-failed': (jobs) => {
      jobs.jobs[0].steps[7].conclusion = 'failure';
    },
    'setup-skipped': (jobs) => {
      jobs.jobs[0].steps[2].conclusion = 'skipped';
    },
    'audit-timed-out': (jobs) => {
      jobs.jobs[0].steps[6].conclusion = 'timed_out';
    },
    'upload-before-command': (jobs) => {
      jobs.jobs[0].steps[7].number = 0;
    },
    'missing-checkout': (jobs) => {
      jobs.jobs[0].steps.splice(1, 1);
    },
    'inconsistent-result': (jobs) => {
      jobs.jobs[0].steps[6].conclusion = 'failure';
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const jobs = executionJobs();
    mutate(jobs);
    const setup = await fixture(report('pass'), { jobs });
    await assert.rejects(
      reportAudit({ ...setup, config: {}, dryRun: true }),
      /prerequisite|execution/i,
      name,
    );
    assert.equal(
      setup.calls.some((call) => call[1] === 'issue'),
      false,
    );
  }
});

test('real audit findings remain reportable after successful prerequisites and optional skips', async () => {
  const jobs = executionJobs();
  jobs.jobs[0].conclusion = 'failure';
  jobs.jobs[0].steps[6].conclusion = 'failure';
  for (const index of [3, 4, 5]) jobs.jobs[0].steps[index].conclusion = 'skipped';
  const setup = await fixture(report(), { jobs });
  assert.equal(
    (await reportAudit({ ...setup, config: {}, dryRun: true })).actions[0].action,
    'create',
  );
  assert.equal(setup.calls.filter((call) => call[2]?.includes('/attempts/1/jobs')).length, 1);
});

test('audit workflow runs measurements only after successful prerequisites while retaining and reconciling evidence', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/audit.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /name: Execute configured audits and retain every result\s+if: success\(\)/u,
  );
  assert.match(workflow, /name: Retain normalized and raw evidence\s+if: always\(\)/u);
  assert.match(workflow, /report:\s+needs: execute\s+if: >-\s+always\(\)/u);
});
