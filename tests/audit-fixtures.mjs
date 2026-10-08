import { after } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export const scratch = await mkdtemp(path.join(tmpdir(), 'lvbt-audit-report-'));
after(() => rm(scratch, { recursive: true, force: true }));
export const sha = 'a'.repeat(40);
export const repository = 'LasVegasForTransit/example';
export const environment = {
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: '100',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: sha,
  GITHUB_REF_NAME: 'main',
  GITHUB_EVENT_NAME: 'schedule',
};
export function report(status = 'fail') {
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
export const remoteRun = {
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
function fixtureApi(endpoint, options) {
  if (endpoint === `repos/${repository}`) return { default_branch: 'main', full_name: repository };
  if (endpoint.includes('/contents/'))
    return {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from('{"version":1}').toString('base64'),
    };
  if (endpoint.includes('/jobs?')) return options.jobs;
  if (endpoint.includes('/artifacts'))
    return { artifacts: [{ id: 777, name: 'lvbt-audit-report', expired: false }] };
  if (endpoint.endsWith('/runs/100')) return options.run;
  if (endpoint.includes('/workflows/')) return { workflow_runs: options.latest };
  throw new Error(`Unexpected API: ${endpoint}`);
}
export async function fixture(
  value,
  {
    run = remoteRun,
    latest = [remoteRun],
    issues = [],
    artifact = value,
    jobs = executionJobs(value),
  } = {},
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
      data = fixtureApi(args[1], { run, latest, jobs });
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

export function executionJobs(value) {
  const names = [
    'Set up job',
    'Checkout executed source',
    'Setup Node + pnpm',
    'Install product audit browser',
    'Build local audit inputs',
    'Install pinned link checker',
    'Execute configured audits and retain every result',
    'Retain normalized and raw evidence',
  ];
  return {
    total_count: 1,
    jobs: [
      {
        id: 10,
        run_id: 100,
        head_sha: sha,
        name: 'audit / execute',
        status: 'completed',
        conclusion: value?.results.some((result) => result.status !== 'pass')
          ? 'failure'
          : 'success',
        steps: names.map((name, index) => ({
          name,
          number: index + 1,
          status: 'completed',
          conclusion:
            name === names[6] && value?.results.some((result) => result.status !== 'pass')
              ? 'failure'
              : 'success',
        })),
      },
    ],
  };
}

export async function liveFixture(value, issue) {
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
 else if(args[1].includes('/jobs?')) emit(${JSON.stringify(executionJobs(value))});
 else if(args[1].includes('/artifacts')) emit({artifacts:[{id:777,name:'lvbt-audit-report',expired:false}]});
 else if(args[1].includes('/workflows/')) emit({workflow_runs:[{id:100,run_attempt:1,event:'schedule'}]});
 else emit({id:100,run_attempt:1,head_sha:report.commit,head_branch:'main',event:'schedule',path:'.github/workflows/audits.yml',workflow_id:10,repository:{full_name:report.repository},html_url:report.run.url});
} else if(args[0]==='run') fs.copyFileSync(process.env.AUDIT_TEST_REPORT,path.join(option('--dir'),'lvbt-audit-report.json'));
else if(args[0]==='label') {
 if(args[1]==='list') emit(Array.isArray(state.labels)?state.labels.map(name=>({name})):state.labels);
 else {if(state.labels.some(name=>name.toLowerCase()===args[2].toLowerCase())) throw new Error('Duplicate label');state.labels.push(args[2]);}
} else if(args[0]==='issue') {
 if(args[1]==='list') emit(state.issue?[state.issue]:[]);
 else if(args[1]==='view') emit(state.tamper?{...state.issue,body:'Incorrect stored body'}:state.issue);
 else if(args[1]==='create') {
  if(state.issue) throw new Error('Duplicate issue creation');
  state.issue={number:7,title:option('--title'),body:fs.readFileSync(option('--body-file'),'utf8'),state:'OPEN',labels:args.flatMap((arg,index)=>arg==='--label'?[{name:state.labels.find(name=>name.toLowerCase()===args[index+1].toLowerCase())??args[index+1]}]:[]),url:'https://github.com/'+report.repository+'/issues/7'};
  emit(state.issue.url);
 } else if(args[1]==='edit') {state.issue.title=option('--title');state.issue.body=fs.readFileSync(option('--body-file'),'utf8');for(let i=0;i<args.length;i++)if(args[i]==='--add-label'&&!state.issue.labels.some(label=>label.name.toLowerCase()===args[i+1].toLowerCase()))state.issue.labels.push({name:state.labels.find(name=>name.toLowerCase()===args[i+1].toLowerCase())??args[i+1]});}
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
