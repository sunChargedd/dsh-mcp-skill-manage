#!/usr/bin/env node
// scripts/test-tools.mjs — self-test for lib/zip.js and lib/probe.js.
//
// Run from the package directory:  node scripts/test-tools.mjs
// Exits 0 when every test passes (skips are allowed for system-CLI fixtures).
// Cleans up every temp directory, HTTP server and child process it starts.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as zlib from 'node:zlib';

import { probeMcpServer } from '../lib/probe.js';
import { createZip, readZip } from '../lib/zip.js';

const results = { passed: 0, failed: 0, skipped: 0 };
const cleanups = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test(name, fn) {
  try {
    const outcome = await fn();
    if (outcome === 'skip') {
      results.skipped += 1;
      console.log(`skip - ${name}`);
      return;
    }
    results.passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    results.failed += 1;
    console.error(`not ok - ${name}`);
    const detail = error && error.stack ? error.stack : String(error);
    console.error(
      detail
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
    );
  }
}

function naiveCrc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findCentralEntry(buffer, name) {
  const nameBytes = Buffer.from(name, 'utf8');
  for (let position = 0; position + 46 <= buffer.length; position += 1) {
    if (buffer.readUInt32LE(position) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(position + 28);
    const nameStart = position + 46;
    if (nameLength !== nameBytes.length || nameStart + nameLength > buffer.length) continue;
    if (!buffer.subarray(nameStart, nameStart + nameLength).equals(nameBytes)) continue;
    return {
      flags: buffer.readUInt16LE(position + 8),
      method: buffer.readUInt16LE(position + 10),
      crc: buffer.readUInt32LE(position + 16),
      compressedSize: buffer.readUInt32LE(position + 20),
      uncompressedSize: buffer.readUInt32LE(position + 24),
      localOffset: buffer.readUInt32LE(position + 42),
    };
  }
  return null;
}

// Hand-craft a single-entry ZIP archive so DEFLATE support can be tested
// without depending on system CLIs.
function buildZipFixture(name, data, method = 0) {
  const nameBytes = Buffer.from(name, 'utf8');
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const compressed = method === 8 ? zlib.deflateRawSync(payload) : Buffer.from(payload);
  const checksum = naiveCrc32(payload);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0x21, 12); // 1980-01-01
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42); // local header offset (single entry at offset 0)

  const centralDirectoryOffset = local.length + nameBytes.length + compressed.length;
  const centralDirectory = Buffer.concat([central, nameBytes]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([local, nameBytes, compressed, centralDirectory, eocd]);
}

async function readJsonBody(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return raw.length > 0 ? JSON.parse(raw) : {};
}

async function startHttpServer(handler) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    request.on('error', () => {});
    response.on('error', () => {});
    Promise.resolve(handler(request, response)).catch((error) => {
      try {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
        response.end(String(error && error.message ? error.message : error));
      } catch {
        // response is already gone
      }
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  cleanups.push(
    () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        const timer = setTimeout(resolve, 2000);
        if (typeof timer.unref === 'function') timer.unref();
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
  );
  return { server, port: address.port, url: `http://127.0.0.1:${address.port}` };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return false;
    throw error;
  }
}

async function assertProcessGone(pid) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await sleep(50);
  }
  assert.fail(`expected child process ${pid} to have been terminated`);
}

const FAKE_STDIO_SERVER_SOURCE = `import fs from 'node:fs';

const pidFile = process.argv[2];
const mode = process.argv[3] || 'normal';
const tools = [
  { name: 'alpha', description: 'first tool' },
  { name: 'beta' },
  { name: 'gamma' },
];

if (pidFile) fs.writeFileSync(pidFile, String(process.pid));

if (mode === 'crash') {
  process.stderr.write('fake stdio server: crashing\\n');
  process.exit(2);
}

process.stderr.write('fake stdio server: ready\\n');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\\n');
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf('\\n');
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (mode === 'silent') continue;
    if (message.id === undefined) continue;
    if (message.method === 'initialize') {
      respond({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-stdio-server', version: '1.2.3' },
        },
      });
    } else if (message.method === 'tools/list') {
      respond({ jsonrpc: '2.0', id: message.id, result: { tools } });
    } else {
      respond({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));

function respond(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}
`;

