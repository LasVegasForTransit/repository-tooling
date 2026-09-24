import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { platformBootstrap } from '../../packages/cli/src/lib/platform/index.mjs';
import { sampleManifest, scriptedIo } from './platform.mjs';

/**
 * A fake Cloudflare, Wrangler, GitHub, and DNS that remember what setup did
 * to them. Reads answer from the world; writes change it and are logged, so
 * a test can run setup several times and see exactly what each run changed.
 */

const ACCOUNT = 'a'.repeat(32);
const MIGRATIONS = ['0001_first.sql', '0002_second.sql'];

export const CONFIG = `{
  // production
  "name": "example",
  "vars": { "TURNSTILE_SITE_KEY": "0xSITEKEY" },
  "d1_databases": [{ "binding": "DB", "database_name": "example", "database_id": "db-1", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "example-photos" }],
}
`;

/**
 * Everything a dashboard or a deploy provides is in place: the Worker was
 * deployed once, Zero Trust is on with Google Workspace, and the email
 * records are verified. Nothing setup itself can create exists yet.
 */
export function freshWorld() {
  return {
    worker: { exists: true, secrets: new Map() },
    databases: [],
    buckets: new Set(),
    widgets: [],
    zeroTrust: { enabled: true, teamDomain: 'team.cloudflareaccess.com', teamName: 'Example team' },
    providers: [{ id: 'idp-1', type: 'google-apps', name: 'Google Workspace' }],
    apps: [],
    policies: [],
    environments: new Set(),
    environmentSecrets: new Map(),
    dns: {
      'send.example.org MX': ['10 feedback-smtp.us-east-1.amazonses.com.'],
      'send.example.org TXT': ['"v=spf1 include:amazonses.com ~all"'],
      'resend._domainkey.example.org TXT': ['"p=MIGfMA0GCSqGSIb3"'],
      '_dmarc.example.org TXT': ['"v=DMARC1; p=none;"'],
    },
    /** What a person confirmed on this computer, such as a Google Group existing. */
    confirmed: new Set(),
    /** The id `wrangler d1 create` gives the next database. */
    nextDatabaseId: 'db-1',
    /** Commands that fail once, by a pattern of their command line. */
    failOnce: new Set(),
    writes: [],
    sequence: 0,
  };
}

function page(items, url) {
  const query = new URL(url).searchParams;
  const number = Number(query.get('page') ?? 1);
  const size = Number(query.get('per_page') ?? 20);
  return {
    result: items.slice((number - 1) * size, number * size),
    result_info: { page: number, per_page: size, total_count: items.length },
  };
}

const ok = (payload) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, ...payload }),
});
const failed = (status, message, code = 1000) => ({
  ok: false,
  status,
  json: async () => ({ success: false, errors: [{ code, message }] }),
});

function next(world, prefix) {
  world.sequence += 1;
  return `${prefix}-${world.sequence}`;
}

function expandPolicies(world, policies = []) {
  return policies.map((reference) => ({
    ...world.policies.find((policy) => policy.id === reference.id),
    precedence: reference.precedence,
  }));
}

function createPolicy(world, { body }) {
  const policy = { id: next(world, 'policy'), reusable: true, ...body };
  world.policies.push(policy);
  world.writes.push(`create policy ${body.name}`);
  return ok({ result: policy });
}

function updatePolicy(world, { match, body }) {
  const policy = world.policies.find((candidate) => candidate.id === match[1]);
  Object.assign(policy, body);
  world.writes.push(`update policy ${policy.name}`);
  return ok({ result: policy });
}

function createApp(world, { body }) {
  const id = next(world, 'app');
  const app = {
    id,
    aud: String(world.sequence).padStart(64, 'd'),
    ...body,
    policies: expandPolicies(world, body.policies),
  };
  world.apps.push(app);
  world.writes.push(`create app ${body.name}`);
  return ok({ result: app });
}

function updateApp(world, { match, body }) {
  const app = world.apps.find((candidate) => candidate.id === match[1]);
  Object.assign(app, body, { policies: expandPolicies(world, body.policies) });
  world.writes.push(`update app ${app.name}`);
  return ok({ result: app });
}

/** Zero Trust answers only once it is turned on. */
const access = (handler) => (world, call) =>
  world.zeroTrust.enabled
    ? handler(world, call)
    : failed(400, 'access.api.error.not_enabled', 12130);

