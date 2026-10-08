import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const audit = await import('../packages/cli/src/lib/audit/index.mjs').catch(() => ({}));
const scratch = await mkdtemp(path.join(tmpdir(), 'lvbt-audits-'));
after(() => rm(scratch, { recursive: true, force: true }));

test('adapters preserve actionable failures from pinned checker output', () => {
  assert.equal(typeof audit.parseAudit, 'function', 'shared audit parser is missing');
  const cases = [
    [
      'links',
      'lychee',
      {
        total: 2,
        successful: 1,
        errors: 1,
        error_map: {
          'https://example.test/page': [
            { url: 'https://example.test/missing', status: { code: 404, text: 'Not Found' } },
          ],
        },
      },
      /missing/,
    ],
    [
      'links',
      'links',
      {
        checked: 2,
        results: [{ url: 'https://example.test/bad', status: 'fail', diagnostic: 'HTTP 404' }],
      },
      /HTTP 404/,
    ],
    [
      'lighthouse',
      'lighthouse',
      {
        finalUrl: 'https://example.test',
        categories: { performance: { score: 0.6 } },
        audits: {
          'largest-contentful-paint': {
            title: 'Largest Contentful Paint',
            score: 0.4,
            displayValue: '8 s',
          },
        },
      },
      /8 s/,
    ],
    [
      'dependencies',
      'pnpm',
      {
        advisories: {
          1001: {
            module_name: 'example',
            title: 'Example advisory',
            severity: 'high',
            vulnerable_versions: '<2',
            recommendation: 'Upgrade to 2',
            url: 'https://example.test/advisory',
            findings: [{ paths: ['site>example'] }],
          },
        },
        metadata: { vulnerabilities: { high: 1 } },
      },
      /Upgrade to 2/,
    ],
  ];
  for (const [check, format, input, expected] of cases) {
    const result = audit.parseAudit(check, format, input, 1);
    assert.equal(result.status, 'fail');
    assert.match(JSON.stringify(result.findings), expected);
  }
});

test('empty or malformed evidence cannot become a passing audit', () => {
  assert.equal(typeof audit.parseAudit, 'function', 'shared audit parser is missing');
  for (const [check, format] of [
    ['links', 'lychee'],
    ['links', 'links'],
    ['lighthouse', 'lighthouse'],
    ['lighthouse', 'lhci'],
    ['dependencies', 'pnpm'],
  ]) {
    assert.throws(
      () => audit.parseAudit(check, format, {}, 0),
      /evidence|output|results|audit|report/i,
    );
  }
  assert.equal(
    audit.parseAudit(
      'dependencies',
      'pnpm',
      { metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } } },
      0,
    ).status,
    'pass',
  );
  assert.equal(audit.parseAudit('links', 'links', { checked: 3, results: [] }, 0).status, 'pass');
});

test('failed launch or invalid JSON produces an error report with no secret serialization', async () => {
  assert.equal(typeof audit.runAudits, 'function', 'shared audit runner is missing');
  const report = await audit.runAudits({
    cwd: scratch,
    config: { audits: { links: { local: { command: ['missing-tool'], format: 'links' } } } },
    check: 'links',
    env: { SECRET: 'private', GITHUB_SHA: 'a'.repeat(40) },
    execute: async (command) =>
      command === 'git'
        ? { status: 0, stdout: 'a'.repeat(40), stderr: '' }
        : { status: 127, stdout: '', stderr: 'missing-tool not found' },
  });
  assert.equal(report.results[0].status, 'error');
  assert.match(report.results[0].diagnostics.join(' '), /missing-tool/);
  assert.doesNotMatch(JSON.stringify(report), /private|SECRET/);
});

test('runner uses explicit production configuration and saves parser failures as error', async () => {
  assert.equal(typeof audit.runAudits, 'function', 'shared audit runner is missing');
  const output = path.join(scratch, 'links.json');
  await writeFile(
    output,
    JSON.stringify({
      checked: 1,
      results: [{ url: 'https://example.test/bad', status: 'fail', diagnostic: 'HTTP 404' }],
    }),
  );
  const report = await audit.runAudits({
    cwd: scratch,
    target: 'production',
    check: 'links',
    config: {
      audits: {
        links: {
          production: {
            command: [
              process.execPath,
              '-e',
              `require('node:fs').writeFileSync('links.json', '${JSON.stringify({ checked: 1, results: [{ url: 'https://example.test/bad', status: 'fail', diagnostic: 'HTTP 404' }] })}');process.exit(1)`,
            ],
            output: 'links.json',
            format: 'links',
          },
        },
      },
    },
  });
  assert.equal(report.target, 'production');
  assert.equal(report.results[0].status, 'fail');
  assert.equal(report.results[0].artifacts[0], 'links.json');
});

