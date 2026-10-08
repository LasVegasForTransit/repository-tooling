import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const recurring = await import('../packages/cli/src/lib/contributions/recurring.mjs').catch(
  () => ({}),
);
const scratch = await mkdtemp(path.join(tmpdir(), 'lvbt-recurring-'));
after(() => rm(scratch, { recursive: true, force: true }));
const repository = 'LasVegasForTransit/example';
const commit = 'a'.repeat(40);
const workflow = '.github/workflows/weekly.yml';
const body =
  '# Problem\n\nPeople need a weekly report.\n\n# Proposed change\n\nRead the current verified report.\n\n# Additional context\n\nSeven days: 12 visits. Thirty days: 50 visits.\n';
const config = {
  contributions: {
    recurring: {
      weekly: {
        workflow,
        artifactName: 'weekly-evidence',
        title: 'Weekly analytics report',
        type: 'feature',
        labels: ['analytics-report'],
        pin: true,
      },
    },
  },
};
function report(status = 'open') {
  return {
    version: 1,
    repository,
    commit,
    run: {
      id: '100',
      attempt: 1,
      repository,
      headSha: commit,
      headBranch: 'main',
      event: 'schedule',
      workflow,
      url: `https://github.com/${repository}/actions/runs/100`,
    },
    results: [{ key: 'weekly', status, body }],
  };
}
const remote = {
  id: 100,
  run_attempt: 1,
  repository: { full_name: repository },
  head_sha: commit,
  head_branch: 'main',
  event: 'schedule',
  path: workflow,
  workflow_id: 10,
  html_url: `https://github.com/${repository}/actions/runs/100`,
  run_started_at: '2026-10-02T00:00:00Z',
};
const environment = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: commit,
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'schedule',
};
const owned = {
  number: 7,
  title: 'Weekly analytics report',
  body: 'Verified run: 99 (attempt 1).',
  state: 'OPEN',
  labels: ['enhancement', 'recurring-owned', 'recurring:weekly', 'analytics-report'].map(
    (name) => ({ name }),
  ),
  url: `https://github.com/${repository}/issues/7`,
};
async function fixture(value = report(), options = {}) {
  const cwd = await mkdtemp(path.join(scratch, 'case-'));
  const input = path.join(cwd, 'input.json');
  await writeFile(input, JSON.stringify(value));
  const calls = [];
  const execute = async (command, args) => {
    calls.push([command, ...args]);
    if (command === process.execPath) return spawnSync(command, args, { cwd, encoding: 'utf8' });
    let data;
    if (args[0] === 'api') {
      if (args[1] === `repos/${repository}`) data = { default_branch: 'main' };
      else if (args[1].includes('/contents/'))
        data = {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(JSON.stringify(options.trustedConfig ?? config)).toString('base64'),
        };
      else if (args[1].includes('/artifacts'))
        data = { artifacts: [{ id: 777, name: 'weekly-evidence', expired: false }] };
      else if (args[1].includes('/workflows/'))
        data = { workflow_runs: options.latest ?? [remote] };
      else data = options.remote ?? remote;
    } else if (args[0] === 'run') {
      await writeFile(
        path.join(args[args.indexOf('--dir') + 1], 'lvbt-recurring-issues.json'),
        JSON.stringify(options.artifact ?? value),
      );
      return { status: 0, stdout: '', stderr: '' };
    } else if (args[0] === 'issue' && args[1] === 'list') data = options.issues ?? [];
    else throw new Error(`Unexpected mutation ${command} ${args.join(' ')}`);
    return { status: 0, stdout: JSON.stringify(data), stderr: '' };
  };
  return { cwd, input, execute, calls, config, environment };
}
test('trusted recurring evidence previews configured template ownership and pin without mutation', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function', 'recurring helper route is missing');
  const setup = await fixture();
  const preview = await recurring.reportRecurring({ ...setup, dryRun: true });
  assert.equal(preview.actions[0].action, 'create');
  assert.equal(preview.actions[0].title, 'Weekly analytics report');
  assert.equal(preview.actions[0].pin, true);
  assert.deepEqual(
    preview.actions[0].labels,
    owned.labels.map((value) => value.name),
  );
  assert.match(preview.actions[0].body, /Seven days: 12 visits/);
  assert.match(preview.actions[0].body, /Verified run: 100 \(attempt 1\)/);
  assert.match(preview.actions[0].body, /artifacts\/777/);
  assert.equal(
    setup.calls.some((call) => ['create', 'edit', 'close', 'reopen', 'graphql'].includes(call[2])),
    false,
  );
});
test('PR, foreign branch, wrong attempt, forged artifact and newer trusted evidence fail before writes', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const options of [
    { remote: { ...remote, event: 'pull_request' } },
    { remote: { ...remote, head_branch: 'topic' } },
    { remote: { ...remote, run_attempt: 2 } },
    { artifact: { ...report(), commit: 'b'.repeat(40) } },
    { latest: [{ ...remote, id: 101 }] },
  ]) {
    const setup = await fixture(report(), options);
    await assert.rejects(
      recurring.reportRecurring({ ...setup, dryRun: true }),
      /trusted|artifact|stale/i,
    );
    assert.equal(
      setup.calls.some((call) => call[1] === 'issue'),
      false,
    );
  }
});
test('only explicit verified resolution closes; errors and missing results cannot clear issues', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const status of ['error', 'skipped']) {
    const setup = await fixture(report(status), { issues: [owned] });
    assert.deepEqual((await recurring.reportRecurring({ ...setup, dryRun: true })).actions, []);
  }
  const missing = await fixture({ ...report(), results: [] }, { issues: [owned] });
  assert.deepEqual((await recurring.reportRecurring({ ...missing, dryRun: true })).actions, []);
  const setup = await fixture(report('resolved'), { issues: [owned] });
  assert.equal(
    (await recurring.reportRecurring({ ...setup, dryRun: true })).actions[0].action,
    'close',
  );
  const reopened = await fixture(report(), { issues: [{ ...owned, state: 'CLOSED' }] });
  assert.equal(
    (await recurring.reportRecurring({ ...reopened, dryRun: true })).actions[0].action,
    'reopen',
  );
});
test('ambiguous ownership, newer issue evidence and malformed body block the complete batch', async () => {
  assert.equal(typeof recurring.reportRecurring, 'function');
  for (const issues of [
    [owned, { ...owned, number: 8 }],
    [{ ...owned, body: 'Verified run: 101 (attempt 1).' }],
  ]) {
    const setup = await fixture(report(), { issues });
    await assert.rejects(recurring.reportRecurring({ ...setup, dryRun: true }), /multiple|stale/i);
  }
  for (const invalidBody of ['no template headings', `${body}<!-- hidden -->`]) {
    const value = report();
    value.results[0].body = invalidBody;
    const setup = await fixture(value);
    await assert.rejects(
      recurring.reportRecurring({ ...setup, dryRun: true }),
      /section|metadata/i,
    );
  }
});
async function liveFixture(initial, tamper = false, trustedConfig = config) {
  const cwd = await mkdtemp(path.join(scratch, 'live-'));
  const input = path.join(cwd, 'input.json');
  const state = path.join(cwd, 'state.json');
  await writeFile(input, JSON.stringify(report()));
  await writeFile(state, JSON.stringify({ issue: initial, labels: [], pinned: false, tamper }));
  await writeFile(
    path.join(cwd, 'gh'),
    `#!/usr/bin/env node
const fs=require('node:fs'); const path=require('node:path');
const args=process.argv.slice(2); const state=JSON.parse(fs.readFileSync(process.env.RECURRING_TEST_STATE,'utf8'));
const report=JSON.parse(fs.readFileSync(process.env.RECURRING_TEST_INPUT,'utf8'));
const option=name=>args[args.indexOf(name)+1]; const emit=value=>console.log(typeof value==='string'?value:JSON.stringify(value));
if(args[0]==='api') {
 if(args[1]==='graphql') {
  if(option('-f').startsWith('query=mutation')) {state.pinned=true;emit({data:{pinIssue:{issue:{id:'node7'}}}});}
  else emit({data:{repository:{issue:{id:'node7',isPinned:state.pinned}}}});
 } else if(args[1].includes('/contents/')) emit({type:'file',encoding:'base64',content:'${Buffer.from(JSON.stringify(trustedConfig)).toString('base64')}'});
 else if(args[1]==='repos/'+report.repository) emit({default_branch:'main'});
 else if(args[1].includes('/artifacts')) emit({artifacts:[{id:777,name:'weekly-evidence',expired:false}]});
 else if(args[1].includes('/workflows/')) emit({workflow_runs:[{id:100,run_attempt:1,event:'schedule'}]});
 else emit(${JSON.stringify(remote)});
} else if(args[0]==='run') fs.copyFileSync(process.env.RECURRING_TEST_INPUT,path.join(option('--dir'),'lvbt-recurring-issues.json'));
else if(args[0]==='label') {if(args[1]==='list') emit(state.labels.map(name=>({name})));else state.labels.push(args[2]);}
else if(args[0]==='issue') {
 if(args[1]==='list') emit(state.issue?[state.issue]:[]);
 else if(args[1]==='view') emit(state.tamper?{...state.issue,body:'Incorrect stored body'}:state.issue);
 else if(args[1]==='create') {
  if(state.issue) throw new Error('Duplicate issue');
  state.issue={number:7,title:option('--title'),body:fs.readFileSync(option('--body-file'),'utf8'),state:'OPEN',labels:args.flatMap((arg,index)=>arg==='--label'?[{name:args[index+1]}]:[]),url:'https://github.com/'+report.repository+'/issues/7'};
  emit(state.issue.url);
 } else if(args[1]==='edit') {state.issue.title=option('--title');state.issue.body=fs.readFileSync(option('--body-file'),'utf8');for(let i=0;i<args.length;i++)if(args[i]==='--add-label'&&!state.issue.labels.some(label=>label.name===args[i+1]))state.issue.labels.push({name:args[i+1]});}
 else if(args[1]==='reopen') state.issue.state='OPEN';
 else if(args[1]==='close') state.issue.state='CLOSED';
 else throw new Error('Unexpected issue operation');
} else throw new Error('Unexpected GitHub operation');
fs.writeFileSync(process.env.RECURRING_TEST_STATE,JSON.stringify(state));
`,
    { mode: 0o755 },
  );
  const execute = async (command, args) =>
    spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${cwd}:${process.env.PATH}`,
        RECURRING_TEST_STATE: state,
        RECURRING_TEST_INPUT: input,
      },
    });
  return { cwd, input, execute, state, config, environment };
}
test('real helper boundary upserts, reopens, resolves and verifies the requested pin', async () => {
  for (const [initial, status, expectedAction, expectedState] of [
    [undefined, 'open', 'create', 'OPEN'],
    [owned, 'open', 'update', 'OPEN'],
    [{ ...owned, state: 'CLOSED' }, 'open', 'reopen', 'OPEN'],
    [owned, 'resolved', 'close', 'CLOSED'],
  ]) {
    const setup = await liveFixture(initial);
    await writeFile(setup.input, JSON.stringify(report(status)));
    const result = await recurring.reportRecurring(setup);
    assert.equal(result.actions[0].action, expectedAction);
    const stored = JSON.parse(await readFile(setup.state, 'utf8'));
    assert.equal(stored.issue.state, expectedState);
    assert.equal(stored.issue.number, 7);
    assert.equal(stored.issue.title, 'Weekly analytics report');
    assert.match(stored.issue.body, /Verified run: 100 \(attempt 1\)/);
    assert.equal(stored.pinned, status === 'open');
  }
});
test('reporting fails when GitHub stores different content instead of claiming success', async () => {
  const setup = await liveFixture(owned, true);
  await assert.rejects(recurring.reportRecurring(setup), /stored.*differently/i);
  assert.equal(JSON.parse(await readFile(setup.state, 'utf8')).pinned, false);
});
test('explicit adoption preserves only a unique legacy bot issue older than the trusted run', async () => {
  const legacy = {
    ...owned,
    labels: [{ name: 'analytics-report' }],
    author: { login: 'github-actions[bot]', is_bot: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const adopt = {
    contributions: {
      recurring: { weekly: { ...config.contributions.recurring.weekly, adoptExisting: true } },
    },
  };
  const setup = await fixture(report(), {
    issues: [legacy],
    remote: { ...remote, run_started_at: '2026-10-02T00:00:00Z' },
    trustedConfig: adopt,
  });
  const result = await recurring.reportRecurring({ ...setup, config: adopt, dryRun: true });
  assert.equal(result.actions[0].action, 'update');
  assert.equal(result.actions[0].number, 7);
  for (const issues of [
    [legacy, { ...legacy, number: 8 }],
    [{ ...legacy, updatedAt: '2026-10-03T00:00:00Z' }],
    [{ ...legacy, author: { login: 'person', is_bot: false } }],
    [{ ...legacy, labels: [...legacy.labels, { name: 'audit-owned' }] }],
  ]) {
    const blocked = await fixture(report(), {
      issues,
      remote: { ...remote, run_started_at: '2026-10-02T00:00:00Z' },
      trustedConfig: adopt,
    });
    await assert.rejects(
      recurring.reportRecurring({ ...blocked, config: adopt, dryRun: true }),
      /multiple|stale|bot|ownership/i,
    );
  }
});

test('explicit live adoption retains the stable number and verifies labels and pin', async () => {
  const legacy = {
    ...owned,
    labels: [{ name: 'analytics-report' }],
    author: { login: 'github-actions[bot]', is_bot: true },
    updatedAt: '2026-10-01T00:00:00Z',
  };
  const adopt = {
    contributions: {
      recurring: { weekly: { ...config.contributions.recurring.weekly, adoptExisting: true } },
    },
  };
  const setup = await liveFixture(legacy, false, adopt);
  const result = await recurring.reportRecurring({ ...setup, config: adopt });
  assert.equal(result.actions[0].number, 7);
  const stored = JSON.parse(await readFile(setup.state, 'utf8'));
  assert.equal(stored.issue.number, 7);
  assert.equal(stored.pinned, true);
  assert.deepEqual(
    new Set(stored.issue.labels.map(({ name }) => name)),
    new Set(owned.labels.map(({ name }) => name)),
  );
});
test('local and PR executors cannot replay trusted evidence to write recurring issues', async () => {
  for (const environment of [{}, { GITHUB_EVENT_NAME: 'pull_request' }]) {
    const setup = await liveFixture();
    await assert.rejects(
      recurring.reportRecurring({ ...setup, environment }),
      /execution|executor|workflow/i,
    );
    assert.equal(JSON.parse(await readFile(setup.state, 'utf8')).issue, undefined);
  }
});
test('local declarations cannot replace the configuration owned by the verified commit', async () => {
  const setup = await fixture();
  const altered = {
    contributions: {
      recurring: {
        weekly: { ...config.contributions.recurring.weekly, title: 'Unreviewed replacement title' },
      },
    },
  };
  await assert.rejects(
    recurring.reportRecurring({ ...setup, config: altered, dryRun: true }),
    /configuration|declaration|commit/i,
  );
});
test('recurring declarations and existing owned issues cannot claim foreign automation ownership', async () => {
  for (const name of [
    'audit-owned',
    'audit:links',
    'target:production',
    'other-owned',
    'Audit-Owned',
  ]) {
    const changed = {
      contributions: {
        recurring: { weekly: { ...config.contributions.recurring.weekly, labels: [name] } },
      },
    };
    const setup = await fixture(report(), { trustedConfig: changed });
    await assert.rejects(
      recurring.reportRecurring({ ...setup, config: changed, dryRun: true }),
      /declaration|ownership/i,
    );
    const claimed = await fixture(report(), {
      issues: [{ ...owned, labels: [...owned.labels, { name }] }],
    });
    await assert.rejects(recurring.reportRecurring({ ...claimed, dryRun: true }), /ownership/i);
  }
});
