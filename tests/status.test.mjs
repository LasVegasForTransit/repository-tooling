import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { applyExceptions, daysBehind, findings, pluginRef, report } from '../standards/status.ts';

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
  assert.match(output, /\| example \| v0\.4\.5 \|/);
  assert.match(output, /\| other \| unreleased \|/);
});

test('the status workflow runs daily and by hand with only its own token', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/standard-status.yml'), 'utf8');
  assert.match(workflow, /^ {2}schedule:/m);
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.match(workflow, /node standards\/status\.ts/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /secrets\./);
});
