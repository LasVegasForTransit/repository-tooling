import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat, chmod } from 'node:fs/promises';
import path from 'node:path';

export async function exists(file) {
  return stat(file).then(
    () => true,
    () => false,
  );
}

/** Every file below `root`, as paths relative to `root`, sorted for stable digests. */
export async function listFiles(root) {
  const found = await stat(root).catch(() => undefined);
  if (!found) return [];
  if (found.isFile()) return [''];

  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  await walk(root);
  return files.sort();
}

export async function copyTree(from, to) {
  const source = await stat(from);
  if (source.isFile()) {
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    await chmod(to, source.mode & 0o777);
    return;
  }
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    await copyTree(path.join(from, entry.name), path.join(to, entry.name));
  }
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Per-file hashes for every managed path plus one digest over all of them.
 * Keys are consumer-relative paths so a mismatch can name the file.
 */
export async function digestManaged(root, targets) {
  const files = {};
  for (const target of targets) {
    const absolute = path.join(root, target);
    for (const relative of await listFiles(absolute)) {
      const file = relative === '' ? target : `${target}/${relative}`;
      files[file] = sha256(await readFile(path.join(root, file)));
    }
  }
  const hash = createHash('sha256');
  for (const file of Object.keys(files).sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(files[file]);
    hash.update('\0');
  }
  return { files, sha256: hash.digest('hex') };
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
