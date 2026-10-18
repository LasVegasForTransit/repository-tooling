import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { packageRelease } from '../src/saved-release-artifact.js';

const execute = promisify(execFile);
const expected = '1c4deaba-ee53-4c3f-ba65-176ae596cad5';
const config = {
  repository: 'Example/app',
  appDirectory: 'app',
  publicationMode: 'named-staging',
  productionWorker: 'app',
  previewWorker: 'app-preview',
  productionUrl: 'https://example.org',
  previewUrl: 'https://preview.example.org',
  artifactPrefix: 'app-release',
  stagingWorkflow: { name: 'Stage', path: '.github/workflows/stage.yml', branch: 'main' },
  promotionWorkflow: { file: 'promote.yml', titlePrefix: 'Promote', branch: 'main' },
};

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'candidate-activation-retry-'));
  const source = path.join(root, 'app');
  const directory = path.join(root, 'release');
  const proof = path.join(root, 'proof');
  for (const subtree of ['app/dist', 'app/.wrangler/worker', '.lvbt', 'bin', 'proof'])
    await mkdir(path.join(root, subtree), { recursive: true });
  await writeFile(path.join(source, 'dist/index.html'), '<main>Reviewed candidate</main>');
  await writeFile(path.join(source, '.wrangler/worker/index.js'), 'export default {}');
  await writeFile(
    path.join(source, 'wrangler.jsonc'),
    JSON.stringify({ name: 'app', env: { preview: { name: 'app-preview' } } }),
  );
  await writeFile(
    path.join(root, '.lvbt/web-platform.json'),
    JSON.stringify({ commit: 'c'.repeat(40) }),
  );
  const release = await packageRelease(source, directory, {
    commit: 'a'.repeat(40),
    releaseId: '123',
  });
  await writeFile(
    path.join(proof, 'candidate.json'),
    JSON.stringify({
      formatVersion: 1,
      issuer: {
        runId: '900',
        attempt: '1',
        toolsCommit: 'b'.repeat(40),
        sharedCommit: 'c'.repeat(40),
      },
      release: {
        commit: release.commit,
        releaseId: release.releaseId,
        artifactHash: release.artifactHash,
      },
      preview: { worker: 'app-preview', origin: config.previewUrl, version: expected },
      checks: { artifact: 'success', smoke: 'success', browser: 'success' },
    }) + '\n',
  );
  await execute('zip', ['-q', path.join(root, 'proof.zip'), 'candidate.json'], { cwd: proof });
  await writeFile(
    path.join(root, 'bin/gh'),
    String.raw`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),route=args[1],base='repos/Example/app/actions/';
fs.appendFileSync(process.env.RETRY_GITHUB_CAPTURE,JSON.stringify({attempt:process.env.GITHUB_RUN_ATTEMPT,args})+'\n');
if(args[0]!=='api') throw new Error('Unexpected GitHub command');
let result;
if(route===base+'runs/900') result={id:900,run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT),head_sha:'b'.repeat(40),head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/promote.yml',repository:{full_name:'Example/app'},head_repository:{full_name:'Example/app'}};
else if(route===base+'runs/900/attempts/1/jobs?per_page=100') result={jobs:[{name:'publish / Verify named release candidate',status:'completed',conclusion:'success'}]};
else if(route===base+'runs/900/artifacts?per_page=100') result={artifacts:[{id:55,name:'candidate-900-1',expired:false,workflow_run:{id:900,head_sha:'b'.repeat(40),head_branch:'main'}}]};
else if(route===base+'artifacts/55/zip') {process.stdout.write(fs.readFileSync(process.env.RETRY_PROOF_ZIP));process.exit(0);}
else throw new Error('Unexpected GitHub API route: '+route);
process.stdout.write(JSON.stringify(result));
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(root, 'bin/pnpm'),
    String.raw`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2);
