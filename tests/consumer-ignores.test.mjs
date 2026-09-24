import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { main as markdownlint } from 'markdownlint-cli2';
import prettier from 'prettier';

import { addMarkdownlintIgnore } from '../standards/consumer-ignores.ts';
import { applyPreset } from '../standards/web-platform.ts';

const reason = 'Agent worktrees are other checkouts of this repository.';

// A consumer's own configuration, written before the standard ignored agent worktrees.
const consumerMarkdownlint = `{
  // Documentation is checked like code.
  "customRules": ["./rules//none.js"],
  "config": { "default": true, "ignores": [".claude/worktrees"] },
  "globs": ["**/*.md"],
  "ignores": [
    ".lvbt/web-platform",
    "node_modules",
    // Build output.
    "**/dist",
  ],
}
`;

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvbt-ignores-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function preset() {
  const files = { 'catalog.json': '{}' };
  return { formatVersion: 1, preset: 'lvbt-web', release: 'v1.0.0', commit: 'a'.repeat(40), files };
}

/**
 * Another session's worktree: a checkout of the same repository on another branch, whose Markdown
 * breaks this checkout's rules and whose files still name a legacy package.
 */
async function agentWorktree(root) {
  const worktree = path.join(root, '.claude/worktrees/other');
  await mkdir(worktree, { recursive: true });
  await writeFile(path.join(worktree, '.git'), 'gitdir: /elsewhere/.git/worktrees/other\n');
  await writeFile(path.join(worktree, 'README.md'), '# One\n# Two\n');
  await writeFile(
    path.join(worktree, 'package.json'),
    '{ "devDependencies": { "@lvbt/cli": "1" } }\n',
  );
  return worktree;
}

async function lintMarkdown(root) {
  const errors = [];
  const code = await markdownlint({
    directory: root,
    argv: [],
    logError: (message) => errors.push(message),
  });
  return { code, errors: errors.join('\n') };
}

test("an update keeps another session's agent worktree out of git, Prettier, and markdownlint", () =>
  fixture(async (root) => {
    execFileSync('git', ['init', '--quiet', root]);
    await writeFile(path.join(root, '.gitignore'), 'node_modules/\n');
    await writeFile(path.join(root, '.prettierignore'), 'pnpm-lock.yaml\n');
    const config = consumerMarkdownlint.replace('"customRules": ["./rules//none.js"],\n  ', '');
    await writeFile(path.join(root, '.markdownlint-cli2.jsonc'), config);
    await writeFile(path.join(root, 'README.md'), '# Consumer\n');
    const worktree = await agentWorktree(root);
    assert.notEqual((await lintMarkdown(root)).code, 0, "the worktree's Markdown fails at first");
    const changed = ['.gitignore', '.markdownlint-cli2.jsonc', '.prettierignore'];

    const planned = await applyPreset(root, preset(), true);
    assert.deepEqual(planned.consumerChanged, changed);
    assert.equal(await readFile(path.join(root, '.markdownlint-cli2.jsonc'), 'utf8'), config);

    const applied = await applyPreset(root, preset());
    assert.deepEqual(applied.consumerChanged, changed);
    const lint = await lintMarkdown(root);
    assert.equal(lint.code, 0, lint.errors);
    assert.equal(
      spawnSync('git', ['-C', root, 'check-ignore', '--quiet', '.claude/worktrees/other']).status,
      0,
      'git ignores the worktree',
    );
    const ignorePath = path.join(root, '.prettierignore');
    const info = await prettier.getFileInfo(path.join(worktree, 'README.md'), { ignorePath });
    assert.ok(info.ignored, 'Prettier ignores the worktree');
    assert.match(
      await readFile(path.join(worktree, 'package.json'), 'utf8'),
      /@lvbt\/cli/,
      "the other session's files stay as they were",
    );

    assert.deepEqual((await applyPreset(root, preset())).consumerChanged, []);
  }));

test('adds the ignore first in the array and keeps every entry and comment', () => {
  const next = addMarkdownlintIgnore(consumerMarkdownlint, '.claude/worktrees', reason);
  assert.equal(
    next,
    consumerMarkdownlint.replace(
      '"ignores": [\n',
      `"ignores": [\n    // ${reason}\n    ".claude/worktrees",\n`,
    ),
  );
  assert.equal(addMarkdownlintIgnore(next, '.claude/worktrees', reason), next);
});

test('recognises the ignore wherever the top-level array already holds it', () => {
  const source = '{\n  "ignores": [\n    "dist",\n    ".claude/worktrees" // agents\n  ]\n}\n';
  assert.equal(addMarkdownlintIgnore(source, '.claude/worktrees', reason), source);
});

test('adds the ignore to an array written on one line', () => {
  assert.equal(
    addMarkdownlintIgnore('{ "ignores": ["dist"] }\n', '.claude/worktrees', reason),
    '{ "ignores": [".claude/worktrees", "dist"] }\n',
  );
});

test('gives a configuration without ignores the array', () => {
  assert.equal(
    addMarkdownlintIgnore('{\n  "globs": ["**/*.md"]\n}\n', '.claude/worktrees', reason),
    `{\n  // ${reason}\n  "ignores": [".claude/worktrees"],\n  "globs": ["**/*.md"]\n}\n`,
  );
});

test('refuses a configuration it cannot read rather than guessing', () => {
  assert.throws(() => addMarkdownlintIgnore('{ "ignores": ["dist }', 'x', reason), /unclosed/);
  assert.throws(() => addMarkdownlintIgnore('[]', 'x', reason), /one object/);
});
