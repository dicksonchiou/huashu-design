import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { detectBlockedImageFormat, validateImageSource } = require('../scripts/image-source-guard.js');

function dataUri(bytes) {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('allows a local PNG file', () => {
  const source = resolve('assets/showcases/cover/cover-build.png');
  assert.equal(validateImageSource(source), source);
});

test('blocks ICNS input', () => {
  const source = dataUri(Buffer.from('icns\x00\x00\x00\x08', 'binary'));
  assert.equal(detectBlockedImageFormat(Buffer.from('icns')), 'ICNS');
  assert.throws(() => validateImageSource(source), /ICNS/);
});

test('blocks JPEG XL codestream and container input', () => {
  assert.equal(detectBlockedImageFormat(Buffer.from([0xff, 0x0a])), 'JXL');
  assert.equal(
    detectBlockedImageFormat(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    null
  );
  const container = Buffer.alloc(12);
  container.write('JXL ', 4, 4, 'ascii');
  container.write('jxl ', 8, 4, 'ascii');
  assert.equal(detectBlockedImageFormat(container), 'JXL');
  assert.throws(() => validateImageSource(dataUri([0xff, 0x0a])), /JXL/);
  assert.throws(() => validateImageSource(dataUri(container)), /JXL/);
});

test('blocks the zero-sized JXL box denial-of-service payload', () => {
  const payload = Buffer.from([
    0x00, 0x00, 0x00, 0x00,
    0x4a, 0x58, 0x4c, 0x20,
  ]);

  assert.equal(detectBlockedImageFormat(payload), 'JXL');
  assert.throws(() => validateImageSource(dataUri(payload)), /JXL/);
});

test('blocks HEIF, HEIC, and AVIF container brands', () => {
  for (const brand of ['mif1', 'heic', 'heix', 'hevc', 'hevx', 'avif']) {
    const header = Buffer.alloc(12);
    header.write('ftyp', 4, 4, 'ascii');
    header.write(brand, 8, 4, 'ascii');
    assert.equal(detectBlockedImageFormat(header), 'HEIF/HEIC/AVIF');
    assert.throws(() => validateImageSource(dataUri(header)), /HEIF\/HEIC\/AVIF/);
  }
});

test('rejects remote image sources before dependency parsing', () => {
  assert.throws(
    () => validateImageSource('https://example.com/image.png'),
    /remote or custom-scheme image sources/
  );
});
