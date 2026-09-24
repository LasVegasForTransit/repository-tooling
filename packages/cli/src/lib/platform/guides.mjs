/**
 * What the standard knows about the services behind a manifest: the DNS
 * records an email provider needs, the dashboard pages to open, and the
 * click-by-click steps for the parts no API can do. Keeping them here means
 * every repository gets the same, reviewed instructions.
 *
 * Every guide assumes the person has never used the service before, so each
 * step says exactly what to type or choose, and where a copied value goes.
 * The labels follow the dashboards as they were on 2026-09-23 and the
 * providers' own documentation:
 *   - developers.cloudflare.com/cloudflare-one/setup/
 *   - developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google-workspace/
 *   - developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
 *   - developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 *   - developers.cloudflare.com/turnstile/get-started/
 *   - developers.cloudflare.com/fundamentals/api/get-started/create-token/
 *   - resend.com/docs/knowledge-base/cloudflare and resend.com/docs/dashboard/domains/regions
 */

export const ZERO_TRUST = 'https://one.dash.cloudflare.com/';

/**
 * LVBT's Zero Trust organization. The team domain is what Access signs
 * tokens with and what Google redirects to; the team name is only a label.
 */
export const LVBT_TEAM_SUBDOMAIN = 'lvbt';
export const LVBT_TEAM_DOMAIN = `${LVBT_TEAM_SUBDOMAIN}.cloudflareaccess.com`;
export const LVBT_TEAM_NAME = 'Las Vegans for Better Transit';

const REGIONS = {
  'us-east-1': 'North Virginia (us-east-1)',
  'eu-west-1': 'Ireland (eu-west-1)',
  'sa-east-1': 'São Paulo (sa-east-1)',
  'ap-northeast-1': 'Tokyo (ap-northeast-1)',
};

/** Normalize a DNS-over-HTTPS answer: TXT data arrives quoted and sometimes split. */
export function dnsText(data) {
  return data.replace(/"\s+"/g, '').replace(/^"|"$/g, '');
}

/** A name as the Cloudflare DNS page wants it: relative to the zone, or @ for the zone itself. */
export function relativeName(name, zone) {
  if (name === zone) return '@';
  return name.endsWith(`.${zone}`) ? name.slice(0, -(zone.length + 1)) : name;
}

/** The DNS records an email provider needs for a sending domain. */
export function emailRecords(email) {
  const region = email.region ?? 'us-east-1';
  const domain = email.domain;
  const mailFrom = `feedback-smtp.${region}.amazonses.com`;
  return [
    {
      key: 'mx',
      type: 'MX',
      name: `send.${domain}`,
      purpose: 'returns bounces to Resend',
      expected: `MX send → ${mailFrom}, priority 10`,
      matches: (data) => data.replace(/\.$/, '').endsWith(mailFrom),
      level: 'required',
    },
    {
      key: 'spf',
      type: 'TXT',
      name: `send.${domain}`,
      purpose: 'allows Resend to send for the domain (SPF)',
      expected: 'TXT send → "v=spf1 include:amazonses.com ~all"',
      matches: (data) =>
        dnsText(data).startsWith('v=spf1') && dnsText(data).includes('include:amazonses.com'),
      level: 'required',
    },
    {
      key: 'dkim',
      type: 'TXT',
      name: `resend._domainkey.${domain}`,
      purpose: 'signs every message (DKIM)',
      expected: 'TXT resend._domainkey → the p=… value Resend shows',
      matches: (data) => dnsText(data).startsWith('p='),
      level: 'required',
    },
    {
      key: 'dmarc',
      type: 'TXT',
      name: `_dmarc.${domain}`,
      purpose: 'tells inboxes what to do with mail that fails the checks (DMARC)',
      expected: 'TXT _dmarc → "v=DMARC1; p=none;"',
      matches: (data) => dnsText(data).startsWith('v=DMARC1'),
      level: 'recommended',
    },
  ];
}

