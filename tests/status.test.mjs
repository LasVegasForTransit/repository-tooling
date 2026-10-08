import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { applyExceptions, daysBehind, findings, pluginRef, report } from '../standards/status.ts';
import * as status from '../standards/status.ts';
import { processFindings } from '../standards/process-contract.ts';
import { standardCommandsFor } from '../packages/cli/src/lib/check/standard.mjs';

const root = path.resolve(import.meta.dirname, '..');
const day = 86_400_000;
const now = Date.parse('2026-09-27T12:00:00Z');
const releases = [
  { tag: 'v0.4.3', date: '2026-09-20T12:00:00Z' },
  { tag: 'v0.4.4', date: '2026-09-23T12:00:00Z' },
  { tag: 'v0.4.5', date: '2026-09-27T00:00:00Z' },
];
const current = (overrides = {}) => ({
  name: 'example',
  release: 'v0.4.5',
  pluginRef: 'v0.4.5',
  selfUpdating: true,
  rulesets: ['org-standard'],
  updates: [],
  ...overrides,
});
const rules = (state) => findings(state, releases, now).map(({ rule }) => rule);

test('a current repository has no findings', () => {
  assert.deepEqual(rules(current()), []);
});

test('lag counts from the first release a repository missed, not the latest', () => {
  assert.equal(daysBehind('v0.4.5', releases, now), 0);
  assert.equal(Math.round(daysBehind('v0.4.3', releases, now)), 4);
  assert.deepEqual(rules(current({ release: 'v0.4.4', pluginRef: 'v0.4.4' })), []);
  assert.deepEqual(rules(current({ release: 'v0.4.3', pluginRef: 'v0.4.3' })), ['release']);
  assert.ok(daysBehind('v0.4.4', releases, now + 4 * day) > 3);
});

test('unreleased vendoring, plugin refs, self-update, rulesets, and red updates are drift', () => {
  assert.deepEqual(rules(current({ release: null, pluginRef: null })), ['release']);
  assert.deepEqual(rules(current({ pluginRef: 'v0.4.0' })), ['plugin-ref']);
  assert.deepEqual(rules(current({ selfUpdating: false })), ['self-update']);
  assert.deepEqual(rules(current({ rulesets: [] })), ['ruleset']);
  assert.deepEqual(
    rules(
      current({
        updates: [
          { number: 7, headRefName: 'automation/repository-standard-v0.4.5', failing: true },
        ],
      }),
    ),
    ['update'],
  );
});

test('an unexpired exception silences one rule for one repository', () => {
  const found = findings(current({ pluginRef: 'v0.4.0', rulesets: [] }), releases, now);
  const registry = {
    exceptions: [
      { repository: 'example', rule: 'ruleset', reason: 'test', expires: '2026-12-31' },
      { repository: 'example', rule: 'plugin-ref', reason: 'test', expires: '2026-09-01' },
    ],
  };
  assert.deepEqual(
    applyExceptions(found, registry, '2026-09-27').map(({ rule }) => rule),
    ['plugin-ref'],
  );
});

test('the plugin ref is read from the repository-tooling marketplace', async () => {
  const settings = await readFile(path.join(root, 'examples/basic/.claude/settings.json'), 'utf8');
  assert.match(pluginRef(settings) ?? '', /^v\d+\.\d+\.\d+$/);
  assert.equal(pluginRef(null), null);
  assert.equal(pluginRef('{}'), null);
});

test('the report lists every repository', () => {
  const output = report([current(), current({ name: 'other', release: null })], 'v0.4.5', []);
  assert.match(output, /\| example \| — \/ — \| v0\.4\.5 \|/);
  assert.match(output, /\| other \| — \/ — \| unreleased \|/);
});

test('the status workflow runs daily and by hand with only its own token', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/standard-status.yml'), 'utf8');
  assert.match(workflow, /^ {2}schedule:/m);
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.match(workflow, /node standards\/status\.ts/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /secrets\./);
});

const processSnapshot = (overrides = {}) => ({
  name: 'example',
  kind: 'consumer',
  files: {
    'package.json': JSON.stringify({ scripts: standardCommandsFor({ vendored: true }) }),
    '.lvbt/web-platform/packages/cli/src/cli.mjs': '',
    'pnpm-workspace.yaml': 'verifyDepsBeforeRun: false\n',
    '.lvbt/web-platform.json': JSON.stringify({
      commit: 'a'.repeat(40),
      contentHash: 'b'.repeat(64),
    }),
    '.lvbt/tooling.json': JSON.stringify({
      version: 1,
      audits: { workflow: '.github/workflows/audits.yml' },
    }),
    '.github/workflows/audits.yml':
      '  schedule:\n  workflow_dispatch:\npnpm run audit --target production\npnpm run audit report --input report.json\n',
  },
  paths: [],
  ...overrides,
});

