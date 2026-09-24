import assert from 'node:assert/strict';
import test from 'node:test';

import { sampleManifest } from './support/platform.mjs';
import { bootstrapOnce, freshWorld, worldRepository } from './support/platform-world.mjs';

/**
 * `lvbt bootstrap --production` run more than once against the same fake
 * services. Every step checks before it acts, so a finished setup is left
 * alone, and an unfinished one resumes where it stopped.
 */

const RESEND = [/Paste RESEND_API_KEY/, 're_goodkey'];
const secretPrompts = (asked) => asked.filter((question) => /^Paste [A-Z_]+ /.test(question));
const duplicates = (writes) => writes.filter((write, index) => writes.indexOf(write) !== index);

async function withRepository(manifest, body) {
  const repository = await worldRepository(manifest);
  try {
    await body(repository);
  } finally {
    await repository.remove();
  }
}

test('a second run on a finished setup changes nothing, asks for nothing, and reports ready', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    const config = await repository.readConfig();

    const first = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(first.ready, true, first.error?.message);
    assert.deepEqual(duplicates(first.writes), []);
    for (const created of [
      'create database example',
      'create bucket example-photos',
      'create widget example.org',
      'create app example admin',
      'create environment production',
    ])
      assert.ok(first.writes.includes(created), created);

    const second = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(second.ready, true, second.error?.message);
    assert.deepEqual(second.writes, []);
    assert.deepEqual(secretPrompts(second.asked), []);
    assert.equal(await repository.readConfig(), config);
    assert.match(second.output, /nothing was changed/i);
    assert.match(second.output, /Ready for production/);
  });
});

test('every value stays the one first stored; a later run never mints or copies a new one', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    const stored = new Map(world.worker.secrets);
    await bootstrapOnce(world, repository, { rules: [[/Paste RESEND_API_KEY/, 're_other']] });
    assert.deepEqual(new Map(world.worker.secrets), stored);
  });
});

test('after a partial run, the next run does exactly what is left, and the one after nothing', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    world.failOnce.add('r2 bucket create');

    const partial = await bootstrapOnce(world, repository, { rules: [[/Paste RESEND/, '']] });
    assert.equal(partial.ready, false);
    assert.ok(!partial.writes.includes('create bucket example-photos'));
    assert.ok(!partial.writes.includes('put RESEND_API_KEY on the Worker'));

    const resumed = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(resumed.ready, true, resumed.error?.message);
    assert.deepEqual(resumed.writes.sort(), [
      'create bucket example-photos',
      'put RESEND_API_KEY on the Worker',
    ]);

    const again = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.deepEqual(again.writes, []);
  });
});

test('a brand-new account converges through its dashboard steps without doing anything twice', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    world.zeroTrust.enabled = false;
    world.providers = [];
    // What a person does in the dashboard when a run shows them the steps.
    const dashboardSteps = [
      () => (world.zeroTrust.enabled = true),
      () => (world.providers = [{ id: 'idp-1', type: 'google-apps', name: 'Google Workspace' }]),
    ];

    const runs = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
      runs.push(run);
      if (run.ready && run.writes.length === 0) break;
      dashboardSteps.shift()?.();
    }
    const last = runs.at(-1);
    assert.equal(last.ready, true, last.error?.message);
    assert.deepEqual(last.writes, []);
    assert.ok(runs.length <= 4, `took ${runs.length} runs`);
    assert.deepEqual(duplicates(runs.flatMap((run) => run.writes)), []);
  });
});

test('when Zero Trust is already on, setup confirms the team domain instead of turning it on', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.match(run.output, /team\.cloudflareaccess\.com/);
    assert.doesNotMatch(run.output, /Zero Trust Free plan/);
  });
});

test('a new Access application stores its new audience tag but not the team domain again', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    world.apps = [];

    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.ok(run.writes.includes('create app example admin'));
    assert.ok(run.writes.includes('put ACCESS_AUD on the Worker'));
    assert.ok(!run.writes.includes('put ACCESS_TEAM_DOMAIN on the Worker'));
    assert.deepEqual(duplicates(run.writes), []);
  });
});

