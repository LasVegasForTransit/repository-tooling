import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared release builders require explicit opt-in before downloading LFS objects', async () => {
  for (const name of ['release-build', 'release-pr-preview-build']) {
    const source = await readFile(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      'utf8',
    );
    assert.match(
      source,
      /checkout-lfs:\n\s+description: [^\n]+\n\s+type: boolean\n\s+default: false/,
    );
    const checkouts = [...source.matchAll(/uses: actions\/checkout@/g)];
    const policies = [...source.matchAll(/lfs: \$\{\{ inputs.checkout-lfs \}\}/g)];
    assert.equal(policies.length, checkouts.length);
    assert.doesNotMatch(source, /lfs:\s*true/);
  }
});
