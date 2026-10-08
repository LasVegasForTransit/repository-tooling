import path from 'node:path';
import { readReleaseConfiguration } from './release-config.js';
import { runPromote } from './promote-command.js';
import { runWorkerRelease } from './worker-release-command.js';
import { runWorkerReleaseSmoke } from './worker-release-smoke.js';
import { runPublication } from './record-publication-command.js';

const [command, root, ...args] = process.argv.slice(2);
if (!root) throw new Error('Pass the repository root.');
const config = await readReleaseConfiguration(root);
process.chdir(path.resolve(root, config.appDirectory));
if (command === 'promote') await runPromote(config, args);
else if (command === 'worker-release') await runWorkerRelease(config, args);
else if (command === 'publication') await runPublication(config, args);
else if (command === 'smoke') await runWorkerReleaseSmoke(config, args);
else throw new Error('Use promote, worker-release, publication, or smoke.');
