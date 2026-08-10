import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('the pull request template stays human-readable and exact', async () => {
  const template = await read('community-health/pull_request_template.md');
  assert.equal(
    template,
    `# TL;DR

# Overview of Changes

## [subheading if needed]

## [more subheadings if needed]

# Follow-ups

- [ ] Future issue title if needed
`,
  );
  assert.doesNotMatch(template, /<!--/);
});

test('the issue forms require actionable information through native fields', async () => {
  const bug = await read('community-health/ISSUE_TEMPLATE/bug.yml');
  const feature = await read('community-health/ISSUE_TEMPLATE/feature.yml');
  const config = await read('community-health/ISSUE_TEMPLATE/config.yml');

  for (const field of ['reproduction', 'expected', 'actual']) {
    assert.match(bug, new RegExp(`id: ${field}`));
  }
  for (const field of ['problem', 'proposed-change']) {
    assert.match(feature, new RegExp(`id: ${field}`));
  }
  assert.match(bug, /labels:\n  - bug/);
  assert.match(feature, /labels:\n  - enhancement/);
  assert.match(config, /blank_issues_enabled: false/);
  assert.doesNotMatch(`${bug}\n${feature}`, /transitmapper:|<!--/);
});

test('the organization registry contains every active repository', async () => {
  const registry = JSON.parse(
    await read('standards/repositories.json'),
  );
  assert.deepEqual(
    registry.repositories.map(({ name }) => name).sort(),
    ['.github', 'repository-tooling', 'transit-mapper', 'website'],
  );
  assert.deepEqual(registry.exceptions, []);
});

test('both harness manifests publish one plugin version', async () => {
  const codex = JSON.parse(
    await read('plugins/lvbt-contributions/.codex-plugin/plugin.json'),
  );
  const claude = JSON.parse(
    await read('plugins/lvbt-contributions/.claude-plugin/plugin.json'),
  );
  assert.equal(codex.name, 'lvbt-contributions');
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
});

test('the ruleset requires only the repository Validate check', async () => {
  const ruleset = JSON.parse(await read('standards/ruleset.json'));
  const statusRule = ruleset.rules.find(
    ({ type }) => type === 'required_status_checks',
  );
  assert.deepEqual(statusRule.parameters.required_status_checks, [
    { context: 'Validate' },
  ]);
  assert.deepEqual(ruleset.bypass_actors, []);
});
