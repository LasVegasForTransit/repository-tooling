import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { exists, readJson } from './files.mjs';
import { PROFILES } from './templates.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../..');

export const ORGANIZATION_REPOSITORY = 'LasVegasForTransit/repository-tooling';

export async function toolingVersion() {
  return (await readJson(path.join(packageRoot, 'package.json'))).version;
}

export async function catalog() {
  return readJson(path.join(packageRoot, 'catalog.json'));
}

/** True when `directory` is a checkout of repository-tooling itself. */
export async function isSourceCheckout(directory) {
  return (
    (await exists(path.join(directory, 'packages/repository-tooling/src/cli.mjs'))) &&
    (await exists(path.join(directory, 'packages/repository-tooling/templates')))
  );
}

export function dependencySpec(name, { version, local, realCwd }) {
  if (local) {
    // Relative to the real directory: pnpm resolves link: from the repository
    // itself, and a tmpdir alias such as /var -> /private/var would add a level.
    const target = path.relative(realCwd, path.join(path.resolve(local), 'packages', name)) || '.';
    return `link:${target}`;
  }
  return `github:${ORGANIZATION_REPOSITORY}#v${version}&path:/packages/${name}`;
}

/** Everything the generator needs to know about the repository it runs in. */
export async function repositoryContext(cwd, options) {
  if (await isSourceCheckout(cwd)) {
    throw new CliError(
      `${cwd} is a repository-tooling source checkout; run this from the repository you are generating.`,
      2,
    );
  }
  const packagePath = path.join(cwd, 'package.json');
  if (!(await exists(packagePath))) {
    throw new CliError(
      'Run this inside a repository that has a package.json (even `{"name": "...", "private": true}`).',
      2,
    );
  }
  const packageJson = await readJson(packagePath);

  const profile = options.profile ?? detectProfile(packageJson);
  if (!profile || !(profile in PROFILES)) {
    const known = Object.keys(PROFILES).join(', ');
    throw new CliError(
      `Pass --profile <${known.replaceAll(', ', '|')}>. ${profile ? `"${profile}" is not one of them.` : ''}`.trim(),
      2,
    );
  }

  const scopesPath = path.join(cwd, '.lvbt/commit-scopes.txt');
  const scopes = options.scopes
    ? parseScopes(options.scopes)
    : (await exists(scopesPath))
      ? (await readFile(scopesPath, 'utf8'))
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
      : undefined;

  return {
    cwd,
    realCwd: await realpath(cwd),
    packageJson,
    profile,
    scopes,
    name: packageJson.name ?? path.basename(cwd),
    version: await toolingVersion(),
    local: options.local,
  };
}

function detectProfile(packageJson) {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if ('astro' in deps) return 'site';
  if ('vite' in deps) return 'app';
  if (Object.keys(deps).length > 0 || packageJson.scripts?.build) return 'package';
  return undefined;
}

const scopePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseScopes(value) {
  const scopes = value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const invalid = scopes.find((scope) => !scopePattern.test(scope));
  if (invalid)
    throw new CliError(`Scope "${invalid}" must be lowercase words joined by hyphens.`, 2);
  if (scopes.length === 0) throw new CliError('--scopes needs at least one scope.', 2);
  return scopes;
}
