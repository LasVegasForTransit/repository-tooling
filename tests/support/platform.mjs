import { known } from '../../packages/cli/src/lib/platform/observe.mjs';

/**
 * A manifest that uses every section, and a state in which all of it is
 * already in place. Tests change one thing and look at what the plan says.
 */
export function sampleManifest() {
  return {
    version: 1,
    name: 'example.org',
    cloudflare: {
      accountId: 'a'.repeat(32),
      zone: { name: 'example.org', id: 'b'.repeat(32) },
      worker: 'example',
    },
    d1: [{ binding: 'DB', name: 'example', migrations: 'migrations' }],
    r2: [{ binding: 'PHOTOS', name: 'example-photos' }],
    turnstile: [
      {
        name: 'example.org',
        domains: ['example.org'],
        siteKeyVar: 'TURNSTILE_SITE_KEY',
        secret: 'TURNSTILE_SECRET',
      },
    ],
    access: [
      {
        name: 'example admin',
        destinations: ['example.org/admin', 'example.org/admin/*'],
        identityProvider: 'google-apps',
        allow: { googleGroup: 'admins@example.org' },
        teamDomainSecret: 'ACCESS_TEAM_DOMAIN',
        audienceSecret: 'ACCESS_AUD',
      },
    ],
    email: [{ domain: 'example.org', provider: 'resend', apiKeySecret: 'RESEND_API_KEY' }],
    secrets: [
      {
        name: 'RESEND_API_KEY',
        purpose: 'Sends email.',
        url: 'https://resend.com/api-keys',
        steps: ['Create a sending key and copy it.'],
        pattern: '^re_',
        patternHint: 'A Resend key starts with re_.',
      },
      { name: 'TURNSTILE_SECRET', purpose: 'Checks the bot challenge.' },
      { name: 'ACCESS_TEAM_DOMAIN', purpose: 'Names the Access team.' },
      { name: 'ACCESS_AUD', purpose: 'Names the Access application.' },
      { name: 'SIGNING_SECRET', purpose: 'Signs links.', generate: true },
      {
        name: 'FUTURE_KEY',
        purpose: 'For a feature that is not built yet.',
        use: 'future',
        steps: ['Ask the partner for it.'],
      },
      {
        name: 'CLOUDFLARE_ACCOUNT_ID',
        purpose: 'Names the account for deploys.',
        targets: ['github:production'],
        from: 'cloudflare.accountId',
      },
    ],
    vars: [{ name: 'TURNSTILE_SITE_KEY', purpose: 'The public site key.' }],
    github: { repository: 'LasVegasForTransit/example' },
    forbidden: [
      { name: 'PREVIEW_ADMIN_KEY', reason: 'It opens the admin views.' },
      { name: 'BOT_CHECK', reason: 'It turns the bot check off.', severity: 'warning' },
    ],
  };
}

export const WORKER_SECRETS = [
  'RESEND_API_KEY',
  'TURNSTILE_SECRET',
  'ACCESS_TEAM_DOMAIN',
  'ACCESS_AUD',
  'SIGNING_SECRET',
  'FUTURE_KEY',
];

export function readyState() {
  const migrations = ['0001_first.sql', '0002_second.sql'];
  return {
    config: known({
      name: 'example',
      vars: { TURNSTILE_SITE_KEY: '0xSITEKEY' },
      d1: [{ binding: 'DB', name: 'example', id: 'db-1', migrationsTable: 'd1_migrations' }],
      r2: [{ binding: 'PHOTOS', name: 'example-photos' }],
    }),
    migrations: { example: known(migrations) },
    worker: known({ exists: true, secrets: [...WORKER_SECRETS], vars: {} }),
    d1: known({ example: { id: 'db-1', applied: known([...migrations]) } }),
    r2: known(['example-photos']),
    turnstile: known([
      { name: 'example.org', sitekey: '0xSITEKEY', domains: ['example.org'], mode: 'managed' },
    ]),
    access: known({
      enabled: true,
      teamDomain: 'team.cloudflareaccess.com',
      providers: [{ id: 'idp-1', type: 'google-apps', name: 'Google Workspace' }],
      apps: [
        {
          id: 'app-1',
          name: 'example admin',
          aud: 'c'.repeat(64),
          domain: 'example.org/admin',
          destinations: [
            { type: 'public', uri: 'example.org/admin' },
            { type: 'public', uri: 'example.org/admin/*' },
          ],
          session_duration: '24h',
          allowed_idps: ['idp-1'],
          policies: [
            {
              id: 'policy-1',
              decision: 'allow',
              include: [{ gsuite: { email: 'admins@example.org', identity_provider_id: 'idp-1' } }],
            },
          ],
        },
      ],
      policies: [],
    }),
    dns: {
      'send.example.org MX': known(['10 feedback-smtp.us-east-1.amazonses.com.']),
      'send.example.org TXT': known(['"v=spf1 include:amazonses.com ~all"']),
      'resend._domainkey.example.org TXT': known(['"p=MIGfMA0GCSqGSIb3" "DQEBAQUAA4GNADCBiQKBgQ"']),
      '_dmarc.example.org TXT': known(['"v=DMARC1; p=none;"']),
    },
    github: known({
      environments: ['production'],
      secrets: { production: ['CLOUDFLARE_ACCOUNT_ID'] },
    }),
  };
}

/**
 * A terminal that answers by matching the question, so a test states what a
 * person would type without depending on the order questions are asked in.
 * Unmatched confirmations take their default; unmatched questions get Enter.
 */
export function scriptedIo(rules = []) {
  const output = [];
  const asked = [];
  const answer = (question) => {
    asked.push(question);
    return rules.find(([pattern]) => pattern.test(question))?.[1];
  };
  return {
    interactive: true,
    write: (text) => output.push(text),
    ask: async (question) => answer(question) ?? '',
    askHidden: async (question) => {
      const value = answer(question);
      return typeof value === 'function' ? value() : (value ?? '');
    },
    confirm: async (question, byDefault) => answer(question) ?? byDefault,
    open: () => undefined,
    output: () => output.join(''),
    asked,
  };
}
