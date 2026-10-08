import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
async function setupScript() {
  const action = await readFile(
    path.join(root, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8',
  );
  const step = action.split('    - name: Install reviewed secret scanner\n')[1];
  assert.ok(
    step,
    'CI must provision its configured scanner without relying on Docker availability.',
  );
  assert.match(step, /hashFiles\('\.gitleaks\.toml'\)/);
  return step
    .split('      run: |\n')[1]
    .split('\n')
    .map((line) => line.slice(8))
    .join('\n');
}

test('CI rejects a tampered scanner archive before extraction or execution', async () => {
  const script = await setupScript();
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'lvbt-scanner-'));
  try {
    const bin = path.join(temporary, 'bin');
    await mkdir(bin);
    await writeFile(
      path.join(bin, 'curl'),
      '#!/bin/bash\nwhile [ "$1" != "--output" ]; do shift; done\nprintf tampered > "$2"\n',
      { mode: 0o755 },
    );
    await writeFile(path.join(bin, 'tar'), '#!/bin/bash\ntouch "$RUNNER_TEMP/extracted"\n', {
      mode: 0o755,
    });
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_OS: 'Linux',
        RUNNER_ARCH: 'X64',
        RUNNER_TEMP: temporary,
        GITHUB_PATH: path.join(temporary, 'path'),
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /FAILED|did NOT match/);
    await assert.rejects(readFile(path.join(temporary, 'extracted')));
    await assert.rejects(readFile(path.join(temporary, 'path')));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('CI rejects unsupported scanner platforms before downloading', async () => {
  const script = await setupScript();
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    env: { ...process.env, RUNNER_OS: 'Unknown', RUNNER_ARCH: 'X64' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported scanner runner/);
});

test('all generated CI setup actions come from the canonical action', async () => {
  const action = await readFile(
    path.join(root, '.github/actions/setup-node-pnpm/action.yml'),
    'utf8',
  );
  for (const example of ['basic', 'with-astro', 'with-vite-react']) {
    assert.equal(
      await readFile(
        path.join(root, 'examples', example, '.github/actions/setup-node-pnpm/action.yml'),
        'utf8',
      ),
      action,
    );
  }
});