export function resendDomainGuide(email, cloudflare) {
  const region = email.region ?? 'us-east-1';
  const zone = cloudflare.zone.name;
  const [mx, spf, dkim, dmarc] = emailRecords(email).map((record) => ({
    ...record,
    short: relativeName(record.name, zone),
  }));
  return {
    url: 'https://resend.com/domains',
    steps: [
      'Sign in to Resend at https://resend.com/login. If you have no account, sign up at https://resend.com/signup with your @lasvegasfortransit.org address, then ask a maintainer to invite you to the LVBT team.',
      `On the Domains page, if ${email.domain} is listed, click it and go to the next step. Otherwise click "Add Domain", type ${email.domain}, choose the region ${REGIONS[region] ?? region}, and click "Add". Keep that region: platform.json and the DNS records both name it.`,
      `The easiest way to add the DNS records is the "Sign in to Cloudflare" button on the domain's page in Resend. Approve the request in the Cloudflare window, and it adds every record for you.`,
      `To add them by hand instead, open https://dash.cloudflare.com/${cloudflare.accountId}/${zone}/dns/records and add these three, each with TTL "Auto" and Proxy status "DNS only": type MX, name ${mx.short}, mail server feedback-smtp.${region}.amazonses.com, priority 10; type TXT, name ${spf.short}, content v=spf1 include:amazonses.com ~all; type TXT, name ${dkim.short}, content the long p=… value Resend shows for it.`,
      `Add the DMARC record too, which Resend recommends: type TXT, name ${dmarc.short}, content v=DMARC1; p=none;.`,
      'Back in Resend, click "Verify DNS Records". Wait until the domain\'s status says "Verified", usually within a few minutes (DNS can take up to 72 hours). Then run this command again.',
    ],
  };
}

export function zeroTrustGuide(manifest) {
  const secrets = [...new Set((manifest?.access ?? []).map((app) => app.teamDomainSecret))];
  const holds = secrets.length > 0 ? secrets.join(' and ') : 'ACCESS_TEAM_DOMAIN';
  return {
    url: ZERO_TRUST,
    steps: [
      'Open Cloudflare One and choose the LVBT account. These steps appear only the first time Zero Trust is used in an account.',
      `Cloudflare asks you to choose the team domain (its documentation calls this the team name). Type ${LVBT_TEAM_SUBDOMAIN}, so the team domain becomes ${LVBT_TEAM_DOMAIN}. That is the address of the sign-in page, the value ${holds} holds, and the start of the Google sign-in addresses.`,
      `If it also asks for a team name, type ${LVBT_TEAM_NAME}. The team name is only a label people see; it changes nothing in any configuration.`,
      'Choose the Zero Trust Free plan. Cloudflare asks for payment details even for the Free plan, but does not charge for it.',
      'Finish the onboarding, then run this command again. It will find Zero Trust turned on and carry on from there.',
      `Later, Cloudflare One → Overview → Account details shows the Team domain and the Team name, each with a pencil icon that edits it. Do not change the team domain: the admin sign-in and the Google sign-in stop working until ${holds} and the Google OAuth client are updated to match.`,
    ],
  };
}

/** Where to copy the team domain from, for when setup cannot read it itself. */
export function teamDomainGuide(secretName) {
  return {
    url: ZERO_TRUST,
    steps: [
      'Open Cloudflare One and choose the LVBT account.',
      `On Overview, find Account details and copy the Team domain. For LVBT it is ${LVBT_TEAM_DOMAIN}. Copy only the domain, without https://.`,
      `Do not copy the Team name ("${LVBT_TEAM_NAME}") shown beside it. It is only a label, and ${secretName} needs the domain.`,
      'If Cloudflare One shows its first-time setup instead, Zero Trust was never turned on for this account. Press Enter to skip, and run this command with the Cloudflare token it asks for, so it can show those steps.',
    ],
  };
}

