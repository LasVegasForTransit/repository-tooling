import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { formatJson } from './astro-sync.ts';
import { readOptional, rejectSymlinkDestination } from './paths.ts';
import type { WebPreset } from './web-platform.ts';
import type * as CacheModule from '../packages/cli/src/lib/check/turbo-cache.mjs';

type CachePolicy = typeof CacheModule;

async function incomingPolicy(bundle: WebPreset): Promise<CachePolicy> {
  const source = bundle.files['packages/cli/src/lib/check/turbo-cache.mjs'];
  if (source === undefined) return import('../packages/cli/src/lib/check/turbo-cache.mjs');
  // Installed older updaters extract standards/** only. This pure module has no relative imports;
  // load its validated incoming bytes without requiring a new command or copying another policy.
  return (await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  )) as CachePolicy;
}

/** Add shared cache inputs without owning application tasks or removing existing root inputs. */
export async function syncTurboCache(
  root: string,
  bundle: WebPreset,
  dryRun: boolean,
): Promise<string[]> {
  await rejectSymlinkDestination(root, 'turbo.json');
  const file = path.join(root, 'turbo.json');
  const source = await readOptional(file);
  if (source === null) return [];
  const { TURBO_GLOBAL_DEPENDENCIES, parseTurboCache } = await incomingPolicy(bundle);
  const config = parseTurboCache(source);
  const globals = config.globalDependencies ?? [];
  const added = TURBO_GLOBAL_DEPENDENCIES.filter((entry) => !globals.includes(entry));
  if (!added.length) return [];
  if (!dryRun)
    await writeFile(
      file,
      `${formatJson({ ...config, globalDependencies: [...globals, ...added] })}\n`,
    );
  return ['turbo.json'];
}
