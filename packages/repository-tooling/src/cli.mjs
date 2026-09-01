#!/usr/bin/env node
/**
 * The LVBT repository standard, as a command.
 *
 *   init       generate a repository from the standard (once)
 *   diff       report where this repository differs from the current standard
 *   apply      take the standard's version of named files
 *   bootstrap  install, wire git hooks, run preflight
 *   preflight  confirm this machine can build and deploy the repository
 *   deploy     build, then `wrangler deploy`
 *
 * A generated repository owns every file this writes. Nothing here is required
 * at build or run time; the `@lvbt/*` packages it depends on are ordinary
 * dependencies.
 */
import { CliError, parseArguments } from './lib/arguments.mjs';
import { apply, diff, init } from './lib/generate.mjs';
import { bootstrap, deploy, preflight } from './lib/operate.mjs';
import { PROFILES } from './lib/templates.mjs';

const usage = `Usage:
  lvbt-repository-tooling init --profile <${Object.keys(PROFILES).join('|')}> --scopes <a,b,c> [--local <checkout>] [--dry-run]
  lvbt-repository-tooling diff [--profile <profile>]
  lvbt-repository-tooling apply <file> [<file>...] [--dry-run]
  lvbt-repository-tooling bootstrap
  lvbt-repository-tooling preflight
  lvbt-repository-tooling deploy [--dry-run]

Profiles:
${Object.entries(PROFILES)
  .map(([name, description]) => `  ${name.padEnd(9)}${description}`)
  .join('\n')}

Options:
  --scopes    Comma-separated commit scopes written to .lvbt/commit-scopes.txt
  --local     Link the @lvbt/* packages from a local repository-tooling checkout (pre-release work)
  --dry-run   Print what would change and write nothing
`;

const commands = { init, diff, apply, bootstrap, preflight, deploy };

try {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === undefined || command === 'help') {
    process.stdout.write(usage);
  } else if (command in commands) {
    await commands[command]({ cwd: process.cwd(), options });
  } else {
    throw new CliError(`Unknown command "${command}".\n${usage}`, 2);
  }
} catch (error) {
  if (error instanceof CliError) {
    if (error.message) process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