const ACCESS_ROUTES = [
  ['GET', /^access\/apps$/, access((world, { url }) => ok(page(world.apps, url)))],
  [
    'GET',
    /^access\/organizations$/,
    access((world) =>
      ok({ result: { auth_domain: world.zeroTrust.teamDomain, name: world.zeroTrust.teamName } }),
    ),
  ],
  [
    'GET',
    /^access\/identity_providers$/,
    access((world, { url }) => ok(page(world.providers, url))),
  ],
  ['GET', /^access\/policies$/, access((world, { url }) => ok(page(world.policies, url)))],
  ['POST', /^access\/policies$/, access(createPolicy)],
  ['PUT', /^access\/policies\/(.+)$/, access(updatePolicy)],
  ['POST', /^access\/apps$/, access(createApp)],
  ['PUT', /^access\/apps\/(.+)$/, access(updateApp)],
];

function queryDatabase(world, { match }) {
  const database = world.databases.find((candidate) => candidate.uuid === match[1]);
  if (database.applied.length === 0) return failed(400, 'no such table: d1_migrations', 7500);
  return ok({ result: [{ results: database.applied.map((name) => ({ name })) }] });
}

/** A listed widget, which never carries its secret. */
function listedWidget(widget) {
  const listed = { ...widget };
  delete listed.secret;
  return listed;
}

function createWidget(world, { body }) {
  const widget = { sitekey: '0xSITEKEY', secret: '0xWIDGETSECRET', ...body };
  world.widgets.push(widget);
  world.writes.push(`create widget ${body.name}`);
  return ok({ result: widget });
}

function updateWidget(world, { match, body }) {
  const widget = world.widgets.find((candidate) => candidate.sitekey === match[1]);
  Object.assign(widget, body);
  world.writes.push(`update widget ${widget.name}`);
  return ok({ result: widget });
}

const ROUTES = [
  [
    'GET',
    /^workers\/scripts\/example\/settings$/,
    (world) =>
      world.worker.exists ? ok({ result: { bindings: [] } }) : failed(404, 'not found', 10007),
  ],
  [
    'GET',
    /^workers\/scripts\/example\/secrets$/,
    (world) => ok({ result: [...world.worker.secrets.keys()].map((name) => ({ name })) }),
  ],
  [
    'GET',
    /^d1\/database$/,
    (world, { url }) =>
      ok(
        page(
          world.databases.map(({ name, uuid }) => ({ name, uuid })),
          url,
        ),
      ),
  ],
  ['POST', /^d1\/database\/([^/]+)\/query$/, queryDatabase],
  [
    'GET',
    /^r2\/buckets\/(.+)$/,
    (world, { match }) =>
      world.buckets.has(decodeURIComponent(match[1]))
        ? ok({ result: { name: match[1] } })
        : failed(404, 'The specified bucket does not exist.', 10006),
  ],
  [
    'GET',
    /^challenges\/widgets$/,
    (world, { url }) => ok(page(world.widgets.map(listedWidget), url)),
  ],
  ['POST', /^challenges\/widgets$/, createWidget],
  [
    'GET',
    /^challenges\/widgets\/(.+)$/,
    (world, { match }) =>
      ok({ result: world.widgets.find((candidate) => candidate.sitekey === match[1]) }),
  ],
  ['PUT', /^challenges\/widgets\/(.+)$/, updateWidget],
  ...ACCESS_ROUTES,
];

function cloudflareRoute(world, method, route, call) {
  for (const [verb, pattern, handler] of ROUTES) {
    const match = verb === method ? pattern.exec(route) : null;
    if (match) return handler(world, { ...call, match });
  }
  return failed(404, `no route for ${method} ${route}`);
}

export function worldRequest(world, seen = []) {
  return async (url, init = {}) => {
    const method = init.method ?? 'GET';
    seen.push({ method, url, authorization: init.headers?.Authorization });
    if (url.includes('dns-query')) {
      const query = new URL(url).searchParams;
      const code = { MX: 15, TXT: 16 }[query.get('type')];
      const answers = world.dns[`${query.get('name')} ${query.get('type')}`] ?? [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ Answer: answers.map((data) => ({ type: code, data })) }),
      };
    }
    if (url.endsWith('user/tokens/verify')) return ok({ result: { status: 'active' } });
    const route = new URL(url).pathname.replace(`/client/v4/accounts/${ACCOUNT}/`, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    return cloudflareRoute(world, method, route, { body, url });
  };
}

const done = (stdout = '') => ({ status: 0, stdout, stderr: '' });

