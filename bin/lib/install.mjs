import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { copyTree, digestManaged, exists, formatJson, readJson } from './files.mjs';
import {
  PIN_FILE,
  PIN_SCHEMA_VERSION,
  PLUGIN_NAME,
  consumerScripts,
  managedPaths,
  scaffoldedPaths,
} from './manifest.mjs';
import { isSourceCheckout, resolveSource } from './source.mjs';

const scopePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseScopes(value) {
  const scopes = value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const invalid = scopes.find((scope) => !scopePattern.test(scope));
  if (invalid) throw new CliError(`Scope "${invalid}" must be lowercase words joined by hyphens.`, 2);
  if (scopes.length === 0) throw new CliError('--scopes needs at least one scope.', 2);
  return scopes;
}

function scopesFile(scopes) {
  return [
    '# One scope per durable boundary in this repository.',
    '# Omit a scope when a change crosses boundaries.',
    ...scopes,
    '',
  ].join('\n');
}

function claudeSettings(existing, source) {
  const settings = existing ?? {};
  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    lvbt: { source: { source: 'github', repo: source.repository, ref: source.ref } },
  };
  settings.enabledPlugins = { ...settings.enabledPlugins, [`${PLUGIN_NAME}@lvbt`]: true };
  return settings;
}

function packageScripts(existing) {
  const scripts = { ...existing };
  for (const [name, command] of Object.entries(consumerScripts)) {
    if (name === 'prepare' && scripts.prepare && !scripts.prepare.includes('core.hooksPath .githooks')) {
      scripts.prepare = `${command} && ${scripts.prepare}`;
    } else if (name === 'prepare' && scripts.prepare) {
      continue;
    } else {
      scripts[name] = command;
    }
  }
  return scripts;
}

export async function install({ command, cwd, cliRoot, options }) {
  // The managed paths are the same relative paths in the source repository, so
  // running here would delete the source before copying it onto itself.
  if (await isSourceCheckout(cwd)) {
    throw new CliError(
      `${cwd} is a repository-tooling source checkout; run \`${command}\` from the consumer repository instead.`,
      2,
    );
  }

  const pinPath = path.join(cwd, PIN_FILE);
  const existingPin = (await exists(pinPath)) ? await readJson(pinPath) : undefined;

  if (command === 'init' && existingPin) {
    throw new CliError(`${PIN_FILE} already exists; run \`update\` instead of \`init\`.`, 2);
  }
  if (command === 'update' && !existingPin) {
    throw new CliError(`${PIN_FILE} is missing; run \`init\` first.`, 2);
  }
  if (!(await exists(path.join(cwd, 'package.json')))) {
    throw new CliError('Run this inside a repository that has a package.json.', 2);
  }

  const scopes = command === 'init' ? parseScopes(options.scopes ?? '') : undefined;
  if (command === 'init' && !options.scopes) {
    throw new CliError('init needs --scopes <a,b,c>: the durable boundaries this repository commits under.', 2);
  }

  const source = await resolveSource({
    cliRoot,
    options,
    repository: existingPin?.repository,
  });

  const plan = [];
  for (const { to } of managedPaths) plan.push({ action: 'vendor', to });
  const scaffolds = [];
  for (const { from, to } of scaffoldedPaths) {
    if (command === 'init' && !(await exists(path.join(cwd, to)))) {
      scaffolds.push({ from, to });
      plan.push({ action: 'scaffold', to });
    }
  }
  if (command === 'init') plan.push({ action: 'scaffold', to: '.lvbt/commit-scopes.txt' });
  plan.push({ action: 'patch', to: '.claude/settings.json' });
  plan.push({ action: 'patch', to: 'package.json' });
  plan.push({ action: 'write', to: PIN_FILE });

  process.stdout.write(
    `${command === 'init' ? 'Adopting' : 'Updating'} ${source.repository} ${source.ref} (${source.commit.slice(0, 7)})\n`,
  );
  for (const { action, to } of plan) process.stdout.write(`  ${action.padEnd(8)} ${to}\n`);
  if (options.dryRun) {
    process.stdout.write('Dry run: nothing written.\n');
    return;
  }

  for (const { from, to } of managedPaths) {
    const target = path.join(cwd, to);
    await rm(target, { recursive: true, force: true });
    await copyTree(path.join(source.root, from), target);
  }

  for (const { from, to } of scaffolds) {
    const target = path.join(cwd, to);
    await mkdir(path.dirname(target), { recursive: true });
    await copyTree(path.join(source.root, from), target);
  }
  if (scopes) {
    await mkdir(path.join(cwd, '.lvbt'), { recursive: true });
    await writeFile(path.join(cwd, '.lvbt/commit-scopes.txt'), scopesFile(scopes));
  }

  const settingsPath = path.join(cwd, '.claude/settings.json');
  const settings = (await exists(settingsPath)) ? await readJson(settingsPath) : undefined;
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, formatJson(claudeSettings(settings, source)));

  const packagePath = path.join(cwd, 'package.json');
  const packageJson = await readJson(packagePath);
  packageJson.scripts = packageScripts(packageJson.scripts);
  await writeFile(packagePath, formatJson(packageJson));

  const digest = await digestManaged(
    cwd,
    managedPaths.map(({ to }) => to),
  );
  await writeFile(
    pinPath,
    formatJson({
      schemaVersion: PIN_SCHEMA_VERSION,
      repository: source.repository,
      ref: source.ref,
      commit: source.commit,
      plugin: PLUGIN_NAME,
      version: source.version,
      sha256: digest.sha256,
      managedPaths: managedPaths.map(({ to }) => to),
      files: digest.files,
    }),
  );

  process.stdout.write(
    [
      '',
      'Next:',
      '  pnpm install                     # wires .githooks through the prepare script',
      '  pnpm check:repository-tooling    # proves the vendored files match the pin',
      command === 'init' ? '  git add -A && git commit         # commit the adoption as one change' : '',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
  await readFile(pinPath, 'utf8');
}
