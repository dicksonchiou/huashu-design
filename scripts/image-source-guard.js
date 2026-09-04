'use strict';

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

// image-size currently has no patched release for its ICNS, HEIF, and JXL
// parser denial-of-service advisories. Keep those formats away from
// PptxGenJS, which uses image-size to inspect image dimensions.
const BLOCKED_HEIF_BRANDS = new Set([
  'mif1',
  'msf1',
  'heic',
  'heix',
  'hevc',
  'hevx',
  'avif'
]);

function ascii(buffer, start, end) {
  return buffer.subarray(start, end).toString('ascii');
}

function detectBlockedImageFormat(header) {
  if (header.length >= 4 && ascii(header, 0, 4) === 'icns') {
    return 'ICNS';
  }

  // JPEG XL codestream.
  if (header.length >= 2 && header[0] === 0xff && header[1] === 0x0a) {
    return 'JXL';
  }

  // JPEG XL container. Reject the box signature before attempting to parse a
  // complete ftyp box: image-size can loop forever on an 8-byte, zero-sized
  // "JXL " box (GHSA-5p2g-fcmc-qvqq).
  if (header.length >= 8 && ascii(header, 4, 8) === 'JXL ') {
    return 'JXL';
  }

  // HEIF/HEIC and AVIF use an ISO-BMFF ftyp header.
  if (
    header.length >= 12 &&
    ascii(header, 4, 8) === 'ftyp' &&
    BLOCKED_HEIF_BRANDS.has(ascii(header, 8, 12))
  ) {
    return 'HEIF/HEIC/AVIF';
  }

  return null;
}

function readFileHeader(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readDataUriHeader(source) {
  const comma = source.indexOf(',');
  if (comma < 0) throw new Error('invalid data URI');

  const metadata = source.slice(5, comma);
  const payload = source.slice(comma + 1, comma + 129);
  if (/;base64(?:;|$)/i.test(metadata)) {
    return Buffer.from(payload, 'base64');
  }

  // Only inspect the prefix. This avoids copying an arbitrarily large data URI.
  const prefix = payload.replace(/%(?:[0-9a-f]?)$/i, '');
  try {
    return Buffer.from(decodeURIComponent(prefix), 'latin1');
  } catch {
    return Buffer.from(prefix, 'latin1');
  }
}

function sourceToHeader(source) {
  if (/^data:/i.test(source)) {
    return { header: readDataUriHeader(source), output: source };
  }

  if (/^file:/i.test(source)) {
    const filePath = fileURLToPath(source);
    return { header: readFileHeader(filePath), output: filePath };
  }

  // PptxGenJS accepts paths, not arbitrary browser URLs for this local
  // exporter. Rejecting remote and custom schemes also ensures their bytes
  // cannot bypass the format check.
  if (/^[a-z][a-z\d+.-]*:/i.test(source) && !path.win32.isAbsolute(source)) {
    throw new Error('remote or custom-scheme image sources are not supported; use a local file or data URI');
  }

  return { header: readFileHeader(source), output: source };
}

function validateImageSource(source, label = 'image') {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError(`${label} source must be a non-empty string`);
  }

  const normalized = source.trim();
  const { header, output } = sourceToHeader(normalized);
  const blockedFormat = detectBlockedImageFormat(header);
  if (blockedFormat) {
    throw new Error(
      `${label} uses unsupported ${blockedFormat} format; convert it to PNG, JPEG, WebP, or SVG before PPTX export`
    );
  }

  return output;
}

module.exports = { detectBlockedImageFormat, validateImageSource };