export function googleWorkspaceGuide(teamDomain, workspaceDomain, group) {
  const team = teamDomain ?? LVBT_TEAM_DOMAIN;
  const domain = workspaceDomain ?? 'lasvegasfortransit.org';
  return {
    url: 'https://console.cloud.google.com/',
    steps: [
      `Do the Google steps signed in as a Google Workspace super admin for ${domain}: turning on "Trust internal apps" and approving group access both need one. The Cloudflare steps need a Cloudflare user who can administer the LVBT account.`,
      'In Google Cloud (https://console.cloud.google.com/), open the project picker at the top. Choose the project named "LVBT Access". If there is none, click "New project", name it LVBT Access, keep the organization, and click "Create".',
      'Open https://console.cloud.google.com/apis/library/admin.googleapis.com and click "Enable" on "Admin SDK API". Access uses it to read which Google Groups a person is in.',
      `Open https://console.cloud.google.com/auth/overview. If Google says the app is not configured yet, click "Get started": App name LVBT volunteer sign-in, User support email your @${domain} address, Audience "Internal", contact email your address, agree to the policy, and click "Create".`,
      'Open https://console.cloud.google.com/auth/clients and click "Create client". Application type: "Web application". Name: Cloudflare Access.',
      `Under "Authorized JavaScript origins", click "Add URI" and enter exactly https://${team}`,
      `Under "Authorized redirect URIs", click "Add URI" and enter exactly https://${team}/cdn-cgi/access/callback, then click "Create".`,
      'Copy the Client ID (it ends in .apps.googleusercontent.com) and the Client secret. They go into Cloudflare One in a later step; they are not stored in GitHub or on the Worker.',
      'Open https://admin.google.com/ac/owl (Security → Access and data control → API controls), click "Settings", turn on "Trust internal apps", and save. It is off by default, and Access needs it.',
      'In Cloudflare One, go to Integrations → Identity providers and click "Add new identity provider", then "Google Workspace".',
      `Paste the Client ID into "App ID" and the Client secret into "Client secret". Type ${domain} as the Google Workspace domain, and click "Save".`,
      'Cloudflare then shows a link. Open it signed in as the Google Workspace super admin and approve it, so Access can read group membership.',
      `Back in Integrations → Identity providers, click "Test" next to Google Workspace. It should show your name and your groups${group ? `, including ${group} if you are in it` : ''}. Then run this command again.`,
    ],
  };
}

/** A host-and-path destination split the way the "Add public hostname" form asks for it. */
export function hostnameParts(destination, zone) {
  const slash = destination.indexOf('/');
  const host = slash === -1 ? destination : destination.slice(0, slash);
  const path = slash === -1 ? '' : destination.slice(slash + 1);
  const inZone = host === zone || host.endsWith(`.${zone}`);
  const subdomain = inZone && host !== zone ? host.slice(0, -(zone.length + 1)) : '';
  return { subdomain, domain: inZone ? zone : host, path };
}

function describeHostname({ subdomain, domain, path }) {
  const parts = [
    subdomain ? `Subdomain ${subdomain}` : 'Subdomain empty',
    `Domain ${domain}`,
    path ? `Path ${path}` : 'Path empty',
  ];
  return parts.join(', ');
}

function sessionLabel(duration) {
  const match = /^(\d+)(m|h)$/.exec(duration);
  if (!match) return duration;
  const unit = match[2] === 'h' ? 'hour' : 'minute';
  return `${match[1]} ${unit}${match[1] === '1' ? '' : 's'}`;
}

function includeRule(app) {
  if (app.allow.googleGroup) {
    const domain = app.allow.googleGroup.split('@')[1];
    return `Add one Include rule. If Integrations → Identity providers in Cloudflare One lists Google Workspace (it does for LVBT), choose the selector "Google Workspace groups" and enter ${app.allow.googleGroup}. If it does not list Google Workspace yet, choose "Emails ending in" and enter @${domain} for now; this command changes the rule to the group once Google Workspace is connected.`;
  }
  if (app.allow.emailDomain)
    return `Add one Include rule: choose the selector "Emails ending in" and enter @${app.allow.emailDomain}.`;
  return `Add one Include rule: choose the selector "Emails" and enter ${app.allow.emails.join(', ')}.`;
}

/**
 * Creating an Access application by hand, from a dashboard that has never
 * had one, then copying its audience tag. `audienceSteps` alone say where the
 * tag is, for when the application already exists.
 */
export function accessAppGuide(app, zone) {
  const zoneName = zone ?? app.destinations[0].split('/')[0];
  const hostnames = app.destinations.map((destination) =>
    describeHostname(hostnameParts(destination, zoneName)),
  );
  const loginMethod =
    app.identityProvider === 'google-apps'
      ? 'Under login methods, select only "Google Workspace" (or only "One-time PIN" if Google Workspace is not listed yet) and turn on "Apply instant authentication".'
      : 'Under login methods, select only "One-time PIN" and turn on "Apply instant authentication".';
  const audienceSteps = [
    `In Cloudflare One, go to Access controls → Applications and click "Configure" on "${app.name}".`,
    `Open "Additional settings" and copy "Application Audience (AUD) Tag". It is 64 lowercase letters and digits, and it is the value ${app.audienceSecret} holds.`,
  ];
  return {
    url: ZERO_TRUST,
    audienceSteps,
    steps: [
      `Open Cloudflare One and choose the LVBT account. Go to Access controls → Applications. If "${app.name}" is already listed, skip to the last two steps.`,
      'Click "Create new application" (some screens say "Add an application").',
      'In the "Add an application" dialog, on the "Self-hosted and private" tab, choose "Public DNS" (not Private destinations, Workers, or Service auth), then click "Continue with Self-hosted and private".',
      `Application name: ${app.name}.`,
      `Click "Add public hostname" once for each address and fill it in: ${hostnames.join('; ')}. A path does not cover the paths under it, and a wildcard does not cover its parent, so every one is needed.`,
      `Under "Access policies", create a new policy named ${app.name} allow, with Action "Allow".`,
      includeRule(app),
      loginMethod,
      `Set "Session Duration" to ${sessionLabel(app.sessionDuration ?? '24h')}, then click "Create".`,
      ...audienceSteps,
    ],
  };
}

