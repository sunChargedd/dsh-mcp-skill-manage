/**
 * Market adapter tests: normalized search results, skill bundle download + tree
 * picking, MCP install planning, and error handling. Network is fully faked.
 *
 * Run: node scripts/test-market.mjs
 */
import assert from 'node:assert/strict';
import {
  fetchSkillBundle,
  mcpInstallPlan,
  normalizeRegistryEntry,
  pickSkillBundle,
  sanitizeMcpName,
  searchMcpRegistry,
  searchSkillMarket,
} from '../lib/market.js';

const jsonResponse = (value) => ({
  ok: true,
  status: 200,
  json: async () => value,
});

const textResponse = (text) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});

const tree = {
  tree: [
    { path: 'skills/pdf/SKILL.md', type: 'blob', size: 100 },
    { path: 'skills/pdf/scripts/render.py', type: 'blob', size: 200 },
    { path: 'skills/pdf/assets/sample.txt', type: 'blob', size: 50 },
    { path: 'skills/docx/SKILL.md', type: 'blob', size: 80 },
    { path: 'README.md', type: 'blob', size: 10 },
  ],
};

const calls = [];

/** Router for every fake request the adapters make. */
const fakeFetch = async (url) => {
  calls.push(String(url));
  if (url.startsWith('https://skills.sh/api/search')) {
    return jsonResponse({
      skills: [
        { id: 'anthropics/skills/pdf', source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 12 },
        { id: 'acme/skills/noop', source: 'acme/skills', skillId: 'noop', name: 'noop' },
        { id: 'broken' },
      ],
    });
  }
  if (url === 'https://api.github.com/repos/anthropics/skills') {
    return jsonResponse({ default_branch: 'main' });
  }
  if (url.startsWith('https://api.github.com/repos/anthropics/skills/git/trees/main')) {
    return jsonResponse(tree);
  }
  if (url.startsWith('https://raw.githubusercontent.com/anthropics/skills/main/')) {
    return textResponse(`content of ${url.split('/main/')[1]}`);
  }
  if (url.startsWith('https://registry.modelcontextprotocol.io/v0/servers')) {
    return jsonResponse({
      servers: [
        {
          server: {
            name: 'io.acme/remote',
            title: 'Remote',
            description: 'A remote MCP server',
            version: '1.0.0',
            remotes: [{ type: 'streamable-http', url: 'https://mcp.acme.test/mcp' }],
          },
        },
        {
          server: {
            name: 'io.acme/std',
            title: 'Stdio',
            description: 'A stdio MCP server',
            version: '2.1.0',
            packages: [
              {
                registryType: 'npm',
                identifier: '@acme/mcp',
                version: '2.1.0',
                runtimeHint: 'npx',
                runtimeArguments: [{ type: 'positional', value: '-y' }],
                environmentVariables: [
                  { name: 'API_TOKEN', isRequired: true, isSecret: true },
                  { name: 'MODE', default: 'safe' },
                ],
              },
            ],
          },
        },
      ],
    });
  }
  throw new Error(`unexpected fake fetch: ${url}`);
};

// --- skills.sh search --------------------------------------------------------
const skillSearch = await searchSkillMarket('pdf', { fetchImpl: fakeFetch, limit: 5 });
assert.equal(skillSearch.results.length, 2, 'entries without source/skillId are dropped');
assert.deepEqual(skillSearch.results[0], {
  id: 'anthropics/skills/pdf',
  source: 'anthropics/skills',
  skillId: 'pdf',
  name: 'pdf',
  installs: 12,
});
await assert.rejects(() => searchSkillMarket('p', { fetchImpl: fakeFetch }), /at least 2 characters/);
console.log('ok - skill market search normalizes results');

