import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from './arguments.mjs';
import { exists, readJson } from './files.mjs';

function output(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function satisfies(version, range) {
  const minimum = /^>=\s*(\d+)/.exec(range)?.[1];
  return minimum === undefined || Number(version.split('.')[0]) >= Number(minimum);
}

async function wranglerConfig(cwd) {
  for (const file of ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']) {
    if (await exists(path.join(cwd, file))) return file;
  }
  return undefined;
}

/**
 * Confirm the machine can work on this repository. Every finding names the
 * command that fixes it; the exit code is 1 when anything failed.
 */
export async function preflight({ cwd }) {
  const packageJson = await readJson(path.join(cwd, 'package.json'));
  const findings = [];
  const pass = (label, detail) => findings.push({ ok: true, label, detail });
  const fail = (label, detail, fix) => findings.push({ ok: false, label, detail, fix });

  const nodeRange = packageJson.engines?.node ?? '>=24';
  if (satisfies(process.versions.node, nodeRange))
    pass('Node.js', `${process.versions.node} satisfies ${nodeRange}`);
  else
    fail(
      'Node.js',
      `${process.versions.node} does not satisfy ${nodeRange}`,
      'install Node.js 24 from https://nodejs.org',
    );

  const wantedPnpm = /^pnpm@(\S+)/.exec(packageJson.packageManager ?? '')?.[1];
  const pnpm = output('pnpm', ['--version'], cwd);
  if (!wantedPnpm)
    fail(
      'pnpm',
      'package.json has no packageManager field',
      'add "packageManager": "pnpm@<version>" to package.json',
    );
  else if (!pnpm)
    fail(
      'pnpm',
      'pnpm is not installed',
      'corepack enable && corepack prepare ' + packageJson.packageManager + ' --activate',
    );
  else if (pnpm !== wantedPnpm)
    fail(
      'pnpm',
      `${pnpm} is installed, ${wantedPnpm} is pinned`,
      `corepack prepare pnpm@${wantedPnpm} --activate`,
    );
  else pass('pnpm', `${pnpm} matches packageManager`);

  if (await exists(path.join(cwd, 'node_modules'))) pass('dependencies', 'node_modules is present');
  else fail('dependencies', 'node_modules is missing', 'pnpm install');

  const hooksPath = output('git', ['config', '--local', 'core.hooksPath'], cwd);
  if (hooksPath === '.githooks') pass('git hooks', 'core.hooksPath is .githooks');
  else
    fail(
      'git hooks',
      `core.hooksPath is ${hooksPath ?? 'unset'}`,
      'pnpm install   # the prepare script sets it',
    );

  const scopes = await readFile(path.join(cwd, '.lvbt/commit-scopes.txt'), 'utf8').catch(
    () => undefined,
  );
  if (scopes) pass('commit scopes', '.lvbt/commit-scopes.txt is present');
  else
    fail(
      'commit scopes',
      '.lvbt/commit-scopes.txt is missing',
      "copy .lvbt/commit-scopes.txt from the standard example and list this repository's scopes",
    );

  const config = await wranglerConfig(cwd);
  if (config) {
    const whoami = output('pnpm', ['exec', 'wrangler', 'whoami'], cwd);
    if (whoami && !/not authenticated/i.test(whoami))
      pass('Cloudflare', `wrangler is authenticated (${config})`);
    else fail('Cloudflare', 'wrangler is not authenticated', 'pnpm exec wrangler login');
  } else {
    pass('Cloudflare', 'no wrangler config; nothing to deploy from here');
  }

  for (const finding of findings) {
    process.stdout.write(
      `  ${finding.ok ? 'ok  ' : 'FAIL'}  ${finding.label.padEnd(14)} ${finding.detail}\n`,
    );
    if (!finding.ok) process.stdout.write(`        fix: ${finding.fix}\n`);
  }
  const failed = findings.filter((finding) => !finding.ok);
  if (failed.length > 0)
    throw new CliError(`preflight: ${failed.length} of ${findings.length} checks failed`, 1);
  process.stdout.write(`preflight: all ${findings.length} checks passed\n`);
}

/** Install, wire hooks, and confirm the machine is ready. */
export async function bootstrap({ cwd }) {
  process.stdout.write('pnpm install\n');
  const install = spawnSync('pnpm', ['install'], { cwd, stdio: 'inherit' });
  if (install.status !== 0)
    throw new CliError('bootstrap: pnpm install failed', install.status ?? 1);
  await preflight({ cwd });
}

/** Build, then deploy with Wrangler. The same steps every deployable repository runs. */
export async function deploy({ cwd, options }) {
  const config = await wranglerConfig(cwd);
  if (!config)
    throw new CliError(
      'deploy: no wrangler.jsonc, wrangler.json, or wrangler.toml in this directory.',
      2,
    );

  process.stdout.write('pnpm build\n');
  const build = spawnSync('pnpm', ['build'], { cwd, stdio: 'inherit' });
  if (build.status !== 0) throw new CliError('deploy: build failed', build.status ?? 1);

  const args = ['exec', 'wrangler', 'deploy', ...(options.dryRun ? ['--dry-run'] : [])];
  process.stdout.write(`pnpm ${args.join(' ')}\n`);
  const result = spawnSync('pnpm', args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new CliError('deploy: wrangler deploy failed', result.status ?? 1);
}