test('runner rejects configured paths escaping repository and never executes them', async () => {
  assert.equal(typeof audit.runAudits, 'function', 'shared audit runner is missing');
  const report = await audit.runAudits({
    cwd: scratch,
    check: 'links',
    config: {
      audits: { links: { local: { command: ['never'], cwd: '../escape', format: 'links' } } },
    },
    execute: async (command) => {
      assert.equal(command, 'git');
      return { status: 0, stdout: 'a'.repeat(40), stderr: '' };
    },
  });
  assert.equal(report.results[0].status, 'error');
  assert.match(report.results[0].diagnostics[0], /relative|outside|escape/);
});

test('old output from a prior passing run cannot pass a tool that wrote no evidence', async () => {
  const output = path.join(scratch, 'stale.json');
  await writeFile(output, JSON.stringify({ checked: 5, results: [] }));
  const report = await audit.runAudits({
    cwd: scratch,
    check: 'links',
    config: {
      audits: {
        links: {
          local: {
            command: [process.execPath, '-e', 'process.exit(0)'],
            output: 'stale.json',
            format: 'links',
          },
        },
      },
    },
  });
  assert.equal(report.results[0].status, 'error');
});

test('new output directories are allowed without allowing symlink escapes', async () => {
  const report = await audit.runAudits({
    cwd: scratch,
    check: 'links',
    config: {
      audits: {
        links: {
          local: {
            command: [
              process.execPath,
              '-e',
              `require('node:fs').mkdirSync('new-results',{recursive:true});require('node:fs').writeFileSync('new-results/links.json','{"checked":1,"results":[]}')`,
            ],
            output: 'new-results/links.json',
            format: 'links',
          },
        },
      },
    },
  });
  assert.equal(report.results[0].status, 'pass');
});

test('report commit describes the executed checkout rather than an unrelated environment SHA', async () => {
  const report = await audit.runAudits({
    cwd: scratch,
    check: 'links',
    env: { GITHUB_SHA: 'b'.repeat(40) },
    config: { audits: { links: { local: { command: ['checker'], format: 'links' } } } },
    execute: async (command) => ({
      status: 0,
      stderr: '',
      stdout: command === 'git' ? 'a'.repeat(40) : '{"checked":1,"results":[]}',
    }),
  });
  assert.equal(report.commit, 'a'.repeat(40));
});

test('invalid repository audit configuration still emits the JSON error report', async () => {
  const directory = await mkdtemp(path.join(scratch, 'invalid-config-'));
  await (await import('node:fs/promises')).mkdir(path.join(directory, '.lvbt'));
  await writeFile(path.join(directory, '.lvbt/tooling.json'), 'broken JSON');
  const { spawnSync } = await import('node:child_process');
  const moduleUrl = new URL('../packages/cli/src/lib/audit/index.mjs', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {audit}=await import(${JSON.stringify(moduleUrl)});process.exitCode=await audit({cwd:process.cwd(),options:{positional:['links'],json:true}});`,
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stdout,
    /"status": "error"/,
    'invalid config omitted the required error report',
  );
  const report = JSON.parse(result.stdout);
  assert.equal(report.results[0].status, 'error');
  assert.match(report.results[0].diagnostics[0], /tooling.json/);
});

test('an omitted check selects configured target adapters plus the default dependency audit', async () => {
  const report = await audit.runAudits({
    cwd: scratch,
    config: {},
    execute: async (command) => ({
      status: 0,
      stderr: '',
      stdout:
        command === 'git'
          ? 'a'.repeat(40)
          : '{"metadata":{"vulnerabilities":{"low":0,"moderate":0,"high":0,"critical":0}}}',
    }),
  });
  assert.deepEqual(
    report.results.map((result) => result.check),
    ['dependencies'],
  );
  assert.equal(report.results[0].status, 'pass');
});