async function main() {
  const startedAt = Date.now();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'dsh-mcp-tools-test-'));
  cleanups.push(() => rm(tempDir, { recursive: true, force: true }));

  const fakeStdioScript = path.join(tempDir, 'fake-stdio-mcp.mjs');
  await writeFile(fakeStdioScript, FAKE_STDIO_SERVER_SOURCE, 'utf8');

  // -------------------------------------------------------------------------
  // zip writer/reader
  // -------------------------------------------------------------------------

  await test('zip: createZip/readZip roundtrip (nested, unicode, binary, directory)', () => {
    const binary = Buffer.alloc(4096);
    for (let index = 0; index < binary.length; index += 1) binary[index] = (index * 131 + 17) & 0xff;
    const unicodeName = 'nested/deep/unicode-\u6587\u4ef6-\u2713-\u03bb.txt';
    const unicodeContent = 'Unicode payload: \u2713 \u6587\u4ef6 \u03bb \u2014 end';

    const entries = [
      { name: 'hello.txt', data: 'hello world' },
      { name: unicodeName, data: unicodeContent },
      { name: 'bin/data.bin', data: binary },
      { name: 'empty-dir/', directory: true },
      { name: 'empty.txt', data: '' },
    ];
    const archive = createZip(entries, { mtime: new Date(2024, 0, 2, 3, 4, 6) });
    assert.ok(Buffer.isBuffer(archive), 'createZip must return a Buffer');
    assert.ok(archive.length > 0);

    const readEntries = readZip(archive);
    assert.equal(readEntries.length, entries.length);
    const byName = new Map(readEntries.map((entry) => [entry.name, entry]));
    assert.equal(byName.get('hello.txt').data.toString('utf8'), 'hello world');
    assert.equal(byName.get(unicodeName).data.toString('utf8'), unicodeContent);
    assert.deepEqual(byName.get('bin/data.bin').data, binary);
    assert.equal(byName.get('empty-dir/').directory, true);
    assert.equal(byName.get('empty-dir/').data.length, 0);
    assert.equal(byName.get('empty.txt').directory, false);
    assert.equal(byName.get('empty.txt').data.length, 0);

    const expectedByName = new Map([
      ['hello.txt', Buffer.from('hello world', 'utf8')],
      [unicodeName, Buffer.from(unicodeContent, 'utf8')],
      ['bin/data.bin', binary],
      ['empty-dir/', Buffer.alloc(0)],
      ['empty.txt', Buffer.alloc(0)],
    ]);
    for (const [name, expected] of expectedByName) {
      const central = findCentralEntry(archive, name);
      assert.ok(central, `central directory must contain ${name}`);
      assert.equal(central.method, 0, 'createZip must use STORE');
      assert.equal(central.flags & 0x0800, 0x0800, 'names must be flagged UTF-8');
      assert.equal(central.compressedSize, expected.length);
      assert.equal(central.uncompressedSize, expected.length);
      assert.equal(central.crc, naiveCrc32(expected), `CRC mismatch for ${name}`);
      if (typeof zlib.crc32 === 'function') {
        assert.equal(central.crc, zlib.crc32(expected), `CRC mismatch vs zlib.crc32 for ${name}`);
      }
      assert.equal(archive.readUInt32LE(central.localOffset), 0x04034b50, 'local header signature');
    }

    // EOCD trailer
    assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
    assert.equal(archive.readUInt16LE(archive.length - 22 + 10), entries.length);

    // Empty archive and trailing-slash directory inference.
    assert.deepEqual(readZip(createZip([])), []);
    const inferredDirectory = readZip(createZip([{ name: 'auto-dir/', data: '' }]));
    assert.equal(inferredDirectory.length, 1);
    assert.equal(inferredDirectory[0].directory, true);
  });

  await test('zip: readZip inflates a hand-crafted DEFLATE (method 8) archive', () => {
    const payload = Buffer.from(`deflate payload ${'\u6587\u4ef6 '.repeat(200)}end \u2713`, 'utf8');
    const fixture = buildZipFixture('deflate/data.txt', payload, 8);
    const parsed = readZip(fixture);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'deflate/data.txt');
    assert.equal(parsed[0].directory, false);
    assert.deepEqual(parsed[0].data, payload);
  });

  await test('zip: readZip rejects ZIP64 archives with a clear error', () => {
    const archive = createZip([{ name: 'a.txt', data: 'a' }]);
    archive.writeUInt32LE(0xffffffff, archive.length - 22 + 16); // ZIP64 central-directory offset sentinel
    assert.throws(() => readZip(archive), /zip64/i);
  });

  await test('zip: interoperates with the system zip/unzip CLIs (optional fixture)', async () => {
    const hasZip = spawnSync('zip', ['-v'], { encoding: 'utf8' }).status === 0;
    const hasUnzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' }).status === 0;
    if (!hasZip && !hasUnzip) {
      console.log('  skip: system `zip`/`unzip` CLIs are not available');
      return 'skip';
    }

    const workingDir = path.join(tempDir, 'cli-zip');
    await mkdir(workingDir, { recursive: true });
    const content = 'CLI deflate fixture '.repeat(120);
    await writeFile(path.join(workingDir, 'cli.txt'), content);

    if (hasZip) {
      const archivePath = path.join(workingDir, 'cli-deflate.zip');
      const zipResult = spawnSync('zip', ['-q', archivePath, 'cli.txt'], { cwd: workingDir, encoding: 'utf8' });
      assert.equal(zipResult.status, 0, `zip CLI failed: ${zipResult.stderr}`);
      const archiveBytes = await readFile(archivePath);
      const parsed = readZip(archiveBytes);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].name, 'cli.txt');
      assert.equal(parsed[0].data.toString('utf8'), content);
      const central = findCentralEntry(archiveBytes, 'cli.txt');
      assert.ok(central);
      assert.equal(central.method, 8, 'system zip CLI should deflate the fixture');
    }

    if (hasUnzip) {
      const binary = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
      const ourArchivePath = path.join(workingDir, 'our-store.zip');
      await writeFile(
        ourArchivePath,
        createZip([
          { name: 'cli.txt', data: content },
          { name: 'nested/binary.bin', data: binary },
        ]),
      );
      const testResult = spawnSync('unzip', ['-t', ourArchivePath], { encoding: 'utf8' });
      assert.equal(testResult.status, 0, `unzip -t failed: ${testResult.stdout}\n${testResult.stderr}`);
      const extracted = spawnSync('unzip', ['-p', ourArchivePath, 'nested/binary.bin']);
      assert.equal(extracted.status, 0, 'unzip -p failed');
      assert.deepEqual(extracted.stdout, binary);
    }
  });

  await test('zip: createZip rejects unsafe entry names', () => {
    const cases = [
      ['/absolute/path.txt', /absolute/i],
      ['../escape.txt', /unsafe/i],
      ['a/../../b.txt', /unsafe/i],
      ['dir\\file.txt', /backslash/i],
      ['nul\0byte.txt', /NUL/i],
      ['', /non-empty/i],
      ['C:/windows.txt', /absolute/i],
    ];
    for (const [name, pattern] of cases) {
      assert.throws(
        () => createZip([{ name, data: 'x' }]),
        pattern,
        `expected createZip to reject ${JSON.stringify(name)}`,
      );
    }
    assert.throws(() => createZip('not-an-array'), /entries must be an array/);
    assert.throws(() => createZip([{ name: 'bad-type.txt', data: 42 }]), /Buffer, Uint8Array, ArrayBuffer or string/);
  });

  await test('zip: readZip rejects unsafe names and invalid archives', () => {
    for (const name of ['../evil.txt', '/etc/passwd', 'back\\slash.txt', 'nul\0byte.txt']) {
      assert.throws(() => readZip(buildZipFixture(name, 'evil')), /unsafe/i, `expected readZip to reject ${JSON.stringify(name)}`);
    }

    assert.throws(() => readZip(Buffer.from('definitely not a zip archive')), /Invalid zip/i);
    assert.throws(() => readZip(Buffer.alloc(4)), /Invalid zip/i);
    assert.throws(() => readZip('not a buffer'), /readZip/);

    const valid = createZip([{ name: 'a.txt', data: 'a' }]);
    assert.throws(() => readZip(valid.subarray(0, valid.length - 5)), /Invalid zip/i);
    assert.throws(() => readZip(valid.subarray(0, 40)), /Invalid zip/i);
  });

  // -------------------------------------------------------------------------
  // probe: stdio transport
  // -------------------------------------------------------------------------

  await test('probe: stdio handshake returns serverInfo/tools, latency and stderr', async () => {
    const pidFile = path.join(tempDir, 'stdio-normal.pid');
    const result = await probeMcpServer(
      {
        transport: 'stdio',
        command: process.execPath,
        args: [fakeStdioScript, pidFile, 'normal'],
        env: { PROBE_TEST_FLAG: '1' },
      },
      { timeoutMs: 5000 },
    );

    assert.equal(result.ok, true, `expected ok, got error: ${result.error}`);
    assert.equal(result.transport, 'stdio');
    assert.deepEqual(result.serverInfo, { name: 'fake-stdio-server', version: '1.2.3' });
    assert.deepEqual(result.tools, ['alpha', 'beta', 'gamma']);
    assert.equal(result.toolCount, 3);
    assert.equal(typeof result.latencyMs, 'number');
    assert.ok(result.latencyMs >= 0 && result.latencyMs < 5000, `unexpected latency ${result.latencyMs}`);
    assert.equal(typeof result.stderr, 'string');
    assert.match(result.stderr, /fake stdio server: ready/);

    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    assert.ok(Number.isInteger(pid) && pid > 0, 'fake server should have written its pid');
    await assertProcessGone(pid);

    // Transport inference: no explicit `transport`, only a command.
    const inferredPidFile = path.join(tempDir, 'stdio-inferred.pid');
    const inferred = await probeMcpServer(
      { command: process.execPath, args: [fakeStdioScript, inferredPidFile, 'normal'] },
      { timeoutMs: 5000 },
    );
    assert.equal(inferred.ok, true, `expected inferred stdio probe to succeed: ${inferred.error}`);
    assert.equal(inferred.transport, 'stdio');
    assert.equal(inferred.toolCount, 3);
    await assertProcessGone(Number((await readFile(inferredPidFile, 'utf8')).trim()));
  });

  await test('probe: stdio child that exits early yields ok:false with a clear error', async () => {
    const pidFile = path.join(tempDir, 'stdio-crash.pid');
    const result = await probeMcpServer(
      { transport: 'stdio', command: process.execPath, args: [fakeStdioScript, pidFile, 'crash'] },
      { timeoutMs: 3000 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.transport, 'stdio');
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.match(result.error, /exit|EPIPE|stdin|closed/i);
    assert.equal(typeof result.latencyMs, 'number');
  });

  await test('probe: stdio hard timeout kills the child and reports the timeout', async () => {
    const pidFile = path.join(tempDir, 'stdio-silent.pid');
    const startedAt = Date.now();
    const result = await probeMcpServer(
      { transport: 'stdio', command: process.execPath, args: [fakeStdioScript, pidFile, 'silent'] },
      { timeoutMs: 400 },
    );
    const elapsed = Date.now() - startedAt;

    assert.equal(result.ok, false);
    assert.equal(result.transport, 'stdio');
    assert.match(result.error, /timed out/i);
    assert.ok(elapsed >= 350, `timeout returned too early (${elapsed}ms)`);
    assert.ok(elapsed < 5000, `timeout returned too late (${elapsed}ms)`);

    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    assert.ok(Number.isInteger(pid) && pid > 0);
    await assertProcessGone(pid);
  });

  // -------------------------------------------------------------------------
  // probe: HTTP / SSE transport
  // -------------------------------------------------------------------------

  await test('probe: http transport sends initialize + tools/list and reuses session id', async () => {
    const seen = { initialize: null, toolsList: null };
    const endpoint = await startHttpServer(async (request, response) => {
      const body = await readJsonBody(request);
      if (body.method === 'initialize') {
        seen.initialize = { headers: request.headers, body };
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'fake-http-server', version: '9.9.9' },
          },
        });
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'mcp-session-id': 'sess-42',
        });
        response.end(payload);
        return;
      }
      if (body.method === 'tools/list') {
        seen.toolsList = { headers: request.headers, body };
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'tool-one' }, { name: 'tool-two' }] },
        });
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
        response.end(payload);
        return;
      }
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id ?? null, error: { code: -32601, message: 'Method not found' } }));
    });

    const result = await probeMcpServer(
      {
        transport: 'http',
        url: `${endpoint.url}/mcp`,
        headers: { authorization: 'Bearer test-token', 'x-custom-header': 'yes' },
      },
      { timeoutMs: 5000 },
    );

    assert.equal(result.ok, true, `expected ok, got error: ${result.error}`);
    assert.equal(result.transport, 'http');
    assert.deepEqual(result.tools, ['tool-one', 'tool-two']);
    assert.equal(result.toolCount, 2);
    assert.deepEqual(result.serverInfo, { name: 'fake-http-server', version: '9.9.9' });
    assert.equal(typeof result.latencyMs, 'number');
    assert.ok(result.latencyMs >= 0);

    assert.ok(seen.initialize, 'initialize must reach the server');
    assert.equal(seen.initialize.body.params.protocolVersion, '2025-06-18');
    assert.deepEqual(seen.initialize.body.params.clientInfo, { name: 'dsh-mcp-skill-manage', version: '0.1.0' });
    assert.equal(seen.initialize.headers.authorization, 'Bearer test-token');
    assert.equal(seen.initialize.headers['x-custom-header'], 'yes');
    assert.match(seen.initialize.headers['content-type'], /application\/json/);
    assert.match(seen.initialize.headers.accept, /application\/json/);
    assert.match(seen.initialize.headers.accept, /text\/event-stream/);

    assert.ok(seen.toolsList, 'tools/list must reach the server');
    assert.equal(seen.toolsList.headers['mcp-session-id'], 'sess-42', 'session id must be reused');
  });

  await test('probe: sse transport consumes streamed data: frames without hanging', async () => {
    const endpoint = await startHttpServer(async (request, response) => {
      const body = await readJsonBody(request);
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (body.method === 'initialize') {
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake-sse-server', version: '0.0.1' } },
        });
        response.write(`event: message\ndata: ${payload}\n\n`);
      } else {
        response.write(': keep-alive comment frame\n\n');
        response.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } })}\n\n`);
        response.write(
          `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'sse-tool' }] } })}\n\n`,
        );
      }
      const keepAlive = setInterval(() => {
        try {
          response.write(': keep-alive\n\n');
        } catch {
          clearInterval(keepAlive);
        }
      }, 100);
      if (typeof keepAlive.unref === 'function') keepAlive.unref();
      response.on('close', () => clearInterval(keepAlive));
    });

    const result = await probeMcpServer({ transport: 'sse', url: `${endpoint.url}/sse` }, { timeoutMs: 5000 });
    assert.equal(result.ok, true, `expected ok, got error: ${result.error}`);
    assert.equal(result.transport, 'sse');
    assert.deepEqual(result.tools, ['sse-tool']);
    assert.equal(result.toolCount, 1);
    assert.equal(result.serverInfo.name, 'fake-sse-server');
    assert.equal(typeof result.latencyMs, 'number');
  });

  await test('probe: reports errors for bad config, missing commands and failing HTTP endpoints', async () => {
    const missingUrl = await probeMcpServer({ transport: 'http' }, { timeoutMs: 1000 });
    assert.equal(missingUrl.ok, false);
    assert.match(missingUrl.error, /url/i);

    const unsupported = await probeMcpServer({ transport: 'carrier-pigeon' }, { timeoutMs: 1000 });
    assert.equal(unsupported.ok, false);
    assert.match(unsupported.error, /transport/i);

    const badServer = await probeMcpServer(null);
    assert.equal(badServer.ok, false);
    assert.equal(typeof badServer.error, 'string');

    const missingCommand = await probeMcpServer(
      { transport: 'stdio', command: 'dsh-probe-definitely-missing-command-xyz' },
      { timeoutMs: 2000 },
    );
    assert.equal(missingCommand.ok, false);
    assert.equal(missingCommand.transport, 'stdio');
    assert.match(missingCommand.error, /ENOENT|not found|spawn/i);

    const failing = await startHttpServer((request, response) => {
      request.resume();
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end('boom');
    });
    const httpError = await probeMcpServer({ transport: 'http', url: `${failing.url}/fail` }, { timeoutMs: 2000 });
    assert.equal(httpError.ok, false);
    assert.equal(httpError.transport, 'http');
    assert.match(httpError.error, /HTTP 500/);
    assert.equal(typeof httpError.latencyMs, 'number');
  });

  const elapsed = Date.now() - startedAt;
  console.log(`\n${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped (${elapsed}ms)`);
  return results;
}

try {
  const summary = await main();
  process.exitCode = summary.failed === 0 ? 0 : 1;
} catch (error) {
  console.error('fatal:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
} finally {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`cleanup failed: ${error && error.message ? error.message : error}`);
    }
  }
}
