import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const OWNER = 'LasVegasForTransit';
export const BRANCH_PREFIX = 'automation/repository-standard-';
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export interface RegistryEntry {
  name: string;
  requiredStatus: string;
  kind: 'source' | 'template' | 'consumer';
  example?: string;
}

export interface Registry {
  version: number;
  repositories: RegistryEntry[];
  exceptions: RegistryException[];
}

export interface RegistryException {
  repository: string;
  rule: string;
  reason: string;
  expires: string;
}

export interface OpenUpdate {
  number: number;
  headRefName: string;
}

export async function readRegistry(
  file = path.join(import.meta.dirname, 'repositories.json'),
): Promise<Registry> {
  return JSON.parse(await readFile(file, 'utf8')) as Registry;
}

/** Repositories that receive each release: every template and consumer, never the source. */
export function propagationTargets(registry: Registry): RegistryEntry[] {
  return registry.repositories.filter(({ kind }) => kind !== 'source');
}

export function parseRelease(tag: string): [number, number, number] {
  const match = STABLE_TAG.exec(tag);
  if (!match) throw new Error(`Propagation requires a stable release tag, not ${tag}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareReleases(left: string, right: string): number {
  const a = parseRelease(left);
  const b = parseRelease(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function latestRelease(tags: string[]): string | undefined {
  return tags
    .filter((tag) => STABLE_TAG.test(tag))
    .sort(compareReleases)
    .at(-1);
}

export function updateBranch(tag: string): string {
  parseRelease(tag);
  return `${BRANCH_PREFIX}${tag}`;
}

/**
 * Decides what to do with the update pull requests already open in a repository. Older releases
 * are closed as superseded; a newer one means this release must not be proposed at all.
 */
export function planOpenUpdates(open: OpenUpdate[], tag: string) {
  const current = updateBranch(tag);
  const superseded: OpenUpdate[] = [];
  const newer: OpenUpdate[] = [];
  for (const update of open) {
    if (!update.headRefName.startsWith(BRANCH_PREFIX) || update.headRefName === current) continue;
    const release = update.headRefName.slice(BRANCH_PREFIX.length);
    if (!STABLE_TAG.test(release)) continue;
    if (compareReleases(release, tag) < 0) superseded.push(update);
    else newer.push(update);
  }
  return { superseded, newer };
}

export function releaseNotesPath(tag: string): string {
  return `docs/reference/release-${tag.slice(1).replaceAll('.', '-')}.md`;
}

export function pullRequestTitle(tag: string): string {
  return `chore: update LVBT repository standard to ${tag}`;
}

export function pullRequestBody(options: {
  tag: string;
  kind: RegistryEntry['kind'];
  hasNotes: boolean;
}): string {
  const { tag, kind, hasNotes } = options;
  const source = `https://github.com/${OWNER}/repository-tooling`;
  const notes = hasNotes
    ? `The [release notes](${source}/blob/${tag}/${releaseNotesPath(tag)}) say what changes for a repository that updates.`
    : `The [${tag} release](${source}/releases/tag/${tag}) describes what changed.`;
  const change =
    kind === 'template'
      ? `The files are generated from the reviewed ${tag} example in repository-tooling.`
      : `The vendored standard in \`.lvbt/web-platform/\` is replaced by ${tag}, and the release's own migrations update the files it manages.`;
  return [
    '# TL;DR',
    '',
    `Moves this repository to LVBT repository standard ${tag}.`,
    '',
    '# Overview of Changes',
    '',
    `${change} ${notes}`,
    '',
    'This pull request was opened by the `Publish standard` workflow when the release was tagged, and it merges itself once `Validate` passes. If `Validate` fails, fix the repository on this branch; a newer release closes this pull request and opens its own.',
    '',
    '# Follow-ups',
    '',
    'None.',
    '',
  ].join('\n');
}

export function commitMessage(tag: string): string {
  return `${pullRequestTitle(tag)}\n\nApply the reviewed ${tag} release with its own updater.\n`;
}

type Runner = (command: string, args: string[], cwd: string) => string;

const run: Runner = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

async function currentRelease(target: string): Promise<string | null> {
  const file = path.join(target, '.lvbt/web-platform.json');
  if (!existsSync(file)) return null;
  const { release } = JSON.parse(await readFile(file, 'utf8')) as { release: string | null };
  return release;
}

/**
 * Applies a release to one checked-out repository with the release's own scripts and commits the
 * result on the release's update branch. Returns false when the repository already matches.
 */
export async function applyRelease(options: {
  source: string;
  target: string;
  entry: RegistryEntry;
  tag: string;
  install?: boolean;
  runner?: Runner;
}): Promise<{ changed: boolean; reason?: string }> {
  const { entry, tag, install = true, runner = run } = options;
  // A release's scripts only run as entry points when invoked by their real path.
  const source = realpathSync(options.source);
  const target = realpathSync(options.target);
  parseRelease(tag);
  const release = await currentRelease(target);
  if (release && STABLE_TAG.test(release) && compareReleases(release, tag) > 0) {
    return { changed: false, reason: `${entry.name} is already on ${release}, newer than ${tag}.` };
  }

  if (entry.kind === 'template') {
    if (!entry.example) throw new Error(`${entry.name} is a template without an example.`);
    // Publication rebuilds the template from the example, lockfile included. Keeping the published
    // lockfile makes pnpm resolve only what the release changed, so a re-run with no new release
    // proposes nothing instead of whichever transitive packages were published since.
    const lockfile = path.join(target, 'pnpm-lock.yaml');
    const published = existsSync(lockfile) ? await readFile(lockfile, 'utf8') : undefined;
    runner(
      'node',
      [
        path.join(source, 'standards/template-publication.ts'),
        '--source',
        source,
        '--target',
        target,
        '--example',
        entry.example,
        '--release',
        tag,
      ],
      target,
    );
    if (published !== undefined) await writeFile(lockfile, published);
  } else if (entry.kind === 'consumer') {
    runner(
      'node',
      [
        path.join(source, 'standards/web-platform-cli.ts'),
        'update',
        '--root',
        target,
        '--source',
        source,
        '--release',
        tag,
        '--apply',
        '--json',
      ],
      target,
    );
  } else throw new Error(`${entry.name} does not receive releases.`);

  if (install) runner('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile'], target);
  if (!runner('git', ['status', '--porcelain'], target)) return { changed: false };

  const message = path.join(target, '.git', 'lvbt-standard-commit-message');
  await writeFile(message, commitMessage(tag));
  runner('git', ['switch', '-C', updateBranch(tag)], target);
  runner('git', ['restore', '--staged', '.'], target);
  runner('git', ['add', '-A'], target);
  runner(
    'git',
    [
      '-c',
      'user.name=lvbt-bot',
      '-c',
      'user.email=noreply@lasvegasfortransit.org',
      'commit',
      '--quiet',
      '--no-verify',
      '-F',
      message,
    ],
    target,
  );
  return { changed: true };
}

