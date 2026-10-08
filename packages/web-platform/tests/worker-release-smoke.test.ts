import { expect, it } from 'vitest';
import * as smoke from '../src/worker-release-smoke';
const identity = { commit: 'a'.repeat(40), releaseId: '100' };
it('API smoke requires the saved release identity and declared health behavior', async () => {
  expect('verifyWorkerReleaseSmoke' in smoke).toBe(true);
  const result = await smoke.verifyWorkerReleaseSmoke({
    origin: 'https://preview.example.test',
    identity,
    smoke: { path: '/health', status: 200, body: 'ok' },
    request: async (url) =>
      Promise.resolve(
        url.endsWith('/lvbt-release.json') ? Response.json(identity) : new Response('ok'),
      ),
  });
  expect(result.path).toBe('/health');
  await expect(
    smoke.verifyWorkerReleaseSmoke({
      origin: 'https://preview.example.test',
      identity,
      smoke: { path: '/health', status: 200, body: 'ok' },
      request: async (url) =>
        Promise.resolve(
          url.endsWith('/lvbt-release.json')
            ? Response.json({ ...identity, commit: 'b'.repeat(40) })
            : new Response('ok'),
        ),
    }),
  ).rejects.toThrow(/Expected release/);
  await expect(
    smoke.verifyWorkerReleaseSmoke({
      origin: 'https://preview.example.test',
      identity,
      smoke: { path: '/health', status: 200, body: 'ok' },
      request: async (url) =>
        Promise.resolve(
          url.endsWith('/lvbt-release.json') ? Response.json(identity) : new Response('wrong'),
        ),
    }),
  ).rejects.toThrow(/body/);
});
it('protected API checks deny anonymous requests and scope credentials to one origin without redirects', async () => {
  expect('verifyWorkerReleaseSmoke' in smoke).toBe(true);
  const calls: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  await smoke.verifyWorkerReleaseSmoke({
    origin: 'https://preview.example.test',
    identity,
    smoke: { path: '/health', status: 200, body: 'ok' },
    protected: true,
    credentials: { clientId: 'fixture-id', clientSecret: 'fixture-secret' },
    request: async (url, options) => {
      calls.push({ url, headers: options.headers, redirect: options.redirect });
      return Promise.resolve(
        Object.keys(options.headers).length === 0
          ? new Response('', { status: 403 })
          : url.endsWith('/lvbt-release.json')
            ? Response.json(identity)
            : new Response('ok'),
      );
    },
  });
  expect(calls[0]?.headers).toEqual({});
  expect(
    calls
      .slice(1)
      .every(
        (call) =>
          call.url.startsWith('https://preview.example.test/') &&
          call.headers['CF-Access-Client-Secret'] === 'fixture-secret' &&
          call.redirect === 'manual',
      ),
  ).toBe(true);
  await expect(
    smoke.verifyWorkerReleaseSmoke({
      origin: 'https://preview.example.test',
      identity,
      smoke: { path: 'https://unrelated.test/health', status: 200 },
      protected: true,
      credentials: { clientId: 'fixture-id', clientSecret: 'fixture-secret' },
    }),
  ).rejects.toThrow(/path|origin|invalid/i);
});
it('protected candidate origins identify the configured preview Worker and reject lookalikes', () => {
  const config = {
    previewUrl: 'https://staging.example.test',
    previewWorker: 'collector-preview',
    productionUrl: 'https://events.example.test',
    productionWorker: 'collector',
  };
  expect(() =>
    smoke.validateWorkerSmokeOrigin(
      'https://deadbeef-collector-preview.account.workers.dev',
      config,
      true,
    ),
  ).not.toThrow();
  expect(() => smoke.validateWorkerSmokeOrigin(config.previewUrl, config, true)).not.toThrow();
  expect(() =>
    smoke.validateWorkerSmokeOrigin(
      'https://deadbeef-collector.account.workers.dev',
      config,
      false,
    ),
  ).not.toThrow();
  expect(() =>
    smoke.validateWorkerSmokeOrigin(
      'https://deadbeef-collector-preview.account.workers.dev',
      config,
      false,
    ),
  ).toThrow(/production/);
  for (const url of [
    config.productionUrl,
    'https://deadbeef-collector.account.workers.dev',
    'https://deadbeef-collector-preview.account.workers.dev.attacker.test',
    'https://deadbeef-collector-preview.account.workers.dev/path',
    'https://collector-preview.account.workers.dev',
    'https://deadbeef-collector-preview.account.workers.dev:8443',
  ])
    expect(() => smoke.validateWorkerSmokeOrigin(url, config, true)).toThrow(/preview/);
});
