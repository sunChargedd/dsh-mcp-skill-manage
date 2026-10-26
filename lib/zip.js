// lib/zip.js — self-contained ZIP writer (STORE) and reader (STORE + DEFLATE).
//
// Node builtins only; no imports of other package files. ESM, Node 20+.
//
// Public API:
//   createZip(entries, options) -> Buffer
//   readZip(buffer)             -> [{ name, data, directory }]

import { inflateRawSync } from 'node:zlib';

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIG = 0x07064b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

const UTF8_NAME_FLAG = 0x0800;
const VERSION_NEEDED = 20;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT_LENGTH = 0xffff;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

const CRC_TABLE = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDataBuffer(value, label) {
  if (value === undefined || value === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError(`createZip: data for "${label}" must be a Buffer, Uint8Array, ArrayBuffer or string`);
}

function asArchiveBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  throw new TypeError('readZip: expected a Buffer, Uint8Array or ArrayBuffer');
}

function assertSafeName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: name must be a non-empty string`);
  }
  if (name.includes('\0')) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: contains a NUL byte`);
  }
  if (name.includes('\\')) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: contains a backslash`);
  }
  if (name.startsWith('/')) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: absolute paths are not allowed`);
  }
  if (/^[A-Za-z]:/.test(name)) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: absolute (drive-letter) paths are not allowed`);
  }
  const segments = name.split('/');
  if (segments.includes('..')) {
    throw new Error(`zip: unsafe entry name ${JSON.stringify(name)}: ".." path segments are not allowed`);
  }
  return name;
}

function toDosDateTime(mtime) {
  const date = mtime instanceof Date && !Number.isNaN(mtime.getTime()) ? mtime : new Date();
  const year = date.getFullYear();
  if (year < 1980) return { date: (1 << 5) | 1, time: 0 }; // 1980-01-01 00:00:00
  const clampedYear = Math.min(year, 2107);
  const dosDate = ((clampedYear - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

/**
 * Build a ZIP archive (STORE method, UTF-8 names) from a list of entries.
 *
 * @param {Array<{name: string, data?: Buffer|string|Uint8Array|ArrayBuffer, directory?: boolean}>} entries
 * @param {{mtime?: Date}} [options]
 * @returns {Buffer}
 */
export function createZip(entries, options = {}) {
  if (!Array.isArray(entries)) throw new TypeError('createZip: entries must be an array');
  const opts = options && typeof options === 'object' ? options : {};
  const { date: dosDate, time: dosTime } = toDosDateTime(opts.mtime);

  if (entries.length > ZIP64_MARKER_16) {
    throw new Error('createZip: too many entries for a non-ZIP64 archive (maximum 65535)');
  }

  const fileChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`createZip: entry at index ${index} must be an object`);
    }
    const rawName = assertSafeName(entry.name);
    const isDirectory = entry.directory === true || rawName.endsWith('/');
    const name = isDirectory && !rawName.endsWith('/') ? `${rawName}/` : rawName;
    const data = isDirectory ? Buffer.alloc(0) : toDataBuffer(entry.data, name);
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    if (nameBytes.length > ZIP64_MARKER_16) {
      throw new Error(`createZip: entry name is too long (${nameBytes.length} bytes): "${name.slice(0, 64)}"`);
    }
    if (offset > ZIP64_MARKER_32) {
      throw new Error('createZip: archive is too large for a non-ZIP64 archive');
    }

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_HEADER_SIG, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(UTF8_NAME_FLAG, 6);
    localHeader.writeUInt16LE(METHOD_STORE, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_HEADER_SIG, 0);
    centralHeader.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    centralHeader.writeUInt16LE(VERSION_NEEDED, 6); // version needed to extract
    centralHeader.writeUInt16LE(UTF8_NAME_FLAG, 8);
    centralHeader.writeUInt16LE(METHOD_STORE, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(isDirectory ? 0x10 << 16 : 0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42);

    fileChunks.push(localHeader, nameBytes, data);
    centralChunks.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  if (centralDirectory.length > ZIP64_MARKER_32) {
    throw new Error('createZip: central directory is too large for a non-ZIP64 archive');
  }

  const eocd = Buffer.alloc(EOCD_MIN_SIZE);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...fileChunks, centralDirectory, eocd]);
}

function findEndOfCentralDirectory(buffer) {
  if (buffer.length < EOCD_MIN_SIZE) {
    throw new Error('Invalid zip: buffer is too small to contain an end-of-central-directory record');
  }
  const lowest = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT_LENGTH);
  for (let position = buffer.length - EOCD_MIN_SIZE; position >= lowest; position -= 1) {
    if (buffer.readUInt32LE(position) !== EOCD_SIG) continue;
    const commentLength = buffer.readUInt16LE(position + 20);
    if (position + EOCD_MIN_SIZE + commentLength <= buffer.length) return position;
  }
  throw new Error('Invalid zip: end-of-central-directory record not found (truncated or not a ZIP archive)');
}

function decodeName(bytes) {
  // UTF-8 is used for names flagged as UTF-8; for legacy archives UTF-8/ASCII
  // is the best interpretation available with Node builtins only.
  return bytes.toString('utf8');
}

/**
 * Read a ZIP archive.
 *
 * Supports STORE (method 0) and DEFLATE (method 8) entries and verifies CRCs.
 * Directory entries are included in the result with `directory: true`.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @returns {Array<{name: string, data: Buffer, directory: boolean}>}
 */
export function readZip(input) {
  const buffer = asArchiveBuffer(input);

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (
    totalEntries === ZIP64_MARKER_16 ||
    centralDirectorySize === ZIP64_MARKER_32 ||
    centralDirectoryOffset === ZIP64_MARKER_32
  ) {
    throw new Error('Unsupported zip: ZIP64 archives are not supported');
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new Error('Unsupported zip: multi-disk (spanned) archives are not supported');
  }
  // A ZIP64 end-of-central-directory locator directly preceding the classic
  // EOCD record means this is a ZIP64 archive even when the classic record
  // carries real (non-sentinel) values.
  if (eocdOffset >= 20 && buffer.readUInt32LE(eocdOffset - 20) === ZIP64_EOCD_LOCATOR_SIG) {
    throw new Error('Unsupported zip: ZIP64 archives are not supported');
  }

  if (totalEntries === 0 && centralDirectorySize === 0) return [];

  // Central directory offsets are relative to the start of the archive data.
  // Archives with appended data (self-extracting stubs) need the leading-byte
  // delta applied to both central-directory and local-header offsets.
  let offsetAdjustment = 0;
  if (
    centralDirectoryOffset + 4 > buffer.length ||
    buffer.readUInt32LE(centralDirectoryOffset) !== CENTRAL_HEADER_SIG
  ) {
    offsetAdjustment = eocdOffset - (centralDirectoryOffset + centralDirectorySize);
    if (offsetAdjustment <= 0) {
      throw new Error('Invalid zip: central directory size/offset are inconsistent with the archive length');
    }
  }
  const centralStart = centralDirectoryOffset + offsetAdjustment;
  if (centralStart + centralDirectorySize > buffer.length) {
    throw new Error('Invalid zip: central directory lies outside the archive bounds');
  }

  const entries = [];
  let position = centralStart;

  for (let index = 0; index < totalEntries; index += 1) {
    if (position + 46 > buffer.length) {
      throw new Error(`Invalid zip: truncated central directory entry ${index + 1} of ${totalEntries}`);
    }
    if (buffer.readUInt32LE(position) !== CENTRAL_HEADER_SIG) {
      throw new Error(`Invalid zip: bad central directory signature at offset ${position}`);
    }

    const method = buffer.readUInt16LE(position + 10);
    const crc = buffer.readUInt32LE(position + 16);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localHeaderOffset = buffer.readUInt32LE(position + 42);

    if (
      compressedSize === ZIP64_MARKER_32 ||
      uncompressedSize === ZIP64_MARKER_32 ||
      localHeaderOffset === ZIP64_MARKER_32
    ) {
      throw new Error('Unsupported zip: ZIP64 archives are not supported');
    }

    const nameStart = position + 46;
    const nextPosition = nameStart + nameLength + extraLength + commentLength;
    if (nextPosition > buffer.length) {
      throw new Error(`Invalid zip: truncated central directory entry for entry ${index + 1}`);
    }
    const name = assertSafeName(decodeName(buffer.subarray(nameStart, nameStart + nameLength)));
    const isDirectory = name.endsWith('/');

    const localStart = localHeaderOffset + offsetAdjustment;
    if (localStart + 30 > buffer.length) {
      throw new Error(`Invalid zip: truncated local file header for "${name}"`);
    }
    if (buffer.readUInt32LE(localStart) !== LOCAL_HEADER_SIG) {
      throw new Error(`Invalid zip: bad local file header signature for "${name}"`);
    }
    const localNameLength = buffer.readUInt16LE(localStart + 26);
    const localExtraLength = buffer.readUInt16LE(localStart + 28);
    const dataStart = localStart + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) {
      throw new Error(`Invalid zip: truncated data for "${name}"`);
    }
    const rawData = buffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (compressedSize === 0 && uncompressedSize === 0) {
      data = Buffer.alloc(0);
    } else if (method === METHOD_STORE) {
      data = Buffer.from(rawData);
    } else if (method === METHOD_DEFLATE) {
      try {
        data = inflateRawSync(rawData);
      } catch (error) {
        throw new Error(`Invalid zip: failed to inflate "${name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error(`Unsupported zip: compression method ${method} for "${name}"`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Invalid zip: size mismatch for "${name}" (expected ${uncompressedSize}, got ${data.length})`);
    }
    if (crc32(data) !== crc) {
      throw new Error(`Invalid zip: CRC mismatch for "${name}"`);
    }

    entries.push({ name, data, directory: isDirectory });

    position = nextPosition;
  }

  return entries;
}
