// lib/probe.js — MCP server probe (JSON-RPC 2.0 handshake over stdio or HTTP/SSE).
//
// Node builtins only; no imports of other package files. ESM, Node 20+.
//
// Public API:
//   probeMcpServer(server, options) -> Promise<ProbeResult>
//
// ProbeResult: { ok, transport, latencyMs, serverInfo?, tools?, toolCount?, error?, stderr? }
// The function never throws.

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 8000;
const STDERR_LIMIT = 4096;
const KILL_GRACE_MS = 500;
const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = Object.freeze({ name: 'dsh-mcp-skill-manage', version: '0.1.0' });

/**
 * Probe an MCP server by performing the standard initialize -> tools/list handshake.
 *
 * @param {{
 *   transport?: 'stdio'|'http'|'sse',
 *   command?: string, args?: string[], env?: Record<string,string>, cwd?: string,
 *   url?: string, headers?: Record<string,string>
 * }} server
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{
 *   ok: boolean, transport: string|null, latencyMs: number,
 *   serverInfo?: {name?: string, version?: string},
 *   tools?: string[], toolCount?: number, error?: string, stderr?: string
 * }>}
 */
export async function probeMcpServer(server, options = {}) {
  const startedAt = Date.now();
  const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  try {
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      return failure(null, startedAt, 'probeMcpServer: server configuration must be an object');
    }
    const transport = resolveTransport(server);
    if (!transport) {
      return failure(
        typeof server.transport === 'string' ? server.transport : null,
        startedAt,
        `Unsupported transport ${JSON.stringify(server.transport ?? null)}: expected "stdio", "http" or "sse"`,
      );
    }
    const timeoutMs = normalizeTimeout(opts.timeoutMs);
    return transport === 'stdio'
      ? await probeStdio(server, timeoutMs, startedAt)
      : await probeHttp(server, transport, timeoutMs, startedAt);
  } catch (error) {
    const transport = server && typeof server === 'object' && typeof server.transport === 'string' ? server.transport : null;
    return failure(transport, startedAt, `probeMcpServer: ${errorMessage(error)}`);
  }
}

function failure(transport, startedAt, error, extra = {}) {
  return { ok: false, transport, latencyMs: Date.now() - startedAt, error: String(error), ...extra };
}

function normalizeTimeout(value) {
  const timeout = Number(value);
  if (Number.isFinite(timeout) && timeout > 0) return timeout;
  return DEFAULT_TIMEOUT_MS;
}

function resolveTransport(server) {
  const declared = typeof server.transport === 'string' ? server.transport.trim().toLowerCase() : '';
  if (declared === 'stdio' || declared === 'http' || declared === 'sse') return declared;
  if (!declared) {
    if (typeof server.command === 'string' && server.command.trim()) return 'stdio';
    if (typeof server.url === 'string' && server.url.trim()) return 'http';
  }
  return null;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isAbortError(error) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR'),
  );
}

function timeoutError(label, timeoutMs) {
  return new Error(`Timed out after ${timeoutMs}ms waiting for the ${label} response`);
}

function normalizeId(id) {
  return typeof id === 'number' ? `n:${id}` : `s:${String(id)}`;
}

function formatRpcError(error) {
  if (error && typeof error === 'object') {
    const code = error.code !== undefined ? ` ${error.code}` : '';
    const message = typeof error.message === 'string' ? error.message : JSON.stringify(error);
    return `JSON-RPC error${code}: ${message}`;
  }
  return `JSON-RPC error: ${String(error)}`;
}

function extractServerInfo(result) {
  const info = result && typeof result === 'object' && !Array.isArray(result) ? result.serverInfo : undefined;
  const output = {};
  if (info && typeof info === 'object') {
    if (typeof info.name === 'string') output.name = info.name;
    if (typeof info.version === 'string') output.version = info.version;
  }
  return output;
}

function extractToolNames(result) {
  const tools = result && typeof result === 'object' && Array.isArray(result.tools) ? result.tools : [];
  return tools
    .map((tool) => (tool && typeof tool === 'object' ? tool.name : tool))
    .filter((name) => typeof name === 'string' && name.length > 0);
}

function initializeParams(id) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { ...CLIENT_INFO },
    },
  };
}

function buildHttpHeaders(configured) {
  const headers = {};
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    for (const [name, value] of Object.entries(configured)) {
      if (name.length === 0 || value === undefined || value === null) continue;
      headers[name] = String(value);
    }
  }
  setHeader(headers, 'content-type', 'application/json');
  setHeader(headers, 'accept', 'application/json, text/event-stream');
  return headers;
}

function setHeader(headers, name, value) {
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === name) delete headers[existing];
  }
  headers[name] = value;
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

