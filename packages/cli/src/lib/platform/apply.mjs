import { randomBytes } from 'node:crypto';
import { accessAppGuide, turnstileGuide } from './guides.mjs';
import { findApp, findWidget, SETUP } from './plan.mjs';
import { redact } from './services.mjs';
import { paint } from './terminal.mjs';

/**
 * Carry out a plan: create what is missing, store secrets, and walk a person
 * through the steps only a dashboard can do. Each step acts only on an item
 * the plan found open, so running setup again after a failure or a skipped
 * step picks up exactly the items that are still open.
 *
 * Secret values live only in `context.values` for the length of the run.
 * They reach Wrangler and gh on stdin and are redacted from any output shown.
 */

export function generateSecret() {
  return randomBytes(32).toString('base64url');
}

function account(context) {
  return `accounts/${context.manifest.cloudflare.accountId}`;
}

function wrangler(context, args, options = {}) {
  return context.run('pnpm', ['exec', 'wrangler', ...args], {
    cwd: context.directory,
    env: {
      CLOUDFLARE_ACCOUNT_ID: context.manifest.cloudflare.accountId,
      WRANGLER_SEND_METRICS: 'false',
    },
    ...options,
  });
}

function succeeded(result, secret) {
  if (result.status === 0) return;
  const output = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-3).join(' ');
  throw new Error(redact(output || `exited with ${result.status}`, secret));
}

function printGuide(io, guide) {
  if (guide.url) io.write(`Open: ${paint('cyan', guide.url)}\n`);
  guide.steps.forEach((step, index) => io.write(`  ${index + 1}. ${step}\n`));
}

async function manualStep(context, key, title, guide) {
  if (context.handled.has(key)) return;
  context.handled.add(key);
  const { io } = context;
  io.write(`\n${paint('bold', title)}\n`);
  printGuide(io, guide);
  if (guide.url && (await io.confirm('Open that page in your browser?', true))) io.open(guide.url);
  await io.ask('Press Enter when you have finished (or to leave it for later): ');
}

export function targetName(context, target) {
  return target === 'worker'
    ? `Worker ${context.manifest.cloudflare.worker}`
    : `GitHub environment ${target.slice(7)}`;
}

async function storeSecret(context, name, target, value) {
  if (target === 'worker') {
    succeeded(
      wrangler(context, ['secret', 'put', name, '--name', context.manifest.cloudflare.worker], {
        input: value,
      }),
      value,
    );
  } else {
    const repository = context.manifest.github.repository;
    succeeded(
      context.run('gh', ['secret', 'set', name, '--env', target.slice(7), '--repo', repository], {
        cwd: context.directory,
        input: value,
      }),
      value,
    );
  }
  context.handled.add(`secret:${name}:${target}`);
  context.io.write(`${paint('green', 'Stored')} ${name} on ${targetName(context, target)}.\n`);
}

/** Store a value a new resource produced, straight away, so it cannot be lost or left stale. */
async function storeFed(context, name, value) {
  if (!value || !context.state.worker.ok || !context.state.worker.value.exists) return;
  context.values.set(name, value);
  await storeSecret(context, name, 'worker', value);
}

async function promptValue(context, secret, fallback) {
  const { io } = context;
  io.write(`\n${paint('bold', secret.name)}: ${secret.purpose}\n`);
  if (secret.neededFor) io.write(`Needed for ${secret.neededFor}.\n`);
  const guide = { url: secret.url ?? fallback?.url, steps: secret.steps ?? fallback?.steps ?? [] };
  printGuide(io, guide);
  if (guide.url && (await io.confirm('Open that page in your browser?', true))) io.open(guide.url);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = await io.askHidden(
      `Paste ${secret.name} (hidden; leave empty to skip for now): `,
    );
    if (!value) return undefined;
    if (!secret.pattern || new RegExp(secret.pattern, 'u').test(value)) return value;
    io.write(
      `That does not look right. ${secret.patternHint ?? `It should match ${secret.pattern}.`}\n`,
    );
  }
  return undefined;
}

async function readWidgetSecret(context, widget) {
  const created = context.created.widgets.get(widget.name);
  if (created?.secret) return created.secret;
  const api = await context.setupApi();
  if (!api) return undefined;
  const found = findWidget(await api.list(`${account(context)}/challenges/widgets`), widget);
  return found
    ? (await api.get(`${account(context)}/challenges/widgets/${found.sitekey}`))?.secret
    : undefined;
}

