import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, chmod, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(sourceRoot, 'bin/cli.mjs');
const pinFile = '.lvbt/repository-tooling.json';

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function emptyRepository(name = 'example') {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-lifecycle-'));
  git(directory, 'init', '-q', '-b', 'main');
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ name, private: true, packageManager: 'pnpm@11.15.1' }, null, 2)}\n`,
  );
  return directory;
}

async function initialized(scopes = 'core,dx') {
  const repository = await emptyRepository();
  const result = run(['init', '--source', sourceRoot, '--ref', 'v9.9.9', '--scopes', scopes], repository);
  assert.equal(result.status, 0, result.stderr);
  return repository;
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

test('init vendors the managed files and records a verifiable pin', async () => {
  const repository = await initialized();

  for (const file of [
    'plugins/lvbt-contributions/scripts/github-create.mjs',
    '.lvbt/repository-tooling/cli.mjs',
    '.githooks/commit-msg',
    '.githooks/prepare-commit-msg',
    '.agents/plugins/marketplace.json',
    '.codex/hooks.json',
    '.github/actions/setup-node-pnpm/action.yml',
  ]) {
    assert.ok(await exists(path.join(repository, file)), `${file} should be vendored`);
  }

  const pin = await json(path.join(repository, pinFile));
  assert.equal(pin.schemaVersion, 2);
  assert.equal(pin.repository, 'LasVegasForTransit/repository-tooling');
  assert.equal(pin.ref, 'v9.9.9');
  assert.equal(pin.commit, git(sourceRoot, 'rev-parse', 'HEAD'));
  assert.equal(pin.plugin, 'lvbt-contributions');
  assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  assert.ok(pin.managedPaths.includes('.lvbt/repository-tooling'));

  const check = run(['check'], repository);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /v9\.9\.9/);
});

test('init scaffolds the repository-owned files once and leaves them alone afterwards', async () => {
  const repository = await initialized('network,operations');

  const scopes = await readFile(path.join(repository, '.lvbt/commit-scopes.txt'), 'utf8');
  assert.match(scopes, /^network$/m);
  assert.match(scopes, /^operations$/m);

  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /name: Validate/);
  assert.match(workflow, /run: pnpm check/);

  const packageJson = await json(path.join(repository, 'package.json'));
  assert.equal(packageJson.scripts.prepare, 'git config --local core.hooksPath .githooks');
  assert.equal(
    packageJson.scripts['check:repository-tooling'],
    'node .lvbt/repository-tooling/cli.mjs check',
  );
  assert.match(packageJson.scripts['repository-tooling:update'], /cli\.mjs update/);

  const settings = await json(path.join(repository, '.claude/settings.json'));
  assert.equal(settings.extraKnownMarketplaces.lvbt.source.ref, 'v9.9.9');
  assert.equal(settings.enabledPlugins['lvbt-contributions@lvbt'], true);

  await writeFile(path.join(repository, 'AGENTS.md'), '# Custom agents file\n\ngithub-contribution github-create.mjs\n');
  const again = run(['update', '--source', sourceRoot, '--ref', 'v9.9.10'], repository);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(
    await readFile(path.join(repository, 'AGENTS.md'), 'utf8'),
    '# Custom agents file\n\ngithub-contribution github-create.mjs\n',
  );
});

test('init refuses to run without the repository scopes', async () => {
  const repository = await emptyRepository();
  const result = run(['init', '--source', sourceRoot, '--ref', 'v9.9.9'], repository);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--scopes/);
});

test('check fails when a managed file is edited locally', async () => {
  const repository = await initialized();
  const hook = path.join(repository, '.githooks/commit-msg');
  await writeFile(hook, `${await readFile(hook, 'utf8')}\n# local edit\n`);

  const result = run(['check'], repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /differs from the pinned release/);
  assert.match(result.stderr, /\.githooks\/commit-msg/);
});

test('check fails when the harness ref drifts from the pin', async () => {
  const repository = await initialized();
  const settingsFile = path.join(repository, '.claude/settings.json');
  const settings = await json(settingsFile);
  settings.extraKnownMarketplaces.lvbt.source.ref = 'v0.0.1';
  await writeFile(settingsFile, JSON.stringify(settings, null, 2));

  const result = run(['check'], repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Claude does not load the pinned/);
});

test('check fails when local GitHub templates shadow the organization defaults', async () => {
  const repository = await initialized();
  await writeFile(path.join(repository, '.github/pull_request_template.md'), '# Mine\n');

  const result = run(['check'], repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shadow the organization defaults/);
});

test('check fails when a managed hook is not executable', async () => {
  const repository = await initialized();
  await chmod(path.join(repository, '.githooks/prepare-commit-msg'), 0o644);

  const result = run(['check'], repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prepare-commit-msg.*executable/);
});

