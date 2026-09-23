/**
 * What the standard knows about the services behind a manifest: the DNS
 * records an email provider needs, the dashboard pages to open, and the
 * click-by-click steps for the parts no API can do. Keeping them here means
 * every repository gets the same, reviewed instructions.
 */

const ZERO_TRUST = 'https://one.dash.cloudflare.com/';

/** Normalize a DNS-over-HTTPS answer: TXT data arrives quoted and sometimes split. */
export function dnsText(data) {
  return data.replace(/"\s+"/g, '').replace(/^"|"$/g, '');
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
  return {
    url: 'https://resend.com/domains',
    steps: [
      'Sign in to Resend with the LVBT account (ask a maintainer for access if you have none).',
      `If ${email.domain} is not listed on the Domains page, click "Add Domain", type ${email.domain}, choose the region ${email.region ?? 'us-east-1'}, and click "Add".`,
      `Open ${email.domain} and click "Sign in to Cloudflare". Approve the request in the Cloudflare window; it adds every record for you.`,
      `If you cannot use that button, add each record Resend lists by hand at https://dash.cloudflare.com/${cloudflare.accountId}/${cloudflare.zone.name}/dns/records. Type only the part before .${email.domain} as the name, and set the DKIM record to "DNS only".`,
      `Add the DMARC record too: type TXT, name _dmarc, content v=DMARC1; p=none;.`,
      'Wait until Resend says "Verified". It usually takes a few minutes. Then run this command again.',
    ],
  };
}

export function zeroTrustGuide() {
  return {
    url: ZERO_TRUST,
    steps: [
      'Open Cloudflare Zero Trust and choose the LVBT account.',
      'If Cloudflare asks for a team name, type lasvegasfortransit. Your team domain becomes lasvegasfortransit.cloudflareaccess.com.',
      'Choose the Free plan. It costs nothing for up to 50 people. Cloudflare may still ask for a payment method.',
      'Finish the onboarding, then run this command again.',
    ],
  };
}

export function googleWorkspaceGuide(teamDomain, workspaceDomain) {
  const team = teamDomain ?? '<team>.cloudflareaccess.com';
  return {
    url: 'https://console.cloud.google.com/apis/library/admin.googleapis.com',
    steps: [
      'Sign in to Google Cloud with an LVBT Google Workspace admin account and choose the LVBT project at the top of the page. Create one named "LVBT Access" if there is none.',
      'On the Admin SDK API page, click "Enable".',
      'Open https://console.cloud.google.com/auth/overview. If Google asks you to configure the consent screen: App name "LVBT volunteer sign-in", support email your LVBT address, Audience "Internal", then "Create".',
      'Open https://console.cloud.google.com/auth/clients and click "Create client". Application type: "Web application". Name: "Cloudflare Access".',
      `Under "Authorized JavaScript origins", add https://${team}.`,
      `Under "Authorized redirect URIs", add https://${team}/cdn-cgi/access/callback, then click "Create".`,
      'Copy the Client ID and the Client secret from the dialog.',
      'Open https://admin.google.com/ac/owl (Security → Access and data control → API controls), click "Settings", choose "Internal apps", turn on "Trust internal apps", and save.',
      'In Cloudflare Zero Trust, go to Integrations → Identity providers → "Add new identity provider" → "Google Workspace".',
      `Paste the Client ID into "App ID" and the Client secret into "Client secret", type ${workspaceDomain} as the Google Workspace domain, and click "Save".`,
      'Open the link Cloudflare shows after saving and approve it with the Google Workspace admin account, so Access can read group membership.',
      'Click "Test" next to Google Workspace. It should list your groups. Then run this command again.',
    ],
  };
}

export function accessAppGuide(app) {
  const allow = app.allow.googleGroup
    ? `Include → "Google Workspace groups" → ${app.allow.googleGroup}`
    : app.allow.emailDomain
      ? `Include → "Emails ending in" → @${app.allow.emailDomain}`
      : `Include → "Emails" → ${app.allow.emails.join(', ')}`;
  return {
    url: ZERO_TRUST,
    steps: [
      'In Cloudflare Zero Trust, go to Access controls → Applications → "Create new application" → "Self-hosted and private".',
      `Name it "${app.name}".`,
      `Add one public hostname for each of: ${app.destinations.join(', ')}. A path does not cover the paths under it, so each one is needed.`,
      `Under Access policies, create a policy named "${app.name} allow" with Action "Allow" and ${allow}.`,
      `Under authentication, select only ${app.identityProvider === 'google-apps' ? 'Google Workspace' : 'One-time PIN'} and turn on "Apply instant authentication".`,
      `Set Session Duration to ${app.sessionDuration ?? '24h'} and click "Create".`,
      `Open the application's Overview tab and copy "Application Audience (AUD) Tag" into ${app.audienceSecret} when this command asks for it.`,
    ],
  };
}

export function turnstileGuide(widget, cloudflare) {
  return {
    url: `https://dash.cloudflare.com/${cloudflare.accountId}/turnstile`,
    steps: [
      'Click "Add widget".',
      `Name it "${widget.name}" and add the hostnames ${widget.domains.join(', ')}.`,
      `Choose the widget mode "${widget.mode ?? 'managed'}" and click "Create".`,
      `Copy the Site Key into "${widget.siteKeyVar}" in the wrangler config's vars, and the Secret Key into ${widget.secret} when this command asks for it.`,
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
  if (manifest.turnstile?.length) needed.push('Account · Turnstile · Edit');
  if (manifest.access?.length) {
    needed.push('Account · Access: Apps and Policies · Edit');
    needed.push('Account · Access: Organizations, Identity Providers, and Groups · Read');
  }
  return {
    url: setupTokenUrl(manifest),
    steps: [
      'Sign in to Cloudflare with your LVBT account if it asks.',
      `Check that the token lists these permissions, and add any that is missing with "+ Add more": ${needed.join('; ')}.`,
      'Under "Account Resources", choose "Include" and the LVBT account.',
      'Under "TTL", set an end date of tomorrow so the token stops working by itself.',
      'Click "Continue to summary", then "Create Token".',
      'Click "Copy" and paste the token here. It stays in this terminal\'s memory and is never saved.',
    ],
  };
}

export function varGuide(variable, configPath, value) {
  const shown = value === undefined ? '<value>' : JSON.stringify(value);
  return {
    steps: [
      `Add "${variable.name}": ${shown} to "vars" in ${configPath}.`,
      'Commit it on a branch and open a pull request. The Worker gets it on the next deploy from main.',
    ],
  };
}
