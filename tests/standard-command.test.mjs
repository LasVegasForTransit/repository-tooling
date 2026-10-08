import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkStandard } from '../packages/cli/src/lib/check/standard.mjs';
import * as standard from '../packages/cli/src/lib/check/standard.mjs';
test('remote inventory can use the same pure vendored command contract', () => {
  assert.equal(typeof standard.standardCommandsFor, 'function');
  assert.equal(
    standard.standardCommandsFor({ vendored: true }).bootstrap,
    'node .lvbt/web-platform/packages/cli/src/cli.mjs bootstrap',
  );
  assert.equal(standard.standardCommandsFor({ vendored: false }).preflight, 'lvbt preflight');
});
test('standard command drift warns with a concrete upstream migration action', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-standard-check-'));
  try {
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        scripts: {
          bootstrap: 'tsx scripts/bootstrap.ts',
          preflight: 'tsx doctor.ts',
          check: 'pnpm lint',
        },
      }),
    );
    const result = await checkStandard({ cwd });
    assert.equal(result.ok, true);
    assert.match(result.lines.join('\n'), /warning.*bootstrap/);
    assert.match(result.lines.join('\n'), /lvbt bootstrap/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('standard check detects invalid tooling declarations before bootstrap', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-standard-config-'));
  try {
    await mkdir(path.join(cwd, '.lvbt'));
    await writeFile(path.join(cwd, 'package.json'), '{}');
    await writeFile(path.join(cwd, '.lvbt/tooling.json'), '{"version":2}');
    const result = await checkStandard({ cwd });
    assert.equal(result.ok, false);
    assert.match(result.lines.join('\n'), /version/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('standard diagnostics accept direct vendored setup entrypoints and warn about the effective pnpm guard', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-direct-command-'));
  try {
    await mkdir(path.join(cwd, '.lvbt/web-platform/packages/cli/src'), { recursive: true });
    await writeFile(path.join(cwd, '.lvbt/web-platform/packages/cli/src/cli.mjs'), '');
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        scripts: {
          bootstrap: 'node .lvbt/web-platform/packages/cli/src/cli.mjs bootstrap',
          preflight: 'node .lvbt/web-platform/packages/cli/src/cli.mjs preflight',
        },
      }),
    );
    await writeFile(
      path.join(cwd, 'pnpm-workspace.yaml'),
      'packages: []\nverifyDepsBeforeRun: false\n',
    );
    const result = await checkStandard({ cwd });
    assert.doesNotMatch(
      result.lines.join('\n'),
      /warning.*bootstrap|warning.*preflight|verifyDepsBeforeRun/,
    );
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages: []\n');
    assert.match(
      (await checkStandard({ cwd })).lines.join('\n'),
      /verifyDepsBeforeRun: false.*pnpm-workspace/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
