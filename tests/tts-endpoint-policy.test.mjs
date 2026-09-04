import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TTS_FETCH_POLICY,
  validateTtsEndpoint,
} from '../scripts/cloud/endpoint-policy.mjs';

test('accepts only the official Doubao HTTPS endpoint', () => {
  assert.equal(
    validateTtsEndpoint('https://openspeech.bytedance.com/api/v3/tts/unidirectional').href,
    'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
  );

  for (const endpoint of [
    'http://openspeech.bytedance.com/api/v3/tts/unidirectional',
    'https://other.bytedance.com/api/v3/tts/unidirectional',
    'https://openspeech.bytedance.com:8443/api/v3/tts/unidirectional',
    'https://user:password@openspeech.bytedance.com/api/v3/tts/unidirectional',
  ]) {
    assert.throws(() => validateTtsEndpoint(endpoint));
  }
});

test('does not follow redirects for credential-bearing TTS requests', () => {
  assert.equal(TTS_FETCH_POLICY.redirect, 'error');
});
