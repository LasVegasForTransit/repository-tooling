import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
for (const example of ['basic', 'with-astro', 'with-vite-react']) {
  test(`${example} complete required gate includes exact uncached security checks`, async () => {
    const directory = path.join(root, 'examples', example);
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.scripts.validate, 'lvbt check secrets');
    assert.equal(manifest.scripts['security:dependencies'], 'pnpm audit --audit-level=high');
    const turbo = JSON.parse(await readFile(path.join(directory, 'turbo.json'), 'utf8'));
    assert.equal(turbo.tasks['//#validate'].cache, false);
    assert.deepEqual(turbo.tasks['//#validate'].dependsOn, ['//#security:dependencies']);
    assert.equal(turbo.tasks['//#security:dependencies'].cache, false);
    const workflow = await readFile(path.join(directory, '.github/workflows/ci.yml'), 'utf8');
    assert.match(workflow, /name: Validate/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /run: pnpm check/);
    assert.doesNotMatch(workflow, /run: pnpm audit|name: Secret scan|docker run/);
    const originalRules = await readFile(path.join(root, '.gitleaks.toml'), 'utf8');
    assert.equal(await readFile(path.join(directory, '.gitleaks.toml'), 'utf8'), originalRules);
    const graph = JSON.parse(
      execFileSync(path.join(root, 'node_modules/.bin/turbo'), ['run', 'validate', '--dry=json'], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1' },
        maxBuffer: 4 * 1024 * 1024,
      }),
    );
    for (const taskId of ['//#validate', '//#security:dependencies']) {
      const task = graph.tasks.find((candidate) => candidate.taskId === taskId);
      assert.ok(task, taskId);
      assert.equal(task.cache.local, false);
      assert.equal(task.cache.remote, false);
    }
    assert.deepEqual(graph.tasks.find(({ taskId }) => taskId === '//#validate').dependencies, [
      '//#security:dependencies',
    ]);
  });
}
