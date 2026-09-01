import { defineConfig, mergeConfig } from 'vitest/config';

/**
 * The organization's Vitest configuration. Test files live under `tests/`
 * and end in `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx`. A suite
 * with no tests fails, so a mis-glob cannot pass CI silently.
 *
 * @param {import('vitest/config').UserConfig} [overrides] repository-specific settings, merged on top
 */
export function lvbt(overrides = {}) {
  return defineConfig(
    mergeConfig(
      {
        test: {
          include: ['tests/**/*.{test,spec}.{ts,tsx}'],
          passWithNoTests: false,
        },
      },
      overrides,
    ),
  );
}

export default lvbt;
