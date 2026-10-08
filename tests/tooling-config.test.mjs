import assert from 'node:assert/strict';
import test from 'node:test';
import { readTooling, validateTooling } from '../packages/cli/src/lib/tooling.mjs';

test('attestation compatibility declares only bounded exact old artifact records', () => {
  const record = {
    runId: '123',
    sourceCommit: 'a'.repeat(40),
    artifactId: 456,
    expiresAt: '2027-01-01T00:00:00Z',
  };
  const attestation = {
    signerWorkflow: 'LasVegasForTransit/repository-tooling/.github/workflows/release-attest.yml',
    signerCommit: 'b'.repeat(40),
    legacyArtifacts: [record],
  };
  assert.deepEqual(validateTooling({ version: 1, release: { attestation } }), []);
  assert.ok(
    validateTooling({
      version: 1,
      release: {
        attestation: {
          ...attestation,
          legacyArtifacts: Array.from({ length: 101 }, (_, index) => ({
            ...record,
            runId: String(index + 1),
            artifactId: index + 1,
          })),
        },
      },
    }).length,
  );
  for (const invalid of [
    { ...record, artifactId: 0 },
    { ...record, runId: 'main' },
    { ...record, sourceCommit: 'main' },
    { ...record, expiresAt: 'tomorrow' },
    { ...record, enabled: true },
  ])
    assert.ok(
      validateTooling({
        version: 1,
        release: { attestation: { ...attestation, legacyArtifacts: [invalid] } },
      }).length,
    );
});
test('tooling validates one declarative local/audit/release contract', () => {
  assert.deepEqual(
    validateTooling({
      version: 1,
      local: {
        env: [{ example: 'apps/site/.env.example', file: 'apps/site/.env.local' }],
        optional: [{ name: 'API_KEY', purpose: 'Press archive' }],
      },
      audits: {
        links: {
          local: {
            command: ['pnpm', 'check:links'],
            cwd: 'apps/site',
            format: 'links',
            output: '.reports/links.json',
          },
        },
      },
    }),
    [],
  );
});
test('tooling rejects unsupported versions, paths and unknown fields', () => {
  for (const v of [
    { version: 2 },
    { version: 1, release: { smoke: { path: '/health', status: 5000 } } },
    { version: 1, bootstrap: 'script' },
    { version: 1, local: { env: [{ example: '../outside', file: '.env.local' }] } },
    { version: 1, audits: { links: { local: { command: ['curl'], env: { SECRET: 42 } } } } },
  ])
    assert.ok(validateTooling(v).length);
});
test('repositories without optional tooling declarations use version1 defaults', () =>
  assert.deepEqual(readTooling('/nonexistent/lvbt-fixture'), { version: 1 }));

test('release profiles reuse field constraints and reject nested or unknown settings', () => {
  const profile = {
    artifactSource: 'typed-worker',
    typedConfig: 'cloudflare.config.ts',
    assetsDirectory: '../site/dist',
    appDirectory: 'apps/deploy',
  };
  assert.deepEqual(validateTooling({ version: 1, release: { apps: { site: profile } } }), []);
  for (const invalid of [
    { ...profile, artifactSource: 'copied-framework' },
    { ...profile, smoke: { path: '/health', status: 900 } },
    { ...profile, apps: { other: {} } },
    { ...profile, bootstrap: 'secret' },
  ])
    assert.ok(validateTooling({ version: 1, release: { apps: { site: invalid } } }).length);
});

test('release extensions use the same constraints in common config and named profiles', () => {
  const valid = {
    publicationMode: 'named-staging',
    previewOnly: true,
    publicPath: '/transit-funding/',
    previewReadOnlyBindings: ['GTFS_ARCHIVES'],
    workersDevSubdomainEnv: 'LVBT_WORKERS_DEV_SUBDOMAIN',
    attestation: {
      signerWorkflow: 'LasVegasForTransit/repository-tooling/.github/workflows/release-attest.yml',
      signerCommit: 'a'.repeat(40),
    },
  };
  for (const release of [valid, { apps: { site: valid } }])
    assert.deepEqual(validateTooling({ version: 1, release }), []);
  for (const field of [
    { publicationMode: 'custom-deployer' },
    { previewOnly: 'false' },
    { workersDevSubdomainEnv: 'not-an-env-name' },
    { publicPath: '//outside/' },
    { publicPath: '/../outside/' },
    { publicPath: '/missing-trailing-slash' },
    { previewReadOnlyBindings: ['GTFS_ARCHIVES', 'GTFS_ARCHIVES'] },
    { previewReadOnlyBindings: ['lower-case'] },
    { attestation: { ...valid.attestation, signerCommit: 'main' } },
    { attestation: { ...valid.attestation, signerWorkflow: 'untrusted/workflow' } },
  ])
    for (const release of [field, { apps: { site: field } }])
      assert.ok(validateTooling({ version: 1, release }).length);
});

test('prototype property names cannot bypass unknown-field configuration diagnostics', () => {
  for (const key of ['__proto__', 'constructor', 'toString'])
    assert.ok(validateTooling(JSON.parse(`{"version":1,"${key}":{}}`)).length);
});

test('recurring contributions declare one trusted workflow, artifact, and visible ownership', () => {
  const recurring = {
    'weekly-report': {
      workflow: '.github/workflows/weekly.yml',
      artifactName: 'lvbt-weekly-issues',
      title: 'LVBT analytics weekly report',
      type: 'feature',
      labels: ['analytics'],
      pin: true,
      adoptExisting: true,
    },
  };
  assert.deepEqual(validateTooling({ version: 1, contributions: { recurring } }), []);
  const declaration = recurring['weekly-report'];
  for (const invalid of [
    { ...declaration, workflow: '../../workflow.yml' },
    { ...declaration, artifactName: '' },
    { ...declaration, title: '' },
    { ...declaration, type: 'custom-report-template' },
    { ...declaration, labels: ['analytics', 'analytics'] },
    { ...declaration, pin: 'yes' },
    { ...declaration, adoptExisting: 'yes' },
    { ...declaration, publish: 'custom-helper' },
  ])
    assert.ok(
      validateTooling({ version: 1, contributions: { recurring: { 'weekly-report': invalid } } })
        .length,
    );
  for (const key of ['__proto__', 'constructor', '../report', 'Weekly Report']) {
    const configuration = JSON.parse(
      JSON.stringify({ version: 1, contributions: { recurring: { [key]: declaration } } }),
    );
    assert.ok(validateTooling(configuration).length);
  }
});
