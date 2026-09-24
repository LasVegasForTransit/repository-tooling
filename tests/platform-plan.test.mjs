import assert from 'node:assert/strict';
import test from 'node:test';

import { known, unknown } from '../packages/cli/src/lib/platform/observe.mjs';
import { planPlatform, readiness } from '../packages/cli/src/lib/platform/plan.mjs';
import { readyState, sampleManifest } from './support/platform.mjs';

const configPath = 'apps/site/wrangler.jsonc';

/** Plan the sample manifest after `change` edits the ready state. */
function planAfter(change = () => undefined, editManifest = () => undefined) {
  const manifest = sampleManifest();
  const state = readyState();
  editManifest(manifest);
  change(state, manifest);
  const items = planPlatform({ manifest, state, configPath });
  return { items, byId: (id) => items.find((entry) => entry.id === id), ...readiness(items) };
}

test('when everything exists, every item is ok and production is ready', () => {
  const plan = planAfter();
  assert.deepEqual(
    plan.items.filter((entry) => entry.status !== 'ok').map((entry) => entry.id),
    [],
  );
  assert.equal(plan.ready, true);
});

test('a missing database is created, and its migrations follow once the config names it', () => {
  const plan = planAfter((state) => (state.d1 = known({})));
  assert.equal(plan.byId('d1:example').action.type, 'd1.create');
  const migrations = plan.byId('d1:example:migrations');
  assert.equal(migrations.status, 'missing');
  assert.equal(migrations.action.type, 'd1.migrate');
  assert.equal(migrations.action.afterCreate, true);
  assert.equal(plan.ready, false);
});

test('migrations are not applied through a config that names another database', () => {
  const plan = planAfter((state) => {
    state.config.value.d1[0].id = 'db-old';
    state.d1.value.example.applied = known(['0001_first.sql']);
  });
  const migrations = plan.byId('d1:example:migrations');
  assert.equal(migrations.status, 'missing');
  assert.equal(migrations.action, undefined);
  assert.match(migrations.next, /db-1/);
});

test('unapplied migrations are named and applied', () => {
  const plan = planAfter((state) => (state.d1.value.example.applied = known(['0001_first.sql'])));
  const migrations = plan.byId('d1:example:migrations');
  assert.equal(migrations.status, 'missing');
  assert.equal(migrations.action.type, 'd1.migrate');
  assert.match(migrations.detail, /0002_second\.sql/);
});

test('a wrangler config pointing at another database is a mismatch nobody fixes silently', () => {
  const plan = planAfter((state) => (state.config.value.d1[0].id = 'db-old'));
  const database = plan.byId('d1:example');
  assert.equal(database.status, 'mismatch');
  assert.equal(database.action, undefined);
  assert.match(database.next, /db-1/);
});

test('a missing bucket is created', () => {
  const plan = planAfter((state) => (state.r2 = known([])));
  assert.equal(plan.byId('r2:example-photos').action.type, 'r2.create');
});

test('a Turnstile widget is created when none covers the domains, and widened when one falls short', () => {
  const missing = planAfter((state) => (state.turnstile = known([])));
  assert.equal(missing.byId('turnstile:example.org').action.type, 'turnstile.create');

  const narrow = planAfter((state) => (state.turnstile.value[0].domains = ['other.org']));
  const widget = narrow.byId('turnstile:example.org');
  assert.equal(widget.status, 'mismatch');
  assert.equal(widget.action.type, 'turnstile.update');
});

test('Turnstile that cannot be read fails the check and says which credential is missing', () => {
  const plan = planAfter((state) => (state.turnstile = unknown('403', 'unauthorized')));
  const widget = plan.byId('turnstile:example.org');
  assert.equal(widget.status, 'unknown');
  assert.match(widget.next, /LVBT_CLOUDFLARE_SETUP_TOKEN/);
  assert.equal(plan.ready, false);
});