fs.appendFileSync(process.env.RETRY_PROVIDER_CAPTURE,JSON.stringify({attempt:process.env.GITHUB_RUN_ATTEMPT,args})+'\n');
if(args[2]==='deployments'&&args[3]==='list') {
  process.stdout.write(JSON.stringify([{created_on:'2026-09-05T00:00:00Z',versions:[{version_id:process.env.RETRY_ACTIVE_VERSION,percentage:100}]}]));
} else if(args[2]==='deploy'&&args[args.indexOf('--name')+1]==='app') {
  if(process.env.RETRY_FAIL_ACTIVATION==='true') {process.stderr.write('fixture failure before changing production');process.exit(1);}
  fs.writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH,JSON.stringify({type:'deploy',version:1,worker_name:'app',version_id:'12345678-1234-4234-8234-123456789abc'}));
} else throw new Error('Unexpected provider command');
`,
    { mode: 0o755 },
  );
  const script = `import {runWorkerRelease} from ${JSON.stringify(new URL('../src/worker-release-command.ts', import.meta.url).href)};
await runWorkerRelease(${JSON.stringify(config)},${JSON.stringify(['activate', '--directory', directory, '--candidate-directory', proof, '--target', 'production', '--expected-version', expected])});`;
  const activate = (attempt: string, activeVersion = expected) =>
    execute(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', script],
      {
        cwd: source,
        env: {
          ...process.env,
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          GITHUB_ACTIONS: 'true',
          GITHUB_REPOSITORY: config.repository,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_EVENT_NAME: 'workflow_dispatch',
          GITHUB_RUN_ID: '900',
          GITHUB_RUN_ATTEMPT: attempt,
          GITHUB_SHA: 'b'.repeat(40),
          RETRY_FAIL_ACTIVATION: attempt === '1' ? 'true' : 'false',
          RETRY_ACTIVE_VERSION: activeVersion,
          RETRY_PROOF_ZIP: path.join(root, 'proof.zip'),
          RETRY_GITHUB_CAPTURE: path.join(root, 'github.jsonl'),
          RETRY_PROVIDER_CAPTURE: path.join(root, 'provider.jsonl'),
        },
      },
    );
  const calls = async (file: string): Promise<{ attempt: string; args: string[] }[]> =>
    (await readFile(path.join(root, file), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { attempt: string; args: string[] });
  return { root, activate, calls };
}

test('failed activation resumes on attempt two using the accepted attempt-one receipt without staging again', async () => {
  const f = await fixture();
  try {
    await expect(f.activate('1')).rejects.toThrow('outcome is unknown');
    expect((await f.activate('2')).stdout).toContain('12345678-1234-4234-8234-123456789abc');
    expect(
      (await f.calls('provider.jsonl')).map(({ attempt, args }) => [attempt, args[2]]),
    ).toEqual([
      ['1', 'deployments'],
      ['1', 'deploy'],
      ['2', 'deployments'],
      ['2', 'deploy'],
    ]);
    expect(
      (await f.calls('github.jsonl'))
        .filter(({ attempt }) => attempt === '2')
        .map(({ args }) => args[1]),
    ).toEqual([
      'repos/Example/app/actions/runs/900',
      'repos/Example/app/actions/runs/900/attempts/1/jobs?per_page=100',
      'repos/Example/app/actions/runs/900/artifacts?per_page=100',
      'repos/Example/app/actions/artifacts/55/zip',
    ]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('activation-only retry still refuses changed production before any new deployment', async () => {
  const f = await fixture();
  try {
    await expect(f.activate('1')).rejects.toThrow('outcome is unknown');
    await expect(f.activate('2', '2ae50b24-3d42-48d2-a784-627b60841961')).rejects.toThrow(
      'production version changed',
    );
    expect(
      (await f.calls('provider.jsonl')).map(({ attempt, args }) => [attempt, args[2]]),
    ).toEqual([
      ['1', 'deployments'],
      ['1', 'deploy'],
      ['2', 'deployments'],
    ]);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