async function probeStdio(server, timeoutMs, startedAt) {
  const transport = 'stdio';
  const command = typeof server.command === 'string' ? server.command.trim() : '';
  if (!command) {
    return failure(transport, startedAt, 'stdio transport requires a non-empty "command"');
  }

  const args = Array.isArray(server.args) ? server.args.map((arg) => String(arg)) : [];
  const env = { ...process.env };
  if (server.env && typeof server.env === 'object' && !Array.isArray(server.env)) {
    for (const [name, value] of Object.entries(server.env)) {
      if (value === undefined || value === null) continue;
      env[name] = String(value);
    }
  }
  const cwd = typeof server.cwd === 'string' && server.cwd.length > 0 ? server.cwd : undefined;

  let child;
  try {
    child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
  } catch (error) {
    return failure(transport, startedAt, `Failed to spawn "${command}": ${errorMessage(error)}`);
  }

  let stderrText = '';
  let stdoutBuffer = '';
  const pending = new Map();

  const rejectPending = (error) => {
    for (const entry of pending.values()) {
      pending.delete(entry.key);
      entry.reject(error);
    }
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('error', () => {});
  child.stderr.on('data', (chunk) => {
    if (stderrText.length >= STDERR_LIMIT) return;
    stderrText += String(chunk).slice(0, STDERR_LIMIT - stderrText.length);
  });

  const handleIncoming = (message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.id === undefined) return; // notification or server request
    const entry = pending.get(normalizeId(message.id));
    if (!entry) return;
    pending.delete(entry.key);
    if (message.error) {
      entry.reject(new Error(formatRpcError(message.error)));
      return;
    }
    entry.resolve(message.result && typeof message.result === 'object' ? message.result : {});
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('error', () => {});
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          message = undefined;
        }
        if (message !== undefined) handleIncoming(message);
      }
      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  const writeMessage = (message) => {
    if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded) {
      throw new Error('child process stdin is closed');
    }
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const request = (method, params, id) =>
    new Promise((resolve, reject) => {
      const remaining = startedAt + timeoutMs - Date.now();
      if (remaining <= 0) {
        reject(timeoutError(method, timeoutMs));
        return;
      }
      const key = normalizeId(id);
      const timer = setTimeout(() => {
        if (!pending.has(key)) return;
        pending.delete(key);
        reject(timeoutError(method, timeoutMs));
      }, remaining);
      pending.set(key, {
        key,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        writeMessage({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        pending.delete(key);
        clearTimeout(timer);
        reject(error);
      }
    });

  child.stdin.on('error', (error) => {
    rejectPending(new Error(`Failed to write to child process stdin: ${errorMessage(error)}`));
  });
  child.on('error', (error) => {
    rejectPending(new Error(`Child process error: ${errorMessage(error)}`));
  });
  child.on('exit', (code, signal) => {
    rejectPending(
      new Error(`Child process exited before responding (code ${code}${signal ? `, signal ${signal}` : ''})`),
    );
  });

  let result;
  try {
    const initializeResult = await request(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { ...CLIENT_INFO },
      },
      1,
    );
    // Best-effort: a server that closes stdin on this notification still answers tools/list.
    try {
      writeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    } catch {
      // ignore: the tools/list request below will surface a real failure
    }
    const listResult = await request('tools/list', {}, 2);
    const tools = extractToolNames(listResult);
    const serverInfo = extractServerInfo(initializeResult);
    result = { ok: true, transport, tools, toolCount: tools.length };
    if (Object.keys(serverInfo).length > 0) result.serverInfo = serverInfo;
  } catch (error) {
    result = { ok: false, transport, error: errorMessage(error) };
  } finally {
    await terminateChild(child);
  }

  result.latencyMs = Date.now() - startedAt;
  if (stderrText.length > 0) result.stderr = stderrText;
  return result;
}

function terminateChild(child) {
  return new Promise((resolve) => {
    let settled = false;
    let killTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      try {
        child.stdout.destroy();
      } catch {
        // ignore
      }
      try {
        child.stderr.destroy();
      } catch {
        // ignore
      }
      resolve();
    };

    const dead = () => child.exitCode !== null || child.signalCode !== null;
    if (dead()) {
      finish();
      return;
    }

    child.once('exit', finish);
    child.once('close', finish);
    killTimer = setTimeout(() => {
      if (dead()) {
        finish();
        return;
      }
      try {
        child.kill('SIGKILL');
      } catch {
        finish();
      }
    }, KILL_GRACE_MS);
    if (typeof killTimer.unref === 'function') killTimer.unref();
    try {
      if (!child.kill('SIGTERM')) finish();
    } catch {
      finish();
    }
  });
}

// ---------------------------------------------------------------------------
// http / sse transport
// ---------------------------------------------------------------------------

