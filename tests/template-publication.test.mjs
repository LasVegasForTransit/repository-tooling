import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeTemplate } from '../standards/template-publication.ts';
import { verifyPreset } from '../standards/web-platform.ts';

const root = path.resolve(import.meta.dirname, '..');
const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

async function tree(directory, prefix = '') {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const name = `${prefix}${entry.name}`;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await tree(file, `${name}/`));
    else
      files[name] = {
        content: await readFile(file, 'utf8'),
        mode: (await stat(file)).mode & 0o777,
      };
  }
  return files;
}

async function manifests(directory) {
  const files = [path.join(directory, 'package.json')];
  for (const parent of ['apps', 'packages']) {
    const entries = await readdir(path.join(directory, parent), { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      if (entry.isDirectory()) files.push(path.join(directory, parent, entry.name, 'package.json'));
    }
  }
  return Promise.all(files.map(async (file) => [file, JSON.parse(await readFile(file, 'utf8'))]));
}

function assertVendoredDependencies(target, file, manifest) {
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const dependencies = fields.flatMap((field) => Object.entries(manifest[field] ?? {}));
  for (const [name, specifier] of dependencies) {
    if (!name.startsWith('@lasvegasfortransit/')) continue;
    if (specifier.startsWith('workspace:')) continue;
    const packageName = name.slice('@lasvegasfortransit/'.length);
    assert.ok(specifier.startsWith('file:'), `${file}: ${name} must use a file dependency`);
    assert.equal(
      path.resolve(path.dirname(file), specifier.slice('file:'.length)),
      path.join(target, '.lvbt/web-platform/packages', packageName),
    );
  }
}

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
    path.join(root, 'examples/basic/.github/workflows/standard-update.yml'),
    'utf8',
  );
  const propagate = [
    await readFile(path.join(root, 'standards/propagate.ts'), 'utf8'),
    await readFile(path.join(root, 'standards/propose.ts'), 'utf8'),
  ].join('\n');

  assert.match(propagate, /automation\/repository-standard-/);
  assert.match(propagate, /github-create\.mjs/);
  assert.match(propagate, /'--body-file'/);
  assert.match(propagate, /'--base', 'main'/);
  assert.match(propagate, /'pr', 'list'/);
  assert.match(propagate, /'pr', 'edit'/);
  assert.match(propagate, /standards\/template-publication\.ts/);
  assert.match(workflow, /self-update\.ts/);
  assert.doesNotMatch(`${workflow}\n${propagate}`, /HEAD:main/);
});

test('template publication vendors one exact release and is byte-for-byte idempotent', async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'lvbt-template-publication-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = path.join(fixture, 'source');
  execFileSync('git', ['clone', '--quiet', '--shared', root, source]);
  execFileSync('git', ['-C', source, 'tag', 'v99.0.0', 'HEAD']);

  for (const example of ['basic', 'with-astro', 'with-vite-react']) {
    const target = path.join(fixture, example);
    await materializeTemplate({ source, target, example, release: 'v99.0.0' });

    const metadata = await verifyPreset(target);
    assert.equal(metadata.release, 'v99.0.0');
    const publishedTurbo = JSON.parse(await readFile(path.join(target, 'turbo.json'), 'utf8'));
    const reviewedTurbo = JSON.parse(
      await readFile(path.join(source, 'examples', example, 'turbo.json'), 'utf8'),
    );
    assert.deepEqual(
      publishedTurbo.globalDependencies,
      reviewedTurbo.globalDependencies,
      'publishing an older reviewed release must not apply the running release cache migration',
    );
    if (example !== 'basic') {
      const application = example === 'with-astro' ? 'site' : 'app';
      const deployment = JSON.parse(
        await readFile(path.join(target, 'apps/deploy/package.json'), 'utf8'),
      );
      assert.equal(deployment.devDependencies[`@lasvegasfortransit/${application}`], 'workspace:*');
    }
    const rootManifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    assert.equal(
      rootManifest.scripts['standards:update'],
      'node .lvbt/web-platform/standards/web-platform-cli.ts update',
    );
    assert.equal(
      rootManifest.scripts['standards:check'],
      'node .lvbt/web-platform/standards/web-platform-cli.ts check',
    );
    assert.equal(
      rootManifest.scripts.bootstrap,
      'node .lvbt/web-platform/packages/cli/src/cli.mjs bootstrap',
    );
    assert.equal(
      rootManifest.scripts.preflight,
      'node .lvbt/web-platform/packages/cli/src/cli.mjs preflight',
    );
    assert.match(
      await readFile(path.join(target, 'pnpm-workspace.yaml'), 'utf8'),
      /^verifyDepsBeforeRun: false$/mu,
    );
    assert.match(rootManifest.scripts.check, /lvbt check/);
    assert.doesNotMatch(rootManifest.scripts.check, /^pnpm standards:check && /);

    for (const [file, manifest] of await manifests(target))
      assertVendoredDependencies(target, file, manifest);

    const first = await tree(target);
    await materializeTemplate({ source, target, example, release: 'v99.0.0' });
    assert.deepEqual(await tree(target), first, `${example} publication must be idempotent`);
  }

  await writeFile(path.join(source, 'examples/basic/README.md'), 'unreleased change\n');
  await assert.rejects(
    materializeTemplate({
      source,
      target: path.join(fixture, 'dirty-source'),
      example: 'basic',
      release: 'v99.0.0',
    }),
    /clean checkout of the requested release/,
  );
});
