import assert from 'node:assert/strict';
import test from 'node:test';

import { dnsResolver } from '../packages/cli/src/lib/platform/services.mjs';

test('DNS lookup keeps only CNAME answers for Forge records', async () => {
  const requests = [];
  const resolve = dnsResolver(async (url) => {
    requests.push(new URL(url));
    return {
      ok: true,
      json: async () => ({
        Answer: [
          { type: 5, data: 'send.forge.rmta.net.' },
          { type: 1, data: '192.0.2.1' },
        ],
      }),
    };
  });
  assert.deepEqual(await resolve('send.example.org', 'CNAME'), ['send.forge.rmta.net.']);
  assert.equal(requests[0].searchParams.get('type'), 'CNAME');
});
