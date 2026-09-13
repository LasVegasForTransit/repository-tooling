import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

async function workflow(directory = '.') {
  return readFile(path.join(root, directory, '.github/workflows/ci.yml'), 'utf8');
}

test('source repository validates each pull request commit once', async () => {
  const source = await workflow();
  assert.match(source, /^ {2}pull_request:$/m);
  assert.doesNotMatch(source, /^ {2}push:$/m);
});

for (const name of ['basic', 'with-astro', 'with-vite-react']) {
  test(`${name}: validates each pull request commit once`, async () => {
    const template = await workflow(path.join('examples', name));
    assert.match(template, /^ {2}pull_request:$/m);
    assert.doesNotMatch(template, /^ {2}push:$/m);
    assert.match(template, /^ {2}workflow_call:$/m);
    assert.match(template, /^ {2}workflow_dispatch:$/m);
  });
}