test('Access waits for Zero Trust, which only the dashboard can turn on', () => {
  const plan = planAfter(
    (state) => (state.access = known({ enabled: false, providers: [], apps: [], policies: [] })),
  );
  assert.equal(plan.byId('access:zero-trust').action.type, 'manual');
  assert.ok(plan.byId('access:zero-trust').action.guide.steps.length > 0);
  assert.equal(plan.byId('access:example admin').action, undefined);
});

test('Access waits for the identity provider before it creates the application', () => {
  const plan = planAfter((state) => {
    state.access.value.providers = [];
    state.access.value.apps = [];
  });
  assert.equal(plan.byId('access:idp:google-apps').action.type, 'manual');
  assert.equal(plan.byId('access:example admin').action, undefined);
});

test('a missing Access application is created with an allow rule for the Google group', () => {
  const plan = planAfter((state) => (state.access.value.apps = []));
  const { action } = plan.byId('access:example admin');
  assert.equal(action.type, 'access.create');
  assert.deepEqual(action.rule, [
    { gsuite: { email: 'admins@example.org', identity_provider_id: 'idp-1' } },
  ]);
});

test('an Access application that lets everyone in, or misses a path, is fixed', () => {
  const plan = planAfter((state) => {
    const [app] = state.access.value.apps;
    app.destinations = app.destinations.slice(0, 1);
    app.policies.push({ id: 'open', decision: 'allow', include: [{ everyone: {} }] });
  });
  const app = plan.byId('access:example admin');
  assert.equal(app.status, 'mismatch');
  assert.equal(app.action.type, 'access.update');
  assert.match(app.detail, /example\.org\/admin\/\*/);
  assert.match(app.detail, /everyone/);
});

test('a reusable allow policy referenced by id counts', () => {
  const plan = planAfter((state) => {
    const access = state.access.value;
    access.policies = [access.apps[0].policies[0]];
    access.apps[0].policies = [{ id: 'policy-1', precedence: 1 }];
  });
  assert.equal(plan.byId('access:example admin').status, 'ok');
});

test('each missing secret says where its value will come from', () => {
  const plan = planAfter((state) => {
    state.worker.value.secrets = [];
    state.github.value.secrets.production = [];
  });
  const source = (name, target = 'worker') =>
    plan.byId(`secret:${name}:${target}`).action.source.type;
  assert.equal(source('RESEND_API_KEY'), 'prompt');
  assert.equal(source('TURNSTILE_SECRET'), 'turnstile');
  assert.equal(source('ACCESS_TEAM_DOMAIN'), 'access-team');
  assert.equal(source('ACCESS_AUD'), 'access-audience');
  assert.equal(source('SIGNING_SECRET'), 'generate');
  assert.equal(source('CLOUDFLARE_ACCOUNT_ID', 'github:production'), 'value');
});

test('a secret for a feature not built yet warns but does not block production', () => {
  const plan = planAfter((state) => {
    state.worker.value.secrets = state.worker.value.secrets.filter((name) => name !== 'FUTURE_KEY');
  });
  assert.equal(plan.byId('secret:FUTURE_KEY:worker').level, 'later');
  assert.equal(plan.ready, true);
  assert.equal(plan.later.length, 1);
});

test('secrets wait for the first deploy of a Worker that does not exist yet', () => {
  const plan = planAfter(
    (state) => (state.worker = known({ exists: false, secrets: [], vars: {} })),
  );
  const secret = plan.byId('secret:RESEND_API_KEY:worker');
  assert.equal(secret.status, 'missing');
  assert.equal(secret.action, undefined);
});

test("a site-key var must be in the wrangler config and match the widget's key", () => {
  const missing = planAfter((state) => (state.config.value.vars = {}));
  assert.equal(missing.byId('var:TURNSTILE_SITE_KEY').status, 'missing');
  assert.match(missing.byId('var:TURNSTILE_SITE_KEY').next, /0xSITEKEY/);

  const stale = planAfter((state) => (state.config.value.vars.TURNSTILE_SITE_KEY = '0xOLD'));
  assert.equal(stale.byId('var:TURNSTILE_SITE_KEY').status, 'mismatch');
});

