import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { exists, readJson } from './files.mjs';
import { ORGANIZATION_REPOSITORY, PLUGIN_NAME } from './manifest.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new CliError(`git ${args.join(' ')} failed:\n${result.stderr.trim()}`, 2);
  }
  return result.stdout.trim();
}

async function isSourceCheckout(directory) {
  return (
    (await exists(path.join(directory, 'bin/cli.mjs'))) &&
    (await exists(path.join(directory, 'templates/managed'))) &&
    (await exists(path.join(directory, `plugins/${PLUGIN_NAME}`)))
  );
}

/**
 * Where to vendor from. Precedence: an explicit --source checkout, then a
 * --release tag cloned from GitHub, then (for `init` run from a source
 * checkout) the checkout the CLI itself lives in.
 */
export async function resolveSource({ cliRoot, options, repository = ORGANIZATION_REPOSITORY }) {
  let root;
  let ref = options.ref ?? options.release;

  if (options.source) {
    root = path.resolve(options.source);
  } else if (options.release) {
    root = await mkdtemp(path.join(tmpdir(), 'lvbt-repository-tooling-'));
    git(
      process.cwd(),
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      options.release,
      `https://github.com/${repository}.git`,
      root,
    );
  } else if (await isSourceCheckout(path.resolve(cliRoot, '..'))) {
    root = path.resolve(cliRoot, '..');
  } else {
    throw new CliError('Pass --release <tag> to vendor from a published release, or --source <dir> for a local checkout.', 2);
  }

  if (!(await isSourceCheckout(root))) {
    throw new CliError(`${root} is not a repository-tooling checkout.`, 2);
  }

  const commit = git(root, 'rev-parse', 'HEAD');
  if (!ref) {
    const exact = spawnSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (exact.status !== 0) {
      throw new CliError(`${root} is not checked out at a release tag; pass --ref <tag> to record one.`, 2);
    }
    ref = exact.stdout.trim();
  }

  const manifest = await readJson(path.join(root, `plugins/${PLUGIN_NAME}/.claude-plugin/plugin.json`));
  return { root, ref, commit, version: manifest.version, repository };
}
