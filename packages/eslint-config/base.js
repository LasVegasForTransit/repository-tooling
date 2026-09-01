import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import turboPlugin from 'eslint-plugin-turbo';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * A shared ESLint configuration for every LVBT repository.
 *
 * TypeScript files are linted with type information from the nearest
 * tsconfig.json (run ESLint from the package directory, as `turbo run lint`
 * does). Plain JavaScript files get Node globals and no type rules. Prettier's
 * config comes last so formatting is never a lint error.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      'turbo/no-undeclared-env-vars': 'error',
    },
  },
  eslintConfigPrettier,
  {
    ignores: [
      '.astro/**',
      '.wrangler/**',
      'coverage/**',
      'dist/**',
      'dist-archive/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];
