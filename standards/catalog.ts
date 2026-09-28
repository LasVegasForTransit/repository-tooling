import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WebPreset } from './web-platform.ts';

const WORKSPACE = 'pnpm-workspace.yaml';
const ENTRY = /^(\s+)(['"]?)([^'"\s:]+)\2:\s*(['"]?)([^'"\s#]+)\4(.*)$/;

/**
 * Moves every shared entry in the repository's default catalog to the release's version, the way
 * `lvbt check contract` requires. Entries only this repository uses, comments, quoting, and order
 * stay as they are.
 */
export async function syncCatalog(
  root: string,
  bundle: WebPreset,
  dryRun: boolean,
): Promise<string[]> {
  const catalog = bundle.files['packages/cli/catalog.json'];
  if (catalog === undefined) return [];
  const standard = (JSON.parse(catalog) as { catalog: Record<string, string> }).catalog;
  const file = path.join(root, WORKSPACE);
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source === null) return [];

  let inCatalog = false;
  const lines = source.split(/(?<=\n)/).map((line) => {
    const body = line.replace(/\r?\n$/, '');
    if (/^catalog:\s*$/.test(body)) {
      inCatalog = true;
      return line;
    }
    if (!inCatalog || /^\s*(?:#.*)?$/.test(body)) return line;
    if (/^\S/.test(body)) {
      inCatalog = false;
      return line;
    }
    const match = ENTRY.exec(body);
    const name = match?.[3];
    if (!match || !name || !Object.hasOwn(standard, name) || standard[name] === match[5])
      return line;
    const [, indent, keyQuote, , valueQuote, , rest] = match;
    return `${indent}${keyQuote}${name}${keyQuote}: ${valueQuote}${standard[name]}${valueQuote}${rest}${line.slice(body.length)}`;
  });
  const next = lines.join('');
  if (next === source) return [];
  if (!dryRun) await writeFile(file, next);
  return [WORKSPACE];
}
