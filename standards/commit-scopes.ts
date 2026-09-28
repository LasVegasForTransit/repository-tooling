import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCOPES = '.lvbt/commit-scopes.txt';

// The shared validator rejects these as scopes, so a repository's list must not offer them.
export const RETIRED_SCOPES = ['ci'];

/** Removes retired scopes from the repository's scope list, keeping its comments and order. */
export async function retireCommitScopes(root: string, dryRun: boolean): Promise<string[]> {
  const file = path.join(root, SCOPES);
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null) return [];
  const next = source
    .split(/(?<=\n)/)
    .filter((line) => !RETIRED_SCOPES.includes(line.trim()))
    .join('');
  if (next === source) return [];
  if (!dryRun) await writeFile(file, next);
  return [SCOPES];
}
