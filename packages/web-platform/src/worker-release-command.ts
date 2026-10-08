import { verifyWorkerReleaseConfiguration } from './worker-release-configuration.js';
import { packageCfRelease } from './cf-release-artifact.js';
import type { ReleaseConfiguration } from './release-config.js';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { previewUploadReceipt } from './pr-preview-config.js';
import { packageRelease, verifyRelease, type WebsiteRelease } from './saved-release-artifact.js';
import { releaseSource } from './release-source.js';
import { accessCredentials } from './access-auth.js';
import { readReleaseIdentity } from './release-identity.js';
import { resolveRelease } from './resolve-release.js';
import { githubJson } from './release-github.js';

const execute = promisify(execFile);
function printRelease(release: WebsiteRelease): void {
  process.stdout.write(
    `${JSON.stringify({ commit: release.commit, releaseId: release.releaseId, artifactHash: release.artifactHash, fileCount: release.files.length })}\n`,
  );
}
interface ReleaseOptions {
  directory?: string;
  commit?: string;
  'release-id'?: string;
  target?: string;
  version?: string;
  'run-file'?: string;
  repository?: string;
  'run-id'?: string;
}
async function sourceRelease(config: ReleaseConfiguration, values: ReleaseOptions): Promise<void> {
  if (!values.repository || values.repository !== config.repository)
    throw new Error('Pass the configured --repository.');
  const source =
    values['run-file'] && values['run-id']
      ? releaseSource(
          JSON.parse(await readFile(values['run-file'], 'utf8')),
          values.repository,
          values['run-id'],
          config.stagingWorkflow,
        )
      : await resolveRelease(
          values.repository,
          values['run-id'] === '' ? undefined : values['run-id'],
          {
            previewIdentity: async () => {
              const credentials = accessCredentials(process.env);
              if (!credentials)
                throw new Error(
                  'The worker-preview environment needs its Access service credentials.',
                );
              return await readReleaseIdentity(config.previewUrl, {
                credentials,
              });
            },
            getRun: async (id) =>
              await githubJson(['api', `repos/${values.repository}/actions/runs/${id}`]),
            getArtifacts: async (id) =>
              await githubJson([
                'api',
                `repos/${values.repository}/actions/runs/${id}/artifacts?per_page=100`,
              ]),
          },
          config,
        );
  const output = process.env.GITHUB_OUTPUT;
  if (output)
    await writeFile(output, `commit=${source.commit}\nrelease-id=${source.releaseId}\n`, {
      flag: 'a',
    });
  process.stdout.write(`${JSON.stringify(source)}\n`);
}
async function uploadRelease(
  config: ReleaseConfiguration,
  directory: string,
  release: WebsiteRelease,
  target: string,
): Promise<void> {
  await verifyWorkerReleaseConfiguration(directory, config);
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-release-upload-'));
  try {
    // Wrangler may write cache files; its working copy cannot modify the saved release.
    const copy = path.join(temporary, 'release');
    await cp(directory, copy, { recursive: true });
    const receiptPath = path.join(temporary, 'receipt.jsonl');
    await execute(
      'pnpm',
      [
        'exec',
        'wrangler',
        'versions',
        'upload',
        '--name',
        target === 'preview' ? config.previewWorker : config.productionWorker,
        '--config',
        path.join(copy, 'wrangler.jsonc'),
        '--env',
        target === 'preview' ? 'preview' : '',
        '--no-bundle',
        '--preview-alias',
        `release-${release.releaseId}`,
        '--message',
        `Release ${release.releaseId} at ${release.commit}`,
      ],
      {
        env: {
          ...process.env,
          WRANGLER_LOG_SANITIZE: 'true',
          WRANGLER_OUTPUT_FILE_PATH: receiptPath,
        },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const receipt = previewUploadReceipt(
      await readFile(receiptPath, 'utf8'),
      target === 'preview' ? config.previewWorker : config.productionWorker,
    );
    const output = process.env.GITHUB_OUTPUT;
    if (output)
      await writeFile(
        output,
        `url=${receipt.url}\nversion=${receipt.version}\nartifact-hash=${release.artifactHash}\n`,
        { flag: 'a' },
      );
    process.stdout.write(
      `${JSON.stringify({ ...receipt, releaseId: release.releaseId, commit: release.commit, artifactHash: release.artifactHash })}\n`,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
async function activateRelease(
  config: ReleaseConfiguration,
  values: ReleaseOptions,
): Promise<void> {
  const target = values.target;
  if (target !== 'preview' && target !== 'production')
    throw new Error('Pass --target preview or production.');
  if (!values.version || !/^[a-f0-9-]{36}$/.test(values.version))
    throw new Error('Pass an explicit Worker version ID.');
  const { stdout } = await execute(
    'pnpm',
    [
      'exec',
      'wrangler',
      'versions',
      'deploy',
      `${values.version}@100%`,
      '--name',
      target === 'preview' ? config.previewWorker : config.productionWorker,
      '--env',
      target === 'preview' ? 'preview' : '',
      '--yes',
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  process.stdout.write(stdout);
}
function verifySelectedIdentity(release: WebsiteRelease, values: ReleaseOptions): void {
  if (values.commit && release.commit !== values.commit)
    throw new Error('Release commit does not match the selected Actions run.');
  if (values['release-id'] && release.releaseId !== values['release-id'])
    throw new Error('Release ID does not match the selected Actions run.');
}
export async function runWorkerRelease(
  config: ReleaseConfiguration,
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      directory: { type: 'string' },
      commit: { type: 'string' },
      'release-id': { type: 'string' },
      target: { type: 'string' },
      version: { type: 'string' },
      'run-file': { type: 'string' },
      repository: { type: 'string' },
      'run-id': { type: 'string' },
    },
  });
  const command = positionals[0];
  const directory = values.directory ? path.resolve(values.directory) : undefined;
  const target = values.target;
  if (command === 'source') {
    await sourceRelease(config, values);
    return;
  }
  if (command === 'activate') {
    await activateRelease(config, values);
    return;
  }
  if (!directory) throw new Error('Pass --directory.');
  if (command === 'package') {
    if (!values.commit || !values['release-id']) throw new Error('Pass --commit and --release-id.');
    printRelease(
      await (config.artifactSource === 'cf-output'
        ? packageCfRelease(
            process.cwd(),
            directory,
            { commit: values.commit, releaseId: values['release-id'] },
            config,
          )
        : packageRelease(
            process.cwd(),
            directory,
            {
              commit: values.commit,
              releaseId: values['release-id'],
            },
            config.artifactAcceptance,
          )),
    );
    return;
  }
  if (command !== 'verify' && command !== 'upload')
    throw new Error('Use source, package, verify, upload, or activate.');
  const release = await verifyRelease(directory);
  verifySelectedIdentity(release, values);
  if (command === 'verify') {
    printRelease(release);
    return;
  }
  if (target !== 'preview' && target !== 'production')
    throw new Error('Pass --target preview or production.');
  await uploadRelease(config, directory, release, target);
}
