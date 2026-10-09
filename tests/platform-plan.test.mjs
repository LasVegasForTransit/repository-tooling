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

test('a name-only D1 binding is ready and can apply migrations from the observed database', () => {
  const plan = planAfter((state) => {
    delete state.config.value.d1[0].id;
    state.d1.value.example.applied = known(['0001_first.sql']);
  });
  assert.equal(plan.byId('d1:example').status, 'ok');
  assert.equal(plan.byId('d1:example:migrations').action.type, 'd1.migrate');
});

test('D1 readiness and migrations wait when the binding config cannot be read', () => {
  const plan = planAfter((state) => {
    state.config = unknown('config unavailable');
    state.d1.value.example.applied = known(['0001_first.sql']);
  });
  assert.equal(plan.byId('d1:example').status, 'unknown');
  assert.equal(plan.byId('d1:example:migrations').action, undefined);
});

test('a wrangler config pointing at another database is a mismatch nobody fixes silently', () => {
  const plan = planAfter((state) => (state.config.value.d1[0].id = 'db-old'));
  const database = plan.byId('d1:example');
  assert.equal(database.status, 'mismatch');
  assert.equal(database.action, undefined);
  assert.match(database.next, /db-1/);
});

test('cf plan names typed D1, R2 and text bindings in its repair instructions', () => {
  const manifest = sampleManifest();
  manifest.cloudflare.cloudflareConfig = '../deploy/cloudflare.config.ts';
  const state = readyState();
  state.config.value.d1 = [];
  state.config.value.r2 = [];
  state.config.value.vars = {};
  const items = planPlatform({
    manifest,
    state,
    configPath: 'apps/deploy/cloudflare.config.ts',
  });
  const byId = (id) => items.find((entry) => entry.id === id);
  assert.match(byId('d1:example').next, /bindings\.d1/);
  assert.match(byId('r2:example-photos').next, /bindings\.r2/);
  assert.match(byId('var:TURNSTILE_SITE_KEY').next, /worker\.env/);
  assert.doesNotMatch(byId('d1:example').next, /d1_databases/);
  assert.doesNotMatch(byId('r2:example-photos').next, /r2_buckets/);
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

test('Forge records make email ready and a missing return-path CNAME blocks it', () => {
  const forgeDns = {
    'rsend.example.org CNAME': known(['rsend.forge.rmta.net.']),
    'send.example.org CNAME': known(['send.forge.rmta.net.']),
    'resend._domainkey.example.org TXT': known(['"p=MIGfMA0GCSqGSIb3"']),
    '_dmarc.example.org TXT': known(['"v=DMARC1; p=none;"']),
  };
  const forge = (change = () => undefined) =>
    planAfter(
      (state) => {
        state.dns = { ...forgeDns };
        change(state);
      },
      (manifest) => {
        manifest.email[0].dnsProfile = 'forge';
      },
    );
  const ready = forge();
  assert.equal(ready.byId('email:example.org:rsend').status, 'ok');
  assert.equal(ready.byId('email:example.org:send').status, 'ok');
  assert.equal(ready.ready, true);
  assert.equal(ready.byId('email:example.org:mx'), undefined);

  const noReturnPath = forge((state) => (state.dns['send.example.org CNAME'] = known([])));
  assert.equal(noReturnPath.byId('email:example.org:send').status, 'missing');
  assert.equal(noReturnPath.ready, false);

  const noDmarc = forge((state) => (state.dns['_dmarc.example.org TXT'] = known([])));
  assert.equal(noDmarc.ready, true);
  assert.equal(noDmarc.byId('email:example.org:dmarc').level, 'recommended');
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

test('a declared main-only release environment reports policy drift before credential setup', () => {
  const plan = planAfter(
    (state) =>
      (state.github.value.policies = {
        production: { deployment_branch_policy: null, branch_policies: [] },
      }),
    (manifest) => (manifest.github.environments = [{ name: 'production', branch: 'main' }]),
  );
  const entry = plan.byId('github:production');
  assert.equal(entry.status, 'missing');
  assert.deepEqual(entry.action, {
    type: 'github.environment',
    environment: 'production',
    branch: 'main',
  });
  const fixed = planAfter(
    (state) =>
      (state.github.value.policies = {
        production: {
          deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
          branch_policies: [{ name: 'main', type: 'branch' }],
        },
      }),
    (manifest) => (manifest.github.environments = [{ name: 'production', branch: 'main' }]),
  );
  assert.equal(fixed.byId('github:production').status, 'ok');
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

test('list-only future secrets never offer provisioning actions', () => {
  const plan = planAfter(
    (state) => {
      state.worker.value.secrets = [];
    },
    (manifest) => {
      manifest.secrets = [
        {
          name: 'UNUSED_KEY',
          purpose: 'Not built',
          use: 'future',
          listOnly: true,
          steps: ['Do not create a key.'],
        },
      ];
    },
  );
  const secret = plan.byId('secret:UNUSED_KEY:worker');
  assert.equal(secret.action, undefined);
  assert.equal(plan.ready, true);
});
test('generated values wait when another target could not be observed', () => {
  const plan = planAfter(
    (state) => {
      state.worker.value.secrets = [];
      state.github = unknown('missing inventory access');
    },
    (manifest) => {
      manifest.secrets = [
        {
          name: 'SIGNING_SECRET',
          purpose: 'Signs links.',
          generate: true,
          targets: ['worker', 'github:production'],
        },
      ];
    },
  );
  assert.equal(plan.byId('secret:SIGNING_SECRET:worker').action, undefined);
  assert.match(plan.byId('secret:SIGNING_SECRET:worker').detail, /cannot|unknown|check/i);
});

test('rotation refuses list-only future credentials', async () => {
  const { rotationNames } = await import('../packages/cli/src/lib/platform/index.mjs');
  assert.throws(
    () =>
      rotationNames('UNUSED_KEY', [
        { secrets: [{ name: 'UNUSED_KEY', use: 'future', listOnly: true }] },
      ]),
    /future|list-only/,
  );
});
