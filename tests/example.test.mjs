import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

// Every copy made below is removed when the file's tests finish, so repeated
// runs do not accumulate example copies under the system temp directory.
const copies = [];
after(async () => {
  for (const copy of copies) await rm(copy, { recursive: true, force: true });
});

const sourceRoot = path.resolve(import.meta.dirname, '..');
const example = path.join(sourceRoot, 'examples/basic');
const cli = path.join(sourceRoot, 'packages/cli/src/cli.mjs');
const version = JSON.parse(
  await readFile(path.join(sourceRoot, 'packages/cli/package.json'), 'utf8'),
).version;
const sharedPackages = [
  'cli',
  'eslint-config',
  'playwright-config',
  'prettier-config',
  'typescript-config',
  'vitest-config',
];

async function exists(file) {
  return stat(file).then(
    () => true,
    () => false,
  );
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/**
 * A fresh copy of the example with its dependencies satisfied the way
 * `pnpm install` would satisfy them, without touching the network: the shared
 * packages link to this checkout and the tools link to the root node_modules.
 */
async function installedCopy() {
  const repository = await mkdtemp(path.join(tmpdir(), 'lvbt-example-'));
  copies.push(repository);
  await cp(example, repository, { recursive: true });
  git(repository, 'init', '-q', '-b', 'main');

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
        await symlink(path.join(sourceModules, entry, scoped), path.join(modules, entry, scoped));
      }
    } else {
      await symlink(path.join(sourceModules, entry), path.join(modules, entry));
    }
  }
  return repository;
}

/** Run the copied repository's commit-msg hook with agent variables cleared unless given. */
function runCommitHook(repository, message, env = {}) {
  return spawnSync(path.join(repository, '.githooks/commit-msg'), [message], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, AI_AGENT: '', CLAUDECODE: '', ...env },
  });
}

const bin = (tool, file) => path.join(sourceRoot, 'node_modules', tool, file);

test('the example pins every shared package to the current release tag', async () => {
  const root = await json(path.join(example, 'package.json'));
  const pkg = await json(path.join(example, 'packages/example/package.json'));
  const specifiers = { ...root.devDependencies, ...pkg.devDependencies };
  for (const name of sharedPackages) {
    // The basic example has no end-to-end tests, so it does not depend on the Playwright config.
    if (name === 'playwright-config') continue;
    assert.equal(
      specifiers[`@lvbt/${name}`],
      `github:LasVegasForTransit/repository-tooling#v${version}&path:/packages/${name}`,
      `@lvbt/${name} must be pinned to v${version}`,
    );
  }
  const settings = await json(path.join(example, '.claude/settings.json'));
  assert.equal(settings.extraKnownMarketplaces.lvbt.source.ref, `v${version}`);
});

test('the example carries the same version catalog as the packages', async () => {
  const workspace = await readFile(path.join(example, 'pnpm-workspace.yaml'), 'utf8');
  const { catalog } = await json(path.join(sourceRoot, 'packages/cli/catalog.json'));
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

test('the example answers to the standard commands', async () => {
  const root = await json(path.join(example, 'package.json'));
  for (const script of [
    'bootstrap',
    'preflight',
    'build',
    'dev',
    'lint',
    'check-types',
    'test',
    'format',
    'format:check',
    'check',
    'check:fix',
    'prepare',
  ]) {
    assert.ok(root.scripts[script], `root script ${script} must exist`);
  }
  assert.equal(root.scripts.bootstrap, 'lvbt bootstrap');
  assert.equal(
    root.scripts.check,
    'pnpm format:check && markdownlint-cli2 && lvbt check && turbo run lint check-types test',
  );
  for (const hook of ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'pre-push']) {
    const mode = (await stat(path.join(example, '.githooks', hook))).mode;
    assert.ok(mode & 0o111, `${hook} must be executable`);
  }
});

test('the example passes its own check with the shared packages', async () => {
  const repository = await installedCopy();
  const pkg = path.join(repository, 'packages/example');
  const exec = (cwd, args) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });

  const format = exec(repository, [bin('prettier', 'bin/prettier.cjs'), '--check', '.']);
  assert.equal(format.status, 0, `${format.stdout}\n${format.stderr}`);

  const docs = exec(repository, [bin('markdownlint-cli2', 'markdownlint-cli2-bin.mjs')]);
  assert.equal(docs.status, 0, `${docs.stdout}\n${docs.stderr}`);

  const shape = exec(repository, [cli, 'check']);
  assert.equal(shape.status, 0, `${shape.stdout}\n${shape.stderr}`);
  assert.match(shape.stdout, /ok {4}filenames/);
  assert.match(shape.stdout, /ok {4}contract/);

  const lint = exec(pkg, [bin('eslint', 'bin/eslint.js'), '.', '--max-warnings', '0']);
  assert.equal(lint.status, 0, `${lint.stdout}\n${lint.stderr}`);

  const types = exec(pkg, [bin('typescript', 'bin/tsc'), '--noEmit']);
  assert.equal(types.status, 0, `${types.stdout}\n${types.stderr}`);

  const build = exec(pkg, [bin('typescript', 'bin/tsc'), '-p', 'tsconfig.build.json']);
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  assert.ok(await exists(path.join(pkg, 'dist/index.js')));

  const tests = exec(pkg, [bin('vitest', 'vitest.mjs'), 'run']);
  assert.equal(tests.status, 0, `${tests.stdout}\n${tests.stderr}`);
});

