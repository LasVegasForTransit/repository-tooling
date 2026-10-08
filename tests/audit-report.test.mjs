import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const audit = await import('../packages/cli/src/lib/audit/report.mjs').catch(() => ({}));
const scratch = await mkdtemp(path.join(tmpdir(), 'lvbt-audit-report-'));
after(() => rm(scratch, { recursive: true, force: true }));
const sha = 'a'.repeat(40);
const repository = 'LasVegasForTransit/example';
const environment = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: sha,
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'schedule',
};
function report(status = 'fail') {
  return {
    version: 1,
    repository,
    commit: sha,
    target: 'production',
    run: {
      id: '100',
      attempt: 1,
      repository,
      headSha: sha,
      headBranch: 'main',
      event: 'schedule',
      workflow: '.github/workflows/audits.yml',
      url: `https://github.com/${repository}/actions/runs/100`,
    },
    results: [
      {
        check: 'links',
        target: 'production',
        status,
        command: ['pnpm', 'audit:links'],
        findings:
          status === 'fail'
            ? [
                {
                  title: 'Broken link',
                  diagnostic: 'HTTP 404',
                  url: 'https://example.test/missing',
                  reproduction: 'pnpm audit:links',
                  artifacts: ['links.json'],
                },
              ]
            : [],
        diagnostics: [],
        artifacts: ['links.json'],
      },
    ],
  };
}
const remoteRun = {
  id: 100,
  run_attempt: 1,
  head_sha: sha,
  head_branch: 'main',
  event: 'schedule',
  path: '.github/workflows/audits.yml',
  workflow_id: 10,
  repository: { full_name: repository },
  html_url: `https://github.com/${repository}/actions/runs/100`,
  status: 'in_progress',
};
async function fixture(
  value,
  { run = remoteRun, latest = [remoteRun], issues = [], artifact = value } = {},
) {
  const dir = await mkdtemp(path.join(scratch, 'case-'));
  const input = path.join(dir, 'report.json');
  await writeFile(input, JSON.stringify(value));
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, ...args]);
    let data;
    if (command === process.execPath)
      return spawnSync(command, args, { encoding: 'utf8', cwd: dir });
    if (command === 'gh' && args[0] === 'api') {
      if (args[1] === `repos/${repository}`)
        data = { default_branch: 'main', full_name: repository };
      else if (args[1].includes('/contents/'))
        data = {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from('{"version":1}').toString('base64'),
        };
      else if (args[1].includes('/artifacts'))
        data = { artifacts: [{ id: 777, name: 'lvbt-audit-report', expired: false }] };
      else if (args[1].endsWith('/runs/100')) data = run;
      else if (args[1].includes('/workflows/')) data = { workflow_runs: latest };
      else throw new Error(`Unexpected API: ${args[1]}`);
    } else if (command === 'gh' && args[0] === 'run' && args[1] === 'download') {
      await writeFile(
        path.join(args[args.indexOf('--dir') + 1], 'lvbt-audit-report.json'),
        JSON.stringify(artifact),
      );
      return { status: 0, stdout: '', stderr: '' };
    } else if (command === 'gh' && args[0] === 'issue' && args[1] === 'list') data = issues;
    else throw new Error(`Unexpected mutation: ${command} ${args.join(' ')}`);
    return { status: 0, stdout: JSON.stringify(data), stderr: '' };
  };
  return { cwd: dir, input, execute, calls, environment };
}

test('verified failure previews one helper-owned bug with reproduction and artifact links', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const setup = await fixture(report());
  const result = await audit.reportAudit({ ...setup, dryRun: true, config: {} });
  assert.equal(result.actions[0].action, 'create');
  assert.deepEqual(result.actions[0].labels, [
    'bug',
    'audit-owned',
    'audit:links',
    'target:production',
  ]);
  assert.match(result.actions[0].title, /Links audit fails in production/);
  assert.match(
    result.actions[0].body,
    /# Steps to reproduce[\s\S]*pnpm audit:links[\s\S]*# Expected behavior[\s\S]*# Actual behavior[\s\S]*HTTP 404[\s\S]*# Additional context/,
  );
  assert.doesNotMatch(result.actions[0].body, /<!--/);
  assert.match(result.actions[0].body, /actions\/runs\/100\/artifacts\/777/);
});

