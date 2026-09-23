import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const examples = path.resolve(import.meta.dirname, '../examples');

/** Each example's workspace packages: the directories under apps/ and packages/ with a manifest. */
async function workspacePackages(example) {
  const found = [];
  for (const parent of ['apps', 'packages']) {
    const directory = path.join(examples, example, parent);
    if (!existsSync(directory)) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const manifest = path.join(directory, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(manifest)) found.push(manifest);
    }
  }
  return found;
}

// A task with more than one step gets a script per step, ordered in turbo.json, so Turbo can cache
// and run each one; see "Standard scripts" in docs/reference/cli.md.
test('every example workspace script runs one command and leaves ordering to Turbo', async () => {
  for (const example of await readdir(examples)) {
    for (const manifest of await workspacePackages(example)) {
      const { scripts = {} } = JSON.parse(await readFile(manifest, 'utf8'));
      for (const [name, command] of Object.entries(scripts)) {
        assert.doesNotMatch(
          command,
          /&&|\|\||;/,
          `${path.relative(examples, manifest)} "${name}" chains commands; split it into turbo tasks`,
        );
      }
    }
  }
});
