export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const flags = new Set(['--dry-run', '--help']);
const valued = new Set(['--scopes', '--release', '--source', '--ref']);

export function parseArguments(argv) {
  const [first, ...rest] = argv;
  const command = first === '--help' ? 'help' : first;
  const options = { dryRun: false };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--help') {
      return { command: 'help', options };
    } else if (valued.has(argument)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`Missing value for ${argument}.`, 2);
      }
      options[argument.slice(2)] = value;
      index += 1;
    } else if (flags.has(argument) === false) {
      throw new CliError(`Unexpected argument: ${argument}`, 2);
    }
  }

  return { command, options };
}
