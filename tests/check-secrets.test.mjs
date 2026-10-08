import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkSecrets,
  secretScannerFinding,
  GITLEAKS_IMAGE,
} from '../packages/cli/src/lib/check/secrets.mjs';

async function fixture(run, { configured = true } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'lvbt-secret-check-'));
  try {
    execFileSync('git', ['init', '--quiet', cwd]);
    const bin = path.join(cwd, 'bin');
    await mkdir(bin);
    if (configured)
      await writeFile(path.join(cwd, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
    for (const tool of ['gitleaks', 'docker']) {
      const file = path.join(bin, tool);
      await writeFile(
        file,
        `#!${process.execPath}\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);fs.appendFileSync(process.env.COMMAND_LOG,JSON.stringify({tool:'${tool}',args})+'\\n');\nif ('${tool}'==='gitleaks' && args[0]==='version') {console.log(process.env.NATIVE_VERSION ?? '8.30.1');process.exit(0);}\nif ('${tool}'==='docker' && args[0]==='info') process.exit(process.env.DOCKER_AVAILABLE==='yes'?0:1);\nif ('${tool}'==='docker' && args[0]==='rm') process.exit(0);\nif (process.env.SCAN_MODE==='timeout') setTimeout(()=>{},5000);\nelse {console.log('secret-value-that-must-not-be-reprinted');process.exit(Number(process.env.SCAN_EXIT ?? 0));}\n`,
      );
      await chmod(file, 0o755);
    }
    const log = path.join(cwd, 'commands.jsonl');
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      COMMAND_LOG: log,
    };
    const commands = async () =>
      (await readFile(log, 'utf8').catch(() => ''))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    await run({ cwd, env, commands });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('repositories without product scanner rules skip without invoking any tool', () =>
  fixture(
    async ({ cwd, env, commands }) => {
      assert.equal((await checkSecrets({ cwd, env })).ok, true);
      assert.equal(secretScannerFinding({ cwd, env }), undefined);
      assert.deepEqual(await commands(), []);
    },
    { configured: false },
  ));

test('exact reviewed native scanner performs a full-history redacted scan with product config', () =>
  fixture(async ({ cwd, env, commands }) => {
    const result = await checkSecrets({ cwd, env });
    assert.equal(result.ok, true);
    assert.deepEqual(await commands(), [
      { tool: 'gitleaks', args: ['version'] },
      {
        tool: 'gitleaks',
        args: ['git', '--redact', '--no-banner', '--config', path.join(cwd, '.gitleaks.toml')],
      },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  }));

test('unreviewed native version cannot scan and uses only the pinned Docker digest', () =>
  fixture(async ({ cwd, env, commands }) => {
    const result = await checkSecrets({
      cwd,
      env: { ...env, NATIVE_VERSION: '8.99.0', DOCKER_AVAILABLE: 'yes' },
    });
    assert.equal(result.ok, true);
    const calls = await commands();
    assert.equal(calls.filter(({ tool }) => tool === 'gitleaks').length, 1);
    const scan = calls.find(({ tool, args }) => tool === 'docker' && args[0] === 'run');
    assert.ok(scan.args.includes(GITLEAKS_IMAGE));
    assert.ok(scan.args.includes(`${cwd}:/repo:ro`));
    assert.deepEqual(scan.args.slice(-5), [
      'git',
      '--redact',
      '--no-banner',
      '--config',
      '/repo/.gitleaks.toml',
    ]);
  }));

test('configured scanner availability fails precisely without a reviewed native or Docker daemon', () =>
  fixture(async ({ cwd, env }) => {
    const finding = secretScannerFinding({ cwd, env: { ...env, NATIVE_VERSION: '8.99.0' } });
    assert.equal(finding.ok, false);
    assert.match(finding.detail, /8\.30\.1/);
    assert.match(finding.fix, /Docker/);
    assert.equal(
      (await checkSecrets({ cwd, env: { ...env, NATIVE_VERSION: '8.99.0' } })).ok,
      false,
    );
  }));

test('preflight availability probes do not scan history or request publishing authentication', () =>
  fixture(async ({ cwd, env, commands }) => {
    assert.equal(secretScannerFinding({ cwd, env }).ok, true);
    assert.deepEqual(await commands(), [{ tool: 'gitleaks', args: ['version'] }]);
  }));

test('shallow history fails before scanner invocation', () =>
  fixture(async ({ cwd, env, commands }) => {
    await writeFile(path.join(cwd, '.git/shallow'), `${'a'.repeat(40)}\n`);
    const result = await checkSecrets({ cwd, env });
    assert.equal(result.ok, false);
    assert.match(result.lines.join('\n'), /full.*history|shallow/i);
    assert.deepEqual(await commands(), []);
  }));

for (const [exit, expected] of [
  [1, /secret.*detected/i],
  [2, /failed.*2/i],
])
  test(`scanner exit ${exit} fails without reprinting secret content`, () =>
    fixture(async ({ cwd, env }) => {
      const result = await checkSecrets({ cwd, env: { ...env, SCAN_EXIT: String(exit) } });
      assert.equal(result.ok, false);
      assert.match(result.lines.join('\n'), expected);
      assert.doesNotMatch(JSON.stringify(result), /secret-value/);
    }));

test('native scan timeout fails boundedly without output exposure', () =>
  fixture(async ({ cwd, env }) => {
    const result = await checkSecrets({ cwd, env: { ...env, SCAN_MODE: 'timeout' }, timeout: 80 });
    assert.equal(result.ok, false);
    assert.match(result.lines.join('\n'), /timed out/i);
    assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  }));

test('Docker scan timeout removes only its own named disposable container', () =>
  fixture(async ({ cwd, env, commands }) => {
    const result = await checkSecrets({
      cwd,
      env: { ...env, NATIVE_VERSION: '8.99.0', DOCKER_AVAILABLE: 'yes', SCAN_MODE: 'timeout' },
      timeout: 80,
    });
    assert.equal(result.ok, false);
    const calls = await commands();
    const scan = calls.find(({ args }) => args[0] === 'run');
    const name = scan.args[scan.args.indexOf('--name') + 1];
    assert.match(name, /^lvbt-secret-scan-/);
    assert.ok(
      calls.some(
        ({ tool, args }) =>
          tool === 'docker' &&
          args[0] === 'rm' &&
          args[1] === '--force' &&
          args[2] === name &&
          args.length === 3,
      ),
    );
  }));

const cli = new URL('../packages/cli/src/cli.mjs', import.meta.url).pathname;
test('actual CLI dispatch invokes the explicit scanner but default shape checks exclude it', () =>
  fixture(async ({ cwd, env, commands }) => {
    const explicit = spawnSync(process.execPath, [cli, 'check', 'secrets'], {
      cwd,
      env,
      encoding: 'utf8',
    });
    assert.equal(explicit.status, 0, explicit.stdout + explicit.stderr);
    assert.match(explicit.stdout, /ok\s+secrets/);
    const before = await commands();
    const defaults = spawnSync(process.execPath, [cli, 'check'], { cwd, env, encoding: 'utf8' });
    assert.doesNotMatch(defaults.stdout, /(?:ok|FAIL)\s+secrets/);
    assert.deepEqual(await commands(), before);
  }));

test('pinned Docker fallback mounts genuine linked-worktree Git history read-only', () =>
  fixture(async ({ cwd, env, commands }) => {
    const history = path.join(cwd, 'history.git');
    const worktree = path.join(cwd, 'consumer');
    execFileSync('git', [
      'clone',
      '--quiet',
      '--bare',
      path.resolve(import.meta.dirname, '..'),
      history,
    ]);
    execFileSync('git', [
      '--git-dir',
      history,
      'worktree',
      'add',
      '--quiet',
      '--detach',
      worktree,
      'HEAD',
    ]);
    await writeFile(path.join(worktree, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
    const result = await checkSecrets({
      cwd: worktree,
      env: { ...env, NATIVE_VERSION: '8.99.0', DOCKER_AVAILABLE: 'yes' },
    });
    assert.equal(result.ok, true);
    const scan = (await commands()).find(({ args }) => args[0] === 'run');
    assert.ok(scan.args.includes(`${worktree}:/repo:ro`));
    const actualHistory = await realpath(history);
    assert.ok(scan.args.includes(`${actualHistory}:${actualHistory}:ro`));
    assert.ok(scan.args.includes(`GIT_COMMON_DIR=${actualHistory}`));
    assert.ok(scan.args.includes(`GIT_DIR=${actualHistory}/worktrees/consumer`));
    assert.ok(!scan.args.some((arg) => arg === `${actualHistory}:${actualHistory}`));
  }));
