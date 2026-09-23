import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkPlatform } from '../packages/cli/src/lib/check/platform.mjs';
import {
  findManifests,
  parseJsonc,
  platformSchema,
  validateManifest,
} from '../packages/cli/src/lib/platform/manifest.mjs';
import { unsupportedKeywords } from '../packages/cli/src/lib/platform/schema.mjs';
import { sampleManifest } from './support/platform.mjs';

/** Validate a copy of the sample after `change` edits it. */
function errorsAfter(change) {
  const manifest = sampleManifest();
  change(manifest);
  return validateManifest(manifest);
}

test('a manifest that uses every section is valid', () => {
  assert.deepEqual(validateManifest(sampleManifest()), []);
});

test('the schema uses only keywords the validator enforces', () => {
  assert.deepEqual(unsupportedKeywords(platformSchema()), []);
});

test('missing and unknown fields are reported with where they are', () => {
  const missing = errorsAfter((manifest) => delete manifest.cloudflare.worker);
  assert.ok(missing.some((error) => error.startsWith('$.cloudflare') && error.includes('worker')));
  const unknownField = errorsAfter((manifest) => (manifest.cloudflare.region = 'us'));
  assert.ok(unknownField.some((error) => error.includes('region')));
});

test('secret and var names must be environment names', () => {
  const errors = errorsAfter((manifest) => (manifest.secrets[0].name = 'resend-key'));
  assert.ok(errors.some((error) => error.startsWith('$.secrets[0].name')));
});

test('a resource cannot feed a secret the manifest does not declare', () => {
  const errors = errorsAfter((manifest) => {
    manifest.secrets = manifest.secrets.filter((secret) => secret.name !== 'TURNSTILE_SECRET');
  });
  assert.ok(errors.some((error) => error.includes('TURNSTILE_SECRET')));
});

test('a value a person types in needs steps that say where to find it', () => {
  const errors = errorsAfter((manifest) => delete manifest.secrets[0].steps);
  assert.ok(errors.some((error) => error.includes('RESEND_API_KEY')));
});

test('a name cannot be both required and forbidden', () => {
  const errors = errorsAfter((manifest) =>
    manifest.forbidden.push({ name: 'RESEND_API_KEY', reason: 'contradiction' }),
  );
  assert.ok(errors.some((error) => error.includes('RESEND_API_KEY')));
});

test('a Google group needs the Google Workspace identity provider', () => {
  const errors = errorsAfter((manifest) => (manifest.access[0].identityProvider = 'onetimepin'));
  assert.ok(errors.some((error) => error.includes('google-apps')));
});

test('a GitHub target needs the repository that holds the environment', () => {
  const errors = errorsAfter((manifest) => delete manifest.github);
  assert.ok(errors.some((error) => error.includes('github.repository')));
});

test('a secret pattern must be a regular expression', () => {
  const errors = errorsAfter((manifest) => (manifest.secrets[0].pattern = '(unclosed'));
  assert.ok(errors.some((error) => error.includes('RESEND_API_KEY')));
});

test('wrangler.jsonc comments and trailing commas parse, and strings stay whole', () => {
  const parsed = parseJsonc(`{
    // the Worker
    "name": "example", /* inline */
    "vars": { "HOME": "https://example.org//path", "LIST": "a,]" },
    "routes": [1, 2,],
  }`);
  assert.deepEqual(parsed, {
    name: 'example',
    vars: { HOME: 'https://example.org//path', LIST: 'a,]' },
    routes: [1, 2],
  });
});

test('lvbt check platform finds manifests at the root and under apps/, and fails on errors', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-platform-'));
  try {
    await mkdir(path.join(root, 'apps/site'), { recursive: true });
    await mkdir(path.join(root, 'apps/docs'), { recursive: true });
    await writeFile(path.join(root, 'apps/site/platform.json'), JSON.stringify(sampleManifest()));
    assert.deepEqual(findManifests(root), [path.join('apps', 'site', 'platform.json')]);
    assert.equal(checkPlatform({ cwd: root }).ok, true);

    const broken = { ...sampleManifest(), version: 2 };
    await writeFile(path.join(root, 'platform.json'), JSON.stringify(broken));
    const result = checkPlatform({ cwd: root });
    assert.equal(result.ok, false);
    assert.ok(result.lines.some((line) => line.includes('version')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a repository without a manifest passes the platform check', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-platform-'));
  try {
    assert.equal(checkPlatform({ cwd: root }).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