test('the example commit hook enforces the scope list through the installed package', async () => {
  const repository = await installedCopy();
  const message = path.join(repository, 'COMMIT_EDITMSG');

  await writeFile(message, 'chore(example): tidy\n');
  const accepted = runCommitHook(repository, message);
  assert.equal(accepted.status, 0, accepted.stderr);

  await writeFile(message, 'chore(invented): tidy\n');
  const rejected = runCommitHook(repository, message);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /scope.*invented/i);
});

test('the commit hook requires a body for feat and fix and wraps the body at 72 columns', async () => {
  const repository = await installedCopy();
  const message = path.join(repository, 'COMMIT_EDITMSG');
  const hook = (env) => runCommitHook(repository, message, env);

  await writeFile(message, 'feat(example): add greeting\n');
  const noBody = hook();
  assert.equal(noBody.status, 1);
  assert.match(noBody.stderr, /needs a body/);

  await writeFile(message, `feat(example): add greeting\n\n${'x'.repeat(80)}\n`);
  const longLine = hook();
  assert.equal(longLine.status, 1);
  assert.match(longLine.stderr, /72 columns/);

  await writeFile(message, 'feat(example): add greeting\n\nGreets the visitor by name.\n');
  const accepted = hook();
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('the commit hook requires attribution when an agent drives the commit', async () => {
  const repository = await installedCopy();
  const message = path.join(repository, 'COMMIT_EDITMSG');
  const hook = (env) => runCommitHook(repository, message, env);

  await writeFile(message, 'chore(example): tidy\n');
  const unattributed = hook({ CLAUDECODE: '1' });
  assert.equal(unattributed.status, 1);
  assert.match(unattributed.stderr, /without attribution/);

  await writeFile(
    message,
    'chore(example): tidy\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n',
  );
  const attributed = hook({ CLAUDECODE: '1' });
  assert.equal(attributed.status, 0, attributed.stderr);

  await writeFile(
    message,
    'chore(example): tidy\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n\nMore prose after the footer.\n',
  );
  const misplaced = hook({ CLAUDECODE: '1' });
  assert.equal(misplaced.status, 1);
  assert.match(misplaced.stderr, /last block/);
});

test('lvbt check reports the file that breaks a shape rule', async () => {
  const repository = await installedCopy();
  await writeFile(path.join(repository, 'packages/example/src/greet.helper.ts'), 'export {};\n');
  await writeFile(path.join(repository, 'packages/example/src/stray.test.ts'), 'export {};\n');

  const result = spawnSync(process.execPath, [cli, 'check', 'filenames', 'contract'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL {2}filenames/);
  assert.match(result.stdout, /greet\.helper\.ts/);
  assert.match(result.stdout, /FAIL {2}contract/);
  assert.match(result.stdout, /stray\.test\.ts/);
});

test('preflight names the fix for every failing check and passes once they are done', async () => {
  const repository = await installedCopy();
  const packagePath = path.join(repository, 'package.json');
  const packageJson = await json(packagePath);
  // Preflight compares against this machine; the copy pins whatever is installed here.
  packageJson.packageManager = `pnpm@${spawnSync('pnpm', ['--version'], { encoding: 'utf8' }).stdout.trim()}`;
  packageJson.engines = { node: `>=${process.versions.node}` };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const run = () =>
    spawnSync(process.execPath, [cli, 'preflight'], { cwd: repository, encoding: 'utf8' });

  const before = run();
  assert.equal(before.status, 1);
  assert.match(before.stdout, /FAIL {2}git hooks/);
  assert.match(before.stdout, /fix: pnpm install/);

  git(repository, 'config', '--local', 'core.hooksPath', '.githooks');
  const after = run();
  assert.equal(after.status, 0, `${after.stdout}\n${after.stderr}`);
  assert.match(after.stdout, /all \d+ checks passed/);
});

test('deploy refuses to run where there is nothing to deploy', async () => {
  const repository = await installedCopy();
  const result = spawnSync(process.execPath, [cli, 'deploy', '--dry-run'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /wrangler/);
});

test('the source repository consumes its own packages and every package shares one version', async () => {
  const hook = await readFile(path.join(sourceRoot, '.githooks/commit-msg'), 'utf8');
  assert.match(hook, /packages\/cli\/hooks\/commit-msg\.sh/);
  const packageJson = await json(path.join(sourceRoot, 'package.json'));
  assert.equal(packageJson.version, version);
  for (const name of ['eslint-config', 'prettier-config']) {
    assert.equal(packageJson.devDependencies[`@lvbt/${name}`], 'workspace:*');
  }
  for (const name of sharedPackages) {
    const manifest = await json(path.join(sourceRoot, 'packages', name, 'package.json'));
    assert.equal(manifest.version, version, `${name} must share the tooling version`);
    assert.equal(manifest.publishConfig?.registry, 'https://npm.pkg.github.com');
  }
});
