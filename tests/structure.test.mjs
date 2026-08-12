import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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

# Follow-ups
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
  assert.doesNotMatch(`${bug}\n${feature}`, /^title:\s*["']{2}\s*$/m);
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

test('the source repository uses the TransitMapper package-manager contract', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const readme = await read('README.md');
  const agents = await read('AGENTS.md');

  assert.equal(packageJson.packageManager, 'pnpm@11.15.1');
  assert.equal(packageJson.scripts.prepare, 'git config --local core.hooksPath .githooks');
  await access(path.join(root, 'pnpm-lock.yaml'));
  assert.match(readme, /pnpm check/);
  assert.doesNotMatch(readme, /npm run check/);
  assert.match(agents, /pnpm check/);
  assert.doesNotMatch(agents, /npm run check/);
});

test('continuous integration uses the same pnpm setup contract', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  const setup = await read('.github/actions/setup-node-pnpm/action.yml');

  assert.match(workflow, /uses: \.\/\.github\/actions\/setup-node-pnpm/);
  assert.match(workflow, /run: pnpm check/);
  assert.doesNotMatch(workflow, /npm run check/);
  assert.match(setup, /pnpm\/action-setup@/);
  assert.match(setup, /cache: pnpm/);
  assert.match(setup, /pnpm install --frozen-lockfile/);
});

test('the source repository installs the shared commit-subject validator', async () => {
  const hook = await read('.githooks/commit-msg');
  const prePush = await read('.githooks/pre-push');

  assert.match(hook, /validate-commit-subject\.mjs/);
  assert.match(prePush, /pnpm check/);
});

test('the contribution policy publishes one closed list of scopes', async () => {
  const readme = await read('README.md');
  const skill = await read(
    'plugins/lvbt-contributions/skills/github-contribution/SKILL.md',
  );

  assert.match(
    readme,
    /`web`, `worker`, `core`, `pwa`, `tooling`, `ci`, `deps`, and `repo`/,
  );
  assert.match(readme, /commit scopes are optional/i);
  assert.match(skill, /`web`, `worker`, `core`, `pwa`, `tooling`, `ci`, `deps`, and `repo`/);
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
