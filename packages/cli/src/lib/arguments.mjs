export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const flags = new Set(['--dry-run', '--help']);

/** `<command> [--flag]`. Unknown options are an error. */
export function parseArguments(argv) {
  const [first, ...rest] = argv;
  const command = first === '--help' ? 'help' : first;
  const options = { dryRun: false };

  for (const argument of rest) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help') return { command: 'help', options };
    else if (!flags.has(argument)) throw new CliError(`Unexpected argument: ${argument}`, 2);
  }

  return { command, options };
}
