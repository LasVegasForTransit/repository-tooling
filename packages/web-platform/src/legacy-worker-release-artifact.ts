import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ReleaseConfiguration } from './release-config.js';
import { packageRelease, type WebsiteRelease } from './saved-release-artifact.js';
import { retainReleaseMigrations } from './saved-release-migrations.js';

export async function packageLegacyWorkerRelease(
  source: string,
  destination: string,
  identity: { commit: string; releaseId: string },
  config: ReleaseConfiguration,
): Promise<WebsiteRelease> {
  if (!config.migrations?.length)
    return await packageRelease(source, destination, identity, {
      ...config.artifactAcceptance,
      formatVersion: 2,
    });
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-legacy-worker-'));
  try {
    const copy = path.join(temporary, 'release');
    // The existing reader validates regular build files before copying them; generated
    // migration paths can then be written without touching checkout files or symlink targets.
    await packageRelease(source, copy, identity, {
      ...config.artifactAcceptance,
      formatVersion: 2,
    });
    await retainReleaseMigrations(source, copy, config);
    return await packageRelease(copy, destination, identity, {
      ...config.artifactAcceptance,
      formatVersion: 2,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