test('migrations wait until the config names a newly created database', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    world.nextDatabaseId = 'db-new';

    const first = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.ok(first.writes.includes('create database example'));
    assert.ok(!first.writes.some((write) => write.startsWith('apply')));
    assert.match(first.output, /db-new/);

    const second = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.deepEqual(second.writes, []);
    assert.equal(second.ready, false);
  });
});

test('an Access application that lets everyone in is fixed once and then left alone', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    world.policies.push({
      id: 'open',
      name: 'anyone',
      decision: 'allow',
      include: [{ everyone: {} }],
    });
    world.apps[0].policies.push({ ...world.policies.at(-1), precedence: 2 });

    const fix = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.ok(fix.writes.includes('update app example admin'));
    assert.ok(world.apps[0].policies.every((policy) => policy.id !== 'open'));

    const after = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.deepEqual(after.writes, []);
  });
});

test('widening a Turnstile widget keeps the settings setup does not manage', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    Object.assign(world.widgets[0], {
      domains: ['other.org'],
      clearance_level: 'managed',
      bot_fight_mode: true,
    });

    const fix = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.deepEqual(fix.writes, ['update widget example.org']);
    assert.equal(world.widgets[0].clearance_level, 'managed');
    assert.equal(world.widgets[0].bot_fight_mode, true);
    assert.deepEqual(world.widgets[0].domains, ['other.org', 'example.org']);
  });
});

test('resources on later pages of a long list are found, not created again', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    const filler = (count, make) => Array.from({ length: count }, (_, index) => make(index));
    world.widgets.unshift(
      ...filler(120, (index) => ({
        name: `w${index}`,
        sitekey: `0x${index}`,
        domains: [`w${index}.org`],
        mode: 'managed',
      })),
    );
    world.databases.unshift(
      ...filler(120, (index) => ({ name: `d${index}`, uuid: `u${index}`, applied: [] })),
    );
    world.apps.unshift(
      ...filler(120, (index) => ({ id: `a${index}`, name: `app ${index}`, destinations: [] })),
    );
    world.policies.unshift(
      ...filler(120, (index) => ({ id: `p${index}`, name: `policy ${index}` })),
    );

    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(run.ready, true, run.error?.message);
    assert.deepEqual(run.writes, []);
  });
});

test('the Google Group step is shown until the person confirms it, then never again', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    const notYet = await bootstrapOnce(world, repository, {
      rules: [RESEND, [/Does the Google Group/, false]],
    });
    assert.match(notYet.output, /Create group/);
    assert.equal(notYet.ready, true, 'an unconfirmed group only warns');

    const confirmed = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.match(confirmed.output, /Create group/);

    const after = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.doesNotMatch(after.output, /Create group/);
    assert.ok(!after.asked.some((question) => /Google Group/.test(question)));
  });
});

test('resources made by hand in the dashboard with the manifest names are used, not duplicated', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    // As the dashboard guide creates them: the manifest's names, an inline policy.
    world.widgets.push({
      name: 'example.org',
      sitekey: '0xSITEKEY',
      secret: '0xHANDMADE',
      domains: ['example.org'],
      mode: 'managed',
    });
    world.apps.push({
      id: 'hand-app',
      name: 'example admin',
      aud: 'e'.repeat(64),
      domain: 'example.org/admin',
      self_hosted_domains: ['example.org/admin', 'example.org/admin/*'],
      destinations: [
        { type: 'public', uri: 'example.org/admin' },
        { type: 'public', uri: 'example.org/admin/*' },
      ],
      session_duration: '24h',
      allowed_idps: ['idp-1'],
      policies: [
        {
          id: 'hand-policy',
          name: 'example admin allow',
          decision: 'allow',
          include: [{ gsuite: { email: 'admins@example.org', identity_provider_id: 'idp-1' } }],
        },
      ],
    });

    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(run.ready, true, run.error?.message);
    assert.ok(!run.writes.some((write) => /widget|app |policy/.test(write)), run.writes.join());
    assert.equal(world.worker.secrets.get('ACCESS_AUD'), 'e'.repeat(64));
    assert.equal(world.worker.secrets.get('TURNSTILE_SECRET'), '0xHANDMADE');
  });
});

