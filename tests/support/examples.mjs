import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

// Every copy made below is removed when the file's tests finish, so repeated
// runs do not accumulate example copies under the system temp directory.
export const copies = [];
after(async () => {
  for (const copy of copies) await rm(copy, { recursive: true, force: true });
});

export const sourceRoot = path.resolve(import.meta.dirname, '../..');
export const sharedPackages =
  'cli eslint-config playwright-config prettier-config typescript-config vitest-config web-platform'.split(
    ' ',
  );

export const exampleDirectory = (name) => path.join(sourceRoot, 'examples', name);

export async function exists(file) {
  return stat(file).then(
    () => true,
    () => false,
  );
}

export async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** The workspace packages of an example, as directories relative to its root. */
export async function workspacePackages(root) {
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
export async function installedCopy(name) {
  const repository = await mkdtemp(path.join(tmpdir(), `lvbt-${name}-`));
  copies.push(repository);
  await cp(exampleDirectory(name), repository, { recursive: true });
  git(repository, 'init', '-q', '-b', 'main');
  const modules = path.join(repository, 'node_modules');
  await mkdir(path.join(modules, '@lasvegasfortransit'), { recursive: true });
  for (const shared of sharedPackages) {
    await symlink(
      path.join(sourceRoot, 'packages', shared),
      path.join(modules, '@lasvegasfortransit', shared),
    );
  }
  const sourceModules = path.join(sourceRoot, 'node_modules');
  await symlink(path.join(sourceModules, '.bin'), path.join(modules, '.bin'));
  for (const entry of await readdir(sourceModules)) {
    if (entry.startsWith('.') || entry === '@lasvegasfortransit') continue;
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
export async function runScript(repository, directory, script) {
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
