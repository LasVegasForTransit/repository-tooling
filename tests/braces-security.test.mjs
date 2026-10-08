import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Exercise the actual dependency chain used by the mandatory Markdown gate.
const rootRequire = createRequire(import.meta.url);
const markdownRequire = createRequire(rootRequire.resolve('markdownlint-cli2'));
const globRequire = createRequire(markdownRequire.resolve('fast-glob'));
const micromatch = globRequire('micromatch');
const matchRequire = createRequire(globRequire.resolve('micromatch'));
const braces = matchRequire('braces');
const bracesPath = matchRequire.resolve('braces');
const fastGlob = markdownRequire('fast-glob');

test('installed braces rejects deeply nested attacker inputs below its character limit', () => {
  const inputs = [
    '{'.repeat(4500) + 'a,b' + '}'.repeat(4500),
    '('.repeat(4500) + 'a,b' + ')'.repeat(4500),
    '{('.repeat(2200) + 'a,b' + ')}'.repeat(2200),
    '{'.repeat(4500) + 'a,b',
    '('.repeat(4500) + 'a,b',
  ];
  for (const input of inputs) {
    assert.ok(input.length < 10000);
    for (const method of ['parse', 'compile', 'stringify', 'expand', 'create']) {
      for (const maxDepth of [undefined, Infinity, NaN, 1e9]) {
        assert.throws(
          () => braces[method](input, { maxDepth }),
          /exceeds max depth/,
          `${method} must reject depth before recursive stack exhaustion`,
        );
      }
    }
  }
});

test('installed walkers bound caller-supplied ASTs and reject parent cycles without hanging', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const assert = require('node:assert/strict');
       const braces = require(process.argv[1]);
       for (const method of ['compile', 'stringify', 'expand']) {
         const ast = {type: 'root', nodes: []};
         let node = ast;
         for (let i = 0; i < 4500; i++) {
           const child = {type: 'paren', nodes: []};
           node.nodes.push(child); node = child;
         }
         assert.throws(() => braces[method](ast), /exceeds max depth/);
         const cycle = {type: 'root', nodes: []};
         cycle.nodes.push(cycle);
         assert.throws(() => braces[method](cycle), /exceeds max depth/);
       }
       const parent = {type: 'paren', nodes: []};
       parent.parent = parent;
       const ast = {type: 'root', nodes: [parent]};
       assert.throws(() => braces.expand(ast), /parent chain contains a cycle/);`,
      bracesPath,
    ],
    { encoding: 'utf8', timeout: 3000 },
  );
  assert.equal(result.error, undefined, 'malicious AST must not hang the process');
  assert.equal(result.status, 0, result.stderr);
});

test('depth and length option edge cases cannot disable installed parser guards', () => {
  const nested = (depth) => '{'.repeat(depth) + 'a,b' + '}'.repeat(depth);
  for (const maxDepth of [Infinity, -Infinity, NaN, '1000', null, {}])
    assert.throws(() => braces.parse(nested(101), { maxDepth }), /exceeds max depth/);
  assert.doesNotThrow(() => braces.parse(nested(100)));
  assert.doesNotThrow(() => braces.parse(nested(1), { maxDepth: 1.5 }));
  assert.throws(() => braces.parse(nested(2), { maxDepth: 1.5 }), /exceeds max depth/);
  for (const maxLength of [Infinity, 1e9])
    assert.throws(() => braces.parse('a'.repeat(10001), { maxLength }), /exceeds max characters/);
  for (const maxLength of [NaN, -1, -Infinity])
    assert.throws(() => braces.parse('abc', { maxLength }), /non-negative/);
  let reads = 0;
  assert.throws(
    () =>
      braces.parse(nested(2), {
        get maxDepth() {
          return ++reads === 1 ? 1 : NaN;
        },
      }),
    /exceeds max depth/,
  );
  assert.equal(reads, 1);
});

test('actual micromatch and fast-glob preserve normal Markdown and source discovery', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-braces-glob-'));
  const files = ['src/a.js', 'src/b.ts', 'docs/a.md', 'docs/b.mdx', 'assets/1.png', 'assets/2.png'];
  try {
    for (const file of files) {
      const filename = path.join(directory, file);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, 'fixture\n');
    }
    for (const [pattern, expected] of [
      ['**/*.{js,ts}', ['src/a.js', 'src/b.ts']],
      ['{docs,missing}/*.{md,mdx}', ['docs/a.md', 'docs/b.mdx']],
      ['assets/{1..2}.png', ['assets/1.png', 'assets/2.png']],
      ['{src/{a,b},missing/*}.{js,ts}', ['src/a.js', 'src/b.ts']],
    ]) {
      assert.deepEqual(micromatch(files, pattern).sort(), expected);
      assert.deepEqual(fastGlob.sync(pattern, { cwd: directory }).sort(), expected);
    }
    assert.deepEqual(braces.expand('{a,b}{1..2}'), ['a1', 'a2', 'b1', 'b2']);
    assert.deepEqual(braces('a/{b,c}/d'), ['a/(b|c)/d']);
    assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
    const attacker = '{'.repeat(4500) + 'a,b' + '}'.repeat(4500);
    assert.throws(() => micromatch.braces(attacker), /exceeds max depth/);
    assert.throws(() => fastGlob.sync(attacker, { cwd: directory }), /exceeds max depth/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
