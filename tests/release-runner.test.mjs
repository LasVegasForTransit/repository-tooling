import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRelease } from '../packages/cli/src/lib/release/runner.mjs';

test('artifact-only manifest generation reaches the signing command without app configuration', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-release-runner-'));
  try {
    await assert.rejects(runRelease({ cwd, mode: 'attestation', args: ['manifest'] }), (error) => {
      assert.doesNotMatch(error.message, /Configure release/);
      return true;
    });
    await assert.rejects(
      runRelease({ cwd, mode: 'attestation', args: ['verify'] }),
      /Configure release/,
    );
    await assert.rejects(
      runRelease({ cwd, mode: 'worker-release', args: ['activate'] }),
      /Configure release/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