test('missing sending records block production; a missing DMARC record only warns', () => {
  const noDkim = planAfter((state) => (state.dns['resend._domainkey.example.org TXT'] = known([])));
  assert.equal(noDkim.byId('email:example.org:dkim').status, 'missing');
  assert.equal(noDkim.ready, false);

  const noDmarc = planAfter((state) => (state.dns['_dmarc.example.org TXT'] = known([])));
  assert.equal(noDmarc.byId('email:example.org:dmarc').level, 'recommended');
  assert.equal(noDmarc.ready, true);
});

test('a forbidden secret on the production Worker fails the check and can be deleted', () => {
  const plan = planAfter((state) => state.worker.value.secrets.push('PREVIEW_ADMIN_KEY'));
  const forbidden = plan.byId('forbidden:PREVIEW_ADMIN_KEY:worker');
  assert.equal(forbidden.status, 'forbidden');
  assert.equal(forbidden.action.type, 'secret.delete');
  assert.equal(plan.ready, false);
});

test('a forbidden var is caught in the wrangler config and on the deployed Worker', () => {
  const inConfig = planAfter((state) => (state.config.value.vars.PREVIEW_ADMIN_KEY = 'x'));
  assert.equal(inConfig.byId('forbidden:PREVIEW_ADMIN_KEY:worker').status, 'forbidden');

  const deployed = planAfter((state) => (state.worker.value.vars.PREVIEW_ADMIN_KEY = 'x'));
  assert.equal(deployed.byId('forbidden:PREVIEW_ADMIN_KEY:worker').status, 'forbidden');
});

test('a warning-level forbidden value is reported without blocking production', () => {
  const plan = planAfter((state) => (state.config.value.vars.BOT_CHECK = 'off'));
  assert.equal(plan.byId('forbidden:BOT_CHECK:worker').status, 'forbidden');
  assert.equal(plan.ready, true);
  assert.equal(plan.recommended.length, 1);
});

test('forbidden values are checked in GitHub environments too', () => {
  const plan = planAfter(
    (state) => state.github.value.secrets.production.push('PREVIEW_ADMIN_KEY'),
    (manifest) => (manifest.forbidden[0].targets = ['worker', 'github:production']),
  );
  const forbidden = plan.byId('forbidden:PREVIEW_ADMIN_KEY:github:production');
  assert.equal(forbidden.status, 'forbidden');
  assert.equal(forbidden.action.target, 'github:production');
});

test('a missing GitHub environment is created before its secrets are stored', () => {
  const plan = planAfter((state) => (state.github = known({ environments: [], secrets: {} })));
  const ids = plan.items.map((entry) => entry.id);
  assert.equal(plan.byId('github:production').action.type, 'github.environment');
  assert.ok(
    ids.indexOf('github:production') <
      ids.indexOf('secret:CLOUDFLARE_ACCOUNT_ID:github:production'),
  );
});

test('when Wrangler is signed out, nothing it reads is reported as ready', () => {
  const plan = planAfter((state) => {
    const signedOut = unknown('Wrangler is not signed in.', 'unauthorized');
    Object.assign(state, { worker: signedOut, d1: signedOut, r2: signedOut });
  });
  for (const id of ['worker', 'd1:example', 'r2:example-photos', 'secret:RESEND_API_KEY:worker'])
    assert.equal(plan.byId(id).status, 'unknown', id);
  assert.equal(plan.ready, false);
});

test('an Access application whose identity provider is gone waits instead of guessing', () => {
  const plan = planAfter((state) => {
    state.access.value.providers = [];
    state.access.value.apps[0].session_duration = '1h';
  });
  const app = plan.byId('access:example admin');
  assert.equal(app.status, 'mismatch');
  assert.equal(app.action, undefined);
});
