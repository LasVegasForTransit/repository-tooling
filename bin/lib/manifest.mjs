/**
 * What the tooling owns in a consumer repository, and what it only seeds.
 *
 * Managed paths are copied on every update and covered by the pin digest, so
 * a local edit fails `check`. Scaffolded files are written once by `init` when
 * absent and belong to the repository from then on.
 */
export const ORGANIZATION_REPOSITORY = 'LasVegasForTransit/repository-tooling';
export const PLUGIN_NAME = 'lvbt-contributions';
export const PIN_FILE = '.lvbt/repository-tooling.json';
export const PIN_SCHEMA_VERSION = 2;
export const VENDORED_CLI_DIRECTORY = '.lvbt/repository-tooling';

/** `from` is relative to a source checkout, `to` is relative to the consumer. */
export const managedPaths = Object.freeze([
  { from: 'plugins/lvbt-contributions', to: 'plugins/lvbt-contributions' },
  { from: 'bin', to: VENDORED_CLI_DIRECTORY },
  { from: 'templates/managed/.githooks/commit-msg', to: '.githooks/commit-msg' },
  { from: 'templates/managed/.githooks/prepare-commit-msg', to: '.githooks/prepare-commit-msg' },
  { from: 'templates/managed/.agents/plugins/marketplace.json', to: '.agents/plugins/marketplace.json' },
  { from: 'templates/managed/.codex/hooks.json', to: '.codex/hooks.json' },
  {
    from: 'templates/managed/.github/actions/setup-node-pnpm/action.yml',
    to: '.github/actions/setup-node-pnpm/action.yml',
  },
]);

/** Written by `init` only when the consumer does not already have the file. */
export const scaffoldedPaths = Object.freeze([
  { from: 'templates/scaffold/.githooks/pre-push', to: '.githooks/pre-push' },
  { from: 'templates/scaffold/.github/workflows/ci.yml', to: '.github/workflows/ci.yml' },
  { from: 'templates/scaffold/AGENTS.md', to: 'AGENTS.md' },
  { from: 'templates/scaffold/.gitignore', to: '.gitignore' },
]);

export const managedHooks = Object.freeze(['.githooks/commit-msg', '.githooks/prepare-commit-msg']);

export const consumerScripts = Object.freeze({
  prepare: 'git config --local core.hooksPath .githooks',
  'check:repository-tooling': `node ${VENDORED_CLI_DIRECTORY}/cli.mjs check`,
  'repository-tooling:update': `node ${VENDORED_CLI_DIRECTORY}/cli.mjs update`,
});
