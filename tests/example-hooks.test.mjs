import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';

import { copies, installedCopy } from './example.test.mjs';

// The example copies made here are removed with the ones example.test.mjs makes.
after(async () => {
  for (const copy of copies.splice(0)) await rm(copy, { recursive: true, force: true });
});

/** Run the copied repository's commit-msg hook with agent variables cleared unless given. */
function runCommitHook(repository, message, env = {}) {
  return spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, AI_AGENT: '', CLAUDECODE: '', ...env },
  });
}

test('the example commit hook enforces the scope list through the installed package', async () => {
  const repository = await installedCopy('basic');
  const message = path.join(repository, 'COMMIT_EDITMSG');

  await writeFile(message, 'chore(example): tidy\n');
  const accepted = runCommitHook(repository, message);
  assert.equal(accepted.status, 0, accepted.stderr);

  await writeFile(message, 'chore(invented): tidy\n');
  const rejected = runCommitHook(repository, message);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /scope.*invented/i);
});

test('the commit hook requires a body for feat and fix and wraps the body at 72 columns', async () => {
  const repository = await installedCopy('basic');
  const message = path.join(repository, 'COMMIT_EDITMSG');
  const hook = (env) => runCommitHook(repository, message, env);

  await writeFile(message, 'feat(example): add greeting\n');
  const noBody = hook();
  assert.equal(noBody.status, 1);
  assert.match(noBody.stderr, /needs a body/);

  await writeFile(message, `feat(example): add greeting\n\n${'x'.repeat(80)}\n`);
  const longLine = hook();
  assert.equal(longLine.status, 1);
  assert.match(longLine.stderr, /72 columns/);

  await writeFile(message, 'feat(example): add greeting\n\nGreets the visitor by name.\n');
  const accepted = hook();
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('the commit hook requires attribution when an agent drives the commit', async () => {
  const repository = await installedCopy('basic');
  const message = path.join(repository, 'COMMIT_EDITMSG');
  const hook = (env) => runCommitHook(repository, message, env);

  await writeFile(message, 'chore(example): tidy\n');
  const unattributed = hook({ CLAUDECODE: '1' });
  assert.equal(unattributed.status, 1);
  assert.match(unattributed.stderr, /without attribution/);

  await writeFile(
    message,
    'chore(example): tidy\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  );
  const attributed = hook({ CLAUDECODE: '1' });
  assert.equal(attributed.status, 0, attributed.stderr);

  await writeFile(
    message,
    'chore(example): tidy\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n\nMore prose after the footer.\n',
  );
  const misplaced = hook({ CLAUDECODE: '1' });
  assert.equal(misplaced.status, 1);
  assert.match(misplaced.stderr, /last block/);
});
