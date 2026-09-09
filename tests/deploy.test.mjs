import assert from 'node:assert/strict';
import test from 'node:test';

import { wranglerDeployArguments } from '../packages/cli/src/lib/operate.mjs';

const commit = 'a'.repeat(40);

test('deploy records exact commit provenance and refuses conflicting remote changes', () => {
  assert.deepEqual(wranglerDeployArguments(commit, false), [
    'exec',
    'wrangler',
    'deploy',
    '--strict',
    '--message',
    `Commit ${commit}`,
  ]);
});

test('dry-run keeps provenance and adds the Wrangler dry-run flag', () => {
  assert.deepEqual(wranglerDeployArguments(commit, true), [
    'exec',
    'wrangler',
    'deploy',
    '--strict',
    '--message',
    `Commit ${commit}`,
    '--dry-run',
  ]);
});

test('deploy provenance requires a full Git commit', () => {
  assert.throws(() => wranglerDeployArguments('main', false), /full Git commit/);
});