// --- skill bundle download --------------------------------------------------
const bundle = await fetchSkillBundle({ source: 'anthropics/skills', skillId: 'pdf' }, { fetchImpl: fakeFetch });
assert.deepEqual(
  bundle.entries.map((entry) => entry.name),
  ['pdf/SKILL.md', 'pdf/scripts/render.py', 'pdf/assets/sample.txt'],
);
assert.equal(bundle.entries[0].data.toString(), 'content of skills/pdf/SKILL.md');
assert.equal(bundle.dir, 'skills/pdf');
await assert.rejects(
  () => fetchSkillBundle({ source: 'anthropics/skills', skillId: 'missing' }, { fetchImpl: fakeFetch }),
  /was not found/,
);
await assert.rejects(() => fetchSkillBundle({ source: 'not-a-repo', skillId: 'x' }, { fetchImpl: fakeFetch }), /Invalid skill repository/);
console.log('ok - skill bundles are selected from the GitHub tree and downloaded');

// --- tree picking edge cases ------------------------------------------------
assert.equal(pickSkillBundle({ tree: [{ path: 'SKILL.md', type: 'blob' }] }, 'acme/root-skill', 'root-skill').dir, '');
assert.deepEqual(
  pickSkillBundle(tree, 'anthropics/skills', 'docx').files.map((file) => file.path),
  ['skills/docx/SKILL.md'],
);
console.log('ok - tree picking handles root-level and nested skills');

// --- MCP registry dedup + curated fallback ---------------------------------
const dedupeCalls = [];
const dedupeFetch = async (url) => {
  dedupeCalls.push(String(url));
  return jsonResponse({
    servers: [
      { server: { name: 'io.acme/one', title: 'One', version: '1.0.0', remotes: [{ type: 'streamable-http', url: 'https://one.test/mcp' }] }, _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: false } } },
      { server: { name: 'io.acme/one', title: 'One', version: '2.0.0', remotes: [{ type: 'streamable-http', url: 'https://one.test/mcp' }] }, _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: true } } },
      { server: { name: 'io.acme/two', title: 'Two', version: '0.1.0', remotes: [{ type: 'streamable-http', url: 'https://two.test/mcp' }] }, _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: true } } },
    ],
  });
};
const deduped = await searchMcpRegistry('acme', { fetchImpl: dedupeFetch, limit: 5 });
assert.deepEqual(deduped.results.map((entry) => entry.version), ['2.0.0', '0.1.0']);
assert.equal(dedupeCalls.length, 1, 'a single unfiltered registry request is enough');
console.log('ok - MCP registry keeps the newest entry per server name');

const offline = await searchMcpRegistry('context7', {
  fetchImpl: async () => {
    throw new Error('offline');
  },
  limit: 5,
});
assert.equal(offline.fallback, true);
assert.ok(offline.results.some((entry) => entry.name === 'context7'));
console.log('ok - MCP search falls back to the curated list when the registry is offline');

// --- MCP registry search + install planning --------------------------------
const mcpSearch = await searchMcpRegistry('acme', { fetchImpl: fakeFetch, limit: 5 });
assert.equal(mcpSearch.results.length, 2);
assert.deepEqual(mcpSearch.results.map((entry) => entry.name), ['io.acme/remote', 'io.acme/std']);
const remotePlan = mcpInstallPlan(mcpSearch.results[0]);
assert.equal(remotePlan.server.transport, 'http');
assert.equal(remotePlan.server.url, 'https://mcp.acme.test/mcp');
const stdioPlan = mcpInstallPlan(mcpSearch.results[1]);
assert.equal(stdioPlan.server.transport, 'stdio');
assert.equal(stdioPlan.server.command, 'npx');
assert.deepEqual(stdioPlan.server.args, ['-y', '@acme/mcp@2.1.0']);
assert.deepEqual(stdioPlan.server.env, { API_TOKEN: '', MODE: 'safe' });
assert.deepEqual(stdioPlan.warnings, ['Set API_TOKEN before connecting.']);
assert.equal(sanitizeMcpName('io.acme/remote'), 'acme-remote');
assert.throws(
  () => mcpInstallPlan({ name: 'x', title: 'x', remotes: [], packages: [{ registryType: 'oci', identifier: 'image' }] }),
  /no npm\/pypi package/,
);
const normalized = normalizeRegistryEntry({ name: 'io.x/y' });
assert.equal(normalized.name, 'io.x/y');
assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized, 'normalized entries contain no undefined values');
console.log('ok - MCP registry results map to stdio or http install plans');

console.log(`\nsummary: ${calls.length} fake requests, 6 groups passed`);
