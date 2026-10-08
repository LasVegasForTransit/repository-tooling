import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { readReleaseConfiguration } from '../packages/web-platform/src/release-config.ts';

for (const name of ['with-astro', 'with-vite-react']) {
  test(`${name}: generated web release requires signed staging and explicit promotion`, async () => {
    const directory = path.resolve(import.meta.dirname, '../examples', name);
    const declaration = JSON.parse(await readFile(path.join(directory, '.lvbt/tooling.json')));
    assert.ok(declaration.release.attestation, 'New releases require reviewed signed proof.');
    const config = await readReleaseConfiguration(directory, {
      GITHUB_REPOSITORY: 'LasVegasForTransit/example',
      LVBT_PRODUCTION_URL: 'https://app.example.org',
      LVBT_PREVIEW_URL: 'https://preview.example.org',
      LVBT_WORKERS_DEV_SUBDOMAIN: 'reviewed-account',
    });
    assert.equal(config.workersDevSubdomain, 'reviewed-account');
    assert.notEqual(config.previewWorker, config.productionWorker);
    const deploy = await readFile(path.join(directory, '.github/workflows/deploy.yml'), 'utf8');
    assert.match(deploy, /release-attest\.yml@[a-f0-9]{40}/);
    assert.ok(deploy.includes(`release-attest.yml@${config.attestation.signerCommit}`));
    assert.match(deploy, /needs: \[build, attest\]/);
    assert.match(deploy, /attestation-prefix: attestation-app-release/);
    assert.doesNotMatch(deploy, /target: production/);
    const promote = await readFile(path.join(directory, '.github/workflows/promote.yml'), 'utf8');
    assert.match(promote, /expected-version: \$\{\{ inputs\.expected_version \}\}/);
    assert.match(promote, /attestation-prefix: attestation-app-release/);
    assert.match(promote, /target: production/);
  });
}

for (const name of ['basic', 'with-astro', 'with-vite-react']) {
  test(`${name}: reusable workflow pins belong to merged source history`, async () => {
    const directory = path.resolve(import.meta.dirname, '../examples', name);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(path.join(directory, '.github/workflows'));
    const pins = new Set();
    for (const file of files) {
      const content = await readFile(path.join(directory, '.github/workflows', file), 'utf8');
      for (const match of content.matchAll(
        /LasVegasForTransit\/repository-tooling\/\.github\/workflows\/[^@\s]+@([a-f0-9]{40})/g,
      )) {
        pins.add(match[1]);
      }
    }
    assert.ok(pins.size, 'Generated workflows must use immutable reviewed source pins.');
    for (const pin of pins) {
      const result = spawnSync('git', ['merge-base', '--is-ancestor', pin, 'v0.7.0'], {
        cwd: path.resolve(import.meta.dirname, '..'),
        encoding: 'utf8',
      });
      assert.equal(
        result.status,
        0,
        `${pin} must be reachable through a published merged release; unmerged pins cannot be resolved by Actions after rebase.`,
      );
    }
  });
}
