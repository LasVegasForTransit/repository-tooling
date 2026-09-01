/**
 * The shared Vitest configuration for every LVBT repository. Test files live
 * under `tests/` and end in `.test.ts`, `.test.tsx`, `.spec.ts`, or
 * `.spec.tsx`. A suite with no tests fails, so a mis-glob cannot pass CI
 * silently.
 *
 * Spread it into a package's vitest.config.ts:
 *
 *   import { defineConfig } from 'vitest/config';
 *   import { sharedConfig } from '@lvbt/vitest-config';
 *   export default defineConfig({ ...sharedConfig });
 *
 * @type {import("vitest/config").UserConfig}
 */
export const sharedConfig = {
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: false,
  },
};
