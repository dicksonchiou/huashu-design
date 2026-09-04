import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  configureNetworkPolicy,
  secureContextOptions,
} = require('../scripts/playwright-network-policy.js');

test('blocks web requests and service workers by default', async () => {
  const calls = [];
  const context = {
    async route(pattern) { calls.push(['http', pattern]); },
    async routeWebSocket(pattern) { calls.push(['websocket', pattern]); },
  };

  assert.deepEqual(secureContextOptions({ viewport: { width: 1, height: 1 } }), {
    viewport: { width: 1, height: 1 },
    serviceWorkers: 'block',
  });
  await configureNetworkPolicy(context);
  assert.deepEqual(calls.map(([kind]) => kind), ['http', 'websocket']);
});

test('allows explicit network opt-in without installing routes', async () => {
  const context = {
    async route() { throw new Error('route must not be installed'); },
    async routeWebSocket() { throw new Error('websocket route must not be installed'); },
  };

  assert.deepEqual(secureContextOptions({}, { allowNetwork: true }), {});
  await configureNetworkPolicy(context, { allowNetwork: true });
});
