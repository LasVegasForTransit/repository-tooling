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

/** Every example, with the shared packages a copy of it must pin and whether it deploys. */
const examples = {
  basic: { uses: sharedPackages.filter((name) => name !== 'playwright-config'), deploys: false },
  'with-astro': { uses: sharedPackages, deploys: true },
  'with-vite-react': { uses: sharedPackages, deploys: true },
};
const exampleDirectory = (name) => path.join(sourceRoot, 'examples', name);

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

/** The workspace packages of an example, as directories relative to its root. */
async function workspacePackages(root) {
  const found = [];
  for (const parent of ['apps', 'packages']) {
    if (!(await exists(path.join(root, parent)))) continue;
    for (const entry of await readdir(path.join(root, parent), { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        (await exists(path.join(root, parent, entry.name, 'package.json')))
      )
        found.push(`${parent}/${entry.name}`);
    }
  }
  return found;
}

/**
 * A fresh copy of an example with its dependencies satisfied the way
 * `pnpm install` would satisfy them, without touching the network: the shared
 * packages link to this checkout and the tools link to the root node_modules,
 * including its `.bin`, so the example's own scripts run unchanged.
 */
async function installedCopy(name) {
  const repository = await mkdtemp(path.join(tmpdir(), `lvbt-${name}-`));
  copies.push(repository);
  await cp(exampleDirectory(name), repository, { recursive: true });
  git(repository, 'init', '-q', '-b', 'main');

  const modules = path.join(repository, 'node_modules');
  await mkdir(path.join(modules, '@lvbt'), { recursive: true });
  for (const shared of sharedPackages) {
    await symlink(path.join(sourceRoot, 'packages', shared), path.join(modules, '@lvbt', shared));
  }
  const sourceModules = path.join(sourceRoot, 'node_modules');
  await symlink(path.join(sourceModules, '.bin'), path.join(modules, '.bin'));
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

/** Run one of a package's own scripts, as `turbo run` would, and assert it passes. */
async function runScript(repository, directory, script) {
  const cwd = path.join(repository, directory);
  const manifest = await json(path.join(cwd, 'package.json'));
  const command = manifest.scripts[script];
  assert.ok(command, `${directory} must declare a "${script}" script`);
  const result = spawnSync('sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(repository, 'node_modules/.bin')}:${process.env.PATH}`,
      CI: '1',
    },
  });
  assert.equal(result.status, 0, `${directory} ${script}\n${result.stdout}\n${result.stderr}`);
  return result;
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

for (const [name, { uses, deploys }] of Object.entries(examples)) {
  const example = exampleDirectory(name);

  test(`${name}: pins every shared package it uses to the current release tag`, async () => {
    const specifiers = {};
    for (const directory of ['.', ...(await workspacePackages(example))]) {
      const manifest = await json(path.join(example, directory, 'package.json'));
      Object.assign(specifiers, manifest.dependencies, manifest.devDependencies);
    }
    for (const [dependency, range] of Object.entries(specifiers)) {
      if (dependency.startsWith('@lvbt/')) {
        assert.equal(
          range,
          `github:LasVegasForTransit/repository-tooling#v${version}&path:/packages/${dependency.slice('@lvbt/'.length)}`,
          `${dependency} must be pinned to v${version}`,
        );
      }
    }
    for (const shared of uses) {
      assert.ok(specifiers[`@lvbt/${shared}`], `@lvbt/${shared} must be a dependency`);
    }
    const settings = await json(path.join(example, '.claude/settings.json'));
    assert.equal(settings.extraKnownMarketplaces.lvbt.source.ref, `v${version}`);
  });

  test(`${name}: carries the same version catalog as the packages`, async () => {
    const workspace = await readFile(path.join(example, 'pnpm-workspace.yaml'), 'utf8');
    const { catalog } = await json(path.join(sourceRoot, 'packages/cli/catalog.json'));
    const block = workspace.slice(workspace.indexOf('catalog:\n') + 'catalog:\n'.length);
    const entries = Object.fromEntries(
      block
        .split('\n')
        .map((line) => /^ {2}'?([^':]+)'?: (\S+)$/.exec(line))
        .filter(Boolean)
        .map(([, dependency, range]) => [dependency, range]),
    );
    assert.deepEqual(entries, catalog);
  });

  test(`${name}: answers to the standard commands`, async () => {
    const root = await json(path.join(example, 'package.json'));
    const scripts = [
      'bootstrap',
      'preflight',
      'build',
      'dev',
      'lint',
      'check-types',
      'test',
      'test:e2e',
      'format',
      'format:check',
      'check',
      'check:fix',
      'prepare',
      ...(deploys ? ['preview', 'deploy'] : []),
    ];
    for (const script of scripts) {
      assert.ok(root.scripts[script], `root script ${script} must exist`);
    }
    assert.equal(root.scripts.bootstrap, 'lvbt bootstrap');
    assert.equal(
      root.scripts.check,
      'pnpm format:check && markdownlint-cli2 && lvbt check && turbo run lint check-types test validate',
    );
    if (deploys) assert.equal(root.scripts.deploy, 'lvbt deploy');
    for (const directory of await workspacePackages(example)) {
      const manifest = await json(path.join(example, directory, 'package.json'));
      for (const script of ['lint', 'check-types', 'test']) {
        assert.ok(manifest.scripts[script], `${directory} must declare ${script}`);
      }
    }
    for (const hook of ['pre-commit', 'commit-msg', 'prepare-commit-msg', 'pre-push']) {
      const mode = (await stat(path.join(example, '.githooks', hook))).mode;
      assert.ok(mode & 0o111, `${hook} must be executable`);
    }
    assert.equal(await exists(path.join(example, '.github/workflows/deploy.yml')), deploys);
  });

  test(`${name}: passes its own check with the shared packages`, async () => {
    const repository = await installedCopy(name);
    const exec = (cwd, args) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });

    const format = exec(repository, [bin('prettier', 'bin/prettier.cjs'), '--check', '.']);
    assert.equal(format.status, 0, `${format.stdout}\n${format.stderr}`);

    const docs = exec(repository, [bin('markdownlint-cli2', 'markdownlint-cli2-bin.mjs')]);
    assert.equal(docs.status, 0, `${docs.stdout}\n${docs.stderr}`);

    const shape = exec(repository, [cli, 'check']);
    assert.equal(shape.status, 0, `${shape.stdout}\n${shape.stderr}`);
    assert.match(shape.stdout, /ok {4}filenames/);
    assert.match(shape.stdout, /ok {4}contract/);

    for (const directory of await workspacePackages(repository)) {
      const manifest = await json(path.join(repository, directory, 'package.json'));
      for (const script of ['lint', 'check-types', 'build', 'test']) {
        if (manifest.scripts[script]) await runScript(repository, directory, script);
      }
      if (manifest.scripts.build) {
        assert.ok(await exists(path.join(repository, directory, 'dist')), `${directory} builds`);
      }
      if (manifest.scripts['test:e2e']) {
        // Listing proves the Playwright configuration loads without starting a browser.
        const listed = spawnSync(bin('@playwright/test', 'cli.js'), ['test', '--list'], {
          cwd: path.join(repository, directory),
          encoding: 'utf8',
        });
        assert.equal(listed.status, 0, `${listed.stdout}\n${listed.stderr}`);
        assert.match(listed.stdout, /\[desktop\]/);
        assert.match(listed.stdout, /\[mobile\]/);
      }
    }
  });
}

