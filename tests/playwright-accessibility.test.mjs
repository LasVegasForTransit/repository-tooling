import assert from 'node:assert/strict';
import test from 'node:test';

test('the Playwright package exposes the organization accessibility assertion', async () => {
  const module = await import('@lvbt/playwright-config/accessibility');
  assert.equal(typeof module.expectNoAccessibilityViolations, 'function');
});

test('the Playwright package reports browser runtime and network failures', async () => {
  const { monitorPageHealth } = await import('@lvbt/playwright-config/page-health');
  const listeners = new Map();
  const page = {
    on(event, listener) {
      listeners.set(event, listener);
    },
  };
  const health = monitorPageHealth(page);

  listeners.get('console')({ type: () => 'error', text: () => 'Uncaught failure' });
  listeners.get('pageerror')(new Error('Render failed'));
  listeners.get('requestfailed')({
    failure: () => ({ errorText: 'net::ERR_FAILED' }),
    method: () => 'GET',
    url: () => 'https://example.test/missing.js',
  });

  assert.throws(
    () => health.assertNoErrors(),
    /console: Uncaught failure[\s\S]*page: Render failed[\s\S]*request: GET https:\/\/example\.test\/missing\.js \(net::ERR_FAILED\)/,
  );
});

test('the shared Playwright config separates project and platform snapshots', async () => {
  const { sharedConfig } = await import('@lvbt/playwright-config');
  assert.equal(
    sharedConfig.snapshotPathTemplate,
    '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}',
  );
});

test('the shared web-server environment keeps framework previews attached to Playwright', async () => {
  const { foregroundServerEnvironment } = await import('@lvbt/playwright-config');
  assert.equal(foregroundServerEnvironment.ASTRO_DEV_BACKGROUND, '1');
  assert.equal(foregroundServerEnvironment.ASTRO_PREVIEW_BACKGROUND, '1');
});
