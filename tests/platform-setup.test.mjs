import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { applyPlan } from '../packages/cli/src/lib/platform/apply.mjs';
import { platformBootstrap, platformPreflight } from '../packages/cli/src/lib/platform/index.mjs';
import { planPlatform } from '../packages/cli/src/lib/platform/plan.mjs';
import { readyState, sampleManifest, scriptedIo, WORKER_SECRETS } from './support/platform.mjs';

/** A command runner that records every call and answers the read-only ones. */
function recordingRun(answers = {}) {
  const calls = [];
  const run = (command, args, options = {}) => {
    calls.push({ command, args, options });
    const line = [command, ...args].join(' ');
    if (line.includes('wrangler auth token'))
      return { status: 0, stdout: '{"type":"oauth","token":"wrangler-token"}', stderr: '' };
    for (const [pattern, result] of Object.entries(answers)) {
      if (line.includes(pattern)) return { status: 0, stdout: '', stderr: '', ...result };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

function setupContext({ state = readyState(), io = scriptedIo(), api, run } = {}) {
  const manifest = sampleManifest();
  return {
    manifest,
    directory: '/repo/apps/site',
    configPath: 'apps/site/wrangler.jsonc',
    state,
    run,
    io,
    setupApi: async () => api,
    values: new Map(),
    handled: new Set(),
    created: { widgets: new Map(), apps: new Map() },
  };
}

async function setUp(context) {
  const items = planPlatform({
    manifest: context.manifest,
    state: context.state,
    configPath: context.configPath,
  });
  await applyPlan(context, items);
}

const puts = (calls, name) =>
  calls.filter(({ args }) => args.includes('put') && args.includes(name));

test('a generated secret reaches Wrangler on stdin and is never printed', async () => {
  const state = readyState();
  state.worker.value.secrets = WORKER_SECRETS.filter((name) => name !== 'SIGNING_SECRET');
  const { run, calls } = recordingRun();
  const io = scriptedIo();
  await setUp(setupContext({ state, run, io }));

  const [put] = puts(calls, 'SIGNING_SECRET');
  assert.ok(put, 'the secret was stored');
  assert.ok(put.options.input.length >= 40);
  assert.ok(!put.args.includes(put.options.input));
  assert.ok(!io.output().includes(put.options.input));
});

test('a pasted value is checked against its pattern, and an empty answer skips it', async () => {
  const state = readyState();
  state.worker.value.secrets = WORKER_SECRETS.filter((name) => name !== 'RESEND_API_KEY');
  const typed = ['not-a-key', 're_goodkey'];
  const { run, calls } = recordingRun();
  await setUp(
    setupContext({ state, run, io: scriptedIo([[/Paste RESEND_API_KEY/, () => typed.shift()]]) }),
  );
  assert.equal(puts(calls, 'RESEND_API_KEY')[0].options.input, 're_goodkey');

  const skipped = recordingRun();
  await setUp(setupContext({ state, run: skipped.run }));
  assert.equal(puts(skipped.calls, 'RESEND_API_KEY').length, 0);
});

test('a secret for a feature not built yet is set only when the person asks for it', async () => {
  const state = readyState();
  state.worker.value.secrets = WORKER_SECRETS.filter((name) => name !== 'FUTURE_KEY');
  const declined = recordingRun();
  await setUp(setupContext({ state, run: declined.run }));
  assert.equal(puts(declined.calls, 'FUTURE_KEY').length, 0);

  const accepted = recordingRun();
  await setUp(
    setupContext({
      state,
      run: accepted.run,
      io: scriptedIo([
        [/Set those up now too/, true],
        [/Paste FUTURE_KEY/, 'partner-value'],
      ]),
    }),
  );
  assert.equal(puts(accepted.calls, 'FUTURE_KEY')[0].options.input, 'partner-value');
});

test('a forbidden secret is deleted only after the person confirms', async () => {
  const state = readyState();
  state.worker.value.secrets.push('PREVIEW_ADMIN_KEY');
  const deletes = (calls) => calls.filter(({ args }) => args.includes('delete'));

  const kept = recordingRun();
  await setUp(
    setupContext({ state, run: kept.run, io: scriptedIo([[/Delete PREVIEW_ADMIN_KEY/, false]]) }),
  );
  assert.equal(deletes(kept.calls).length, 0);

  const removed = recordingRun();
  await setUp(setupContext({ state, run: removed.run }));
  assert.equal(deletes(removed.calls).length, 1);
  assert.ok(deletes(removed.calls)[0].args.includes('PREVIEW_ADMIN_KEY'));
});

test('creating the Access application stores its audience and team domain on the Worker once', async () => {
  const state = readyState();
  state.access.value.apps = [];
  state.worker.value.secrets = WORKER_SECRETS.filter(
    (name) => !['ACCESS_AUD', 'ACCESS_TEAM_DOMAIN'].includes(name),
  );
  const posted = [];
  const api = {
    post: async (endpoint, body) => {
      posted.push({ endpoint, body });
      return endpoint.endsWith('/access/policies')
        ? { id: 'new-policy' }
        : { id: 'new-app', aud: 'd'.repeat(64) };
    },
  };
  const { run, calls } = recordingRun();
  await setUp(setupContext({ state, run, api }));

  const app = posted.find(({ endpoint }) => endpoint.endsWith('/access/apps'));
  assert.deepEqual(app.body.allowed_idps, ['idp-1']);
  assert.deepEqual(app.body.policies, [{ id: 'new-policy', precedence: 1 }]);
  assert.deepEqual(
    app.body.destinations.map((destination) => destination.uri),
    ['example.org/admin', 'example.org/admin/*'],
  );
  assert.equal(puts(calls, 'ACCESS_AUD').length, 1);
  assert.equal(puts(calls, 'ACCESS_AUD')[0].options.input, 'd'.repeat(64));
  assert.equal(puts(calls, 'ACCESS_TEAM_DOMAIN')[0].options.input, 'team.cloudflareaccess.com');
});

test('without a setup token, Turnstile falls back to dashboard steps', async () => {
  const state = readyState();
  state.turnstile.value = [];
  const io = scriptedIo();
  const { run } = recordingRun();
  await setUp(setupContext({ state, run, io, api: undefined }));
  assert.match(io.output(), /dash\.cloudflare\.com\/a{32}\/turnstile/);
  assert.ok(io.asked.some((question) => /Press Enter/.test(question)));
});

/** A repository on disk plus a fake Cloudflare and DNS, both answering from `state`. */
async function fakeRepository(state) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-platform-'));
  const site = path.join(root, 'apps/site');
  await mkdir(path.join(site, 'migrations'), { recursive: true });
  await writeFile(path.join(site, 'platform.json'), JSON.stringify(sampleManifest()));
  await writeFile(
    path.join(site, 'wrangler.jsonc'),
    `{
      // production
      "name": "example",
      "vars": { "TURNSTILE_SITE_KEY": "0xSITEKEY" },
      "d1_databases": [{ "binding": "DB", "database_name": "example", "database_id": "db-1", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "example-photos" }],
    }`,
  );
  for (const file of state.migrations.example.value)
    await writeFile(path.join(site, 'migrations', file), 'SELECT 1;');
  return root;
}

function fakeRequest(state, seen) {
  const reply = (result, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => ({ success: status < 400, result, result_info: { total_pages: 1 } }),
  });
  const access = state.access.value;
  return async (url, init = {}) => {
    seen.push({ url, method: init.method ?? 'GET', authorization: init.headers?.Authorization });
    if (url.includes('dns-query')) {
      const name = new URL(url).searchParams.get('name');
      const type = new URL(url).searchParams.get('type');
      const code = { MX: 15, TXT: 16 }[type];
      const answers = state.dns[`${name} ${type}`]?.value ?? [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ Answer: answers.map((data) => ({ type: code, data })) }),
      };
    }
    const routes = [
      [/scripts\/example\/settings/, { bindings: [] }],
      [/scripts\/example\/secrets/, state.worker.value.secrets.map((name) => ({ name }))],
      [
        /d1\/database\/db-1\/query/,
        [{ results: state.d1.value.example.applied.value.map((name) => ({ name })) }],
      ],
      [/d1\/database/, [{ uuid: 'db-1', name: 'example' }]],
      [/r2\/buckets/, { buckets: state.r2.value.map((name) => ({ name })) }],
      [/challenges\/widgets/, state.turnstile.value],
      [/access\/apps/, access.apps],
      [/access\/organizations/, { auth_domain: access.teamDomain }],
      [/access\/identity_providers/, access.providers],
      [/access\/policies/, access.policies],
    ];
    const match = routes.find(([pattern]) => pattern.test(url));
    return match ? reply(match[1]) : reply(null, 404);
  };
}

