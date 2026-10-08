import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repository = new URL('..', import.meta.url).pathname;

test('every published ESLint entrypoint supports strict typed consumers without ambient shims', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-eslint-types-'));
  try {
    const packageDirectory = path.join(directory, 'node_modules/@lasvegasfortransit/eslint-config');
    await mkdir(packageDirectory, { recursive: true });
    const source = path.join(repository, 'packages/eslint-config');
    const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    // Materialize exactly the published file allowlist, rather than relying on a workspace link.
    await writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify(manifest));
    for (const filename of manifest.files)
      await writeFile(
        path.join(packageDirectory, filename),
        await readFile(path.join(source, filename)),
      );
    await symlink(
      await realpath(path.join(repository, 'node_modules/eslint')),
      path.join(directory, 'node_modules/eslint'),
      'dir',
    );
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}\n');
    await writeFile(
      path.join(directory, 'consumer.ts'),
      `import { config as base } from '@lasvegasfortransit/eslint-config/base';
import { config as browser } from '@lasvegasfortransit/eslint-config/browser';
import { config as react } from '@lasvegasfortransit/eslint-config/react-internal';
import type { Linter } from 'eslint';
const config: Linter.Config[] = [...base, ...browser, ...react];
const scoped: Linter.Config[] = browser.map(entry => ({...entry, files: ['browser/**/*.ts']}));
// @ts-expect-error Public configuration entries are typed objects, never implicit any.
const invalid: number = base[0];
void config; void scoped; void invalid;
`,
    );
    for (const [module, moduleResolution] of [
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler'],
    ]) {
      await writeFile(
        path.join(directory, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module,
            moduleResolution,
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            types: [],
          },
          files: ['consumer.ts'],
        }),
      );
      const result = spawnSync(
        process.execPath,
        [path.join(repository, 'node_modules/typescript/bin/tsc'), '-p', directory],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 0, `${moduleResolution}: ${result.stdout}${result.stderr}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
