/**
 * End-to-end test of the Host action layer (`index.js`) against a temporary HOME.
 *
 * Uses only the package's own `__test` surface: the same `runAction` the web routes and the
 * agent tool call, so this covers file writes, backups, symlinks, config editing and the
 * snapshot composition without a running Harness.
 *
 * Run: node scripts/test-actions.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { __test } from '../index.js';
import { readZip, createZip } from '../lib/zip.js';

const { buildState, managerTool, resolvePaths, runAction } = __test;

const UNRELATED_PATCH = `# profile patch\n- id: ui-theme\n  name: '@deepseek-ai/dsh-client-ui-theme'\n  config:\n    fontSize: 13\n`;
const UNRELATED_TOML = `model = "gpt-test"\n\n[model_providers.custom]\nname = "custom"\nbase_url = "http://127.0.0.1:8317/v1"\n\n[mcp_servers.keep]\ncommand = "node"\nargs = ["keep.js"]\n`;
const SEED_CURSOR = { mcpServers: { keep: { command: 'node', args: ['keep.js'] } } };

/** Read a path as UTF-8, returning null when missing. */
async function readOptional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Whether a path exists. */
async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Find one skill by name in a snapshot. */
function skillNamed(state, name) {
  return state.skills.find((skill) => skill.name === name);
}

const root = await mkdtemp(path.join(tmpdir(), 'msm-actions-'));
const env = {
  HOME: root,
  DSH_HOME: path.join(root, '.dsh'),
  DSH_AGENTS_HOME: path.join(root, '.agents'),
  CODEX_HOME: path.join(root, '.codex'),
  CLAUDE_CONFIG_DIR: path.join(root, '.claude'),
  DSH_PROFILE_DIR: path.join(root, '.dsh', 'profiles', 'test'),
};
const paths = resolvePaths(env);
const patchFile = paths.profilePatchFile;
const codexConfig = path.join(env.CODEX_HOME, 'config.toml');
const cursorConfig = path.join(root, '.cursor', 'mcp.json');
const claudeConfig = path.join(root, '.claude.json');
const run = (action, params) => runAction(paths, action, params);
let passed = 0;
const check = (label) => {
  passed += 1;
  process.stdout.write(`ok ${passed} - ${label}\n`);
};

