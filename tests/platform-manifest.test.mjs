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
  readCloudflareConfig,
  validateManifest,
} from '../packages/cli/src/lib/platform/manifest.mjs';
import { unsupportedKeywords } from '../packages/cli/src/lib/platform/schema.mjs';
import { observePlatform } from '../packages/cli/src/lib/platform/observe.mjs';
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

test('a cf project can name its canonical config without a Wrangler config', () => {
  assert.deepEqual(
    errorsAfter((manifest) => {
      manifest.cloudflare.cloudflareConfig = 'cloudflare.config.ts';
    }),
    [],
  );
});

test('email DNS profiles accept Forge explicitly and reject unknown layouts', () => {
  assert.deepEqual(
    errorsAfter((manifest) => {
      manifest.email[0].dnsProfile = 'forge';
    }),
    [],
  );
  const errors = errorsAfter((manifest) => {
    manifest.email[0].dnsProfile = 'unknown';
  });
  assert.ok(errors.some((error) => error.includes('dnsProfile')));
});

test('a cf project manifest rejects a config filename cf cannot discover', () => {
  const errors = errorsAfter((manifest) => {
    manifest.cloudflare.cloudflareConfig = 'production.config.ts';
  });
  assert.ok(errors.some((error) => error.includes('cloudflareConfig')));
});

test('cf preflight reads the canonical binding declarations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-config-'));
  try {
    const config = path.join(root, 'cloudflare.config.ts');
    await writeFile(
      config,
      `export default {
        worker: { name: 'example', env: {
          TURNSTILE_SITE_KEY: {type: 'text', value: '0xSITEKEY'},
          DB: {type: 'd1', name: 'example', id: 'db-1'},
          PHOTOS: {type: 'r2', name: 'example-photos'},
          RESEND_API_KEY: {type: 'secret'},
        }}
      };`,
    );
    assert.deepEqual(await readCloudflareConfig(config), {
      name: 'example',
      vars: { TURNSTILE_SITE_KEY: '0xSITEKEY' },
      d1: [{ binding: 'DB', name: 'example', id: 'db-1', migrationsTable: 'd1_migrations' }],
      r2: [{ binding: 'PHOTOS', name: 'example-photos' }],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('production preflight does not inspect a retained Wrangler mirror', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-cf-preflight-'));
  try {
    const site = path.join(root, 'apps', 'site');
    const deploy = path.join(root, 'apps', 'deploy');
    await mkdir(site, { recursive: true });
    await mkdir(deploy, { recursive: true });
    await writeFile(path.join(site, 'wrangler.jsonc'), '{"name":"stale-preview"}');
    await writeFile(
      path.join(deploy, 'cloudflare.config.ts'),
      "export default {worker:{name:'example',env:{DB:{type:'d1',name:'example',id:'db-1'}}}};",
    );
    const manifest = sampleManifest();
    manifest.cloudflare.cloudflareConfig = '../deploy/cloudflare.config.ts';
    const state = await observePlatform({
      manifest,
      directory: site,
      apis: {},
      run: () => ({ status: 1, stdout: '', stderr: '' }),
      resolve: async () => [],
    });
    assert.equal(state.config.ok, true);
    assert.equal(state.config.value.name, 'example');
    assert.deepEqual(state.config.value.d1, [
      { binding: 'DB', name: 'example', id: 'db-1', migrationsTable: 'd1_migrations' },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test('a generated value is a credential, so it cannot be marked not sensitive', () => {
  const errors = errorsAfter((manifest) => {
    manifest.secrets.find((secret) => secret.generate).sensitive = false;
  });
  assert.ok(errors.some((error) => error.includes('SIGNING_SECRET')));
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