async function secretValue(context, action) {
  const { secret, source } = action;
  if (context.values.has(secret.name)) return context.values.get(secret.name);
  let value;
  let fallback;
  if (source.type === 'generate') {
    value = generateSecret();
    context.io.write(`Generated a new random value for ${secret.name}.\n`);
  } else if (source.type === 'value') {
    value = source.value;
  } else if (source.type === 'turnstile') {
    value = await readWidgetSecret(context, source.widget);
    fallback = turnstileGuide(source.widget, context.manifest.cloudflare);
  } else if (source.type === 'access-team') {
    value = context.state.access.ok ? context.state.access.value.teamDomain : undefined;
  } else if (source.type === 'access-audience') {
    fallback = accessAppGuide(source.app);
    const created = context.created.apps.get(source.app.name);
    value =
      created?.aud ??
      (context.state.access.ok
        ? findApp(context.state.access.value.apps, source.app)?.aud
        : undefined);
  }
  if (!value) value = await promptValue(context, secret, fallback);
  if (value) context.values.set(secret.name, value);
  return value;
}

async function createWidget(context, action) {
  const api = await context.setupApi();
  if (!api)
    return manualStep(
      context,
      `turnstile:${action.widget.name}`,
      `Create the Turnstile widget ${action.widget.name}`,
      action.guide,
    );
  const { widget } = action;
  const created = await api.post(`${account(context)}/challenges/widgets`, {
    name: widget.name,
    domains: widget.domains,
    mode: widget.mode ?? 'managed',
  });
  context.created.widgets.set(widget.name, created);
  context.io.write(`${paint('green', 'Created')} the Turnstile widget ${widget.name}.\n`);
  context.io.write(
    `Put "${widget.siteKeyVar}": "${created.sitekey}" in vars in ${context.configPath}, commit it, and deploy. The site key is public.\n`,
  );
  await storeFed(context, widget.secret, created.secret);
}

async function updateWidget(context, action) {
  const api = await context.setupApi();
  if (!api)
    return manualStep(
      context,
      `turnstile:${action.widget.name}`,
      `Update the Turnstile widget ${action.widget.name}`,
      action.guide,
    );
  const current = await api.get(`${account(context)}/challenges/widgets/${action.sitekey}`);
  await api.put(`${account(context)}/challenges/widgets/${action.sitekey}`, {
    name: current.name,
    domains: [...new Set([...(current.domains ?? []), ...action.widget.domains])],
    mode: action.widget.mode ?? 'managed',
  });
  context.io.write(`${paint('green', 'Updated')} the Turnstile widget ${action.widget.name}.\n`);
}

function appBody(app, provider, policyId, base = {}) {
  const existing = base.destinations ?? [];
  const covered = new Set(existing.map((destination) => destination.uri));
  return {
    name: base.name ?? app.name,
    type: 'self_hosted',
    domain: base.domain ?? app.destinations[0],
    destinations: [
      ...existing,
      ...app.destinations
        .filter((uri) => !covered.has(uri))
        .map((uri) => ({ type: 'public', uri })),
    ],
    session_duration: app.sessionDuration ?? '24h',
    allowed_idps: [provider.id],
    auto_redirect_to_identity: true,
    app_launcher_visible: base.app_launcher_visible ?? false,
    policies: [
      { id: policyId, precedence: 1 },
      ...(base.policies ?? [])
        .filter((policy) => policy.id !== policyId)
        .map((policy, index) => ({ id: policy.id, precedence: index + 2 })),
    ],
  };
}

async function allowPolicy(context, api, action) {
  const name = `${action.app.name} allow`;
  const existing = context.state.access.ok
    ? context.state.access.value.policies.find((policy) => policy.name === name)
    : undefined;
  if (existing) {
    await api.put(`${account(context)}/access/policies/${existing.id}`, {
      name,
      decision: 'allow',
      include: action.rule,
    });
    return existing.id;
  }
  const created = await api.post(`${account(context)}/access/policies`, {
    name,
    decision: 'allow',
    include: action.rule,
  });
  return created.id;
}

async function createOrUpdateApp(context, action) {
  const api = await context.setupApi();
  const title = `${action.found ? 'Fix' : 'Create'} the Access application ${action.app.name}`;
  if (!api) return manualStep(context, `access:${action.app.name}`, title, action.guide);
  const policyId = await allowPolicy(context, api, action);
  const result = action.found
    ? await api.put(
        `${account(context)}/access/apps/${action.found.id}`,
        appBody(action.app, action.provider, policyId, action.found),
      )
    : await api.post(
        `${account(context)}/access/apps`,
        appBody(action.app, action.provider, policyId),
      );
  context.created.apps.set(action.app.name, result);
  context.io.write(
    `${paint('green', action.found ? 'Updated' : 'Created')} the Access application ${action.app.name}.\n`,
  );
  if (!action.found) {
    await storeFed(context, action.app.audienceSecret, result.aud);
    if (!context.values.has(action.app.teamDomainSecret) && context.state.access.ok)
      await storeFed(context, action.app.teamDomainSecret, context.state.access.value.teamDomain);
  }
}

