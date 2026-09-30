import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessAppGuide,
  emailRecords,
  googleGroupGuide,
  googleWorkspaceGuide,
  hostnameParts,
  relativeName,
  resendDomainGuide,
  setupTokenGuide,
  teamDomainGuide,
  turnstileGuide,
  varGuide,
  zeroTrustGuide,
} from '../packages/cli/src/lib/platform/guides.mjs';
import { sampleManifest } from './support/platform.mjs';

/**
 * The dashboard guides are read by someone who has never used the service,
 * so the values they must type are checked here: addresses built from the
 * team domain, hostnames split the way the form asks, DNS names relative to
 * the zone.
 */

const everyStep = (guide) => guide.steps.join('\n');

test('the Google sign-in guide gives the exact origin and redirect for the team domain', () => {
  const steps = everyStep(
    googleWorkspaceGuide('lvbt.cloudflareaccess.com', 'lasvegasfortransit.org'),
  );
  assert.match(steps, /exactly https:\/\/lvbt\.cloudflareaccess\.com$/m);
  assert.ok(steps.includes('https://lvbt.cloudflareaccess.com/cdn-cgi/access/callback'));
  assert.ok(steps.includes('lasvegasfortransit.org'));
});

test('the team domain and the team name are never confused', () => {
  const guides = [zeroTrustGuide(sampleManifest()), teamDomainGuide('ACCESS_TEAM_DOMAIN')];
  for (const guide of guides) {
    const steps = everyStep(guide);
    assert.ok(steps.includes('lvbt.cloudflareaccess.com'));
    assert.ok(!steps.includes('lasvegasfortransit.cloudflareaccess.com'));
  }
  assert.match(everyStep(teamDomainGuide('ACCESS_TEAM_DOMAIN')), /Overview.*Account details/);
});

test('each Access destination is split into the subdomain, domain, and path the form asks for', () => {
  assert.deepEqual(hostnameParts('lvwwd.org/api/admin/*', 'lvwwd.org'), {
    subdomain: '',
    domain: 'lvwwd.org',
    path: 'api/admin/*',
  });
  assert.deepEqual(hostnameParts('staff.lasvegasfortransit.org', 'lasvegasfortransit.org'), {
    subdomain: 'staff',
    domain: 'lasvegasfortransit.org',
    path: '',
  });
});

test('the Access guide walks through creating the application and ends with the audience tag', () => {
  const app = sampleManifest().access[0];
  const guide = accessAppGuide(app, 'example.org');
  const steps = everyStep(guide);
  assert.ok(steps.includes(app.allow.googleGroup));
  assert.ok(steps.includes('Path admin/*'));
  assert.ok(guide.steps.at(-1).includes(app.audienceSecret));
  assert.ok(guide.audienceSteps.every((step) => guide.steps.includes(step)));
});

test('email records are named relative to the zone, including for a sending subdomain', () => {
  assert.equal(relativeName('send.notify.example.org', 'example.org'), 'send.notify');
  const cloudflare = sampleManifest().cloudflare;
  const steps = everyStep(resendDomainGuide({ domain: 'notify.example.org' }, cloudflare));
  assert.ok(steps.includes('name send.notify'));
  assert.ok(steps.includes('name resend._domainkey.notify'));
  assert.ok(steps.includes('us-east-1'));
});

test('the Forge profile requires its two CNAMEs and DKIM but not legacy SES records', () => {
  const email = { domain: 'example.org', provider: 'resend', dnsProfile: 'forge' };
  const records = emailRecords(email);
  assert.deepEqual(
    records.map(({ key, type, name, level }) => ({ key, type, name, level })),
    [
      { key: 'rsend', type: 'CNAME', name: 'rsend.example.org', level: 'required' },
      { key: 'send', type: 'CNAME', name: 'send.example.org', level: 'required' },
      { key: 'dkim', type: 'TXT', name: 'resend._domainkey.example.org', level: 'required' },
      { key: 'dmarc', type: 'TXT', name: '_dmarc.example.org', level: 'recommended' },
    ],
  );
  assert.equal(records[0].matches('RSEND.FORGE.RMTA.NET.'), true);
  assert.equal(records[0].matches('send.forge.rmta.net.'), false);
  assert.equal(records[1].matches('send.forge.rmta.net.'), true);
});

