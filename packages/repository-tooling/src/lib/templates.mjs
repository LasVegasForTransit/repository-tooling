import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '../..');
export const templatesRoot = path.join(packageRoot, 'templates');

export const PROFILES = Object.freeze({
  package: 'A library, CLI, or worker workspace published from this repository',
  site: 'An Astro site deployed to Cloudflare',
  app: 'A Vite and React application deployed to Cloudflare',
});

/**
 * Files the generator writes once and never compares again: the repository
 * grows them. Everything else is part of the standard and `diff` reports it.
 */
const repositoryOwned = new Set([
  'AGENTS.md',
  '.gitignore',
  '.lvbt/commit-scopes.txt',
  'pnpm-workspace.yaml',
  '.github/workflows/ci.yml',
  'src/index.ts',
  'tests/index.test.ts',
]);

export const sharedPackages = Object.freeze([
  'repository-tooling',
  'tsconfig',
  'eslint-config',
  'prettier-config',
  'vitest-config',
]);

/** Scripts every compliant repository answers to, by profile. */
export const scripts = Object.freeze({
  common: {
    bootstrap: 'lvbt-repository-tooling bootstrap',
    preflight: 'lvbt-repository-tooling preflight',
    check: 'pnpm format:check && pnpm lint && pnpm typecheck && pnpm test',
    'check:fix': 'pnpm format && pnpm lint:fix',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
    typecheck: 'tsc --noEmit -p tsconfig.json',
    test: 'vitest run',
    'test:watch': 'vitest',
    prepare: 'git config --local core.hooksPath .githooks',
  },
  package: {
    build: 'tsc -p tsconfig.build.json',
  },
  site: {
    dev: 'astro dev',
    build: 'astro build',
    preview: 'astro preview',
    deploy: 'lvbt-repository-tooling deploy',
    'test:e2e': 'playwright test',
  },
  app: {
    dev: 'vite',
    build: 'vite build',
    preview: 'vite preview',
    deploy: 'lvbt-repository-tooling deploy',
    'test:e2e': 'playwright test',
  },
});

/** Catalog-versioned tools each profile needs, on top of the shared packages. */
export const devDependencies = Object.freeze({
  common: [
    '@eslint/js',
    '@types/node',
    'eslint',
    'eslint-config-prettier',
    'prettier',
    'typescript',
    'typescript-eslint',
    'vitest',
  ],
  package: [],
  site: ['@astrojs/check', '@playwright/test', 'astro', 'prettier-plugin-astro', 'wrangler'],
  app: [
    '@playwright/test',
    '@types/react',
    '@types/react-dom',
    '@vitejs/plugin-react',
    'eslint-plugin-react-hooks',
    'react',
    'react-dom',
    'vite',
    'wrangler',
  ],
});

async function walk(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(root, absolute)));
    else files.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return files;
}

/**
 * Template files that must not carry their real name inside this package,
 * because ESLint, Prettier, and Vitest would otherwise pick a template up as
 * the configuration for the files around it. The `.tmpl` suffix is dropped on
 * output too.
 */
const renames = Object.freeze({
  'format.config.mjs': 'prettier.config.mjs',
  'lint.config.mjs': 'eslint.config.mjs',
  'test.config.mjs': 'vitest.config.mjs',
});

function outputName(relative) {
  const trimmed = relative.replace(/\.tmpl$/, '');
  const base = path.posix.basename(trimmed);
  return base in renames ? path.posix.join(path.posix.dirname(trimmed), renames[base]) : trimmed;
}

/**
 * The template set for a profile: common files first, then the profile's own
 * files on top, so a profile can replace a common file by shipping the same
 * relative path.
 */
export async function templatesFor(profile) {
  const files = new Map();
  for (const layer of ['common', profile]) {
    const root = path.join(templatesRoot, layer);
    for (const relative of await walk(root)) {
      files.set(outputName(relative), path.join(root, relative));
    }
  }
  return [...files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([relative, source]) => ({ relative, source, standard: !repositoryOwned.has(relative) }));
}

export async function render(source, variables) {
  const raw = await readFile(source, 'utf8');
  return raw.replaceAll(/\{\{([a-zA-Z]+)\}\}/g, (match, key) => {
    if (!(key in variables))
      throw new Error(`Template ${source} uses unknown placeholder ${match}`);
    return variables[key];
  });
}

export function catalogYaml(catalog) {
  return Object.entries(catalog)
    .map(([name, version]) => `  ${/^[a-z]/.test(name) ? name : `'${name}'`}: ${version}`)
    .join('\n');
}
