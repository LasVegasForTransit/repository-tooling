import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '..');

// Playwright writes these beside an app's configuration, so they appear under apps/* and
// packages/*, never only at the repository root.
const outputs = [
  'test-results/home-desktop/trace.zip',
  'playwright-report/index.html',
  'blob-report/report.zip',
  'playwright/.cache/index.js',
];
const sources = ['playwright.config.ts', 'tests/e2e/home.spec.ts'];

for (const name of await readdir(path.join(sourceRoot, 'examples'))) {
  test(`${name}: ignores the output Playwright writes into any app`, async () => {
    const repository = await mkdtemp(path.join(tmpdir(), `lvbt-${name}-ignores-`));
    try {
      await cp(
        path.join(sourceRoot, 'examples', name, '.gitignore'),
        path.join(repository, '.gitignore'),
      );
      assert.equal(spawnSync('git', ['init', '--quiet', repository]).status, 0);
      const ignored = (file) =>
        spawnSync('git', ['-C', repository, 'check-ignore', '--quiet', file]).status === 0;
      for (const app of ['apps/site', 'packages/example']) {
        for (const output of outputs) {
          assert.ok(ignored(`${app}/${output}`), `${app}/${output} must be ignored`);
        }
        for (const source of sources) {
          assert.ok(!ignored(`${app}/${source}`), `${app}/${source} must stay tracked`);
        }
      }
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
}
