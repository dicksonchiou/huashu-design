'use strict';

const HTTP_URL = /^https?:\/\//i;
const WEBSOCKET_URL = /^wss?:\/\//i;

function secureContextOptions(options = {}, { allowNetwork = false } = {}) {
  if (allowNetwork) return { ...options };
  return { ...options, serviceWorkers: 'block' };
}

async function configureNetworkPolicy(context, { allowNetwork = false } = {}) {
  if (allowNetwork) return;

  await context.route(HTTP_URL, route => route.abort('blockedbyclient'));
  if (typeof context.routeWebSocket !== 'function') {
    throw new Error('Playwright does not support WebSocket routing; upgrade Playwright before rendering untrusted HTML');
  }
  await context.routeWebSocket(WEBSOCKET_URL, webSocket => webSocket.close());
}

module.exports = { configureNetworkPolicy, secureContextOptions };