test('untrusted events, forged evidence, and stale runs are rejected before issue mutation', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  for (const options of [
    { run: { ...remoteRun, event: 'pull_request' } },
    { artifact: { ...report(), commit: 'b'.repeat(40) } },
    { latest: [{ ...remoteRun, id: 101 }, remoteRun] },
  ]) {
    const setup = await fixture(report(), options);
    await assert.rejects(
      audit.reportAudit({ ...setup, dryRun: true, config: {} }),
      /trusted|artifact|stale|event/i,
    );
    assert.equal(
      setup.calls.some((call) => call[1] === 'issue'),
      false,
    );
  }
});

test('failed check reopens only its matching issue and errors never close issues', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const issue = {
    number: 7,
    title: 'Links audit fails in production',
    body: 'Verified run: 99 (attempt 1).',
    state: 'CLOSED',
    labels: [{ name: 'audit-owned' }, { name: 'audit:links' }, { name: 'target:production' }],
    url: `https://github.com/${repository}/issues/7`,
  };
  const failed = await fixture(report(), { issues: [issue] });
  assert.equal(
    (await audit.reportAudit({ ...failed, dryRun: true, config: {} })).actions[0].action,
    'reopen',
  );
  const errored = await fixture(report('error'), { issues: [issue] });
  assert.deepEqual((await audit.reportAudit({ ...errored, dryRun: true, config: {} })).actions, []);
  const passing = await fixture(report('pass'), { issues: [{ ...issue, state: 'OPEN' }] });
  assert.equal(
    (await audit.reportAudit({ ...passing, dryRun: true, config: {} })).actions[0].action,
    'close',
  );
});

test('newer issue evidence and duplicate audit-owned issues block mutations', async () => {
  assert.equal(typeof audit.reportAudit, 'function', 'audit reporter is missing');
  const issue = {
    number: 7,
    body: 'Verified run: 101 (attempt 1).',
    state: 'OPEN',
    labels: [{ name: 'audit-owned' }, { name: 'audit:links' }, { name: 'target:production' }],
  };
  const stale = await fixture(report(), { issues: [issue] });
  await assert.rejects(audit.reportAudit({ ...stale, dryRun: true, config: {} }), /stale/);
  const duplicate = await fixture(report(), {
    issues: [
      { ...issue, body: '' },
      { ...issue, number: 8, body: '' },
    ],
  });
  await assert.rejects(
    audit.reportAudit({ ...duplicate, dryRun: true, config: {} }),
    /multiple|duplicate/i,
  );
});

test('reporting rejects hidden metadata in findings before previewing issue updates', async () => {
  const value = report();
  value.results[0].findings[0].diagnostic = 'HTTP 404 <!-- hidden -->';
  const setup = await fixture(value);
  await assert.rejects(
    audit.reportAudit({ ...setup, dryRun: true, config: {} }),
    /hidden metadata/i,
  );
});

async function liveFixture(value, issue) {
  const directory = await mkdtemp(path.join(scratch, 'live-'));
  const input = path.join(directory, 'report.json');
  const state = path.join(directory, 'state.json');
  await writeFile(input, JSON.stringify(value));
  await writeFile(state, JSON.stringify({ issue, labels: [] }));
  const fakeGh = path.join(directory, 'gh');
  await writeFile(
    fakeGh,
    `#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2);
const state=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_STATE,'utf8'));
const report=JSON.parse(fs.readFileSync(process.env.AUDIT_TEST_REPORT,'utf8'));
const option=(name)=>args[args.indexOf(name)+1];
const emit=(value)=>console.log(typeof value==='string'?value:JSON.stringify(value));
if(args[0]==='api') {
 if(args[1]==='repos/'+report.repository) emit({default_branch:'main'});
 else if(args[1].includes('/contents/')) emit({type:'file',encoding:'base64',content:Buffer.from('{"version":1}').toString('base64')});
 else if(args[1].includes('/artifacts')) emit({artifacts:[{id:777,name:'lvbt-audit-report',expired:false}]});
 else if(args[1].includes('/workflows/')) emit({workflow_runs:[{id:100,run_attempt:1,event:'schedule'}]});
 else emit({id:100,run_attempt:1,head_sha:report.commit,head_branch:'main',event:'schedule',path:'.github/workflows/audits.yml',workflow_id:10,repository:{full_name:report.repository},html_url:report.run.url});
} else if(args[0]==='run') fs.copyFileSync(process.env.AUDIT_TEST_REPORT,path.join(option('--dir'),'lvbt-audit-report.json'));
else if(args[0]==='label') {
 if(args[1]==='list') emit(state.labels.map(name=>({name})));
 else state.labels.push(args[2]);
} else if(args[0]==='issue') {
 if(args[1]==='list') emit(state.issue?[state.issue]:[]);
 else if(args[1]==='view') emit(state.issue);
 else if(args[1]==='create') {
  if(state.issue) throw new Error('Duplicate issue creation');
  state.issue={number:7,title:option('--title'),body:fs.readFileSync(option('--body-file'),'utf8'),state:'OPEN',labels:args.flatMap((arg,index)=>arg==='--label'?[{name:args[index+1]}]:[]),url:'https://github.com/'+report.repository+'/issues/7'};
  emit(state.issue.url);
 } else if(args[1]==='edit') {state.issue.title=option('--title');state.issue.body=fs.readFileSync(option('--body-file'),'utf8');}
 else if(args[1]==='reopen') state.issue.state='OPEN';
 else if(args[1]==='close') state.issue.state='CLOSED';
 else throw new Error('Unexpected issue operation');
} else throw new Error('Unexpected GitHub call');
fs.writeFileSync(process.env.AUDIT_TEST_STATE,JSON.stringify(state));
`,
    { mode: 0o755 },
  );
  const execute = async (command, args) =>
    spawnSync(command, args, {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        AUDIT_TEST_STATE: state,
        AUDIT_TEST_REPORT: input,
      },
    });
  return { cwd: directory, input, execute, state, environment };
}

