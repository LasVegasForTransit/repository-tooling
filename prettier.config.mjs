import lvbt from '@lvbt/prettier-config';

// The Astro plugin is here for examples/with-astro, so `pnpm format` in this
// repository formats every example the way the example formats itself.
export default {
  ...lvbt,
  plugins: ['prettier-plugin-astro'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
