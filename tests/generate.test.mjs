import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(sourceRoot, 'packages/repository-tooling/src/cli.mjs');
const toolingVersion = JSON.parse(
  await readFile(path.join(sourceRoot, 'packages/repository-tooling/package.json'), 'utf8'),
).version;

const sharedPackages = [
  'repository-tooling',
  'tsconfig',
  'eslint-config',
  'prettier-config',
  'vitest-config',
];

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
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

async function emptyRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-generate-'));
  git(directory, 'init', '-q', '-b', 'main');
  await writeFile(
    path.join(directory, 'package.json'),
    '{\n  "name": "@lvbt/example",\n  "private": true\n}\n',
  );
  return directory;
}

/**
 * Stand in for `pnpm install`: link the workspace packages and the tools the
 * source repository already has installed, so a generated repository can run
 * its own check without touching the network.
 */
async function linkDependencies(repository) {
  const modules = path.join(repository, 'node_modules');
  await mkdir(path.join(modules, '@lvbt'), { recursive: true });
  for (const name of sharedPackages) {
    await symlink(path.join(sourceRoot, 'packages', name), path.join(modules, '@lvbt', name));
  }
  const sourceModules = path.join(sourceRoot, 'node_modules');
  for (const entry of await readdir(sourceModules)) {
    if (entry.startsWith('.') || entry === '@lvbt') continue;
    if (entry.startsWith('@')) {
      await mkdir(path.join(modules, entry), { recursive: true });
      for (const scoped of await readdir(path.join(sourceModules, entry))) {
        const target = path.join(modules, entry, scoped);
        if (!(await exists(target))) await symlink(path.join(sourceModules, entry, scoped), target);
      }
    } else if (!(await exists(path.join(modules, entry)))) {
      await symlink(path.join(sourceModules, entry), path.join(modules, entry));
    }
  }
}

async function generated(profile = 'package', scopes = 'core,dx') {
  const repository = await emptyRepository();
  const result = run(['init', '--profile', profile, '--scopes', scopes], repository);
  assert.equal(result.status, 0, result.stderr);
  return repository;
}

async function allFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(root, absolute));
    }
  }
  await walk(root);
  return files.sort();
}

test('init ejects a conventional repository with no tooling bookkeeping', async () => {
  const repository = await generated();

  for (const file of [
    '.githooks/commit-msg',
    '.githooks/prepare-commit-msg',
    '.githooks/pre-push',
    '.codex/hooks.json',
    '.agents/plugins/marketplace.json',
    '.claude/settings.json',
    '.github/workflows/ci.yml',
    '.github/actions/setup-node-pnpm/action.yml',
    '.github/renovate.json',
    '.editorconfig',
    '.gitignore',
    '.lvbt/commit-scopes.txt',
    'AGENTS.md',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'eslint.config.mjs',
    'prettier.config.mjs',
    'vitest.config.mjs',
    'src/index.ts',
    'tests/index.test.ts',
  ]) {
    assert.ok(await exists(path.join(repository, file)), `${file} should be generated`);
  }

  assert.equal(await exists(path.join(repository, '.lvbt/repository-tooling.json')), false);
  assert.equal(await exists(path.join(repository, 'plugins')), false);

  for (const hook of ['commit-msg', 'prepare-commit-msg', 'pre-push']) {
    const mode = (await stat(path.join(repository, '.githooks', hook))).mode;
    assert.ok(mode & 0o111, `${hook} must be executable`);
  }

  for (const file of await allFiles(repository)) {
    const content = await readFile(path.join(repository, file), 'utf8');
    assert.doesNotMatch(
      content,
      /\{\{[a-zA-Z]+\}\}/,
      `${file} still contains a template placeholder`,
    );
  }
});

