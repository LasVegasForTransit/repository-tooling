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
  assert.match(bug, /labels:\n {2}- bug/);
  assert.match(feature, /labels:\n {2}- enhancement/);
  assert.match(config, /blank_issues_enabled: false/);
  assert.doesNotMatch(`${bug}\n${feature}`, /^title:\s*["']{2}\s*$/m);
  assert.doesNotMatch(`${bug}\n${feature}`, /transitmapper:|<!--/);
});

test('the organization registry contains every active repository', async () => {
  const registry = JSON.parse(await read('standards/repositories.json'));
  assert.deepEqual(registry.repositories.map(({ name }) => name).sort(), [
    '.github',
    'repository-tooling',
    'transit-mapper',
    'website',
  ]);
  assert.deepEqual(registry.exceptions, []);
});

test('both harness manifests publish one plugin version', async () => {
  const codex = JSON.parse(
    await read('packages/cli/plugins/lvbt-contributions/.codex-plugin/plugin.json'),
  );
  const claude = JSON.parse(
    await read('packages/cli/plugins/lvbt-contributions/.claude-plugin/plugin.json'),
  );
  assert.equal(codex.name, 'lvbt-contributions');
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
});

test('the source repository uses the TransitMapper package-manager contract', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const readme = await read('README.md');
  const agents = await read('AGENTS.md');

  assert.equal(packageJson.packageManager, 'pnpm@11.25.0');
  // Tolerant of a missing .git so `npx github:LasVegasForTransit/repository-tooling`
  // can install this package outside a checkout to bootstrap a new repository.
  assert.equal(
    packageJson.scripts.prepare,
    'git config --local core.hooksPath .githooks 2>/dev/null || true',
  );
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
  const sharedHook = await read('packages/cli/hooks/commit-msg.sh');
  const prePush = await read('packages/cli/hooks/pre-push.sh');

  assert.match(hook, /packages\/cli\/hooks\/commit-msg\.sh/);
  assert.match(sharedHook, /validate-commit-message\.mjs/);
  assert.match(prePush, /pnpm check/);
});

test('the contribution policy leaves scopes to each repository', async () => {
  const readme = await read('README.md');
  const skill = await read(
    'packages/cli/plugins/lvbt-contributions/skills/github-contribution/SKILL.md',
  );
  const scopes = await read('.lvbt/commit-scopes.txt');
  const commitTypes = await read(
    'packages/cli/plugins/lvbt-contributions/standards/commit-types.txt',
  );

  assert.match(readme, /commit scopes are optional/i);
  assert.match(readme, /\.lvbt\/commit-scopes\.txt/);
  assert.match(readme, /repository scopes are complete local\s+policy/i);
  assert.doesNotMatch(readme, /rules may add to\s+the organization standard/i);
  assert.match(skill, /\.lvbt\/commit-scopes\.txt/);
  assert.match(scopes, /^tooling$/m);
  assert.match(commitTypes, /^feat$/m);
});

test('the workspace catalog is the same baseline the example ships', async () => {
  const workspace = await read('pnpm-workspace.yaml');
  const { catalog } = JSON.parse(await read('packages/cli/catalog.json'));
  const block = workspace.slice(workspace.indexOf('catalog:\n') + 'catalog:\n'.length);
  const entries = Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^ {2}'?([^':]+)'?: (\S+)$/.exec(line))
      .filter(Boolean)
      .map(([, name, version]) => [name, version]),
  );
  assert.deepEqual(entries, catalog);
});

test('the ruleset requires only the repository Validate check', async () => {
  const ruleset = JSON.parse(await read('standards/ruleset.json'));
  const statusRule = ruleset.rules.find(({ type }) => type === 'required_status_checks');
  assert.deepEqual(statusRule.parameters.required_status_checks, [{ context: 'Validate' }]);
  assert.deepEqual(ruleset.bypass_actors, []);
});
