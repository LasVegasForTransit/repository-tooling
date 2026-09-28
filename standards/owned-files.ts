import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WebPreset } from './web-platform.ts';

/**
 * Files every repository copies from the example and never edits: the adoption guide's "copy these,
 * overwriting your versions" list. The updater keeps them identical to the release, and
 * `standards:check` fails when one is edited, so a fix to one of them reaches every repository.
 */
export const OWNED_FILES = [
  '.githooks/commit-msg',
  '.githooks/pre-commit',
  '.githooks/pre-push',
  '.githooks/prepare-commit-msg',
  '.codex/hooks.json',
  '.agents/plugins/marketplace.json',
  '.github/actions/setup-node-pnpm/action.yml',
  '.editorconfig',
];

/**
 * Files the updater adds when a repository lacks them but never rewrites. A repository's own
 * workflow token may not change workflow files, so rewriting one would block every self-update.
 */
export const SEEDED_FILES = ['.github/workflows/standard-update.yml'];

/** Every example carries the same owned files; the Astro example is the vendored reference. */
const REFERENCE = 'examples/with-astro';

// Prettier reads these before prettier.config.js, so any of them silently replaces the org rules.
const SHADOWING_PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  '.prettierrc.toml',
];

const SETTINGS = '.claude/settings.json';
const MARKETPLACE_REF =
  /("repo"\s*:\s*"LasVegasForTransit\/repository-tooling"\s*,\s*"ref"\s*:\s*")([^"]*)(")/;

async function readOptional(file: string): Promise<string | null> {
  return readFile(file, 'utf8').catch(() => null);
}

async function isExecutable(file: string): Promise<boolean> {
  return ((await stat(file)).mode & 0o111) !== 0;
}

/** Writes one owned file from the release when the repository's copy differs. */
async function syncFile(root: string, bundle: WebPreset, name: string, dryRun: boolean) {
  const reference = `${REFERENCE}/${name}`;
  const content = bundle.files[reference];
  if (content === undefined) return false;
  const file = path.join(root, name);
  const executable = bundle.executables?.includes(reference) ?? false;
  const current = await readOptional(file);
  if (current === content && (!executable || (await isExecutable(file)))) return false;
  if (!dryRun) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    if (executable) await chmod(file, 0o755);
  }
  return true;
}

async function removeShadowingConfigs(root: string, dryRun: boolean): Promise<string[]> {
  if ((await readOptional(path.join(root, 'prettier.config.js'))) === null) return [];
  const removed: string[] = [];
  for (const name of SHADOWING_PRETTIER_CONFIGS) {
    if ((await readOptional(path.join(root, name))) === null) continue;
    removed.push(name);
    if (!dryRun) await rm(path.join(root, name));
  }
  return removed;
}

/** Makes the repository's owned files match the incoming release, and removes shadowing configs. */
export async function syncOwnedFiles(
  root: string,
  bundle: WebPreset,
  dryRun: boolean,
): Promise<string[]> {
  const changed: string[] = [];
  for (const name of OWNED_FILES)
    if (await syncFile(root, bundle, name, dryRun)) changed.push(name);
  for (const name of SEEDED_FILES)
    if (
      (await readOptional(path.join(root, name))) === null &&
      (await syncFile(root, bundle, name, dryRun))
    )
      changed.push(name);
  return [...changed, ...(await removeShadowingConfigs(root, dryRun))];
}

/**
 * Points the Claude Code contribution plugin at the release being installed. A repository without
 * a settings file gets the example's; one that pins another marketplace keeps its own.
 */
export async function syncPluginRef(
  root: string,
  bundle: WebPreset,
  dryRun: boolean,
): Promise<string[]> {
  if (!bundle.release) return [];
  const file = path.join(root, SETTINGS);
  const current = await readOptional(file);
  let next: string | undefined;
  if (current === null) next = bundle.files[`${REFERENCE}/${SETTINGS}`];
  else if (MARKETPLACE_REF.test(current))
    next = current.replace(MARKETPLACE_REF, `$1${bundle.release}$3`);
  if (next === undefined || next === current) return [];
  if (!dryRun) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, next);
  }
  return [SETTINGS];
}

/** What `standards:check` reports: owned files that differ from the vendored release. */
export async function ownedFileDrift(root: string, release: string | null): Promise<string[]> {
  const problems: string[] = [];
  const vendored = path.join(root, '.lvbt/web-platform', REFERENCE);
  for (const name of OWNED_FILES) {
    const expected = await readOptional(path.join(vendored, name));
    if (expected === null) continue;
    const actual = await readOptional(path.join(root, name));
    if (actual === null) problems.push(`${name} is missing.`);
    else if (actual !== expected) problems.push(`${name} differs from the standard's copy.`);
    else if (
      (await isExecutable(path.join(vendored, name))) &&
      !(await isExecutable(path.join(root, name)))
    )
      problems.push(`${name} is not executable.`);
  }
  if (release) {
    const settings = await readOptional(path.join(root, SETTINGS));
    const ref = settings ? MARKETPLACE_REF.exec(settings)?.[2] : undefined;
    if (ref !== undefined && ref !== release)
      problems.push(`${SETTINGS} loads the contribution plugin from ${ref}, not ${release}.`);
  }
  return problems;
}
