import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { digestManaged, exists, readJson } from './files.mjs';
import {
  ORGANIZATION_REPOSITORY,
  PIN_FILE,
  PIN_SCHEMA_VERSION,
  PLUGIN_NAME,
  consumerScripts,
  managedHooks,
} from './manifest.mjs';

const scopePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Every rule a consumer must satisfy. Each returns a string when it fails so
 * one run reports everything wrong instead of the first thing.
 */
async function pinRules(cwd, pin) {
  const failures = [];
  if (pin.schemaVersion !== PIN_SCHEMA_VERSION) {
    failures.push(`${PIN_FILE} uses schema ${pin.schemaVersion}; run \`update --release <tag>\` to migrate to schema ${PIN_SCHEMA_VERSION}`);
    return failures;
  }
  if (pin.repository !== ORGANIZATION_REPOSITORY) {
    failures.push('the pin points at a non-organization source');
  }

  const digest = await digestManaged(cwd, pin.managedPaths);
  if (digest.sha256 !== pin.sha256) {
    const changed = new Set([
      ...Object.keys(pin.files ?? {}).filter((file) => digest.files[file] !== pin.files[file]),
      ...Object.keys(digest.files).filter((file) => pin.files?.[file] === undefined),
    ]);
    failures.push(
      `the vendored tooling differs from the pinned release ${pin.ref}; changed: ${[...changed].sort().join(', ')}. Run \`pnpm repository-tooling:update --release ${pin.ref}\` to restore it.`,
    );
  }

  for (const harness of ['.claude-plugin', '.codex-plugin']) {
    const manifest = await readJson(path.join(cwd, `plugins/${PLUGIN_NAME}/${harness}/plugin.json`)).catch(
      () => undefined,
    );
    if (manifest?.name !== pin.plugin || manifest?.version !== pin.version) {
      failures.push(`plugins/${PLUGIN_NAME}/${harness}/plugin.json does not match the pinned plugin ${pin.plugin}@${pin.version}`);
    }
  }
  return failures;
}

async function harnessRules(cwd, pin) {
  const failures = [];
  const settings = await readJson(path.join(cwd, '.claude/settings.json')).catch(() => undefined);
  const source = settings?.extraKnownMarketplaces?.lvbt?.source;
  if (
    source?.source !== 'github' ||
    source.repo !== pin.repository ||
    source.ref !== pin.ref ||
    settings?.enabledPlugins?.[`${PLUGIN_NAME}@lvbt`] !== true
  ) {
    failures.push(`Claude does not load the pinned organization plugin: .claude/settings.json must reference ${pin.repository} at ${pin.ref} and enable ${PLUGIN_NAME}@lvbt`);
  }

  const marketplace = await readJson(path.join(cwd, '.agents/plugins/marketplace.json')).catch(() => undefined);
  const listed = marketplace?.plugins?.find(({ name }) => name === PLUGIN_NAME);
  if (listed?.source?.source !== 'local' || listed.source.path !== `../../plugins/${PLUGIN_NAME}`) {
    failures.push('the Codex marketplace does not load the vendored plugin');
  }

  const codexHooks = await readFile(path.join(cwd, '.codex/hooks.json'), 'utf8').catch(() => '');
  if (!codexHooks.includes('codex-pre-tool-use.mjs')) {
    failures.push('the Codex creation guard is not configured in .codex/hooks.json');
  }
  return failures;
}

async function repositoryRules(cwd) {
  const failures = [];

  for (const hook of managedHooks) {
    const mode = await stat(path.join(cwd, hook)).then(
      (info) => info.mode,
      () => undefined,
    );
    if (mode === undefined || (mode & 0o111) === 0) {
      failures.push(`${hook} must exist and be executable`);
    }
  }

  const scopesPath = path.join(cwd, '.lvbt/commit-scopes.txt');
  const scopes = (await readFile(scopesPath, 'utf8').catch(() => undefined))
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!scopes) {
    failures.push('.lvbt/commit-scopes.txt is missing; every repository declares its own durable commit scopes');
  } else if (scopes.some((scope) => !scopePattern.test(scope)) || new Set(scopes).size !== scopes.length) {
    failures.push('.lvbt/commit-scopes.txt contains an invalid or duplicated scope');
  }

  const packageJson = await readJson(path.join(cwd, 'package.json')).catch(() => undefined);
  if (!packageJson?.packageManager?.startsWith('pnpm@')) {
    failures.push('package.json must pin pnpm through the packageManager field');
  }
  if (!packageJson?.scripts?.prepare?.includes('core.hooksPath .githooks')) {
    failures.push('package.json "prepare" must set core.hooksPath to .githooks');
  }
  for (const name of ['check:repository-tooling', 'repository-tooling:update']) {
    if (packageJson?.scripts?.[name] !== consumerScripts[name]) {
      failures.push(`package.json script "${name}" must be \`${consumerScripts[name]}\``);
    }
  }

  const workflows = await readdir(path.join(cwd, '.github/workflows')).catch(() => []);
  let validates = false;
  for (const file of workflows) {
    const workflow = await readFile(path.join(cwd, '.github/workflows', file), 'utf8');
    if (/name:\s*Validate\b/.test(workflow) && /pnpm check\b/.test(workflow)) validates = true;
  }
  if (!validates) {
    failures.push('no workflow under .github/workflows declares a job named "Validate" that runs `pnpm check`');
  }

  const agents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8').catch(() => '');
  if (!agents.includes('github-contribution') || !agents.includes('github-create.mjs')) {
    failures.push('AGENTS.md must require the shared github-contribution skill and github-create.mjs helper');
  }

  const issueTemplates = await readdir(path.join(cwd, '.github/ISSUE_TEMPLATE')).catch(() => []);
  const pullRequestTemplate = await exists(path.join(cwd, '.github/pull_request_template.md'));
  if (issueTemplates.length > 0 || pullRequestTemplate) {
    failures.push('local GitHub templates shadow the organization defaults; delete .github/ISSUE_TEMPLATE and .github/pull_request_template.md');
  }
  return failures;
}

export async function check({ cwd }) {
  const pin = await readJson(path.join(cwd, PIN_FILE)).catch(() => undefined);
  if (!pin) {
    throw new CliError(`${PIN_FILE} is missing; run \`init\` to adopt the organization tooling.`);
  }

  const failures = [
    ...(await pinRules(cwd, pin)),
    ...(await harnessRules(cwd, pin)),
    ...(await repositoryRules(cwd)),
  ];
  if (failures.length > 0) {
    throw new CliError(failures.map((failure) => `repository tooling: ${failure}`).join('\n'));
  }

  process.stdout.write(
    `repository tooling: ${pin.plugin} ${pin.version} matches ${pin.ref}; managed files verified; organization templates are inherited.\n`,
  );
}
