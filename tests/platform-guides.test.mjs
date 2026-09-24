import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessAppGuide,
  googleWorkspaceGuide,
  hostnameParts,
  relativeName,
  resendDomainGuide,
  teamDomainGuide,
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