test('init wires the repository to the shared packages through ordinary dependencies', async () => {
  const repository = await generated();
  const packageJson = await json(path.join(repository, 'package.json'));

  assert.equal(packageJson.name, '@lvbt/example');
  assert.match(packageJson.packageManager, /^pnpm@11\./);
  for (const name of sharedPackages) {
    assert.equal(
      packageJson.devDependencies[`@lvbt/${name}`],
      `github:LasVegasForTransit/repository-tooling#v${toolingVersion}&path:/packages/${name}`,
    );
  }
  for (const tool of ['typescript', 'eslint', 'prettier', 'vitest', '@types/node']) {
    assert.equal(packageJson.devDependencies[tool], 'catalog:');
  }
  assert.equal(packageJson.scripts.prepare, 'git config --local core.hooksPath .githooks');
  assert.equal(
    packageJson.scripts.check,
    'pnpm format:check && pnpm lint && pnpm typecheck && pnpm test',
  );
  for (const script of ['lint', 'format', 'format:check', 'typecheck', 'test']) {
    assert.ok(packageJson.scripts[script], `script ${script} should be generated`);
  }

  const workspace = await readFile(path.join(repository, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(workspace, /^catalog:$/m);
  assert.match(workspace, /^ {2}typescript: \d/m);

  assert.equal(
    (await json(path.join(repository, '.claude/settings.json'))).extraKnownMarketplaces.lvbt.source
      .ref,
    `v${toolingVersion}`,
  );
  assert.match(
    await readFile(path.join(repository, '.agents/plugins/marketplace.json'), 'utf8'),
    /node_modules\/@lvbt\/repository-tooling\/plugins\/lvbt-contributions/,
  );
  assert.match(
    await readFile(path.join(repository, 'tsconfig.json'), 'utf8'),
    /@lvbt\/tsconfig\/node\.json/,
  );
  assert.match(
    await readFile(path.join(repository, 'eslint.config.mjs'), 'utf8'),
    /@lvbt\/eslint-config/,
  );
});

test('init preserves what the repository already declares', async () => {
  const repository = await emptyRepository();
  await writeFile(
    path.join(repository, 'package.json'),
    JSON.stringify(
      {
        name: '@lvbt/example',
        private: true,
        packageManager: 'pnpm@11.15.1',
        scripts: { prepare: 'echo custom', dev: 'vite' },
        devDependencies: { vite: '6.4.3' },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(repository, 'AGENTS.md'), '# Mine\n');
  const result = run(['init', '--profile', 'package', '--scopes', 'core'], repository);
  assert.equal(result.status, 0, result.stderr);

  const packageJson = await json(path.join(repository, 'package.json'));
  assert.equal(packageJson.packageManager, 'pnpm@11.15.1');
  assert.equal(packageJson.scripts.dev, 'vite');
  assert.equal(
    packageJson.scripts.prepare,
    'git config --local core.hooksPath .githooks && echo custom',
  );
  assert.equal(packageJson.devDependencies.vite, '6.4.3');
  assert.equal(await readFile(path.join(repository, 'AGENTS.md'), 'utf8'), '# Mine\n');
  assert.match(result.stdout, /skip {4}AGENTS\.md/);
});

test('init with --local links the packages from a checkout for pre-release work', async () => {
  const repository = await emptyRepository();
  const result = run(
    ['init', '--profile', 'package', '--scopes', 'core', '--local', sourceRoot],
    repository,
  );
  assert.equal(result.status, 0, result.stderr);

  const packageJson = await json(path.join(repository, 'package.json'));
  // pnpm resolves link: paths from the real repository directory, which on
  // macOS differs from the tmpdir alias (/var vs /private/var).
  assert.equal(
    packageJson.devDependencies['@lvbt/tsconfig'],
    `link:${path.relative(await realpath(repository), path.join(sourceRoot, 'packages/tsconfig'))}`,
  );
});

test('init refuses to run without a profile or scopes', async () => {
  const repository = await emptyRepository();
  assert.equal(run(['init', '--scopes', 'core'], repository).status, 2);
  assert.equal(run(['init', '--profile', 'package'], repository).status, 2);
  assert.equal(run(['init', '--profile', 'spaceship', '--scopes', 'core'], repository).status, 2);
});

test('init refuses to run inside a tooling source checkout', async () => {
  const fork = await mkdtemp(path.join(tmpdir(), 'lvbt-source-'));
  await cp(sourceRoot, fork, {
    recursive: true,
    filter: (file) =>
      !/(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(path.relative(sourceRoot, file)),
  });
  const result = run(['init', '--profile', 'package', '--scopes', 'core'], fork);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /source checkout/);
  assert.ok(await exists(path.join(fork, 'packages/repository-tooling/src/cli.mjs')));
});

test('a dry run reports the plan and writes nothing', async () => {
  const repository = await emptyRepository();
  const result = run(['init', '--profile', 'package', '--scopes', 'core', '--dry-run'], repository);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /write {3}eslint\.config\.mjs/);
  assert.equal(await exists(path.join(repository, 'eslint.config.mjs')), false);
});

test('diff reports drift from the standard and apply restores a file', async () => {
  const repository = await generated();
  const clean = run(['diff'], repository);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /matches the standard/);

  const config = path.join(repository, 'eslint.config.mjs');
  await writeFile(config, 'export default [];\n');
  const drifted = run(['diff'], repository);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stdout, /eslint\.config\.mjs/);

  const applied = run(['apply', 'eslint.config.mjs'], repository);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(await readFile(config, 'utf8'), /@lvbt\/eslint-config/);
  assert.equal(run(['diff'], repository).status, 0);
});

test('the generated commit hook enforces the repository scopes through the installed package', async () => {
  const repository = await generated('package', 'core,dx');
  await linkDependencies(repository);
  const message = path.join(repository, 'COMMIT_EDITMSG');

  await writeFile(message, 'chore(core): tidy\n');
  const accepted = spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(accepted.status, 0, accepted.stderr);

  await writeFile(message, 'chore(invented): tidy\n');
  const rejected = spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /scope.*invented/i);
});