export function turnstileGuide(widget, cloudflare, configPath) {
  const config = configPath ?? 'the production wrangler config';
  return {
    url: `https://dash.cloudflare.com/${cloudflare.accountId}/turnstile`,
    steps: [
      `Open Turnstile in the Cloudflare dashboard with the LVBT account. If a widget named "${widget.name}" is already listed, click it and skip to the last two steps.`,
      `Click "Add widget". Widget name: ${widget.name}.`,
      `Under "Hostname management", add ${widget.domains.join(', ')}.`,
      `Widget Mode: "${{ managed: 'Managed', 'non-interactive': 'Non-interactive', invisible: 'Invisible' }[widget.mode ?? 'managed']}". Leave pre-clearance off, and click "Create".`,
      `Copy the Site Key. It is public and starts with 0x. It goes into "vars" in ${config} as "${widget.siteKeyVar}", through a pull request.`,
      `Copy the Secret Key. It is private and also starts with 0x. It is the Worker secret ${widget.secret}; paste it when this command asks for it.`,
    ],
  };
}

/** The pre-filled dashboard link for the token that manages Turnstile and Access. */
export function setupTokenUrl(manifest) {
  const permissions = [];
  if (manifest.turnstile?.length) permissions.push({ key: 'challenge_widgets', type: 'edit' });
  if (manifest.access?.length) {
    permissions.push({ key: 'access', type: 'edit' });
    permissions.push({ key: 'access_acct', type: 'read' });
  }
  const query = new URLSearchParams({
    permissionGroupKeys: JSON.stringify(permissions),
    accountId: manifest.cloudflare.accountId,
    zoneId: manifest.cloudflare.zone.id,
    name: `lvbt setup ${manifest.name}`,
  });
  return `https://dash.cloudflare.com/profile/api-tokens?${query}`;
}

export function setupTokenGuide(manifest) {
  const needed = [];
  if (manifest.turnstile?.length) needed.push('Turnstile · Edit');
  if (manifest.access?.length) {
    needed.push('Access: Apps and Policies · Edit');
    needed.push('Access: Organizations, Identity Providers, and Groups · Read');
  }
  return {
    url: setupTokenUrl(manifest),
    steps: [
      'The link opens Cloudflare\'s "Create Custom Token" page with the permissions filled in. Sign in with your LVBT Cloudflare account if it asks.',
      `Token name: lvbt setup ${manifest.name}.`,
      `Under "Permissions", check that there are exactly these rows, each set to "Account", and add any that is missing with "+ Add more": ${needed.join('; ')}.`,
      `Under "Account Resources", choose "Include" and the LVBT account (ID ${manifest.cloudflare.accountId}), not "All accounts".`,
      'Under "TTL", set the End Date to tomorrow, so the token stops working by itself.',
      'Click "Continue to summary", then "Create Token". Click "Copy": Cloudflare shows the token only once.',
      "Paste it here. It stays in this terminal's memory and is never saved. When you finish, delete it at https://dash.cloudflare.com/profile/api-tokens.",
    ],
  };
}

export function varGuide(variable, configPath, value, widget) {
  const shown =
    value === undefined
      ? widget
        ? `"<the Site Key of the ${widget} Turnstile widget, which starts with 0x>"`
        : '"<value>"'
      : JSON.stringify(value);
  return {
    steps: [
      `Add "${variable.name}": ${shown} to "vars" in ${configPath}. It is public, so it belongs in the config rather than in a secret.`,
      'Commit it on a branch and open a pull request. The Worker gets it on the next deploy from main.',
    ],
  };
}