test('an application made by hand under another name is found by its paths', async () => {
  await withRepository(undefined, async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    world.apps[0].name = 'Admin pages (made by hand)';

    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.ok(!run.writes.includes('create app example admin'));
    assert.equal(world.apps.length, 1);
  });
});

/** SIGNING_SECRET shared by the Worker and a GitHub environment. */
function sharedSecretManifest() {
  const manifest = sampleManifest();
  manifest.secrets.find((secret) => secret.name === 'SIGNING_SECRET').targets = [
    'worker',
    'github:production',
  ];
  return manifest;
}

test('a generated secret set on one target is not minted again for another', async () => {
  await withRepository(sharedSecretManifest(), async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    const value = world.worker.secrets.get('SIGNING_SECRET');
    assert.equal(world.environmentSecrets.get('production').get('SIGNING_SECRET'), value);

    world.environmentSecrets.get('production').delete('SIGNING_SECRET');
    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(run.ready, false);
    assert.deepEqual(run.writes, []);
    assert.match(run.output, /--rotate SIGNING_SECRET/);
    assert.equal(world.worker.secrets.get('SIGNING_SECRET'), value);
  });
});

test('--rotate replaces a stored value on every target, and only when asked', async () => {
  await withRepository(sharedSecretManifest(), async (repository) => {
    const world = freshWorld();
    await bootstrapOnce(world, repository, { rules: [RESEND] });
    const old = world.worker.secrets.get('SIGNING_SECRET');

    const rotated = await bootstrapOnce(world, repository, {
      rules: [RESEND],
      options: { rotate: 'SIGNING_SECRET' },
    });
    assert.equal(rotated.ready, true, rotated.error?.message);
    assert.deepEqual(rotated.writes.sort(), [
      'put SIGNING_SECRET on the Worker',
      'set SIGNING_SECRET in production',
    ]);
    const fresh = world.worker.secrets.get('SIGNING_SECRET');
    assert.notEqual(fresh, old);
    assert.equal(world.environmentSecrets.get('production').get('SIGNING_SECRET'), fresh);
    assert.ok(!rotated.output.includes(fresh));

    const declined = await bootstrapOnce(world, repository, {
      rules: [RESEND, [/Replace SIGNING_SECRET/, false]],
      options: { rotate: 'SIGNING_SECRET' },
    });
    assert.deepEqual(declined.writes, []);
  });
});

test('--rotate refuses a name the manifest does not declare', async () => {
  await withRepository(undefined, async (repository) => {
    const run = await bootstrapOnce(freshWorld(), repository, {
      options: { rotate: 'NOT_DECLARED' },
    });
    assert.equal(run.error?.exitCode, 2);
  });
});

test('values that are not credentials are shown; credentials never are', async () => {
  const manifest = sampleManifest();
  for (const secret of manifest.secrets)
    if (['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD'].includes(secret.name)) secret.sensitive = false;
  await withRepository(manifest, async (repository) => {
    const world = freshWorld();
    const run = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.equal(run.ready, true, run.error?.message);

    const audience = world.worker.secrets.get('ACCESS_AUD');
    assert.match(run.output, /Stored ACCESS_TEAM_DOMAIN = team\.cloudflareaccess\.com/);
    assert.ok(run.output.includes(`Stored ACCESS_AUD = ${audience}`));
    for (const credential of ['RESEND_API_KEY', 'TURNSTILE_SECRET', 'SIGNING_SECRET'])
      assert.ok(
        !run.output.includes(world.worker.secrets.get(credential)),
        `${credential} was printed`,
      );

    const report = await bootstrapOnce(world, repository, { rules: [RESEND] });
    assert.match(report.output, /ACCESS_TEAM_DOMAIN.*it should be team\.cloudflareaccess\.com/);
    assert.ok(report.output.includes(`it should be ${audience}`));
  });
});