async function deleteSecret(context, action) {
  const where = targetName(context, action.target);
  if (!(await context.io.confirm(`Delete ${action.name} from ${where}?`, true))) return;
  const result =
    action.target === 'worker'
      ? wrangler(
          context,
          ['secret', 'delete', action.name, '--name', context.manifest.cloudflare.worker],
          { inherit: true },
        )
      : context.run(
          'gh',
          [
            'secret',
            'delete',
            action.name,
            '--env',
            action.target.slice(7),
            '--repo',
            context.manifest.github.repository,
          ],
          { cwd: context.directory },
        );
  succeeded(result);
  context.io.write(`${paint('green', 'Deleted')} ${action.name} from ${where}.\n`);
}

async function perform(context, entry) {
  const { action } = entry;
  switch (action.type) {
    case 'd1.create':
      succeeded(wrangler(context, ['d1', 'create', action.name]));
      context.io.write(
        `${paint('green', 'Created')} the D1 database ${action.name}. Check that database_id in ${context.configPath} matches it; the final report says if not.\n`,
      );
      return;
    case 'd1.migrate':
      context.io.write(
        `Applying migrations to ${action.name}. Wrangler lists them and asks you to confirm.\n`,
      );
      succeeded(
        wrangler(context, ['d1', 'migrations', 'apply', action.name, '--remote'], {
          inherit: true,
        }),
      );
      return;
    case 'r2.create':
      succeeded(wrangler(context, ['r2', 'bucket', 'create', action.name]));
      context.io.write(`${paint('green', 'Created')} the R2 bucket ${action.name}.\n`);
      return;
    case 'turnstile.create':
      return createWidget(context, action);
    case 'turnstile.update':
      return updateWidget(context, action);
    case 'access.create':
    case 'access.update':
      return createOrUpdateApp(context, action);
    case 'github.environment':
      succeeded(
        context.run(
          'gh',
          [
            'api',
            '--method',
            'PUT',
            `repos/${context.manifest.github.repository}/environments/${action.environment}`,
          ],
          { cwd: context.directory },
        ),
      );
      context.io.write(
        `${paint('green', 'Created')} the GitHub environment ${action.environment}.\n`,
      );
      return;
    case 'secret.put': {
      if (context.handled.has(`secret:${action.secret.name}:${action.target}`)) return;
      const value = await secretValue(context, action);
      if (!value) {
        context.io.write(`Skipped ${action.secret.name}. Run ${SETUP} again to set it.\n`);
        return;
      }
      return storeSecret(context, action.secret.name, action.target, value);
    }
    case 'secret.delete':
      return deleteSecret(context, action);
    case 'manual':
      return manualStep(context, action.key, `${entry.label} ${entry.detail}`, action.guide);
    default:
      throw new Error(`unknown action ${action.type}`);
  }
}

export function describeAction(entry) {
  const { action } = entry;
  switch (action.type) {
    case 'd1.create':
      return `create the D1 database ${action.name}`;
    case 'd1.migrate':
      return `apply the migrations to ${action.name}`;
    case 'r2.create':
      return `create the R2 bucket ${action.name}`;
    case 'turnstile.create':
      return `create the Turnstile widget ${action.widget.name} and store its secret`;
    case 'turnstile.update':
      return `update the Turnstile widget ${action.widget.name}`;
    case 'access.create':
      return `create the Access application ${action.app.name} and its allow policy`;
    case 'access.update':
      return `fix the Access application ${action.app.name}`;
    case 'github.environment':
      return `create the GitHub environment ${action.environment}`;
    case 'secret.put':
      return `${action.source.type === 'prompt' ? 'ask for' : 'store'} ${action.secret.name} on ${action.target === 'worker' ? 'the Worker' : `GitHub ${action.target.slice(7)}`}`;
    case 'secret.delete':
      return `offer to delete ${action.name}`;
    default:
      return `show the steps for ${entry.label}`;
  }
}

/**
 * Work through every open item that has an action. Items for features that
 * are not built yet are offered separately, after asking.
 */
export async function applyPlan(context, items) {
  const { io } = context;
  const open = items.filter((entry) => entry.status !== 'ok' && entry.action);
  const later = open.filter((entry) => entry.level === 'later');
  let work = open.filter((entry) => entry.level !== 'later');
  if (later.length > 0) {
    io.write(
      `\n${later.length} item(s) are only needed by features that are not built yet: ${later.map((entry) => entry.label).join(', ')}.\n`,
    );
    if (await io.confirm('Set those up now too?', false)) work = open;
  }
  if (work.length === 0) {
    io.write('\nNothing here can be set up automatically. The report above says what is left.\n');
    return;
  }
  io.write('\nSetup will now, in this order:\n');
  const described = [...new Set(work.map(describeAction))];
  for (const line of described) io.write(`  - ${line}\n`);
  if (!(await io.confirm('Start?', true))) return;
  for (const entry of work) {
    try {
      await perform(context, entry);
    } catch (error) {
      io.write(`${paint('red', 'Could not')} ${describeAction(entry)}: ${error.message}\n`);
    }
  }
}
