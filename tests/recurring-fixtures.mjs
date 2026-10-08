import { after } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const scratch = await mkdtemp(path.join(tmpdir(), 'lvbt-recurring-'));
after(() => rm(scratch, { recursive: true, force: true }));
export const repository = 'LasVegasForTransit/example';
const commit = 'a'.repeat(40);
const workflow = '.github/workflows/weekly.yml';
export const body =
  '# Problem\n\nPeople need a weekly report.\n\n# Proposed change\n\nRead the current verified report.\n\n# Additional context\n\nSeven days: 12 visits. Thirty days: 50 visits.\n';
export const config = {
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
export function report(status = 'open') {
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
export const remote = {
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
export const environment = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: commit,
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'schedule',
};
export const owned = {
  number: 7,
  title: 'Weekly analytics report',
  body: 'Verified run: 99 (attempt 1).',
  state: 'OPEN',
  labels: ['enhancement', 'recurring-owned', 'recurring:weekly', 'analytics-report'].map(
    (name) => ({ name }),
  ),
  url: `https://github.com/${repository}/issues/7`,
};
export async function fixture(value = report(), options = {}) {
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
export async function liveFixture(initial, tamper = false, trustedConfig = config) {
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
else if(args[0]==='label') {if(args[1]==='list') emit(Array.isArray(state.labels)?state.labels.map(name=>({name})):state.labels);else {if(state.labels.some(name=>name.toLowerCase()===args[2].toLowerCase())) throw new Error('Duplicate label');state.labels.push(args[2]);}}
else if(args[0]==='issue') {
 if(args[1]==='list') emit(state.issue?[state.issue]:[]);
 else if(args[1]==='view') emit(state.tamper?{...state.issue,body:'Incorrect stored body'}:state.issue);
 else if(args[1]==='create') {
  if(state.issue) throw new Error('Duplicate issue');
  state.issue={number:7,title:option('--title'),body:fs.readFileSync(option('--body-file'),'utf8'),state:'OPEN',labels:args.flatMap((arg,index)=>arg==='--label'?[{name:state.labels.find(name=>name.toLowerCase()===args[index+1].toLowerCase())??args[index+1]}]:[]),url:'https://github.com/'+report.repository+'/issues/7'};
  emit(state.issue.url);
 } else if(args[1]==='edit') {state.issue.title=option('--title');state.issue.body=fs.readFileSync(option('--body-file'),'utf8');for(let i=0;i<args.length;i++)if(args[i]==='--add-label'&&!state.issue.labels.some(label=>label.name.toLowerCase()===args[i+1].toLowerCase()))state.issue.labels.push({name:state.labels.find(name=>name.toLowerCase()===args[i+1].toLowerCase())??args[i+1]});}
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