async function probeHttp(server, transport, timeoutMs, startedAt) {
  const urlText = typeof server.url === 'string' ? server.url.trim() : '';
  if (!urlText) {
    return failure(transport, startedAt, `${transport} transport requires a non-empty "url"`);
  }
  let url;
  try {
    url = new URL(urlText);
  } catch (error) {
    return failure(transport, startedAt, `Invalid MCP url ${JSON.stringify(urlText)}: ${errorMessage(error)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failure(transport, startedAt, `Unsupported url protocol "${url.protocol}": expected http: or https:`);
  }

  const deadline = startedAt + timeoutMs;
  const remaining = () => deadline - Date.now();
  const baseHeaders = buildHttpHeaders(server.headers);

  let result;
  try {
    const initializeResponse = await postRpc(url.href, baseHeaders, initializeParams(1), remaining(), 'initialize', timeoutMs);
    const serverInfo = extractServerInfo(initializeResponse.message);

    const listHeaders = { ...baseHeaders };
    if (initializeResponse.sessionId) setHeader(listHeaders, 'mcp-session-id', initializeResponse.sessionId);
    setHeader(listHeaders, 'mcp-protocol-version', PROTOCOL_VERSION);
    const listResponse = await postRpc(
      url.href,
      listHeaders,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      remaining(),
      'tools/list',
      timeoutMs,
    );
    const tools = extractToolNames(listResponse.message);

    result = { ok: true, transport, tools, toolCount: tools.length };
    if (Object.keys(serverInfo).length > 0) result.serverInfo = serverInfo;
  } catch (error) {
    result = { ok: false, transport, error: errorMessage(error) };
  }

  result.latencyMs = Date.now() - startedAt;
  return result;
}

async function postRpc(url, headers, payload, remainingMs, label, configuredTimeoutMs) {
  if (remainingMs <= 0) throw timeoutError(label, configuredTimeoutMs);
  const signal = AbortSignal.timeout(remainingMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw timeoutError(label, configuredTimeoutMs);
    throw new Error(`Failed to reach MCP endpoint: ${errorMessage(error)}`);
  }

  const sessionId = response.headers.get('mcp-session-id');
  if (!response.ok) {
    let body = '';
    try {
      body = (await response.text()).slice(0, 300);
    } catch {
      body = '';
    }
    const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    throw new Error(`${status} from MCP endpoint${body ? `: ${body}` : ''}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  let message;
  if (contentType.includes('text/event-stream')) {
    message = await readSseMessage(response, payload.id, label, configuredTimeoutMs);
  } else {
    let text;
    try {
      text = await response.text();
    } catch (error) {
      if (isAbortError(error)) throw timeoutError(label, configuredTimeoutMs);
      throw new Error(`Failed to read MCP ${label} response: ${errorMessage(error)}`);
    }
    message = extractMessageFromText(text, payload.id, label);
  }
  return { message, sessionId };
}

async function readSseMessage(response, id, label, configuredTimeoutMs) {
  if (!response.body) throw new Error(`MCP endpoint returned no body for the ${label} request`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (isAbortError(error)) throw timeoutError(label, configuredTimeoutMs);
        throw new Error(`Failed to read MCP ${label} event stream: ${errorMessage(error)}`);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const message = extractMessageFromSseEvent(rawEvent, id);
        if (message !== undefined) return message;
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore: the stream may already be closed/aborted
    }
  }

  buffer = buffer.replace(/\r\n/g, '\n').trim();
  if (buffer.length > 0) {
    const message = extractMessageFromSseEvent(buffer, id);
    if (message !== undefined) return message;
  }
  throw new Error(`MCP endpoint closed the ${label} event stream without a JSON-RPC response`);
}

function extractMessageFromSseEvent(rawEvent, id) {
  const dataLines = [];
  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (dataLines.length === 0) return undefined;
  const payloadText = dataLines.join('\n').trim();
  if (payloadText.length === 0) return undefined;
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return undefined;
  }
  return pickRpcMessage(payload, id);
}

function extractMessageFromText(text, id, label) {
  const trimmed = (text || '').trim();
  if (trimmed.length === 0) throw new Error(`MCP endpoint returned an empty ${label} response`);

  let payload;
  let parsed = false;
  try {
    payload = JSON.parse(trimmed);
    parsed = true;
  } catch {
    parsed = false;
  }

  if (parsed) {
    const message = pickRpcMessage(payload, id);
    if (message === undefined) {
      throw new Error(`MCP endpoint ${label} response did not contain a JSON-RPC result with id ${JSON.stringify(id)}`);
    }
    return message;
  }

  // Not plain JSON: tolerate servers that answer with SSE framing anyway.
  const events = trimmed.replace(/\r\n/g, '\n').split('\n\n');
  for (const event of events) {
    const message = extractMessageFromSseEvent(event, id);
    if (message !== undefined) return message;
  }
  throw new Error(`MCP endpoint returned a non-JSON ${label} response: ${trimmed.slice(0, 200)}`);
}

function pickRpcMessage(payload, id) {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    if (candidate.id === undefined || normalizeId(candidate.id) !== normalizeId(id)) continue;
    if (candidate.error) throw new Error(formatRpcError(candidate.error));
    return candidate.result && typeof candidate.result === 'object' ? candidate.result : {};
  }
  return undefined;
}