test('the generated repository passes its own check with the shared packages', async () => {
  const repository = await generated();
  await linkDependencies(repository);
  const bin = (tool, file) => path.join(sourceRoot, 'node_modules', tool, file);
  const exec = (args) => spawnSync(process.execPath, args, { cwd: repository, encoding: 'utf8' });

  const format = exec([bin('prettier', 'bin/prettier.cjs'), '--check', '.']);
  assert.equal(format.status, 0, `${format.stdout}\n${format.stderr}`);

  const lint = exec([bin('eslint', 'bin/eslint.js'), '.']);
  assert.equal(lint.status, 0, `${lint.stdout}\n${lint.stderr}`);

  const typecheck = exec([bin('typescript', 'bin/tsc'), '--noEmit', '-p', 'tsconfig.json']);
  assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);

  const tests = exec([bin('vitest', 'vitest.mjs'), 'run']);
  assert.equal(tests.status, 0, `${tests.stdout}\n${tests.stderr}`);
});

test('preflight names the fix for every failing check and passes once they are done', async () => {
  const repository = await generated();
  await linkDependencies(repository);
  const packagePath = path.join(repository, 'package.json');
  const packageJson = await json(packagePath);
  packageJson.packageManager = `pnpm@${spawnSync('pnpm', ['--version'], { encoding: 'utf8' }).stdout.trim()}`;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const before = run(['preflight'], repository);
  assert.equal(before.status, 1);
  assert.match(before.stdout, /FAIL {2}git hooks/);
  assert.match(before.stdout, /fix: pnpm install/);

  git(repository, 'config', '--local', 'core.hooksPath', '.githooks');
  const after = run(['preflight'], repository);
  assert.equal(after.status, 0, `${after.stdout}\n${after.stderr}`);
  assert.match(after.stdout, /all \d+ checks passed/);
});

test('deploy refuses to run where there is nothing to deploy', async () => {
  const repository = await generated();
  const result = run(['deploy', '--dry-run'], repository);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /wrangler/);
});

test('the source repository consumes its own hooks and packages', async () => {
  const hook = await readFile(path.join(sourceRoot, '.githooks/commit-msg'), 'utf8');
  assert.match(hook, /packages\/repository-tooling\/hooks\/commit-msg\.sh/);
  const packageJson = await json(path.join(sourceRoot, 'package.json'));
  for (const name of ['eslint-config', 'prettier-config', 'tsconfig']) {
    assert.equal(packageJson.devDependencies[`@lvbt/${name}`], 'workspace:*');
  }
  for (const name of sharedPackages) {
    const manifest = await json(path.join(sourceRoot, 'packages', name, 'package.json'));
    assert.equal(manifest.version, toolingVersion, `${name} must share the tooling version`);
    assert.equal(manifest.publishConfig?.registry, 'https://npm.pkg.github.com');
  }
});