/**
 * Compares the freshly generated update commit with the branch already on GitHub. A branch that
 * carries someone's fix is kept; a bot-only branch is replaced when the base or the result moved.
 */
function remoteBranchState(
  target: string,
  branch: string,
  runner: Runner,
): 'absent' | 'current' | 'stale' | 'edited' {
  if (!runner('git', ['ls-remote', '--heads', 'origin', branch], target)) return 'absent';
  runner(
    'git',
    ['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
    target,
  );
  const authors = runner('git', ['log', '--format=%ae', `HEAD^..origin/${branch}`], target).split(
    '\n',
  );
  if (authors.some((author) => author !== 'noreply@lasvegasfortransit.org')) return 'edited';
  const same = (ref: string) =>
    runner('git', ['rev-parse', `origin/${branch}${ref}`], target) ===
    runner('git', ['rev-parse', `HEAD${ref}`], target);
  return same('^') && same('^{tree}') ? 'current' : 'stale';
}

function openUpdates(target: string, runner: Runner): OpenUpdate[] {
  return JSON.parse(
    runner(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'open',
        '--base',
        'main',
        '--json',
        'number,headRefName',
        '--limit',
        '100',
      ],
      target,
    ),
  ) as OpenUpdate[];
}

/** Pushes a new or rebuilt update branch, or adopts the one on GitHub when it is current or fixed. */
function pushUpdateBranch(target: string, name: string, branch: string, runner: Runner): void {
  const state = remoteBranchState(target, branch, runner);
  if (state === 'absent' || state === 'stale') {
    runner('git', ['push', '--force-with-lease', '--set-upstream', 'origin', branch], target);
    return;
  }
  if (state === 'edited') {
    process.stdout.write(`${name}: keeping the fixes already pushed to ${branch}.\n`);
    runner('git', ['reset', '--quiet', '--hard', `origin/${branch}`], target);
  }
  runner('git', ['branch', '--set-upstream-to', `origin/${branch}`], target);
}

