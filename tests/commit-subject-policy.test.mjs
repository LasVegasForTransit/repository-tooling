import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const validator = path.join(
  repositoryRoot,
  'plugins/lvbt-contributions/scripts/validate-commit-subject.mjs',
);

async function consumer(scopes) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-commit-scopes-'));
  await mkdir(path.join(directory, '.lvbt'));
  await writeFile(
    path.join(directory, '.lvbt/commit-scopes.txt'),
    `# Local durable boundaries\n${scopes.join('\n')}\n`,
  );
  return directory;
}

function validate(subject, cwd) {
  return spawnSync(process.execPath, [validator, subject], {
    cwd,
    encoding: 'utf8',
  });
}

test('a consuming repository supplies its own accepted scopes', async () => {
  const directory = await consumer(['api', 'editor']);

  assert.equal(validate('fix(api): keep sessions alive', directory).status, 0);

  const rejected = validate('fix(core): keep sessions alive', directory);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Scope `core` is not allowed/);
  assert.match(rejected.stderr, /`api`, `editor`/);
});

test('a consuming repository must declare its scope policy', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-no-commit-scopes-'));
  const rejected = validate('fix: keep sessions alive', directory);

  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Each repository must declare its own durable commit scopes/);
});
