#!/usr/bin/env node
/**
 * Lifecycle for LVBT repository tooling in a consumer repository.
 *
 *   init    vendor the managed files into a new repository and scaffold the
 *           repository-owned files it needs to pass `check`
 *   update  re-vendor the managed files from a newer release
 *   check   prove the vendored files match the pinned release and the
 *           repository still wires them up
 *
 * The same file runs from two places: `bin/cli.mjs` in the source repository
 * and `.lvbt/repository-tooling/cli.mjs` in every consumer. Consumers run the
 * vendored copy so the check and the files it checks always come from one
 * release.
 */
import { install } from './lib/install.mjs';
import { check } from './lib/check.mjs';
import { CliError, parseArguments } from './lib/arguments.mjs';

const usage = `Usage:
  cli.mjs init   --scopes <a,b,c> [--release <tag> | --source <dir> --ref <tag>] [--dry-run]
  cli.mjs update [--release <tag> | --source <dir> --ref <tag>] [--dry-run]
  cli.mjs check

Options:
  --scopes    Comma-separated commit scopes for .lvbt/commit-scopes.txt (init only)
  --release   Release tag of LasVegasForTransit/repository-tooling to vendor
  --source    Local checkout to vendor from instead of cloning a release
  --ref       Tag name to record when --source is used and is not at a tag
  --dry-run   Print the planned changes without writing anything
`;

async function main(argv) {
  const { command, options } = parseArguments(argv);
  const cwd = process.cwd();
  const cliRoot = import.meta.dirname;

  switch (command) {
    case 'init':
    case 'update':
      return install({ command, cwd, cliRoot, options });
    case 'check':
      return check({ cwd });
    case 'help':
    case undefined:
      process.stdout.write(usage);
      return;
    default:
      throw new CliError(`Unknown command "${command}".\n${usage}`);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
