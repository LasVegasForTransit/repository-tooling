import assert from 'node:assert/strict';
import test from 'node:test';
import { readTooling, validateTooling } from '../packages/cli/src/lib/tooling.mjs';
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