test('live helper boundary creates, updates, reopens, and closes one stored owned issue', async () => {
  const owned = {
    number: 7,
    title: 'Old finding',
    body: 'Verified run: 99 (attempt 1).',
    state: 'OPEN',
    labels: [
      { name: 'bug' },
      { name: 'audit-owned' },
      { name: 'audit:links' },
      { name: 'target:production' },
    ],
    url: `https://github.com/${repository}/issues/7`,
  };
  for (const [status, initial, expectedAction, expectedState] of [
    ['fail', undefined, 'create', 'OPEN'],
    ['fail', owned, 'update', 'OPEN'],
    ['fail', { ...owned, state: 'CLOSED' }, 'reopen', 'OPEN'],
    ['pass', owned, 'close', 'CLOSED'],
  ]) {
    const setup = await liveFixture(report(status), initial);
    const result = await audit.reportAudit({ ...setup, config: {} });
    assert.equal(result.actions[0].action, expectedAction);
    const stored = JSON.parse(
      await (await import('node:fs/promises')).readFile(setup.state, 'utf8'),
    ).issue;
    assert.equal(stored.state, expectedState);
    assert.equal(stored.number, 7);
    assert.equal(stored.title, 'Links audit fails in production');
    assert.match(stored.body, /Verified run: 100 \(attempt 1\)/);
    assert.match(stored.body, status === 'pass' ? /now passes/ : /HTTP 404/);
    assert.deepEqual(
      stored.labels.map((label) => label.name),
      ['bug', 'audit-owned', 'audit:links', 'target:production'],
    );
  }
});
test('audit writes cannot replay trusted evidence from a local or PR executor', async () => {
  for (const environment of [{}, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    const setup = await liveFixture(report());
    await assert.rejects(
      audit.reportAudit({ ...setup, config: {}, environment }),
      /executor|execution|workflow/i,
    );
    assert.equal(
      JSON.parse(await (await import('node:fs/promises')).readFile(setup.state, 'utf8')).issue,
      undefined,
    );
  }
});
test('audit artifact selection must match declarations at the verified source commit', async () => {
  const setup = await fixture(report());
  await assert.rejects(
    audit.reportAudit({
      ...setup,
      dryRun: true,
      config: {
        audits: { workflow: '.github/workflows/audits.yml', artifactName: 'lvbt-audit-report' },
      },
    }),
    /configuration|declaration|commit/i,
  );
});
test('an audit-owned result cannot mutate a pull request or another automation owner', async () => {
  const issue = {
    number: 7,
    body: '',
    state: 'OPEN',
    labels: ['audit-owned', 'audit:links', 'target:production'].map((name) => ({ name })),
  };
  const pullRequest = await fixture(report('pass'), {
    issues: [{ ...issue, pull_request: { url: 'https://github.com/example/pull/7' } }],
  });
  assert.deepEqual(
    (await audit.reportAudit({ ...pullRequest, config: {}, dryRun: true })).actions,
    [],
  );
  const ambiguous = await fixture(report(), {
    issues: [{ ...issue, labels: [...issue.labels, { name: 'recurring-owned' }] }],
  });
  await assert.rejects(audit.reportAudit({ ...ambiguous, config: {}, dryRun: true }), /ownership/i);
});
