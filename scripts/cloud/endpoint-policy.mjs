const OFFICIAL_TTS_HOST = 'openspeech.bytedance.com';

export const TTS_FETCH_POLICY = Object.freeze({ redirect: 'error' });

export function validateTtsEndpoint(rawEndpoint) {
  let endpoint;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error('DOUBAO_TTS_ENDPOINT 必須是有效 URL');
  }

  if (endpoint.protocol !== 'https:') {
    throw new Error('DOUBAO_TTS_ENDPOINT 必須使用 HTTPS');
  }
  if (endpoint.hostname !== OFFICIAL_TTS_HOST) {
    throw new Error(`DOUBAO_TTS_ENDPOINT 只允許官方主機 ${OFFICIAL_TTS_HOST}`);
  }
  if (endpoint.port && endpoint.port !== '443') {
    throw new Error('DOUBAO_TTS_ENDPOINT 不允許非標準 HTTPS port');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('DOUBAO_TTS_ENDPOINT 不允許 URL credential');
  }

  return endpoint;
}
