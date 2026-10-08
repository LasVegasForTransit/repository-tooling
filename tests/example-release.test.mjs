import assert from 'node:assert/strict';
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