function wranglerCommand(world, args, input) {
  const line = args.join(' ');
  if (line === 'auth token --json') return done('{"type":"oauth","token":"wrangler-token"}');
  if (args[0] === 'd1' && args[1] === 'create') {
    world.databases.push({ name: args[2], uuid: world.nextDatabaseId, applied: [] });
    world.writes.push(`create database ${args[2]}`);
    return done();
  }
  if (args[0] === 'd1' && args[1] === 'migrations') {
    const database = world.databases.find((candidate) => candidate.name === args[3]);
    const pending = MIGRATIONS.filter((name) => !database.applied.includes(name));
    database.applied.push(...pending);
    world.writes.push(`apply ${pending.length} migrations to ${args[3]}`);
    return done();
  }
  if (args[0] === 'r2') {
    world.buckets.add(args[3]);
    world.writes.push(`create bucket ${args[3]}`);
    return done();
  }
  if (args[0] === 'secret' && args[1] === 'put') {
    world.worker.secrets.set(args[2], input);
    world.writes.push(`put ${args[2]} on the Worker`);
    return done();
  }
  if (args[0] === 'secret' && args[1] === 'delete') {
    world.worker.secrets.delete(args[2]);
    world.writes.push(`delete ${args[2]} from the Worker`);
    return done();
  }
  return { status: 1, stdout: '', stderr: `unexpected wrangler ${line}` };
}

function ghCommand(world, args, input) {
  const environment = args[args.indexOf('--env') + 1];
  if (args[0] === 'api' && args[1] === '--method') {
    const name = args[3].split('/').pop();
    world.environments.add(name);
    world.writes.push(`create environment ${name}`);
    return done('{}');
  }
  if (args[0] === 'api') {
    const name = args[1].split('/').pop();
    return world.environments.has(name)
      ? done('{}')
      : { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
  }
  const secrets = world.environmentSecrets.get(environment) ?? new Map();
  world.environmentSecrets.set(environment, secrets);
  if (args[1] === 'list')
    return done(JSON.stringify([...secrets.keys()].map((name) => ({ name }))));
  if (args[1] === 'set') {
    secrets.set(args[2], input);
    world.writes.push(`set ${args[2]} in ${environment}`);
    return done();
  }
  if (args[1] === 'delete') {
    secrets.delete(args[2]);
    world.writes.push(`delete ${args[2]} from ${environment}`);
    return done();
  }
  return { status: 1, stdout: '', stderr: `unexpected gh ${args.join(' ')}` };
}

export function worldRun(world) {
  return (command, args, options = {}) => {
    const line = [command, ...args].join(' ');
    for (const pattern of world.failOnce) {
      if (line.includes(pattern)) {
        world.failOnce.delete(pattern);
        return { status: 1, stdout: '', stderr: `${pattern} failed for a moment` };
      }
    }
    if (command === 'pnpm' && args[1] === 'wrangler')
      return wranglerCommand(world, args.slice(2), options.input);
    if (command === 'gh') return ghCommand(world, args, options.input);
    return { status: 1, stdout: '', stderr: `unexpected ${line}` };
  };
}

/** A repository with the sample manifest, its wrangler config, and its migrations. */
export async function worldRepository(manifest = sampleManifest()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lvbt-world-'));
  const site = path.join(root, 'apps/site');
  await mkdir(path.join(site, 'migrations'), { recursive: true });
  await writeFile(path.join(site, 'platform.json'), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(site, 'wrangler.jsonc'), CONFIG);
  for (const file of MIGRATIONS) await writeFile(path.join(site, 'migrations', file), 'SELECT 1;');
  return {
    root,
    readConfig: () => readFile(path.join(site, 'wrangler.jsonc'), 'utf8'),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/**
 * One run of `lvbt bootstrap --production` against the world. `rules` answer
 * the questions as scriptedIo does. Returns what the run changed and asked.
 */
export async function bootstrapOnce(world, repository, { rules = [], options = {} } = {}) {
  // Unless a test says otherwise, the person has created the Google Group.
  const io = scriptedIo([...rules, [/Does the Google Group/, true]]);
  const before = world.writes.length;
  let error;
  try {
    await platformBootstrap({
      cwd: repository.root,
      options,
      services: {
        run: worldRun(world),
        request: worldRequest(world),
        env: { LVBT_CLOUDFLARE_SETUP_TOKEN: 'setup-token' },
        confirmations: {
          where: 'the test world',
          read: () => new Set(world.confirmed),
          add: (key) => world.confirmed.add(key),
        },
      },
      io,
    });
  } catch (caught) {
    error = caught;
  }
  return {
    ready: error === undefined,
    error,
    writes: world.writes.slice(before),
    asked: io.asked,
    output: io.output(),
  };
}
