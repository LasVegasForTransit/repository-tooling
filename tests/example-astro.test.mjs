import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';

import { copies, installedCopy, runScript } from './example.test.mjs';

// The example copies made here are removed with the ones example.test.mjs makes.
after(async () => {
  for (const copy of copies.splice(0)) await rm(copy, { recursive: true, force: true });
});

const CONTENT_CONFIG = `import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

const notes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/notes' }),
  schema: z.object({ title: z.string(), order: z.number() }),
});

export const collections = { notes };
`;

const NOTES = `import { getCollection, type CollectionEntry } from 'astro:content';

export async function sortedNotes(): Promise<CollectionEntry<'notes'>[]> {
  const notes = await getCollection('notes');
  return notes.sort((a, b) => a.data.order - b.data.order);
}
`;

test('with-astro: lints a content collection from a clean checkout', async () => {
  const repository = await installedCopy('with-astro');
  const site = path.join(repository, 'apps/site');
  await mkdir(path.join(site, 'src/content/notes'), { recursive: true });
  await writeFile(path.join(site, 'src/content.config.ts'), CONTENT_CONFIG);
  await writeFile(
    path.join(site, 'src/content/notes/first.md'),
    '---\ntitle: First\norder: 1\n---\n',
  );
  await writeFile(path.join(site, 'src/lib/notes.ts'), NOTES);
  assert.ok(!existsSync(path.join(site, '.astro')), 'a clean checkout has no generated types');

  // Without sync, type-aware rules reject every use of astro:content, so turbo runs it first.
  const turbo = JSON.parse(await readFile(path.join(repository, 'turbo.json'), 'utf8'));
  assert.ok(turbo.tasks.lint.dependsOn.includes('sync'));
  await runScript(repository, 'apps/site', 'sync');
  await runScript(repository, 'apps/site', 'lint');
});
