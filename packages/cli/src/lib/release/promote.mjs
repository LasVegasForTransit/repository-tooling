import { CliError } from '../arguments.mjs';
import { runRelease } from './runner.mjs';

export async function promote({ cwd, options = {} }) {
  const runId = options.runId ?? options['run-id'];
  if (runId !== undefined && !/^[1-9][0-9]*$/.test(runId))
    throw new CliError('Select an Actions run ID.', 2);
  const args = runId ? ['--run-id', runId] : [];
  if (options.app) args.push('--app', options.app);
  return await runRelease({ cwd, mode: 'promote', args });
}