test('the Forge guide names the observed Resend records without SES instructions', () => {
  const steps = everyStep(
    resendDomainGuide(
      { domain: 'notify.example.org', provider: 'resend', dnsProfile: 'forge' },
      sampleManifest().cloudflare,
    ),
  );
  assert.match(steps, /CNAME, name rsend\.notify, target rsend\.forge\.rmta\.net/);
  assert.match(steps, /CNAME, name send\.notify, target send\.forge\.rmta\.net/);
  assert.match(steps, /TXT, name resend\._domainkey\.notify/);
  assert.doesNotMatch(steps, /amazonses|type MX|include:amazonses/);
});

test('Cloudflare config guides use typed worker bindings while Wrangler guides use JSON vars', () => {
  const manifest = sampleManifest();
  const widget = manifest.turnstile[0];
  const variable = manifest.vars.find((entry) => entry.name === widget.siteKeyVar);
  const cfPath = 'apps/deploy/cloudflare.config.ts';
  const cfSteps = everyStep(turnstileGuide(widget, manifest.cloudflare, cfPath));
  const cfVar = everyStep(varGuide(variable, cfPath, '0xSITEKEY', widget.name));
  assert.match(cfSteps, /worker\.env/);
  assert.match(cfVar, /TURNSTILE_SITE_KEY: bindings\.text\(["']0xSITEKEY["']\)/);
  assert.doesNotMatch(cfVar, /"vars"/);

  const wranglerVar = everyStep(
    varGuide(variable, 'apps/site/wrangler.jsonc', '0xSITEKEY', widget.name),
  );
  assert.match(wranglerVar, /"TURNSTILE_SITE_KEY": "0xSITEKEY" to "vars"/);
});

/** Each "copy" and "paste" in the order a person reads them, skipping "do not copy". */
function clipboardUses(steps) {
  return steps
    .join('\n')
    .replace(/\bdo not copy\b/gi, '')
    .matchAll(/\b(copy|paste)\b/gi)
    .map(([word]) => word.toLowerCase())
    .toArray();
}

test('no guide asks for a second copy before the first one is pasted', () => {
  const manifest = sampleManifest();
  const [app] = manifest.access;
  const [widget] = manifest.turnstile;
  const access = accessAppGuide(app, 'example.org');
  const turnstile = turnstileGuide(widget, manifest.cloudflare, 'apps/site/wrangler.jsonc');
  const guides = {
    access: access.steps,
    'access, made by hand': access.manualSteps,
    'access, tag only': access.audienceSteps,
    turnstile: turnstile.steps,
    'turnstile, made by hand': turnstile.manualSteps,
    'turnstile, secret only': turnstile.secretSteps,
    'google workspace': googleWorkspaceGuide('team.cloudflareaccess.com', 'example.org').steps,
    'team domain': teamDomainGuide('ACCESS_TEAM_DOMAIN').steps,
    'setup token': setupTokenGuide(manifest).steps,
    'google group': googleGroupGuide(app.allow.googleGroup, [app]).steps,
    resend: resendDomainGuide(manifest.email[0], manifest.cloudflare).steps,
    'zero trust': zeroTrustGuide(manifest).steps,
  };
  for (const [name, steps] of Object.entries(guides)) {
    const uses = clipboardUses(steps);
    uses.forEach((use, index) => {
      if (use === 'copy' && index > 0)
        assert.equal(uses[index - 1], 'paste', `${name}: a copy follows an unpasted copy`);
    });
    if (uses.length > 0)
      assert.equal(uses.at(-1), 'paste', `${name}: the last copy is never pasted`);
  }
});
