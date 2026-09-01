import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Paths no LVBT repository lints: build output, caches, and dependencies.
 * A repository adds its own through `ignores` rather than editing this list.
 */
export const defaultIgnores = [
  '**/.astro/**',
  '**/.wrangler/**',
  '**/coverage/**',
  '**/dist/**',
  '**/dist-archive/**',
  '**/node_modules/**',
  '**/playwright-report/**',
  '**/test-results/**',
];

/**
 * The organization's ESLint configuration.
 *
 * Type-aware rules run on every TypeScript file that a tsconfig includes, so
 * `tsconfigRootDir` must be the directory holding the repository's
 * tsconfig.json (pass `import.meta.dirname` from eslint.config.mjs). Plain
 * JavaScript and configuration files are linted without type information.
 * Prettier's config is last so formatting never becomes a lint error.
 *
 * @param {object} [options]
 * @param {string} [options.tsconfigRootDir]
 * @param {string[]} [options.ignores] additional ignore globs
 * @param {import('typescript-eslint').ConfigArray} [options.extend] repository-specific blocks, applied before Prettier
 */
export function lvbt({ tsconfigRootDir, ignores = [], extend = [] } = {}) {
  return tseslint.config(
    { ignores: [...defaultIgnores, ...ignores] },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
      },
    },
    {
      // Plain JavaScript has no type information, so `no-undef` needs to know
      // the runtime. Node covers every script and config file a repository
      // keeps in JavaScript; browser code is TypeScript, where types cover it.
      files: ['**/*.{js,mjs,cjs,jsx}'],
      ...tseslint.configs.disableTypeChecked,
      languageOptions: { globals: globals.node },
    },
    ...extend,
    prettier,
  );
}

export default lvbt;
