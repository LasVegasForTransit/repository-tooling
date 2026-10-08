import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { packageLegacyWorkerRelease } from '../src/legacy-worker-release-artifact.js';
import { verifyRelease } from '../src/saved-release-artifact.js';
test('legacy Worker packaging retains reviewed migrations without rewriting the checkout config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'legacy-worker-migrations-'));
  try {
    const source = path.join(root, 'apps/site');
    await mkdir(path.join(source, '.wrangler/worker'), { recursive: true });
    await mkdir(path.join(source, 'dist'));
    await mkdir(path.join(source, 'migrations'));
    const original = JSON.stringify({
      name: 'app',
      d1_databases: [{ binding: 'DB', database_id: 'production' }],
      env: {
        preview: { name: 'app-preview', d1_databases: [{ binding: 'DB', database_id: 'preview' }] },
      },
    });
    await writeFile(path.join(source, 'wrangler.jsonc'), original);
    await writeFile(path.join(source, 'dist/index.html'), '<main>Reviewed app</main>');
    await writeFile(path.join(source, '.wrangler/worker/index.js'), 'export default {}');
    const sql = '-- exact reviewed bytes\r\nCREATE TABLE users(id TEXT);\r\n';
    await writeFile(path.join(source, 'migrations/0001_users.sql'), sql);
    const config = {
      repository: 'Example/app',
      appDirectory: 'apps/site',
      productionWorker: 'app',
      previewWorker: 'app-preview',
      productionUrl: 'https://example.org',
      previewUrl: 'https://preview.example.org',
      artifactPrefix: 'app-release',
      migrations: [{ binding: 'DB', directory: 'migrations' }],
      stagingWorkflow: {
        name: 'Deploy staging',
        path: '.github/workflows/deploy.yml',
        branch: 'main',
      },
      promotionWorkflow: { file: 'promote.yml', titlePrefix: 'Promote app', branch: 'main' },
    };
    const destination = path.join(root, 'release');
    const release = await packageLegacyWorkerRelease(
      source,
      destination,
      { commit: 'a'.repeat(40), releaseId: '123' },
      config,
    );
    expect(await verifyRelease(destination)).toEqual(release);
    expect(
      await readFile(
        path.join(destination, '.wrangler/worker/migrations/DB/0001_users.sql'),
        'utf8',
      ),
    ).toBe(sql);
    expect(await readFile(path.join(source, 'wrangler.jsonc'), 'utf8')).toBe(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
