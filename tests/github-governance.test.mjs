import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { githubGovernanceDoctor } from '../packages/web-platform/src/github-governance.ts';
const standard = JSON.parse(
  await readFile(new URL('../standards/ruleset.json', import.meta.url), 'utf8'),
);
const repo = {
  allow_merge_commit: false,
  allow_squash_merge: false,
  allow_rebase_merge: true,
  security_and_analysis: {
    secret_scanning: { status: 'enabled' },
    secret_scanning_push_protection: { status: 'enabled' },
  },
};
function reader(overrides = {}) {
  const values = {
    '': repo,
    '/actions/permissions': { enabled: true, sha_pinning_required: true },
    '/actions/permissions/workflow': {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: true,
    },
    '/rulesets': [{ ...standard, id: 1 }],
    '/rulesets/1': standard,
    '/vulnerability-alerts': null,
    '/automated-security-fixes': { enabled: true, paused: false },
    ...overrides,
  };
  return async (endpoint) => {
    const key = endpoint.replace('repos/LVBT/example', '');
    if (values[key] instanceof Error) throw values[key];
    return values[key];
  };
}
test('shared governance checks canonical rules and security without writing', async () => {
  const checks = await githubGovernanceDoctor(
    { repository: 'LVBT/example', ruleset: standard },
    reader(),
  );
  assert.equal(
    checks.every((c) => c.status === 'pass'),
    true,
  );
});
test('a weaker actions policy and merge settings name the exact repair', async () => {
  const checks = await githubGovernanceDoctor(
    { repository: 'LVBT/example', ruleset: standard },
    reader({
      '/actions/permissions': { enabled: true, sha_pinning_required: false },
      '': { ...repo, allow_squash_merge: true },
    }),
  );
  assert.equal(checks.find((c) => c.id === 'actions-policy').status, 'fail');
  assert.equal(checks.find((c) => c.id === 'merge-methods').status, 'fail');
});
test('unreadable security inventory cannot establish ready governance', async () => {
  const checks = await githubGovernanceDoctor(
    { repository: 'LVBT/example', ruleset: standard },
    reader({ '/vulnerability-alerts': new Error('Forbidden') }),
  );
  assert.equal(checks.find((c) => c.id === 'vulnerability-alerts').status, 'unknown');
});

test('paused or disabled Dependabot security updates require repair', async () => {
  for (const updates of [
    { enabled: true, paused: true },
    { enabled: false, paused: false },
  ]) {
    const checks = await githubGovernanceDoctor(
      { repository: 'LVBT/example', ruleset: standard },
      reader({ '/automated-security-fixes': updates }),
    );
    assert.equal(checks.find((c) => c.id === 'security-updates').status, 'fail');
  }
});

test('malformed Dependabot security update evidence cannot establish readiness', async () => {
  for (const updates of [null, {}, { enabled: true }, { enabled: 'true', paused: false }]) {
    const checks = await githubGovernanceDoctor(
      { repository: 'LVBT/example', ruleset: standard },
      reader({ '/automated-security-fixes': updates }),
    );
    assert.equal(checks.find((c) => c.id === 'security-updates').status, 'unknown');
  }
});
