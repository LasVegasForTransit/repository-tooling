import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileBranchPolicy } from '../packages/cli/src/lib/platform/branch-policy.mjs';

test('setup restricts a release environment and preserves its existing approval protections', async () => {
  const environment = {
    deployment_branch_policy: null,
    protection_rules: [
      { type: 'wait_timer', wait_timer: 10 },
      {
        type: 'required_reviewers',
        prevent_self_review: true,
        reviewers: [{ type: 'Team', reviewer: { id: 23 } }],
      },
    ],
  };
  let branches = [];
  const writes = [];
  const read = async (endpoint) =>
    endpoint.endsWith('deployment-branch-policies') ? { branch_policies: branches } : environment;
  const write = async (method, endpoint, body) => {
    writes.push({ method, endpoint, body });
    if (method === 'PUT')
      Object.assign(environment, { deployment_branch_policy: body.deployment_branch_policy });
    else branches = [body];
  };
  await reconcileBranchPolicy('repos/Example/site/environments/production', 'main', {
    read,
    write,
  });
  assert.deepEqual(branches, [{ name: 'main', type: 'branch' }]);
  assert.equal(writes[0].body.wait_timer, 10);
  assert.deepEqual(writes[0].body.reviewers, [{ type: 'Team', id: 23 }]);
  assert.equal(writes[0].body.prevent_self_review, true);
  writes.length = 0;
  await reconcileBranchPolicy('repos/Example/site/environments/production', 'main', {
    read,
    write,
  });
  assert.equal(writes.length, 0);
  branches = [{ name: '*', type: 'branch' }];
  await assert.rejects(
    reconcileBranchPolicy('repos/Example/site/environments/production', 'main', { read, write }),
    /Unexpected/,
  );
  assert.equal(writes.length, 0);
});

test('setup creates a missing environment with its selected branch and no new approval gate', async () => {
  let environment = null;
  let branches = [];
  const writes = [];
  const read = async (endpoint) =>
    endpoint.endsWith('deployment-branch-policies') ? { branch_policies: branches } : environment;
  const write = async (method, endpoint, body) => {
    writes.push({ method, endpoint, body });
    if (method === 'PUT') environment = { deployment_branch_policy: body.deployment_branch_policy };
    else branches = [body];
  };
  await reconcileBranchPolicy('repos/Example/site/environments/production', 'main', {
    read,
    write,
  });
  assert.deepEqual(branches, [{ name: 'main', type: 'branch' }]);
  assert.equal(writes[0].body.wait_timer, 0);
  assert.deepEqual(writes[0].body.reviewers, []);
});
