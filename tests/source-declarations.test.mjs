import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { checkFilenames } from '../packages/cli/src/lib/check/filenames.mjs';
test('standard TypeScript declarations are source conventions, extra suffixes still fail', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'lvbt-declaration-names-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    const dir = path.join(cwd, 'packages/example/src');
    mkdirSync(dir, { recursive: true });
    for (const name of ['env.d.ts', 'env.d.mts', 'env.d.cts', 'env.extra.ts'])
      writeFileSync(path.join(dir, name), '');
    const result = checkFilenames({ cwd });
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.lines.map((line) => line.split('\n')[0]),
      ['packages/example/src/env.extra.ts'],
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