test('update replaces managed files from the new release and rewrites the pin', async () => {
  const repository = await initialized();
  const before = await json(path.join(repository, pinFile));

  // Copy the working tree rather than cloning: a clone only sees commits, and
  // the templates under test may be uncommitted while they are being written.
  const fork = await mkdtemp(path.join(tmpdir(), 'lvbt-source-'));
  await cp(sourceRoot, fork, {
    recursive: true,
    filter: (file) => !/(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(path.relative(sourceRoot, file)),
  });
  git(fork, 'init', '-q', '-b', 'main');
  const hooksFile = path.join(fork, 'templates/managed/.codex/hooks.json');
  await writeFile(hooksFile, `${JSON.stringify({ ...(await json(hooksFile)), note: 'newer release' }, null, 2)}\n`);
  git(fork, 'add', '.');
  git(fork, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'chore(tooling): change hook');

  const result = run(['update', '--source', fork, '--ref', 'v9.9.10'], repository);
  assert.equal(result.status, 0, result.stderr);

  const after = await json(path.join(repository, pinFile));
  assert.equal(after.ref, 'v9.9.10');
  assert.equal(after.commit, git(fork, 'rev-parse', 'HEAD'));
  assert.notEqual(after.sha256, before.sha256);
  assert.match(await readFile(path.join(repository, '.codex/hooks.json'), 'utf8'), /newer release/);
  assert.equal((await json(path.join(repository, '.claude/settings.json'))).extraKnownMarketplaces.lvbt.source.ref, 'v9.9.10');

  const check = run(['check'], repository);
  assert.equal(check.status, 0, check.stderr);
});

test('update removes managed files the new release no longer ships', async () => {
  const repository = await initialized();
  const stale = path.join(repository, 'plugins/lvbt-contributions/scripts/obsolete.mjs');
  await writeFile(stale, 'export {};\n');

  const result = run(['update', '--source', sourceRoot, '--ref', 'v9.9.9'], repository);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await exists(stale), false);
});

test('a dry run reports the planned changes and writes nothing', async () => {
  const repository = await emptyRepository();
  const result = run(['init', '--source', sourceRoot, '--ref', 'v9.9.9', '--scopes', 'core', '--dry-run'], repository);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /plugins\/lvbt-contributions/);
  assert.match(result.stdout, /\.lvbt\/commit-scopes\.txt/);
  assert.equal(await exists(path.join(repository, pinFile)), false);
  assert.equal(await exists(path.join(repository, 'plugins')), false);
});

test('the vendored cli runs check from inside the consumer', async () => {
  const repository = await initialized();
  const vendored = spawnSync(process.execPath, ['.lvbt/repository-tooling/cli.mjs', 'check'], {
    cwd: repository,
    encoding: 'utf8',
  });

  assert.equal(vendored.status, 0, vendored.stderr);
});

test('the managed commit hook runs the repository extension after the shared validator', async () => {
  const repository = await initialized();
  await mkdir(path.join(repository, '.lvbt/hooks'), { recursive: true });
  const extension = path.join(repository, '.lvbt/hooks/commit-msg');
  await writeFile(extension, '#!/usr/bin/env sh\necho "extension ran" >&2\nexit 3\n');
  await chmod(extension, 0o755);
  const message = path.join(repository, 'COMMIT_EDITMSG');
  await writeFile(message, 'chore(core): tidy\n');

  const accepted = spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(accepted.status, 3, accepted.stderr);
  assert.match(accepted.stderr, /extension ran/);

  await writeFile(message, 'chore(invented): tidy\n');
  const rejected = spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(rejected.status, 1);
  assert.doesNotMatch(rejected.stderr, /extension ran/);
});

test('the source repository consumes the same files it manages for consumers', async () => {
  for (const file of [
    '.githooks/commit-msg',
    '.githooks/prepare-commit-msg',
    '.agents/plugins/marketplace.json',
    '.github/actions/setup-node-pnpm/action.yml',
  ]) {
    assert.equal(
      await readFile(path.join(sourceRoot, file), 'utf8'),
      await readFile(path.join(sourceRoot, 'templates/managed', file), 'utf8'),
      `${file} drifted between the source repository and the managed template`,
    );
  }
});

test('the package exposes the lifecycle cli as its bin', async () => {
  const packageJson = await json(path.join(sourceRoot, 'package.json'));
  assert.equal(packageJson.bin['lvbt-repository-tooling'], 'bin/cli.mjs');
  assert.equal(packageJson.version, (await json(path.join(sourceRoot, 'plugins/lvbt-contributions/.claude-plugin/plugin.json'))).version);
});