async function preflightWith(state, env = { LVBT_CLOUDFLARE_SETUP_TOKEN: 'setup-token' }) {
  const root = await fakeRepository(state);
  const seen = [];
  const { run, calls } = recordingRun({
    'gh api': { stdout: '{}' },
    'gh secret list': {
      stdout: JSON.stringify(state.github.value.secrets.production.map((name) => ({ name }))),
    },
  });
  const io = scriptedIo();
  io.interactive = false;
  const services = { run, request: fakeRequest(state, seen), env };
  try {
    await platformPreflight({ cwd: root, options: {}, services, io });
    return { ready: true, seen, calls, io };
  } catch (error) {
    return { ready: false, error, seen, calls, io };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('preflight --production passes when production has everything the manifest declares', async () => {
  const result = await preflightWith(readyState());
  assert.equal(result.ready, true, result.error?.message);
  assert.match(result.io.output(), /Ready for production/);
});

test('preflight --production fails with exit code 1 and changes nothing', async () => {
  const state = readyState();
  state.worker.value.secrets = [];
  const result = await preflightWith(state);
  assert.equal(result.ready, false);
  assert.equal(result.error.exitCode, 1);
  const writes = result.seen.filter(
    ({ method, url }) => method !== 'GET' && !url.endsWith('/query'),
  );
  assert.deepEqual(writes, []);
  const mutating = result.calls.filter(({ args }) =>
    args.some((arg) => ['put', 'set', 'create', 'delete', 'apply', '--method'].includes(arg)),
  );
  assert.deepEqual(mutating, []);
});

test('the setup token is used only as a Cloudflare credential', async () => {
  const result = await preflightWith(readyState());
  const withToken = result.seen.filter(
    ({ authorization }) => authorization === 'Bearer setup-token',
  );
  assert.ok(withToken.every(({ url }) => /challenges|access/.test(url)));
  assert.ok(withToken.length > 0);
  const leaked = result.calls.filter(({ args, options }) =>
    JSON.stringify({ args, input: options.input, env: options.env }).includes('setup-token'),
  );
  assert.deepEqual(leaked, []);
});

test('bootstrap --production refuses to run without a terminal to ask in', async () => {
  const io = scriptedIo();
  io.interactive = false;
  await assert.rejects(
    platformBootstrap({ cwd: os.tmpdir(), options: {}, services: {}, io }),
    (error) => error.exitCode === 2,
  );
});