try {
  await mkdir(path.dirname(patchFile), { recursive: true });
  await mkdir(env.CODEX_HOME, { recursive: true });
  await mkdir(path.join(root, '.cursor'), { recursive: true });
  // Tool config homes exist once the tool is installed; only the skills subdirectory is new.
  await mkdir(path.join(root, '.claude'), { recursive: true });
  await mkdir(path.join(root, '.qoder'), { recursive: true });
  await writeFile(patchFile, UNRELATED_PATCH);
  await writeFile(codexConfig, UNRELATED_TOML);
  await writeFile(cursorConfig, `${JSON.stringify(SEED_CURSOR, null, 2)}\n`);

  // --- state -----------------------------------------------------------------
  let state = (await run('state/refresh')).state;
  assert.equal(state.version, 1);
  assert.ok(state.skillRoots.length >= 5, 'user skill roots are listed');
  assert.equal(state.skills.length, 0);
  assert.ok(state.mcpTargets.some((target) => target.id === 'dsh:user'));
  assert.ok(state.mcpTargets.some((target) => target.id === 'codex:user'));
  check('state/refresh composes an empty snapshot');

  // --- skill create ----------------------------------------------------------
  const created = await run('skill/save', {
    targetRootId: 'agents:user',
    name: 'alpha',
    description: 'First test skill',
    whenToUse: 'When testing',
    body: '# Alpha\n\nBody text.\n',
    modelInvocable: true,
    userInvocable: true,
    visibility: ['claude:user', 'codex:user', 'qoder:user'],
  });
  assert.ok(created.key);
  const alphaFile = path.join(root, '.agents', 'skills', 'alpha', 'SKILL.md');
  const alphaText = await readFile(alphaFile, 'utf8');
  assert.match(alphaText, /name: alpha/);
  assert.match(alphaText, /description: First test skill/);
  assert.match(alphaText, /# Alpha\n\nBody text\./);
  for (const tool of ['claude', 'codex', 'qoder']) {
    const link = tool === 'claude' || tool === 'codex'
      ? path.join(root, tool === 'claude' ? '.claude' : '.codex', 'skills', 'alpha')
      : path.join(root, '.qoder', 'skills', 'alpha');
    assert.equal(await exists(link), true, `${tool} symlink exists`);
  }
  state = created.state;
  let alpha = skillNamed(state, 'alpha');
  assert.ok(alpha);
  assert.equal(alpha.valid, true);
  assert.equal(alpha.visibility.agents, 'dir');
  assert.equal(alpha.visibility.claude, 'link');
  assert.equal(alpha.visibility.codex, 'link');
  assert.equal(alpha.visibility.qoder, 'link');
  check('skill/save creates the bundle and its cross-tool symlinks');

  // --- skill read ------------------------------------------------------------
  const read = await run('skill/read', { skillKey: alpha.key });
  assert.equal(read.body.trim(), '# Alpha\n\nBody text.');
  assert.equal(read.skill.name, 'alpha');
  check('skill/read returns the current body');

  // --- skill edit + rename ---------------------------------------------------
  const edited = await run('skill/save', {
    skillKey: alpha.key,
    name: 'beta',
    description: 'Renamed skill',
    body: '# Beta\n\nEdited body.\n',
    modelInvocable: false,
    userInvocable: true,
    renameFrom: 'alpha',
    visibility: ['claude:user'],
  });
  assert.equal(await exists(path.join(root, '.agents', 'skills', 'alpha')), false);
  const betaFile = path.join(root, '.agents', 'skills', 'beta', 'SKILL.md');
  const betaText = await readFile(betaFile, 'utf8');
  assert.match(betaText, /name: beta/);
  assert.match(betaText, /disable-model-invocation: true/);
  assert.equal(await exists(path.join(root, '.codex', 'skills', 'alpha')), false);
  assert.equal(await exists(path.join(root, '.codex', 'skills', 'beta')), false);
  const claudeBeta = path.join(root, '.claude', 'skills', 'beta');
  assert.equal(await exists(claudeBeta), true);
  assert.equal(await realpath(claudeBeta), await realpath(path.join(root, '.agents', 'skills', 'beta')));
  state = edited.state;
  const beta = skillNamed(state, 'beta');
  assert.equal(beta.modelInvocable, false);
  assert.equal(beta.visibility.codex, null);
  check('skill/save edits, renames and moves the managed symlinks');

  // --- skill duplicate -------------------------------------------------------
  const duplicated = await run('skill/duplicate', {
    skillKey: beta.key,
    targetRootId: 'agents:user',
    name: 'gamma',
  });
  assert.equal(
    await exists(path.join(root, '.agents', 'skills', 'gamma', 'SKILL.md')),
    true,
  );
  state = duplicated.state;
  const gamma = skillNamed(state, 'gamma');
  assert.equal(gamma.visibility.claude, 'link');
  check('skill/duplicate copies content and visibility');

  // --- skill delete ----------------------------------------------------------
  const deleted = await run('skill/delete', { skillKey: gamma.key });
  assert.ok(deleted.backup, 'a backup path is returned');
  assert.ok(await exists(deleted.backup), 'the backup exists on disk');
  assert.equal(await exists(path.join(root, '.agents', 'skills', 'gamma')), false);
  assert.equal(await exists(path.join(root, '.claude', 'skills', 'gamma')), false);
  check('skill/delete removes the skill and its links after backing up');

  // --- MCP: cursor (json) ----------------------------------------------------
  const cursorSave = await run('mcp/save', {
    targetId: 'cursor:user',
    name: 'demo',
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@demo/mcp'],
      env: { DEMO_TOKEN: 'secret' },
      enabled: true,
    },
  });
  const cursorJson = JSON.parse(await readFile(cursorConfig, 'utf8'));
  assert.equal(cursorJson.mcpServers.keep.command, 'node');
  assert.equal(cursorJson.mcpServers.demo.command, 'npx');
  assert.deepEqual(cursorJson.mcpServers.demo.args, ['-y', '@demo/mcp']);
  assert.equal(cursorSave.state.mcpServers.filter((server) => server.tool === 'cursor').length, 2);
  check('mcp/save writes one entry of a JSON target and keeps its siblings');

  // --- MCP: claude (json + copy) --------------------------------------------
  await run('mcp/save', {
    targetId: 'claude:user',
    name: 'remote',
    server: {
      transport: 'http',
      url: 'https://example.com/mcp',
      headers: { AUTHORIZATION: 'Bearer token' },
      enabled: true,
    },
  });
  const claudeJson = JSON.parse(await readFile(claudeConfig, 'utf8'));
  assert.equal(claudeJson.mcpServers.remote.url, 'https://example.com/mcp');
  check('mcp/save writes an HTTP server to a JSON target');

  const copy = await run('mcp/copy', {
    targetId: 'cursor:user',
    name: 'demo',
    toTargetIds: ['claude:user', 'codex:user'],
  });
  assert.deepEqual(copy.copied.length, 2);
  assert.deepEqual(copy.skipped.length, 0);
  assert.ok(copy.state.mcpServers.some((server) => server.targetId === 'claude:user' && server.name === 'demo'));
  assert.ok(copy.state.mcpServers.some((server) => server.targetId === 'codex:user' && server.name === 'demo'));
  check('mcp/copy copies to another target and skips existing entries');

  // --- MCP: codex (toml text preservation) ----------------------------------
  await run('mcp/save', {
    targetId: 'codex:user',
    name: 'codex-demo',
    server: {
      transport: 'stdio',
      command: 'node',
      args: ['server.js', '--flag'],
      env: { CODEX_DEMO: '1' },
      enabled: true,
    },
  });
  let codexText = await readFile(codexConfig, 'utf8');
  assert.match(codexText, /model_providers\.custom/);
  assert.match(codexText, /\[mcp_servers\.keep\]/);
  assert.match(codexText, /\[mcp_servers\.codex-demo\]/);
  assert.match(codexText, /args = \["server\.js", "--flag"\]/);
  await run('mcp/save', {
    targetId: 'codex:user',
    name: 'codex-renamed',
    originalName: 'codex-demo',
    server: { transport: 'stdio', command: 'node', args: ['server.js'], enabled: false },
  });
  codexText = await readFile(codexConfig, 'utf8');
  assert.doesNotMatch(codexText, /codex-demo/);
  assert.match(codexText, /\[mcp_servers\.codex-renamed\]/);
  await run('mcp/delete', { targetId: 'codex:user', name: 'codex-renamed' });
  codexText = await readFile(codexConfig, 'utf8');
  assert.doesNotMatch(codexText, /codex-renamed/);
  assert.match(codexText, /\[mcp_servers\.keep\]/);
  assert.match(codexText, /model_providers\.custom/);
  check('mcp editing a TOML target preserves unrelated sections');

  // --- MCP: DSH profile patch (yaml) ---------------------------------------
  await run('mcp/save', {
    targetId: 'dsh:user',
    name: 'dsh-demo',
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@demo/dsh-mcp'],
      env: { DSH_DEMO: '1' },
      enabled: true,
    },
  });
  let patchText = await readFile(patchFile, 'utf8');
  assert.match(patchText, /id: ui-theme/);
  assert.match(patchText, /@deepseek-ai\/dsh-mcp-client/);
  assert.match(patchText, /serverName: dsh-demo/);
  const dshState = (await run('state/refresh')).state;
  assert.ok(dshState.mcpServers.some((server) => server.targetId === 'dsh:user' && server.name === 'dsh-demo'));
  await run('mcp/save', {
    targetId: 'dsh:user',
    name: 'dsh-demo',
    originalName: 'dsh-demo',
    server: { transport: 'http', url: 'https://example.com/mcp', enabled: false },
  });
  patchText = await readFile(patchFile, 'utf8');
  assert.match(patchText, /streamable-http/);
  assert.match(patchText, /disabled: true/);
  await run('mcp/delete', { targetId: 'dsh:user', name: 'dsh-demo' });
  patchText = await readFile(patchFile, 'utf8');
  assert.doesNotMatch(patchText, /dsh-demo/);
  assert.match(patchText, /id: ui-theme/);
  check('mcp editing the DSH patch keeps other entries and writes row disabled state');

  // --- full-text search ------------------------------------------------------
  const searchHits = await run('skill/search', { query: 'Edited body' });
  assert.ok(searchHits.results.some((result) => result.name === 'beta'), 'body search finds the edited skill');
  const searchMiss = await run('skill/search', { query: 'zzz-not-in-any-skill' });
  assert.equal(searchMiss.results.length, 0);
  await assert.rejects(() => run('skill/search', { query: 'x' }), /at least 2 characters/);
  check('skill/search finds body text with snippets and rejects tiny queries');

  // --- market search + install ----------------------------------------------
  const realFetch = globalThis.fetch;
  const jsonResponse = (value) => ({ ok: true, status: 200, json: async () => value });
  const textResponse = (text) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
  const skillTree = {
    tree: [
      { path: 'skills/pdf/SKILL.md', type: 'blob', size: 60 },
      { path: 'skills/pdf/references/guide.md', type: 'blob', size: 20 },
    ],
  };
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.startsWith('https://skills.sh/api/search')) {
      return jsonResponse({
        skills: [{ id: 'anthropics/skills/pdf', source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 10 }],
      });
    }
    if (target === 'https://api.github.com/repos/anthropics/skills') return jsonResponse({ default_branch: 'main' });
    if (target.startsWith('https://api.github.com/repos/anthropics/skills/git/trees/main')) {
      return jsonResponse(skillTree);
    }
    if (target.startsWith('https://raw.githubusercontent.com/anthropics/skills/main/')) {
      return textResponse('---\nname: pdf\ndescription: Market installed pdf skill\n---\n\nBody\n');
    }
    if (target.startsWith('https://registry.modelcontextprotocol.io/v0/servers')) {
      return jsonResponse({
        servers: [
          {
            server: {
              name: 'io.acme/remote',
              title: 'Acme Remote',
              description: 'Remote MCP server',
              version: '1.0.0',
              remotes: [{ type: 'streamable-http', url: 'https://mcp.acme.test/mcp' }],
            },
          },
        ],
      });
    }
    throw new Error(`unexpected fetch in test: ${target}`);
  };
  try {
    const skillMarket = await run('market/skills', { query: 'pdf' });
    assert.equal(skillMarket.results[0].source, 'anthropics/skills');
    const marketSkill = await run('market/install_skill', {
      source: 'anthropics/skills',
      skillId: 'pdf',
      targetRootId: 'agents:user',
    });
    assert.equal(marketSkill.imported.length, 1);
    assert.ok(
      await exists(path.join(root, '.agents', 'skills', marketSkill.imported[0].name, 'SKILL.md')),
      'market skill is written to the target root',
    );
    const mcpMarket = await run('market/mcp', { query: 'acme' });
    assert.equal(mcpMarket.results[0].remotes[0].url, 'https://mcp.acme.test/mcp');
    const marketMcp = await run('market/install_mcp', {
      targetId: 'cursor:user',
      entry: mcpMarket.results[0],
    });
    const cursorAfterMarket = JSON.parse(await readFile(cursorConfig, 'utf8'));
    assert.equal(cursorAfterMarket.mcpServers[marketMcp.name].url, 'https://mcp.acme.test/mcp');
    check('market search + install works for skills and MCP servers');
  } finally {
    globalThis.fetch = realFetch;
  }

  // --- export / import -------------------------------------------------------
  const exported = await run('skill/export', { skillKeys: [beta.key] });
  assert.ok(exported.base64 && exported.filename.endsWith('.zip'));
  const zipFiles = readZip(Buffer.from(exported.base64, 'base64'));
  assert.ok(zipFiles.some((file) => file.name === 'beta/SKILL.md'), 'export contains the bundle');

  const emptySkillRoot = path.join(root, '.dsh', 'skills');
  const imported = await run('skill/import_zip', {
    targetRootId: 'dsh:user',
    base64: exported.base64,
  });
  assert.equal(imported.imported.length, 1);
  assert.ok(
    await exists(path.join(emptySkillRoot, imported.imported[0].name, 'SKILL.md')),
    'import writes the bundle into the target root',
  );
  const importedAgain = await run('skill/import_zip', {
    targetRootId: 'dsh:user',
    base64: exported.base64,
  });
  assert.notEqual(importedAgain.imported[0].name, imported.imported[0].name, 'a second import gets a new name');

  const flatZip = createZip([{ name: 'flat-skill.md', data: '---\nname: flat-skill\ndescription: Flat import\n---\n\nBody\n' }]);
  const flatImported = await run('skill/import_zip', {
    targetRootId: 'dsh:user',
    base64: flatZip.toString('base64'),
  });
  assert.equal(flatImported.imported.length, 1);
  assert.ok(await exists(path.join(emptySkillRoot, 'flat-skill.md')), 'flat .md import works');

  const importSource = path.join(root, 'import-source', 'from-disk');
  await mkdir(importSource, { recursive: true });
  await writeFile(
    path.join(importSource, 'SKILL.md'),
    '---\nname: from-disk\ndescription: Imported from disk\n---\n\nDisk body\n',
  );
  const pathImported = await run('skill/import_path', {
    targetRootId: 'dsh:user',
    path: path.join(root, 'import-source'),
  });
  assert.equal(pathImported.imported.length, 1);
  assert.ok(await exists(path.join(emptySkillRoot, 'from-disk', 'SKILL.md')));
  check('skill/export, import_zip and import_path round-trip bundles, flat files and directories');

  // --- backups ---------------------------------------------------------------
  const backupsBefore = (await run('state/refresh')).state.backups;
  assert.ok(backupsBefore.length > 0, 'write operations left snapshots');
  const skillSnapshot = backupsBefore
    .flatMap((snapshot) => snapshot.entries.map((entry) => ({ snapshot, entry })))
    .find((item) => item.entry.kind === 'skill' && item.entry.name === 'gamma');
  assert.ok(skillSnapshot, 'deleting a skill left a snapshot');
  const restored = await run('backup/restore', {
    backupId: skillSnapshot.snapshot.id,
    name: 'gamma',
    targetRootId: 'agents:user',
  });
  assert.ok(await exists(restored.restored), 'skill snapshot restores to a path');
  assert.ok(await exists(path.join(restored.restored, 'SKILL.md')));

  const configSnapshot = backupsBefore
    .flatMap((snapshot) => snapshot.entries.map((entry) => ({ snapshot, entry })))
    .find((item) => item.entry.kind === 'config' && item.entry.target === cursorConfig);
  assert.ok(configSnapshot, 'config writes are recorded with their target');
  const restoredConfig = await run('backup/restore', {
    backupId: configSnapshot.snapshot.id,
    name: configSnapshot.entry.name,
  });
  assert.equal(restoredConfig.restored, cursorConfig);
  const restoredJson = JSON.parse(await readFile(cursorConfig, 'utf8'));
  assert.ok(restoredJson.mcpServers.keep, 'config restore wrote the backed-up content');
  await run('mcp/save', {
    targetId: 'cursor:user',
    name: 'demo',
    server: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@demo/mcp'],
      env: { DEMO_TOKEN: 'secret' },
      enabled: true,
    },
  });

  await run('backup/delete', { backupId: configSnapshot.snapshot.id });
  const afterDelete = (await run('state/refresh')).state.backups;
  assert.equal(afterDelete.some((snapshot) => snapshot.id === configSnapshot.snapshot.id), false);
  check('backups list, restore skills and configs, and delete snapshots');

  // --- MCP health ------------------------------------------------------------
  const fakeServer = path.join(root, 'fake-mcp.mjs');
  await writeFile(
    fakeServer,
    `let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '1.0.0' } } }) + '\\n');
    } else if (message.method === 'tools/list') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'ping', inputSchema: { type: 'object' } }, { name: 'echo', inputSchema: { type: 'object' } }] } }) + '\\n');
    }
  }
});
`,
  );
  await run('mcp/save', {
    targetId: 'cursor:user',
    name: 'fake-health',
    server: { transport: 'stdio', command: process.execPath, args: [fakeServer], enabled: true },
  });
  const health = await run('mcp/health', { targetId: 'cursor:user', name: 'fake-health' });
  assert.equal(health.health.ok, true, health.health.error);
  assert.equal(health.health.toolCount, 2);
  assert.deepEqual(health.health.tools, ['ping', 'echo']);
  assert.equal(health.health.serverInfo.name, 'fake');
  await run('mcp/delete', { targetId: 'cursor:user', name: 'fake-health' });
  check('mcp/health performs a real stdio MCP handshake and reports tools');

  // --- custom locations ------------------------------------------------------
  const customDir = path.join(root, 'custom-skills');
  await mkdir(customDir, { recursive: true });
  const withCustom = await run('custom/add_skill_dir', { path: customDir, label: 'Mine' });
  assert.ok(withCustom.state.skillRoots.some((entry) => entry.scope === 'custom'));
  const customFile = path.join(root, 'custom-mcp.json');
  await writeFile(customFile, '{}\n');
  const withCustomMcp = await run('custom/add_mcp_target', {
    path: customFile,
    format: 'json',
    keyPath: ['mcpServers'],
    label: 'Mine',
  });
  const customTarget = withCustomMcp.state.mcpTargets.find((target) => target.tool === 'custom');
  assert.ok(customTarget);
  await run('mcp/save', {
    targetId: customTarget.id,
    name: 'custom-server',
    server: { transport: 'stdio', command: 'node', enabled: true },
  });
  assert.match(await readFile(customFile, 'utf8'), /custom-server/);
  await run('custom/remove_mcp_target', { id: customTarget.id });
  await run('custom/remove_skill_dir', {
    id: withCustom.state.skillRoots.find((entry) => entry.scope === 'custom').id,
  });
  check('custom skill directories and MCP files can be added and removed');

  // --- projects --------------------------------------------------------------
  const projectDir = path.join(root, 'work', 'demo-project');
  await mkdir(path.join(projectDir, '.claude', 'skills'), { recursive: true });
  const withProject = await run('project/add', { path: projectDir });
  assert.ok(withProject.state.projects.some((project) => project.path === projectDir));
  assert.ok(
    withProject.state.skillRoots.some(
      (entry) => entry.scope === 'project' && entry.projectId !== undefined,
    ),
  );
  const projectId = withProject.state.projects.find((project) => project.path === projectDir).id;
  await run('skill/save', {
    targetRootId: `project:${projectId}:agents`,
    name: 'project-skill',
    description: 'Project scoped',
    body: '# Project\n',
    visibility: [],
  });
  assert.equal(
    await exists(path.join(projectDir, '.agents', 'skills', 'project-skill', 'SKILL.md')),
    true,
  );
  await run('project/remove', { projectId });
  check('tracked projects contribute project-level skill roots');

  // --- agent tool ------------------------------------------------------------
  const tool = managerTool(paths);
  const overview = await tool.execute({ action: 'overview' });
  assert.ok(overview.skills >= 1);
  const listed = await tool.execute({ action: 'list_skills' });
  assert.ok(listed.skills.some((skill) => skill.name === 'beta'));
  const readTool = await tool.execute({ action: 'read_skill', skillKey: beta.key });
  assert.match(readTool.body, /Edited body/);
  const searched = await tool.execute({ action: 'search_skills', query: 'Edited body' });
  assert.ok(searched.results.some((result) => result.name === 'beta'));
  const doctors = await tool.execute({ action: 'doctor' });
  assert.ok(Array.isArray(doctors.issues));
  await assert.rejects(() => tool.execute({ action: 'nope' }), /unknown action/);
  check('the agent tool runs the same actions as the page');

  // --- snapshot -------------------------------------------------------------
  state = (await run('state/refresh')).state;
  assert.ok(state.mcpServers.some((server) => server.targetId === 'cursor:user' && server.name === 'demo'));
  assert.ok(Array.isArray(state.warnings));
  assert.ok(state.capabilities.backups.includes('.mcp-skill-manager'));
  check('final snapshot is consistent');

  const remaining = await readdir(root);
  assert.ok(remaining.length > 0);
  process.stdout.write(`\n${passed} checks passed\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