/** Opens the update pull request with the shared helper, or refreshes the one already open. */
async function openPullRequest(options: {
  source: string;
  tooling: string;
  target: string;
  entry: RegistryEntry;
  tag: string;
  runner: Runner;
}): Promise<number> {
  const { source, tooling, target, entry, tag, runner } = options;
  const title = pullRequestTitle(tag);
  const body = path.join(target, '.git', 'lvbt-standard-pr.md');
  const hasNotes = existsSync(path.join(source, releaseNotesPath(tag)));
  await writeFile(body, pullRequestBody({ tag, kind: entry.kind, hasNotes }));
  const existing = JSON.parse(
    runner(
      'gh',
      ['pr', 'list', '--head', updateBranch(tag), '--state', 'open', '--json', 'number'],
      target,
    ),
  ) as { number: number }[];
  if (existing[0]) {
    runner(
      'gh',
      ['pr', 'edit', String(existing[0].number), '--title', title, '--body-file', body],
      target,
    );
    return existing[0].number;
  }
  const helper = path.join(
    tooling,
    'packages/cli/plugins/lvbt-contributions/scripts/github-create.mjs',
  );
  const args = [helper, 'pr', '--title', title, '--body-file', body, '--base', 'main', '--json'];
  runner('node', [...args, '--dry-run'], target);
  return (JSON.parse(runner('node', args, target)) as { number: number }).number;
}

/**
 * Pushes the update branch, opens or refreshes its pull request, enables auto-merge, and closes
 * update pull requests for older releases.
 */
export async function proposeRelease(options: {
  source: string;
  tooling: string;
  target: string;
  entry: RegistryEntry;
  tag: string;
  changed: boolean;
  runner?: Runner;
}): Promise<string | undefined> {
  const { target, entry, tag, changed, runner = run } = options;
  const { superseded, newer } = planOpenUpdates(openUpdates(target, runner), tag);
  if (newer.length > 0) {
    process.stdout.write(`${entry.name}: a newer update is already open (#${newer[0]?.number}).\n`);
    return undefined;
  }

  let number: number | undefined;
  if (changed) {
    pushUpdateBranch(target, entry.name, updateBranch(tag), runner);
    number = await openPullRequest({ ...options, runner });
    runner('gh', ['pr', 'merge', String(number), '--auto', '--rebase'], target);
  }

  for (const update of superseded) {
    const comment = number
      ? `Superseded by #${number}, which updates to ${tag}.`
      : `Superseded: this repository already matches ${tag}.`;
    runner(
      'gh',
      ['pr', 'close', String(update.number), '--comment', comment, '--delete-branch'],
      target,
    );
  }
  return number ? `${entry.name}: #${number}` : `${entry.name}: already on ${tag}`;
}

export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      source: { type: 'string' },
      target: { type: 'string' },
      repository: { type: 'string' },
      release: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  if (!values.source || !values.target || !values.repository || !values.release) {
    throw new Error(
      'Usage: --source <release checkout> --target <repository checkout> --repository <name> --release <tag> [--dry-run]',
    );
  }
  const registry = await readRegistry();
  const entry = propagationTargets(registry).find(({ name }) => name === values.repository);
  if (!entry)
    throw new Error(`${values.repository} is not a propagation target in repositories.json.`);

  const source = path.resolve(values.source);
  const target = path.resolve(values.target);
  const result = await applyRelease({ source, target, entry, tag: values.release });
  if (result.reason) {
    process.stdout.write(`${result.reason}\n`);
    return;
  }
  if (values['dry-run']) {
    process.stdout.write(
      result.changed
        ? `${entry.name}: committed ${values.release} on ${updateBranch(values.release)}; not pushed (dry run).\n`
        : `${entry.name}: already matches ${values.release}.\n`,
    );
    return;
  }
  const outcome = await proposeRelease({
    source,
    tooling: path.resolve(import.meta.dirname, '..'),
    target,
    entry,
    tag: values.release,
    changed: result.changed,
  });
  if (outcome) process.stdout.write(`${outcome}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
