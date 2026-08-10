import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const helper = path.join(
  repositoryRoot,
  'plugins/lvbt-contributions/scripts/github-create.mjs',
);

async function bodyFile(body) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-github-create-'));
  const file = path.join(directory, 'body.md');
  await writeFile(file, body);
  return file;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [helper, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

async function fakeGh(source) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-fake-gh-'));
  await writeFile(path.join(directory, 'gh'), `#!/usr/bin/env node\n${source}`, {
    mode: 0o755,
  });
  return directory;
}

test('a complete bug report renders without hidden metadata', async () => {
  const file = await bodyFile(`# Steps to reproduce

Open the editor and import the same feed twice.

# Expected behavior

The existing import should be replaced.

# Actual behavior

Both imports remain visible.

# Additional context

This reproduces in Firefox and Chrome.
`);
  const result = run([
    'issue',
    '--type',
    'bug',
    '--title',
    'Importing a feed twice duplicates every route',
    '--body-file',
    file,
    '--dry-run',
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, true);
  assert.equal(output.label, 'bug');
  assert.doesNotMatch(output.body, /transitmapper:|<!--/);
});

test('an untouched issue prompt is rejected', async () => {
  const file = await bodyFile(`# Problem

[Describe the problem]

# Proposed change

Add a useful improvement.

# Additional context
`);
  const result = run([
    'issue',
    '--type',
    'feature',
    '--title',
    'Make imported route colors easier to distinguish',
    '--body-file',
    file,
    '--dry-run',
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /placeholder/i);
});

test('a readable pull request body passes the conventional title rule', async () => {
  const file = await bodyFile(`# TL;DR

Restore the organization contribution workflow.

# Overview of Changes

## Verification

Ran the repository check.

# Follow-ups

`);
  const result = run([
    'pr',
    '--title',
    'chore: standardize contribution tooling',
    '--body-file',
    file,
    '--dry-run',
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);
});

test('a non-conventional pull request title is rejected', async () => {
  const file = await bodyFile(`# TL;DR

Restore the workflow.

# Overview of Changes

The repository now follows the shared standard.

# Follow-ups
`);
  const result = run([
    'pr',
    '--title',
    'Standardize everything',
    '--body-file',
    file,
    '--dry-run',
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /conventional/i);
});

test('a GitHub failure is reported as a runtime failure', async () => {
  const file = await bodyFile(`# Problem

Imported stop names are difficult to scan.

# Proposed change

Group stops by route in the import preview.

# Additional context
`);
  const bin = await fakeGh("process.stderr.write('GitHub is unavailable\\n'); process.exit(1);\n");
  const result = run(
    [
      'issue',
      '--type',
      'feature',
      '--title',
      'Group imported stops by route in the preview',
      '--body-file',
      file,
    ],
    { PATH: `${bin}:${process.env.PATH}` },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /GitHub is unavailable/);
});

test('a stored metadata mismatch is reported without deleting the issue', async () => {
  const body = `# Steps to reproduce

Import the same feed twice.

# Expected behavior

The existing import is replaced.

# Actual behavior

Both imports remain.

# Additional context
`;
  const file = await bodyFile(body);
  const directory = await mkdtemp(path.join(tmpdir(), 'lvbt-gh-log-'));
  const log = path.join(directory, 'calls.log');
  const bin = await fakeGh(`
const fs = require('node:fs');
fs.appendFileSync(process.env.FAKE_GH_LOG, process.argv.slice(2).join(' ') + '\\n');
if (process.argv[2] === 'issue' && process.argv[3] === 'create') {
  console.log('https://github.com/LasVegasForTransit/example/issues/1');
} else {
  console.log(JSON.stringify({ number: 1, title: 'Changed title', body: '', url: 'https://github.com/LasVegasForTransit/example/issues/1' }));
}
`);
  const result = run(
    [
      'issue',
      '--type',
      'bug',
      '--title',
      'Importing the same feed twice duplicates every route',
      '--body-file',
      file,
    ],
    { PATH: `${bin}:${process.env.PATH}`, FAKE_GH_LOG: log },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /differs from the verified preview/);
  assert.doesNotMatch(await readFile(log, 'utf8'), /delete|close/);
});
