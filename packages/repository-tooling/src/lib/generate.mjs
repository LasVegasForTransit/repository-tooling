import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { catalog, dependencySpec, repositoryContext } from './context.mjs';
import { exists, formatJson, readJson } from './files.mjs';
import {
  catalogYaml,
  devDependencies,
  render,
  scripts,
  sharedPackages,
  templatesFor,
} from './templates.mjs';

async function variablesFor(context) {
  const baseline = await catalog();
  return {
    name: context.name,
    profile: context.profile,
    tag: `v${context.version}`,
    scopes: context.scopes.join('\n'),
    catalog: catalogYaml(baseline.catalog),
  };
}

/** The scope file is data the repository owns; only `init` writes it. */
function scopesFile(scopes) {
  return [
    '# One scope per durable boundary in this repository.',
    '# Omit a scope when a change crosses boundaries.',
    ...scopes,
    '',
  ].join('\n');
}

function mergedPackageJson(existing, context, baseline) {
  const packageJson = { ...existing };
  packageJson.type ??= 'module';
  packageJson.packageManager ??= baseline.packageManager;
  packageJson.engines ??= { node: baseline.node };

  const wanted = { ...scripts.common, ...scripts[context.profile] };
  const merged = { ...packageJson.scripts };
  for (const [name, command] of Object.entries(wanted)) {
    if (
      name === 'prepare' &&
      merged.prepare &&
      !merged.prepare.includes('core.hooksPath .githooks')
    ) {
      merged.prepare = `${command} && ${merged.prepare}`;
    } else {
      merged[name] ??= command;
    }
  }
  packageJson.scripts = merged;

  const dev = { ...packageJson.devDependencies };
  for (const name of sharedPackages) {
    dev[`@lvbt/${name}`] ??= dependencySpec(name, context);
  }
  for (const tool of [...devDependencies.common, ...devDependencies[context.profile]]) {
    dev[tool] ??= 'catalog:';
  }
  packageJson.devDependencies = Object.fromEntries(
    Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)),
  );
  return packageJson;
}

function mergedClaudeSettings(existing, context) {
  const settings = existing ?? {};
  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    lvbt: {
      source: {
        source: 'github',
        repo: 'LasVegasForTransit/repository-tooling',
        ref: `v${context.version}`,
      },
    },
  };
  settings.enabledPlugins = { ...settings.enabledPlugins, 'lvbt-contributions@lvbt': true };
  return settings;
}

/**
 * Generate a repository from the standard. Existing files are kept, so
 * running this on a repository that already has a file of the same name skips
 * it and says so; `apply` is the explicit way to overwrite one.
 */
export async function init({ cwd, options }) {
  if (!options.scopes) {
    throw new CliError(
      'init needs --scopes <a,b,c>: the durable boundaries this repository commits under.',
      2,
    );
  }
  if (!options.profile) {
    throw new CliError('init needs --profile <package|site|app>.', 2);
  }
  const context = await repositoryContext(cwd, options);
  const baseline = await catalog();
  const variables = await variablesFor(context);

  const plan = [];
  const writes = [];
  for (const template of await templatesFor(context.profile)) {
    const target = path.join(cwd, template.relative);
    if (await exists(target)) {
      plan.push({ action: 'skip', to: template.relative });
    } else {
      plan.push({ action: 'write', to: template.relative });
      writes.push({ ...template, target });
    }
  }
  const scopesRelative = '.lvbt/commit-scopes.txt';
  const scopesTarget = path.join(cwd, scopesRelative);
  const writeScopes = !(await exists(scopesTarget));
  plan.push({ action: writeScopes ? 'write' : 'skip', to: scopesRelative });
  plan.push({ action: 'merge', to: '.claude/settings.json' });
  plan.push({ action: 'merge', to: 'package.json' });

  process.stdout.write(
    `Generating a ${context.profile} repository from the LVBT standard v${context.version}\n`,
  );
  for (const { action, to } of plan) process.stdout.write(`  ${action.padEnd(8)}${to}\n`);
  if (options.dryRun) {
    process.stdout.write('Dry run: nothing written.\n');
    return;
  }

  for (const { source, target, relative } of writes) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await render(source, variables));
    if (relative.startsWith('.githooks/')) await chmod(target, 0o755);
  }
  if (writeScopes) {
    await mkdir(path.dirname(scopesTarget), { recursive: true });
    await writeFile(scopesTarget, scopesFile(context.scopes));
  }

  const settingsPath = path.join(cwd, '.claude/settings.json');
  const settings = (await exists(settingsPath)) ? await readJson(settingsPath) : undefined;
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, formatJson(mergedClaudeSettings(settings, context)));

  await writeFile(
    path.join(cwd, 'package.json'),
    formatJson(mergedPackageJson(context.packageJson, context, baseline)),
  );

  process.stdout.write(
    [
      '',
      'Next:',
      '  pnpm bootstrap      # installs, wires git hooks, and runs preflight',
      '  pnpm check          # the same check CI runs',
      '  git add -A && git commit -m "chore(dx): adopt the LVBT repository standard"',
      '',
    ].join('\n'),
  );
}