test('the example commit hook enforces the scope list through the installed package', async () => {
  const repository = await installedCopy('basic');
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
  const repository = await installedCopy('basic');
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
  const repository = await installedCopy('basic');
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
  const repository = await installedCopy('basic');
  await writeFile(path.join(repository, 'packages/example/src/greet.helper.ts'), 'export {};\n');
  // Astro endpoints such as src/pages/robots.txt.ts are routes, so the extra dot is allowed there.
  await mkdir(path.join(repository, 'packages/example/src/pages'), { recursive: true });
  await writeFile(
    path.join(repository, 'packages/example/src/pages/robots.txt.ts'),
    'export {};\n',
  );
  await writeFile(path.join(repository, 'packages/example/src/stray.test.ts'), 'export {};\n');
  // Helpers under tests/support and committed snapshots take ordinary names.
  await mkdir(path.join(repository, 'packages/example/tests/support'), { recursive: true });
  await writeFile(
    path.join(repository, 'packages/example/tests/support/fixtures.ts'),
    'export {};\n',
  );
  await mkdir(path.join(repository, 'packages/example/tests/e2e/snapshots/desktop'), {
    recursive: true,
  });
  await writeFile(
    path.join(repository, 'packages/example/tests/e2e/snapshots/desktop/home.png'),
    '',
  );

  const result = spawnSync(process.execPath, [cli, 'check', 'filenames', 'contract'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL {2}filenames/);
  assert.match(result.stdout, /greet\.helper\.ts/);
  assert.doesNotMatch(result.stdout, /robots\.txt\.ts/);
  assert.doesNotMatch(result.stdout, /fixtures\.ts|home\.png/);
  // CSS modules, config files, placeholders, and a README beside tests are conventions.
  const conventional = [
    'src/card.module.css',
    'src/content.config.ts',
    'src/pages/.gitkeep',
    'tests/README.md',
  ];
  for (const file of conventional) assert.ok(!result.stdout.includes(file), `${file} is allowed`);
  assert.match(result.stdout, /FAIL {2}contract/);
  assert.match(result.stdout, /stray\.test\.ts/);
});

test('lvbt check debt lets a newly adopted rule be recorded once but never lets a known rule grow', async () => {
  const repository = await installedCopy('basic');
  const ledger = path.join(repository, 'packages/example/eslint-suppressions.json');
  const commit = (message) => {
    git(repository, 'add', '-A');
    git(
      repository,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.org',
      'commit',
      '-q',
      '--no-verify',
      '-m',
      message,
    );
  };
  const debt = () =>
    spawnSync(process.execPath, [cli, 'check', 'debt'], { cwd: repository, encoding: 'utf8' });

  await writeFile(ledger, JSON.stringify({ 'src/index.ts': { complexity: { count: 1 } } }));
  commit('chore: baseline');
  git(repository, 'switch', '-q', '-c', 'adopt');

  await writeFile(
    ledger,
    JSON.stringify({ 'src/index.ts': { complexity: { count: 1 }, 'max-params': { count: 3 } } }),
  );
  const adopted = debt();
  assert.equal(adopted.status, 0, `${adopted.stdout}\n${adopted.stderr}`);

  await writeFile(ledger, JSON.stringify({ 'src/index.ts': { complexity: { count: 2 } } }));
  const grown = debt();
  assert.equal(grown.status, 1);
  assert.match(grown.stdout, /complexity 2 times, up from 1/);

  // A suppressed file touched only in its import lines (a rename it depends on) is not an edit.
  await writeFile(ledger, JSON.stringify({ 'src/index.ts': { complexity: { count: 1 } } }));
  const source = path.join(repository, 'packages/example/src/index.ts');
  const original = await readFile(source, 'utf8');
  await writeFile(source, `import { helper } from './moved/helper';\n${original}`);
  const renamed = debt();
  assert.equal(renamed.status, 0, `${renamed.stdout}\n${renamed.stderr}`);
  await writeFile(source, `${original}export const extra = 1;\n`);
  const edited = debt();
  assert.equal(edited.status, 1);
  assert.match(edited.stdout, /changed without shrinking/);
});

test('preflight names the fix for every failing check and passes once they are done', async () => {
  const repository = await installedCopy('basic');
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
  const repository = await installedCopy('basic');
  const result = spawnSync(process.execPath, [cli, 'deploy', '--dry-run'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /wrangler/);
});

test('deploy finds every app with a wrangler config and honors --filter', async () => {
  const repository = await installedCopy('with-astro');
  const result = spawnSync(process.execPath, [cli, 'deploy', '--dry-run', '--filter', 'worker'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /worker has no wrangler/);
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
