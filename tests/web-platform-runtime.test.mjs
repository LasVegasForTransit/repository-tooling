import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cloudflareDoctor,
  cloudflareReader,
  doctorCheck,
  githubDoctor,
  githubReader,
  githubVariableWriter,
  matchesPinnedRules,
  provisionEnvironment,
  provisionRoutes,
  provisionVariables,
  reconcileResources,
} from '../packages/web-platform/src/index.ts';

test('publishes the provider-neutral web platform operations', () => {
  for (const operation of [
    cloudflareDoctor,
    cloudflareReader,
    doctorCheck,
    githubDoctor,
    githubReader,
    githubVariableWriter,
    matchesPinnedRules,
    provisionEnvironment,
    provisionRoutes,
    provisionVariables,
    reconcileResources,
  ]) {
    assert.equal(typeof operation, 'function');
  }
});
