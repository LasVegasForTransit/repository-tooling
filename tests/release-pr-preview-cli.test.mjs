import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
const execute = promisify(execFile);
const source = fileURLToPath(new URL('../', import.meta.url));
const identity = { commit: 'a'.repeat(40), releaseId: '123' };
const sql = 'CREATE TABLE retained(id INTEGER PRIMARY KEY);\n';

async function application(root) {
  const production = {
    DB: { type: 'd1', name: 'app-production', id: 'production-db' },
    GTFS: { type: 'r2', name: 'public-gtfs' },
    ROOM: { type: 'durable-object', worker: 'app', exportName: 'Room' },
    LIMIT: { type: 'rate-limit', namespace: '1001', simple: { limit: 10, period: 60 } },
    LVBT_DEPLOYMENT_ENV: { type: 'text', value: 'production' },
  };
  const preview = {
    ...production,
    DB: { type: 'd1', name: 'app-preview', id: 'isolated-preview-db' },
    ROOM: { type: 'durable-object', worker: 'app-preview', exportName: 'Room' },
    LIMIT: { type: 'rate-limit', namespace: '2001', simple: { limit: 10, period: 60 } },
    LVBT_DEPLOYMENT_ENV: { type: 'text', value: 'preview' },
  };
  const config = {
    repository: 'Example/app',
    appDirectory: 'app',
    productionWorker: 'app',
    previewWorker: 'app-preview',
    productionUrl: 'https://example.org',
    previewUrl: 'https://preview.example.org',
    workersDevSubdomain: 'reviewed-account',
    artifactSource: 'typed-worker',
    typedConfig: 'cloudflare.config.mjs',
    publicationMode: 'named-staging',
    artifactPrefix: 'app-release',
    previewBindings: preview,
    previewReadOnlyBindings: ['GTFS'],
    migrations: [{ binding: 'DB', directory: 'migrations' }],
    smoke: { path: '/', status: 200 },
    stagingWorkflow: { name: 'Staging', path: '.github/workflows/deploy.yml', branch: 'main' },
    promotionWorkflow: { file: 'promote.yml', titlePrefix: 'Promote', branch: 'main' },
  };
  await mkdir(path.join(root, '.lvbt'));
  await mkdir(path.join(root, 'app/migrations'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(
    path.join(root, '.lvbt/tooling.json'),
    JSON.stringify({ version: 1, release: config }),
  );
  await writeFile(path.join(root, 'app/migrations/0001.sql'), sql);
  await writeFile(
    path.join(root, 'app/worker.mjs'),
    'export class Room {}\nexport default {fetch(){return new Response("ok")}}',
  );
  await writeFile(
    path.join(root, 'app/cloudflare.config.mjs'),
    `export default ${JSON.stringify({
      worker: {
        name: 'app',
        entrypoint: 'worker.mjs',
        compatibilityDate: '2026-08-31',
        domains: ['example.org'],
        env: production,
        exports: { Room: { type: 'durable-object', storage: 'sqlite' } },
      },
    })}`,
  );
}

async function providerFixture(root) {
  await mkdir(path.join(root, 'bin'));
  await writeFile(path.join(root, 'bin/package.json'), '{"type":"commonjs"}');
  await writeFile(
    path.join(root, 'bin/pnpm'),
    String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),args=process.argv.slice(2);
if(args[0]==='exec'&&args[1]==='tsx'){
  const result=cp.spawnSync(process.execPath,['--import',process.env.PR_TEST_TSX,...args.slice(2)],{stdio:'inherit',env:process.env});process.exit(result.status??1);
}
if(args[0]!=='exec'||args[1]!=='wrangler') throw new Error('Unexpected command');
const file=args[args.indexOf('--config')+1],config=JSON.parse(fs.readFileSync(file,'utf8'));
let retainedSql;
if(args.includes('migrations')) retainedSql=fs.readFileSync(path.join(path.dirname(file),config.env.preview.d1_databases[0].migrations_dir,'0001.sql'),'utf8');
fs.appendFileSync(process.env.PR_TEST_CAPTURE,JSON.stringify({args,config,retainedSql})+'\n');
if(args.includes('--dry-run')) fs.writeFileSync(path.join(args[args.indexOf('--outdir')+1],'index.js'),'export default {}');
else if(args.includes('migrations')) { if(args[args.indexOf('--env')+1]!=='preview') throw new Error('Production migration forbidden'); }
else if(args.includes('deploy')) fs.writeFileSync(process.env.WRANGLER_OUTPUT_FILE_PATH,JSON.stringify({type:'deploy',version:1,worker_name:args[args.indexOf('--name')+1],version_id:'12345678-1234-4234-8234-123456789abc'}));
else throw new Error('Unexpected provider mutation');
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(root, 'fetch.mjs'),
    `globalThis.fetch=async(url,options)=>{
    if(new URL(url).origin!=='https://app-pr-42.reviewed-account.workers.dev')throw new Error('Foreign origin');
    if(Object.keys(options.headers).some(key=>key.startsWith('CF-Access')))throw new Error('Public Access leak');
    return url.endsWith('/lvbt-release.json')?Response.json(${JSON.stringify(identity)}):new Response('ok');
  };`,
  );
}

test('actual CLI packages typed input, freezes SQL, retargets and verifies before preview-only provider calls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pr-preview-cli-'));
  try {
    await application(root);
    await providerFixture(root);
    const event = path.join(root, 'event.json');
    await writeFile(
      event,
      JSON.stringify({
        action: 'synchronize',
        number: 42,
        pull_request: {
          head: { repo: { full_name: 'Example/app' } },
          base: { ref: 'main', repo: { full_name: 'Example/app' } },
        },
      }),
    );
    const output = path.join(root, 'output');
    const capture = path.join(root, 'calls.jsonl');
    const command = [
      path.join(source, 'packages/cli/src/cli.mjs'),
      'release',
      'pr-preview',
      '--pr',
      '42',
      '--commit',
      identity.commit,
      '--release-id',
      identity.releaseId,
      '--publication-mode',
      'named-staging',
      '--protection',
      'public',
    ];
    const options = {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
        NODE_OPTIONS: `--import=${pathToFileURL(path.join(root, 'fetch.mjs')).href}`,
        PR_TEST_CAPTURE: capture,
        PR_TEST_TSX: createRequire(import.meta.url).resolve('tsx'),
        GITHUB_OUTPUT: output,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: event,
        GITHUB_REPOSITORY: 'Example/app',
        GITHUB_SHA: identity.commit,
        GITHUB_RUN_ID: identity.releaseId,
        CF_ACCESS_CLIENT_ID: 'do-not-send',
        CF_ACCESS_CLIENT_SECRET: 'do-not-send',
      },
      maxBuffer: 1024 * 1024,
    };
    await execute(process.execPath, [...command, '--action', 'resolve'], options);
    await assert.rejects(readFile(capture));
    const result = await execute(process.execPath, [...command, '--action', 'deploy'], options);
    const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 3);
    assert.ok(calls[0].args.includes('--dry-run'));
    assert.equal(calls[1].retainedSql, sql);
    for (const call of calls.slice(1)) {
      assert.equal(call.args[call.args.indexOf('--env') + 1], 'preview');
      assert.equal(call.config.env.preview.name, 'app-pr-42');
      assert.deepEqual(call.config.env.preview.routes, []);
      assert.equal(call.config.env.preview.d1_databases[0].database_id, 'isolated-preview-db');
      assert.equal(call.config.env.preview.durable_objects.bindings[0].script_name, 'app-pr-42');
      assert.equal(call.config.env.preview.ratelimits[0].namespace_id, '2001');
    }
    assert.equal(calls[2].args[calls[2].args.indexOf('--name') + 1], 'app-pr-42');
    assert.match(result.stdout, /app-pr-42.reviewed-account.workers.dev/);
    assert.doesNotMatch(await readFile(output, 'utf8'), /artifact-hash|directory=|attestation/);
    await assert.rejects(readFile(calls[1].args[calls[1].args.indexOf('--config') + 1]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('closed unmerged cleanup correlates the rejected PR event while executing trusted default-branch tools and config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'closed-pr-cli-'));
  try {
    await application(root);
    await providerFixture(root);
    const event = path.join(root, 'event.json');
    const capture = path.join(root, 'cleanup.jsonl');
    await writeFile(
      event,
      JSON.stringify({
        action: 'closed',
        number: 42,
        repository: { default_branch: 'main' },
        pull_request: {
          merged: false,
          head: { repo: { full_name: 'Example/app' } },
          base: { ref: 'main', repo: { full_name: 'Example/app' } },
        },
      }),
    );
    // This trusted working tree has a different identity than the rejected PR merge event.
    await mkdir(path.join(root, '.git'));
    await writeFile(path.join(root, '.git/HEAD'), 'b'.repeat(40));
    const request = path.join(root, 'fetch.mjs');
    await writeFile(
      request,
      `import {appendFileSync} from 'node:fs';
globalThis.fetch=async(url,options)=>{
 const base='https://api.cloudflare.com/client/v4/accounts/${'c'.repeat(32)}/workers';
 appendFileSync(process.env.CLEANUP_CAPTURE,JSON.stringify({url,method:options.method||'GET'})+'\\n');
 if(url===base+'/subdomain')return Response.json({success:true,result:{subdomain:'reviewed-account'}});
 if(url===base+'/scripts/app-pr-42?force=true'&&options.method==='DELETE')return Response.json({success:true});
 throw new Error('Deletion escaped the trusted derived PR Worker');
};`,
    );
    await execute(
      process.execPath,
      [
        path.join(source, 'packages/cli/src/cli.mjs'),
        'release',
        'pr-preview',
        '--action',
        'delete',
        '--pr',
        '42',
        '--commit',
        identity.commit,
        '--release-id',
        identity.releaseId,
        '--publication-mode',
        'named-staging',
        '--protection',
        'public',
      ],
      {
        cwd: root,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
          PR_TEST_TSX: createRequire(import.meta.url).resolve('tsx'),
          NODE_OPTIONS: `--import=${pathToFileURL(request).href}`,
          CLEANUP_CAPTURE: capture,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: event,
          GITHUB_REPOSITORY: 'Example/app',
          GITHUB_SHA: identity.commit,
          GITHUB_RUN_ID: identity.releaseId,
          CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32),
          CLOUDFLARE_API_TOKEN: 'fixture-preview-token',
        },
      },
    );
    const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(
      calls.map((call) => call.method),
      ['GET', 'DELETE'],
    );
    assert.match(calls[1].url, /\/workers\/scripts\/app-pr-42\?force=true$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