test('new process contract gaps warn without weakening existing release and ruleset errors', () => {
  const snapshot = processSnapshot();
  snapshot.files['package.json'] = JSON.stringify({ scripts: { check: 'pnpm lint' } });
  snapshot.files['pnpm-workspace.yaml'] = 'packages: []\n';
  const warnings = processFindings(snapshot);
  assert.ok(warnings.some(({ rule }) => rule === 'command:bootstrap'));
  assert.ok(warnings.some(({ rule }) => rule === 'command:check'));
  assert.ok(warnings.some(({ rule }) => rule === 'preflight-install'));
  assert.ok(warnings.every(({ severity }) => severity === 'warning'));
  assert.equal(status.hasErrors(warnings), false);
  assert.equal(
    status.hasErrors([...warnings, ...findings(current({ rulesets: [] }), releases, now)]),
    true,
  );
});

test('declared audits and releases need shared workflow evidence at the inventoried commit', () => {
  const snapshot = processSnapshot();
  snapshot.files['.lvbt/tooling.json'] = JSON.stringify({
    version: 1,
    audits: { workflow: '.github/workflows/missing.yml' },
    release: {
      stagingWorkflow: { path: '.github/workflows/stage.yml' },
      promotionWorkflow: { file: 'promote.yml' },
    },
  });
  const rules = processFindings(snapshot).map(({ rule }) => rule);
  assert.ok(rules.includes('audit-workflow'));
  assert.ok(rules.includes('staging-workflow'));
  assert.ok(rules.includes('promotion-workflow'));
});

test('source command contracts and non-Node community repositories are exempt from consumer process warnings', () => {
  const files = { 'package.json': '{"scripts":{"check":"pnpm lint"}}' };
  assert.deepEqual(processFindings(processSnapshot({ kind: 'source', files })), []);
  assert.deepEqual(processFindings(processSnapshot({ files: {} })), []);
});

test('remote raw files are requested at the same pinned commit rather than a changing default branch', () => {
  const calls = [];
  assert.equal(typeof status.readRaw, 'function');
  const result = status.readRaw('example', 'package.json', 'c'.repeat(40), (args) => {
    calls.push(args);
    return '{}';
  });
  assert.equal(result, '{}');
  assert.equal(
    calls[0][1],
    `repos/LasVegasForTransit/example/contents/package.json?ref=${'c'.repeat(40)}`,
  );
});

test('shared configuration inheritance and adopted hooks are checked without guessing setup filenames', () => {
  const snapshot = processSnapshot();
  snapshot.files['prettier.config.js'] =
    "export { default } from '@lasvegasfortransit/prettier-config';";
  snapshot.files['tsconfig.json'] = '{"extends":"@lasvegasfortransit/typescript-config/node.json"}';
  snapshot.files['apps/app/tsconfig.json'] = '{"extends":"../../tsconfig.json"}';
  snapshot.files['turbo/generators/eslint.config.ts.hbs'] = 'unrendered template';
  snapshot.files['.githooks/pre-commit'] = 'changed';
  snapshot.files['.lvbt/web-platform/examples/with-astro/.githooks/pre-commit'] = 'shared';
  assert.ok(
    processFindings(snapshot).some(
      ({ rule, message }) => rule === 'owned-file' && message.includes('pre-commit'),
    ),
  );
  assert.equal(processFindings(snapshot).filter(({ rule }) => rule === 'shared-config').length, 0);
  snapshot.files['apps/app/tsconfig.json'] = '{"compilerOptions":{"strict":true}}';
  assert.ok(
    processFindings(snapshot).some(
      ({ rule, message }) => rule === 'shared-config' && message.includes('apps/app/tsconfig.json'),
    ),
  );
});

test('declaring deployment without a shared release declaration produces a migration warning', () => {
  const snapshot = processSnapshot();
  snapshot.files['package.json'] = JSON.stringify({
    scripts: { ...standardCommandsFor({ vendored: true }), deploy: 'lvbt deploy' },
  });
  assert.ok(
    processFindings(snapshot).some(
      ({ rule, severity }) => rule === 'release-config' && severity === 'warning',
    ),
  );
});

test('an unavailable file present in the pinned tree cannot become a missing-file migration finding', () => {
  assert.equal(typeof status.readState, 'function');
  const read = (args) => {
    const endpoint = args[1];
    if (endpoint === 'repos/LasVegasForTransit/example') return '{"default_branch":"main"}';
    if (endpoint.includes('/commits/')) return JSON.stringify({ sha: 'd'.repeat(40) });
    if (endpoint.includes('/git/trees/'))
      return '{"truncated":false,"tree":[{"path":"package.json","type":"blob"}]}';
    throw new Error('GitHub contents unavailable');
  };
  assert.throws(
    () => status.readState({ name: 'example', kind: 'consumer', requiredStatus: 'Validate' }, read),
    /Cannot inventory.*package.json/,
  );
});
