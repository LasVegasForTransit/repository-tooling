import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

test('browser templates type their Node.js test configuration', async () => {
  for (const [profile, app] of [
    ['with-astro', 'site'],
    ['with-vite-react', 'app'],
  ]) {
    const directory = `examples/${profile}/apps/${app}`;
    const manifest = await json(`${directory}/package.json`);
    const tsconfig = await json(`${directory}/tsconfig.json`);

    assert.equal(
      manifest.devDependencies?.['@types/node'],
      'catalog:',
      `${profile} must declare the Node.js types used by Playwright`,
    );
    assert.ok(
      tsconfig.compilerOptions?.types?.includes('node') ||
        tsconfig.compilerOptions?.types === undefined,
      `${profile} must not exclude Node.js types from Playwright`,
    );
  }
});

test('template publication respects protected branches through a reviewed pull request', async () => {
  const workflow = await readFile(
    path.join(root, '.github/workflows/publish-template.yml'),
    'utf8',
  );

  assert.match(workflow, /automation\/repository-standard-/);
  assert.match(workflow, /github-create\.mjs[\s\S]*\bpr\b/);
  assert.match(workflow, /--body-file/);
  assert.match(workflow, /--base main/);
  assert.match(workflow, /gh pr list/);
  assert.match(workflow, /gh pr edit/);
  assert.match(workflow, /TEMPLATE_PUBLISH_TOKEN/);
  assert.doesNotMatch(workflow, /git push origin HEAD:main/);
});
