import { config } from '@lvbt/eslint-config/base';

// The source of the standard lints itself with the standard. The examples are
// linted by their own configs inside the example test, not from here; the
// hand-written declaration files belong to no tsconfig; and this repository is
// not a Turborepo workspace, so the env-var rule has no turbo.json to read.
export default [
  ...config,
  { ignores: ['examples/**', '**/*.d.ts'] },
  { rules: { 'turbo/no-undeclared-env-vars': 'off' } },
];
