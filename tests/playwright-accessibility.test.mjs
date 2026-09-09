import assert from 'node:assert/strict';
import test from 'node:test';

test('the Playwright package exposes the organization accessibility assertion', async () => {
  const module = await import('@lvbt/playwright-config/accessibility');
  assert.equal(typeof module.expectNoAccessibilityViolations, 'function');
});