/** Rewrite named files from the standard, overwriting what the repository has. */
export async function apply({ cwd, options }) {
  const context = await repositoryContext(cwd, options);
  if (!context.scopes)
    throw new CliError('.lvbt/commit-scopes.txt is missing; run `init` first.', 2);
  if (options.positional.length === 0)
    throw new CliError(
      'apply needs one or more file paths, for example `apply eslint.config.mjs`.',
      2,
    );

  const templates = new Map(
    (await templatesFor(context.profile)).map((template) => [template.relative, template]),
  );
  const variables = await variablesFor(context);
  for (const relative of options.positional) {
    const template = templates.get(relative.replaceAll('\\', '/'));
    if (!template)
      throw new CliError(`${relative} is not part of the ${context.profile} standard.`, 2);
    const target = path.join(cwd, template.relative);
    process.stdout.write(`  ${options.dryRun ? 'would write' : 'write'}   ${template.relative}\n`);
    if (options.dryRun) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await render(template.source, variables));
    if (template.relative.startsWith('.githooks/')) await chmod(target, 0o755);
  }
}

/** Report which standard files differ from what `init` would write today. */
export async function diff({ cwd, options }) {
  const context = await repositoryContext(cwd, options);
  if (!context.scopes)
    throw new CliError('.lvbt/commit-scopes.txt is missing; run `init` first.', 2);
  const variables = await variablesFor(context);

  const drifted = [];
  const missing = [];
  for (const template of await templatesFor(context.profile)) {
    if (!template.standard) continue;
    const target = path.join(cwd, template.relative);
    if (!(await exists(target))) {
      missing.push(template.relative);
      continue;
    }
    if ((await readFile(target, 'utf8')) !== (await render(template.source, variables))) {
      drifted.push(template.relative);
    }
  }

  const settings = await readJson(path.join(cwd, '.claude/settings.json')).catch(() => undefined);
  const ref = settings?.extraKnownMarketplaces?.lvbt?.source?.ref;
  if (ref !== `v${context.version}`)
    drifted.push(
      `.claude/settings.json (marketplace ref ${ref ?? 'missing'}, standard is v${context.version})`,
    );

  if (drifted.length === 0 && missing.length === 0) {
    process.stdout.write(
      `This ${context.profile} repository matches the standard v${context.version}.\n`,
    );
    return;
  }
  for (const file of missing) process.stdout.write(`  missing  ${file}\n`);
  for (const file of drifted) process.stdout.write(`  differs  ${file}\n`);
  process.stdout.write(
    `\nDrift is allowed; this is a report. To take the standard's version of a file:\n  pnpm exec lvbt-repository-tooling apply <file>\n`,
  );
  throw new CliError('', 1);
}
