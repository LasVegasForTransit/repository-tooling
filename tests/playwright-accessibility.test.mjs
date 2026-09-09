import assert from 'node:assert/strict';
import test from 'node:test';

test('the Playwright package exposes the organization accessibility assertion', async () => {
  const module = await import('@lvbt/playwright-config/accessibility');
  assert.equal(typeof module.expectNoAccessibilityViolations, 'function');
});

test('the shared Playwright config uses portable project-specific snapshots', async () => {
  const { sharedConfig } = await import('@lvbt/playwright-config');
  assert.equal(
    sharedConfig.snapshotPathTemplate,
    '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',
  );
});
