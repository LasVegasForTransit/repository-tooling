import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { applyRelease, run } from '../standards/propagate.ts';
import { materializeTemplate } from '../standards/template-publication.ts';

const root = path.resolve(import.meta.dirname, '..');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

async function commit(cwd, paths, message) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-hook-message-'));
  try {
    const file = path.join(directory, 'message');
    await writeFile(
      file,
      `${message}\n\nInitialize a disposable propagation fixture.\n\nCo-authored-by: Codex <noreply@openai.com>\n`,
    );
    execFileSync(
      'sh',
      [
        '-c',
        'message="$1"; shift; git restore --staged . && git add -- "$@" && git -c user.name=test -c user.email=test@example.org commit --quiet -F "$message"',
        'hook-fixture',
        file,
        ...paths,
      ],
      { cwd, stdio: 'pipe' },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function incomingSource(fixture) {
  const source = path.join(fixture, 'source');
  execFileSync('git', ['clone', '--quiet', '--shared', root, source]);
  git(source, 'checkout', '--quiet', 'v0.7.2');
  const baseline = path.join(fixture, 'baseline');
  execFileSync('git', ['clone', '--quiet', '--shared', source, baseline]);
  const oldFile = path.join(fixture, 'published-propagate.ts');
  await writeFile(oldFile, git(source, 'show', 'v0.7.2:standards/propagate.ts'));
  const old = await import(pathToFileURL(oldFile).href);
  const paths = ['standards/propagate.ts', 'standards/template-publication.ts'];
  for (const file of paths)
    await writeFile(path.join(source, file), await readFile(path.join(root, file)));
  for (const example of ['basic', 'with-astro', 'with-vite-react']) {
    const file = `examples/${example}/.githooks/pre-commit`;
    await writeFile(
      path.join(source, file),
      `${await readFile(path.join(source, file), 'utf8')}\nprintf 'ran\\n' >> "$ROOT/.git/template-hook-proof"\n`,
    );
    paths.push(file);
  }
  await commit(source, paths, 'chore: prepare incoming hook regression');
  git(source, 'tag', 'v99.0.1');
  return { source, baseline, old: old.applyRelease };
}

test(
  'published and current update drivers restore real commit hooks for all templates',
  { timeout: 300000 },
  async (t) => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), 'lvbt-template-hooks-'));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const incoming = await incomingSource(fixture);
    for (const [driver, update] of [
      ['published', incoming.old],
      ['current', applyRelease],
    ]) {
      for (const example of ['basic', 'with-astro', 'with-vite-react']) {
        await t.test(`${driver}: ${example}`, async () => {
          const target = path.join(fixture, `${driver}-${example}`);
          execFileSync('git', ['clone', '--quiet', '--shared', incoming.baseline, target]);
          git(target, 'switch', '--quiet', '-C', 'main');
          await materializeTemplate({
            source: incoming.baseline,
            target,
            example,
            release: 'v0.7.2',
          });
          await commit(target, ['.'], 'chore: initialize template hook fixture');
          run('pnpm', ['install', '--no-frozen-lockfile'], target);
          await commit(target, ['pnpm-lock.yaml'], 'chore: freeze published baseline');
          const before = git(target, 'rev-parse', 'HEAD');
          const commands = [];
          const result = await update({
            source: incoming.source,
            target,
            tag: 'v99.0.1',
            entry: {
              name: `template-${example}`,
              kind: 'template',
              example,
              requiredStatus: 'Validate',
            },
            runner(command, args, cwd) {
              commands.push([command, ...args]);
              const output = run(command, args, cwd);
              if (command === 'node')
                assert.equal(
                  existsSync(
                    path.join(target, 'node_modules/@lasvegasfortransit/cli/hooks/pre-commit.sh'),
                  ),
                  driver === 'published',
                  'only the old driver installs through the incoming publication CLI',
                );
              return output;
            },
          });
          assert.equal(result.changed, true);
          assert.notEqual(git(target, 'rev-parse', 'HEAD'), before);
          assert.equal(
            await readFile(path.join(target, '.git/template-hook-proof'), 'utf8'),
            'ran\n',
          );
          assert.equal(git(target, 'status', '--porcelain'), '');
          run('pnpm', ['install', '--frozen-lockfile'], target);
          if (driver === 'current') {
            assert.deepEqual(
              commands.filter(([command]) => command === 'pnpm'),
              [['pnpm', 'install', '--no-frozen-lockfile']],
            );
            assert.ok(
              commands.findIndex(([command]) => command === 'pnpm') <
                commands.findIndex(([command]) => command === 'sh'),
            );
          }
          if (example === 'basic') {
            const repeated = await update({
              source: incoming.source,
              target,
              tag: 'v99.0.1',
              entry: {
                name: 'template-basic',
                kind: 'template',
                example,
                requiredStatus: 'Validate',
              },
            });
            assert.equal(repeated.changed, false);
            assert.equal(
              await readFile(path.join(target, '.git/template-hook-proof'), 'utf8'),
              'ran\n',
            );
          }
        });
      }
    }
    await t.test(
      'current caller preserves an explicit install=false without a hidden CLI install',
      async () => {
        const target = path.join(fixture, 'skip-install');
        execFileSync('git', ['clone', '--quiet', '--shared', incoming.baseline, target]);
        git(target, 'switch', '--quiet', '-C', 'main');
        await materializeTemplate({
          source: incoming.baseline,
          target,
          example: 'basic',
          release: 'v0.7.2',
        });
        await commit(target, ['.'], 'chore: initialize explicit no-install fixture');
        const result = await applyRelease({
          source: incoming.source,
          target,
          tag: 'v99.0.1',
          install: false,
          entry: {
            name: 'template-basic',
            kind: 'template',
            example: 'basic',
            requiredStatus: 'Validate',
          },
          runner(command, args, cwd) {
            assert.notEqual(command, 'pnpm');
            return run(command, args, cwd);
          },
        });
        assert.equal(result.changed, true);
        assert.equal(existsSync(path.join(target, 'node_modules')), false);
      },
    );
  },
);
