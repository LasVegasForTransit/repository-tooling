import { lvbt } from '@lvbt/eslint-config';

// The source of the standard lints itself with the standard. Templates are
// rendered, not linted: a template is not this repository's code.
export default lvbt({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['packages/repository-tooling/templates/**'],
});
