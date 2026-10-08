import { workerSmokeSchema } from './worker-release-smoke.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const origin = z
  .url({ protocol: /^https$/ })
  .refine((value) => new URL(value).origin === value, 'Use an HTTPS origin without a path.');
const worker = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export const releaseConfigurationSchema = z
  .object({
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    appDirectory: z
      .string()
      .min(1)
      .refine(
        (value) => !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'),
        'Keep the app inside the checked repository.',
      ),
    productionUrl: origin,
    previewUrl: origin,
    productionWorker: worker,
    previewWorker: worker,
    artifactPrefix: worker,
    smoke: workerSmokeSchema.optional(),
    previewBindings: z.record(z.string(), z.unknown()).optional(),
    artifactSource: z.enum(['legacy-worker', 'cf-output']).optional(),
    artifactAcceptance: z
      .object({
        forbiddenPaths: z.array(z.string().min(1)).optional(),
        forbiddenLanguages: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    stagingWorkflow: z.object({
      name: z.string().min(1),
      path: z.string().regex(/^\.github\/workflows\/[a-z0-9-]+\.ya?ml$/),
      branch: z.string().min(1).default('main'),
    }),
    promotionWorkflow: z.object({
      file: z.string().regex(/^[a-z0-9-]+\.ya?ml$/),
      titlePrefix: z.string().min(1),
      branch: z.string().min(1),
    }),
  })
  .strict()
  .refine(
    (config) =>
      config.productionWorker !== config.previewWorker &&
      config.productionUrl !== config.previewUrl,
    'Staging and production require separate Workers and origins.',
  );
export type ReleaseConfiguration = z.infer<typeof releaseConfigurationSchema>;
function configuredUrl(
  value: Record<string, unknown>,
  field: string,
  env: Record<string, string | undefined>,
): unknown {
  const selector = value[`${field}Env`];
  if (selector === undefined) return value[field];
  const name = z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]*$/)
    .parse(selector);
  const result = env[name]?.trim();
  if (!result) throw new Error(`Configure ${name} with the app's HTTPS origin before releasing.`);
  return result;
}
async function repositoryOrigin(
  cwd: string,
  env: Record<string, string | undefined>,
): Promise<string> {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stdout } = await promisify(execFile)('git', ['remote', 'get-url', 'origin'], { cwd });
  const remote = stdout.trim();
  const ssh = /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  if (ssh?.[1]) return ssh[1];
  const url = new URL(remote);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Configure a GitHub origin or an explicit release repository.');
  return url.pathname.slice(1).replace(/\.git$/, '');
}
export async function readReleaseConfiguration(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ReleaseConfiguration> {
  const tooling = z
    .object({ version: z.literal(1), release: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(await readFile(path.join(cwd, '.lvbt/tooling.json'), 'utf8')));
  const value = tooling.release;
  const productionUrl = configuredUrl(value, 'productionUrl', env);
  const previewUrl = configuredUrl(value, 'previewUrl', env);
  const repository = value.repository ?? (await repositoryOrigin(cwd, env));
  let previewBindings = value.previewBindings;
  if (value.previewBindingsEnv !== undefined) {
    const name = z
      .string()
      .regex(/^[A-Z_][A-Z0-9_]*$/)
      .parse(value.previewBindingsEnv);
    const input = env[name]?.trim();
    if (!input)
      throw new Error(
        `Configure ${name} with isolated preview binding declarations before releasing.`,
      );
    previewBindings = JSON.parse(input) as unknown;
  }
  const {
    productionUrlEnv: _productionUrlEnv,
    previewUrlEnv: _previewUrlEnv,
    previewBindingsEnv: _previewBindingsEnv,
    ...release
  } = value;
  return releaseConfigurationSchema.parse({
    ...release,
    repository,
    productionUrl,
    previewUrl,
    ...(previewBindings ? { previewBindings } : {}),
  });
}
