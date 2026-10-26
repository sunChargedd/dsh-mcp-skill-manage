/**
 * MCP & Skill Manager — Host half.
 *
 * One operation surface shared by two callers (see references/user-actions.md):
 *  - the browser page calls the two web routes below (`state` read + `action` dispatch);
 *  - the agent calls the `mcp_skill_manager` tool, which dispatches to the same service functions.
 *
 * The filesystem data layer lives in `./lib/adapters.js`; this module owns settings,
 * snapshot composition, HTTP lifecycle, the profile-patch reload hint, and the tool.
 *
 * @module dsh-mcp-skill-manage
 */
import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { createZip, readZip } from './lib/zip.js';
import {
  fetchSkillBundle,
  mcpInstallPlan,
  searchMcpRegistry,
  searchSkillMarket,
} from './lib/market.js';
import { probeMcpServer } from './lib/probe.js';
import {
  backupRoot,
  copyMcpServer,
  deleteBackup,
  listBackups,
  restoreBackup,
  deleteMcpServer,
  deleteSkill,
  doctor,
  listMcpServers,
  mcpTargets,
  readSkill,
  resolvePaths,
  revealInFileManager,
  saveMcpServer,
  searchSkillBodies,
  saveSkill,
  scanSkills,
  setSkillVisibility,
  skillRoots,
} from './lib/adapters.js';

/** Route ids owned by this plugin; paths keep the app's relative-URL convention. */
const ROUTE_STATE = '/mcp-skill-manager/state';
const ROUTE_ACTION = '/mcp-skill-manager/action';

/** Request bodies are small JSON documents; anything larger is hostile. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Bump when the persisted settings shape changes. */
const SETTINGS_VERSION = 1;

/** Tool actions accepted by `mcp_skill_manager`. */
const TOOL_ACTIONS = [
  'overview',
  'list_skills',
  'read_skill',
  'save_skill',
  'delete_skill',
  'set_skill_visibility',
  'search_skills',
  'list_mcp',
  'save_mcp',
  'delete_mcp',
  'copy_mcp',
  'list_backups',
  'restore_backup',
  'export_skills',
  'import_skill',
  'mcp_health',
  'market_search_skills',
  'market_install_skill',
  'market_search_mcp',
  'market_install_mcp',
  'doctor',
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Directory this plugin owns below the DSH home. */
function stateDir(paths) {
  return join(paths.dshHome, '.mcp-skill-manager');
}

/** Settings file holding the user's tracked project directories. */
function settingsFile(paths) {
  return join(stateDir(paths), 'settings.json');
}

/** Stable short id for one project path. */
function projectIdOf(projectPath) {
  return createHash('sha1').update(projectPath).digest('hex').slice(0, 10);
}

/** Normalize one persisted project entry, or `undefined` when it is malformed. */
function normalizeProject(entry) {
  if (entry === null || typeof entry !== 'object') return undefined;
  if (typeof entry.path !== 'string' || !isAbsolute(entry.path)) return undefined;
  const projectPath = resolve(entry.path);
  return { id: projectIdOf(projectPath), path: projectPath };
}

/** Read the settings document; a missing or corrupt file means an empty state. */
async function loadSettings(paths) {
  const empty = { version: SETTINGS_VERSION, projects: [], customSkillDirs: [], customMcpTargets: [] };
  let text;
  try {
    text = await readFile(settingsFile(paths), 'utf8');
  } catch {
    return empty;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty;
  }
  const projects = [];
  const seen = new Set();
  for (const entry of Array.isArray(parsed?.projects) ? parsed.projects : []) {
    const project = normalizeProject(entry);
    if (project === undefined || seen.has(project.path)) continue;
    seen.add(project.path);
    projects.push(project);
  }
  return {
    version: SETTINGS_VERSION,
    projects,
    customSkillDirs: normalizeCustomSkillDirs(parsed?.customSkillDirs),
    customMcpTargets: normalizeCustomMcpTargets(parsed?.customMcpTargets),
  };
}

/** Normalize user-added skill directories. */
function normalizeCustomSkillDirs(entries) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object') continue;
    if (typeof entry.path !== 'string' || !isAbsolute(entry.path)) continue;
    const dirPath = resolve(entry.path);
    if (seen.has(dirPath)) continue;
    seen.add(dirPath);
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : projectIdOf(dirPath);
    result.push({
      id,
      path: dirPath,
      label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : dirPath,
    });
  }
  return result;
}

/** Normalize user-added MCP configuration targets. */
function normalizeCustomMcpTargets(entries) {
  const formats = new Set(['json', 'jsonc', 'toml', 'yaml-patch']);
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object') continue;
    if (typeof entry.path !== 'string' || !isAbsolute(entry.path)) continue;
    if (!formats.has(entry.format)) continue;
    const filePath = resolve(entry.path);
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : projectIdOf(filePath);
    result.push({
      id,
      path: filePath,
      format: entry.format,
      label: typeof entry.label === 'string' && entry.label.length > 0 ? entry.label : filePath,
      keyPath:
        Array.isArray(entry.keyPath) && entry.keyPath.every((key) => typeof key === 'string')
          ? entry.keyPath
          : undefined,
      style: entry.style === 'opencode' ? 'opencode' : undefined,
    });
  }
  return result;
}

/** Persist the settings document atomically. */
async function saveSettings(paths, settings) {
  const file = settingsFile(paths);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(stateDir(paths), { recursive: true });
  await writeFile(
    tmp,
    `${JSON.stringify(
      {
        version: SETTINGS_VERSION,
        projects: settings.projects,
        customSkillDirs: settings.customSkillDirs,
        customMcpTargets: settings.customMcpTargets,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await rename(tmp, file);
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** Whether a directory is writable by this process. */
async function writableDirectory(directory) {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    await access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Keep one entry per location/message; scan and doctor overlap by design. */
function dedupeWarnings(warnings) {
  const seen = new Set();
  const result = [];
  for (const warning of warnings) {
    const key = `${warning.rootId ?? ''}\u0000${warning.path ?? ''}\u0000${warning.message ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(warning);
  }
  return result;
}

/** Caps for skill import/export so a huge archive cannot stall the Host. */
const MAX_EXPORT_BYTES = 24 * 1024 * 1024;
const MAX_IMPORT_BYTES = 24 * 1024 * 1024;

/** Recursively collect files below a directory into zip entries. */
async function collectSkillFiles(dirPath, prefix, out) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(dirPath, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectSkillFiles(absolute, name, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    if (info.size > MAX_EXPORT_BYTES) throw new Error(`Skill file is too large to export: ${absolute}`);
    out.push({ name, data: await readFile(absolute) });
    if (out.length > 500) throw new Error('Skill has too many files to export');
  }
}

/** Copy a directory tree without following symlinks. */
async function copyDirectoryTree(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryTree(from, to);
    } else if (entry.isFile()) {
      await writeFile(to, await readFile(from));
    }
  }
}

/** Base64 of a UTF-8/binary zip buffer. */
function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

/** Rewrite a downloaded name so the browser keeps a sensible filename. */
function exportFileName(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${stamp}.zip`;
}

/** Find a free directory/file name in a skill root. */
function freeSkillName(rootPath, name) {
  const taken = (candidate) =>
    existsSync(join(rootPath, candidate)) || existsSync(join(rootPath, `${candidate}.md`));
  let candidate = name;
  let index = 1;
  while (taken(candidate)) {
    index += 1;
    candidate = `${name}-imported${index > 2 ? `-${index}` : ''}`;
  }
  return candidate;
}

/** Group imported zip files into skill bundles and flat skills. */
function groupImportedSkills(files) {
  const bundles = new Map();
  const flat = [];
  for (const file of files) {
    const segments = file.name.split('/');
    const fileName = segments[segments.length - 1];
    if (fileName === 'SKILL.md' && segments.length >= 2) {
      const dir = segments.slice(0, -1).join('/');
      const name = segments[segments.length - 2];
      if (!bundles.has(dir)) bundles.set(dir, { name, dir, files: [] });
      bundles.get(dir).files.push(file);
      continue;
    }
    if (segments.length === 1 && fileName.endsWith('.md')) {
      flat.push({ name: fileName.slice(0, -3), file });
    }
  }
  return { bundles: [...bundles.values()], flat };
}

/** Short-lived cache for market searches (the MCP registry is slow). */
const MARKET_CACHE = new Map();
const MARKET_CACHE_TTL_MS = 5 * 60 * 1000;

/** Memoize one market search for five minutes and cap the cache size. */
async function cachedMarket(key, loader) {
  const hit = MARKET_CACHE.get(key);
  if (hit !== undefined && hit.expiresAt > Date.now()) return hit.value;
  const value = await loader();
  MARKET_CACHE.set(key, { value, expiresAt: Date.now() + MARKET_CACHE_TTL_MS });
  if (MARKET_CACHE.size > 200) {
    const oldest = MARKET_CACHE.keys().next().value;
    if (oldest !== undefined) MARKET_CACHE.delete(oldest);
  }
  return value;
}

/** Cached skills.sh search. */
function marketSkills(query, limit) {
  return cachedMarket(`skills:${limit}:${query.toLowerCase()}`, () => searchSkillMarket(query, { limit }));
}

/** Cached MCP registry search. */
function marketMcp(query, limit) {
  return cachedMarket(`mcp:${limit}:${query.toLowerCase()}`, () => searchMcpRegistry(query, { limit }));
}

/** Compose the complete snapshot the page and the tool read. */
async function buildState(paths, settings) {
  const projects = settings.projects;
  const custom = { skillDirs: settings.customSkillDirs, mcpTargets: settings.customMcpTargets };
  const roots = skillRoots(paths, projects, custom);
  const targets = mcpTargets(paths, projects, custom);
  const [scan, mcp, report, backups, patchWritable] = await Promise.all([
    scanSkills(paths, projects, custom),
    listMcpServers(paths, projects, custom),
    doctor(paths, projects, custom),
    listBackups(paths, projects, custom),
    writableDirectory(dirname(paths.profilePatchFile)),
  ]);
  return {
    version: 1,
    paths: {
      home: paths.home,
      dshHome: paths.dshHome,
      agentsHome: paths.agentsHome,
      profileDir: paths.profileDir,
    },
    projects,
    custom,
    skillRoots: roots,
    skills: scan.skills,
    mcpTargets: targets,
    mcpServers: mcp.servers,
    backups: backups.backups,
    warnings: dedupeWarnings([...scan.warnings, ...mcp.warnings, ...report.issues, ...backups.warnings]),
    doctor: report,
    capabilities: {
      dshPatchWritable: paths.profileDir !== '' && patchWritable,
      symlinks: process.platform !== 'win32',
      backups: join(stateDir(paths), 'backups'),
    },
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Resolve the tracked project list, fresh for every operation. */
async function contextOf(paths) {
  const settings = await loadSettings(paths);
  return { settings, projects: settings.projects };
}

/** Refuse a non-string required parameter. */
function requireString(params, key) {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`"${key}" must be a non-empty string`);
  }
  return value;
}

/** Run one action against the filesystem; the single implementation behind both callers. */
async function runAction(paths, action, params) {
  const { settings, projects } = await contextOf(paths);
  const custom = { skillDirs: settings.customSkillDirs, mcpTargets: settings.customMcpTargets };
  const scope = { paths, projects, custom };
  const state = () => buildState(paths, { ...settings, projects });

  switch (action) {
    case 'state/refresh':
      return { state: await state() };

    case 'skill/read': {
      const skillKey = requireString(params, 'skillKey');
      const { skill, body } = await readSkill(skillKey, paths, projects, custom);
      return { skill, body };
    }

    case 'skill/save': {
      const saved = await saveSkill({
        ...scope,
        skillKey: typeof params.skillKey === 'string' ? params.skillKey : undefined,
        targetRootId: typeof params.targetRootId === 'string' ? params.targetRootId : undefined,
        name: requireString(params, 'name'),
        description: requireString(params, 'description'),
        whenToUse: typeof params.whenToUse === 'string' ? params.whenToUse : '',
        metadata:
          params.metadata !== null && typeof params.metadata === 'object' ? params.metadata : undefined,
        modelInvocable: params.modelInvocable !== false,
        userInvocable: params.userInvocable !== false,
        body: typeof params.body === 'string' ? params.body : '',
        extraRaw: Array.isArray(params.extraRaw) ? params.extraRaw : undefined,
        renameFrom: typeof params.renameFrom === 'string' ? params.renameFrom : undefined,
      });
      if (Array.isArray(params.visibility)) {
        await setSkillVisibility({ ...scope, skillKey: saved.key, roots: params.visibility });
      }
      return { key: saved.key, state: await state() };
    }

    case 'skill/delete': {
      const result = await deleteSkill({ ...scope, skillKey: requireString(params, 'skillKey') });
      return { ...result, state: await state() };
    }

    case 'skill/search': {
      const query = requireString(params, 'query');
      return await searchSkillBodies(paths, projects, custom, query, {
        limit: Number.isInteger(params.limit) ? params.limit : 50,
      });
    }

    case 'skill/reveal': {
      const { skill } = await readSkill(requireString(params, 'skillKey'), paths, projects, custom);
      return { result: await revealInFileManager(skill.canonicalPath) };
    }

    case 'skill/visibility': {
      const result = await setSkillVisibility({
        ...scope,
        skillKey: requireString(params, 'skillKey'),
        roots: Array.isArray(params.roots) ? params.roots.filter((root) => typeof root === 'string') : [],
      });
      return { ...result, state: await state() };
    }

    case 'skill/duplicate': {
      const source = await readSkill(requireString(params, 'skillKey'), paths, projects, custom);
      const targetRootId = requireString(params, 'targetRootId');
      const name = requireString(params, 'name');
      const saved = await saveSkill({
        ...scope,
        targetRootId,
        name,
        description: source.skill.description || name,
        whenToUse: source.skill.whenToUse,
        metadata: source.skill.metadata,
        modelInvocable: source.skill.modelInvocable,
        userInvocable: source.skill.userInvocable,
        body: source.body,
      });
      const result = await setSkillVisibility({
        ...scope,
        skillKey: saved.key,
        roots: source.skill.roots
          .map((root) => root.rootId)
          .filter((rootId) => rootId !== undefined && rootId !== targetRootId),
      });
      return { key: saved.key, changed: result.changed, state: await state() };
    }

    case 'mcp/save': {
      await saveMcpServer({
        ...scope,
        targetId: requireString(params, 'targetId'),
        name: requireString(params, 'name'),
        originalName: typeof params.originalName === 'string' ? params.originalName : undefined,
        server: params.server !== null && typeof params.server === 'object' ? params.server : {},
      });
      return { state: await state() };
    }

    case 'mcp/delete': {
      const result = await deleteMcpServer({
        ...scope,
        targetId: requireString(params, 'targetId'),
        name: requireString(params, 'name'),
      });
      return { ...result, state: await state() };
    }

    case 'mcp/copy': {
      const result = await copyMcpServer({
        ...scope,
        targetId: requireString(params, 'targetId'),
        name: requireString(params, 'name'),
        toTargetIds: Array.isArray(params.toTargetIds)
          ? params.toTargetIds.filter((id) => typeof id === 'string')
          : [],
      });
      return { ...result, state: await state() };
    }

    case 'mcp/reveal': {
      const targetId = requireString(params, 'targetId');
      const target = mcpTargets(paths, projects, custom).find((entry) => entry.id === targetId);
      if (target === undefined) throw new Error(`Unknown MCP target: ${targetId}`);
      return { result: await revealInFileManager(target.path) };
    }

    case 'project/add': {
      const raw = requireString(params, 'path');
      if (!isAbsolute(raw)) throw new Error('Project path must be absolute');
      const projectPath = resolve(raw);
      let info;
      try {
        info = await stat(projectPath);
      } catch {
        throw new Error(`Project directory does not exist: ${projectPath}`);
      }
      if (!info.isDirectory()) throw new Error(`Not a directory: ${projectPath}`);
      const id = projectIdOf(projectPath);
      if (!projects.some((project) => project.path === projectPath)) {
        projects.push({ id, path: projectPath });
        await saveSettings(paths, { ...settings, projects });
      }
      return { state: await state() };
    }

    case 'project/remove': {
      const id = requireString(params, 'projectId');
      const next = projects.filter((project) => project.id !== id);
      if (next.length !== projects.length) await saveSettings(paths, { ...settings, projects: next });
      return { state: await state() };
    }

    case 'custom/add_skill_dir': {
      const raw = requireString(params, 'path');
      if (!isAbsolute(raw)) throw new Error('Skill directory must be absolute');
      const dirPath = resolve(raw);
      let info;
      try {
        info = await stat(dirPath);
      } catch {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }
      if (!info.isDirectory()) throw new Error(`Not a directory: ${dirPath}`);
      const label =
        typeof params.label === 'string' && params.label.length > 0 ? params.label : dirPath;
      if (!custom.skillDirs.some((entry) => entry.path === dirPath)) {
        custom.skillDirs.push({ id: projectIdOf(dirPath), path: dirPath, label });
        await saveSettings(paths, { ...settings, customSkillDirs: custom.skillDirs });
      }
      return { state: await state() };
    }

    case 'custom/remove_skill_dir': {
      const id = requireString(params, 'id');
      const next = custom.skillDirs.filter((entry) => entry.id !== id);
      if (next.length !== custom.skillDirs.length) {
        await saveSettings(paths, { ...settings, customSkillDirs: next });
      }
      return { state: await state() };
    }

    case 'custom/add_mcp_target': {
      const raw = requireString(params, 'path');
      if (!isAbsolute(raw)) throw new Error('MCP config path must be absolute');
      const formats = new Set(['json', 'jsonc', 'toml', 'yaml-patch']);
      const format = requireString(params, 'format');
      if (!formats.has(format)) throw new Error(`Unsupported format: ${format}`);
      const filePath = resolve(raw);
      const label =
        typeof params.label === 'string' && params.label.length > 0 ? params.label : filePath;
      const keyPath =
        Array.isArray(params.keyPath) && params.keyPath.every((key) => typeof key === 'string')
          ? params.keyPath
          : undefined;
      if (!custom.mcpTargets.some((entry) => entry.path === filePath)) {
        custom.mcpTargets.push({
          id: projectIdOf(filePath),
          path: filePath,
          format,
          label,
          keyPath,
          style: params.style === 'opencode' ? 'opencode' : undefined,
        });
        await saveSettings(paths, { ...settings, customMcpTargets: custom.mcpTargets });
      }
      return { state: await state() };
    }

    case 'custom/remove_mcp_target': {
      const id = requireString(params, 'id');
      const next = custom.mcpTargets.filter((entry) => entry.id !== id);
      if (next.length !== custom.mcpTargets.length) {
        await saveSettings(paths, { ...settings, customMcpTargets: next });
      }
      return { state: await state() };
    }

    case 'backup/restore': {
      const result = await restoreBackup({
        ...scope,
        backupId: requireString(params, 'backupId'),
        name: requireString(params, 'name'),
        targetRootId: typeof params.targetRootId === 'string' ? params.targetRootId : undefined,
      });
      return { ...result, state: await state() };
    }

    case 'backup/delete': {
      const result = await deleteBackup(paths, requireString(params, 'backupId'));
      return { ...result, state: await state() };
    }

    case 'backup/reveal': {
      const backupId = requireString(params, 'backupId');
      if (!/^[0-9TZ-]+$/.test(backupId)) throw new Error('Invalid backup id');
      return { result: await revealInFileManager(join(backupRoot(paths), backupId)) };
    }

    case 'skill/export': {
      const keys = Array.isArray(params.skillKeys)
        ? params.skillKeys.filter((key) => typeof key === 'string')
        : [];
      if (keys.length === 0) throw new Error('skillKeys is required');
      const entries = [];
      for (const key of keys) {
        const { skill } = await readSkill(key, paths, projects, custom);
        if (skill.format === 'dir') {
          await collectSkillFiles(skill.dirPath, skill.name, entries);
        } else {
          entries.push({
            name: `${skill.name}/${skill.name}.md`,
            data: await readFile(skill.canonicalPath),
          });
        }
      }
      return {
        filename: exportFileName('skills'),
        base64: toBase64(createZip(entries)),
        count: keys.length,
      };
    }

    case 'skill/export_to_file': {
      const keys = Array.isArray(params.skillKeys)
        ? params.skillKeys.filter((key) => typeof key === 'string')
        : [];
      if (keys.length === 0) throw new Error('skillKeys is required');
      const entries = [];
      for (const key of keys) {
        const { skill } = await readSkill(key, paths, projects, custom);
        if (skill.format === 'dir') {
          await collectSkillFiles(skill.dirPath, skill.name, entries);
        } else {
          entries.push({
            name: `${skill.name}/${skill.name}.md`,
            data: await readFile(skill.canonicalPath),
          });
        }
      }
      const targetDir = join(stateDir(paths), 'exports');
      await mkdir(targetDir, { recursive: true });
      const filePath = join(targetDir, exportFileName('skills'));
      await writeFile(filePath, createZip(entries));
      return { path: filePath, count: keys.length };
    }

    case 'skill/import_zip': {
      const targetRootId = requireString(params, 'targetRootId');
      const base64 = requireString(params, 'base64');
      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length === 0 || buffer.length > MAX_IMPORT_BYTES) throw new Error('Archive is empty or too large');
      const files = readZip(buffer).filter((entry) => !entry.directory);
      const totalBytes = files.reduce((sum, entry) => sum + entry.data.length, 0);
      if (totalBytes > MAX_IMPORT_BYTES) throw new Error('Archive is too large');
      const root = skillRoots(paths, projects, custom).find(
        (candidate) => candidate.id === targetRootId && candidate.writable,
      );
      if (!root) throw new Error(`Unknown or read-only skill root: ${targetRootId}`);
      const { bundles, flat } = groupImportedSkills(files);
      if (bundles.length === 0 && flat.length === 0) {
        throw new Error('No SKILL.md bundle or flat <name>.md found in the archive');
      }
      await mkdir(root.path, { recursive: true });
      const imported = [];
      for (const bundle of bundles) {
        const name = freeSkillName(root.path, bundle.name);
        const destDir = join(root.path, name);
        for (const file of bundle.files) {
          const relative = file.name.slice(bundle.dir.length + 1);
          const destination = join(destDir, ...relative.split('/'));
          if (!destination.startsWith(`${destDir}${sep}`)) throw new Error('Unsafe archive path');
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, file.data);
        }
        imported.push({ name, path: destDir });
      }
      for (const item of flat) {
        const name = freeSkillName(root.path, item.name);
        const destination = join(root.path, `${name}.md`);
        await writeFile(destination, item.file.data);
        imported.push({ name, path: destination });
      }
      const scan = await scanSkills(paths, projects, custom);
      const warnings = [];
      for (const entry of imported) {
        const skill = scan.skills.find(
          (candidate) => candidate.canonicalPath === entry.path || candidate.dirPath === entry.path,
        );
        if (skill !== undefined && !skill.valid) warnings.push({ path: entry.path, message: skill.error });
      }
      return { imported, warnings, state: await state() };
    }

    case 'skill/import_path': {
      const targetRootId = requireString(params, 'targetRootId');
      const sourcePath = resolve(requireString(params, 'path'));
      const root = skillRoots(paths, projects, custom).find(
        (candidate) => candidate.id === targetRootId && candidate.writable,
      );
      if (!root) throw new Error(`Unknown or read-only skill root: ${targetRootId}`);
      let info;
      try {
        info = await stat(sourcePath);
      } catch {
        throw new Error(`Path does not exist: ${sourcePath}`);
      }
      await mkdir(root.path, { recursive: true });
      const imported = [];
      if (info.isDirectory() && existsSync(join(sourcePath, 'SKILL.md'))) {
        const name = freeSkillName(root.path, sourcePath.split(/[\\/]/).pop());
        const destination = join(root.path, name);
        await copyDirectoryTree(sourcePath, destination);
        imported.push({ name, path: destination });
      } else if (info.isDirectory()) {
        const children = await readdir(sourcePath, { withFileTypes: true });
        for (const child of children) {
          const childPath = join(sourcePath, child.name);
          if (child.isDirectory() && existsSync(join(childPath, 'SKILL.md'))) {
            const name = freeSkillName(root.path, child.name);
            const destination = join(root.path, name);
            await copyDirectoryTree(childPath, destination);
            imported.push({ name, path: destination });
          } else if (child.isFile() && child.name.endsWith('.md')) {
            const name = freeSkillName(root.path, child.name.slice(0, -3));
            const destination = join(root.path, `${name}.md`);
            await writeFile(destination, await readFile(childPath));
            imported.push({ name, path: destination });
          }
        }
      } else {
        throw new Error('Import path must be a skill directory or a directory of skills');
      }
      if (imported.length === 0) throw new Error('No skill found at that path');
      return { imported, state: await state() };
    }

    case 'mcp/health': {
      const targetId = requireString(params, 'targetId');
      const name = requireString(params, 'name');
      const { servers } = await listMcpServers(paths, projects, custom);
      const server = servers.find((entry) => entry.targetId === targetId && entry.name === name);
      if (server === undefined) throw new Error(`MCP server not found: ${targetId} / ${name}`);
      const timeoutMs = Number.isFinite(params.timeoutMs)
        ? Math.min(Math.max(params.timeoutMs, 1000), 20000)
        : 8000;
      const health = await probeMcpServer(
        {
          transport: server.transport,
          command: server.command ?? undefined,
          args: server.args ?? [],
          env: server.env ?? {},
          cwd: server.cwd ?? undefined,
          url: server.url ?? undefined,
          headers: server.headers ?? {},
        },
        { timeoutMs },
      );
      return { health: { ...health, targetId, name, checkedAt: new Date().toISOString() } };
    }

    case 'market/skills': {
      const query = requireString(params, 'query');
      return await marketSkills(query, Number.isInteger(params.limit) ? params.limit : 20);
    }

    case 'market/mcp': {
      const query = requireString(params, 'query');
      return await marketMcp(query, Number.isInteger(params.limit) ? params.limit : 20);
    }

    case 'market/install_skill': {
      const source = requireString(params, 'source');
      const skillId = requireString(params, 'skillId');
      const targetRootId = requireString(params, 'targetRootId');
      const bundle = await fetchSkillBundle({ source, skillId });
      const result = await runAction(paths, 'skill/import_zip', {
        targetRootId,
        filename: `${skillId}.zip`,
        base64: createZip(bundle.entries).toString('base64'),
      });
      return { ...result, source, skillId };
    }

    case 'market/install_mcp': {
      const targetId = requireString(params, 'targetId');
      let entry = params.entry !== null && typeof params.entry === 'object' ? params.entry : null;
      if (entry === null) {
        const lookup = requireString(params, 'name');
        const found = await searchMcpRegistry(lookup, { limit: 50 });
        entry =
          found.results.find((candidate) => candidate.name === lookup || candidate.title === lookup) ??
          found.results[0];
        if (entry === undefined) throw new Error(`MCP server not found in the registry: ${lookup}`);
      }
      const plan = mcpInstallPlan(entry);
      const existing = (await listMcpServers(paths, projects, custom)).servers.filter(
        (server) => server.targetId === targetId,
      );
      let name = plan.name;
      let suffix = 2;
      while (existing.some((server) => server.name === name)) {
        name = `${plan.name.slice(0, 28)}-${suffix}`;
        suffix += 1;
      }
      await saveMcpServer({ ...scope, targetId, name, server: plan.server });
      return { name, warnings: plan.warnings, state: await state() };
    }

    case 'doctor':
      return { state: await state() };

    default:
      throw new Error(`Unknown action: ${String(action)}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** JSON response; state snapshots are live facts, so never cache them. */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** Send a handled failure without leaking internals beyond the message. */
function sendFailure(res, error) {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(res, 200, { ok: false, error: { code: 'operation-failed', message } });
}

/** Collect a bounded JSON body; `undefined` past the ceiling. */
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return undefined;
    }
    chunks.push(chunk);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Answer requests that do not belong to the authenticated page.
 * Fails closed when the composition has no connection service.
 */
function rejected(ctx, req, res) {
  const connection = ctx.get('connection');
  const requestRejection = connection?.requestRejection;
  if (typeof requestRejection !== 'function') {
    sendJson(res, 403, { ok: false, error: { code: 'untrusted', message: 'No connection service' } });
    return true;
  }
  const rejection = requestRejection.call(connection, req);
  if (rejection === undefined) return false;
  res.statusCode = rejection;
  res.end();
  return true;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Compact a skill for model consumption (drops frontmatter round-trip data). */
function skillSummary(skill) {
  return {
    key: skill.key,
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse || undefined,
    valid: skill.valid,
    error: skill.error ?? undefined,
    format: skill.format,
    primaryRootId: skill.primaryRootId,
    roots: skill.roots.map((root) => ({ rootId: root.rootId, link: root.link })),
    visibility: Object.fromEntries(Object.entries(skill.visibility).filter(([, value]) => value !== null)),
    modelInvocable: skill.modelInvocable,
    userInvocable: skill.userInvocable,
  };
}

/** Compact an MCP server for model consumption. */
function mcpSummary(server) {
  const redact = (record) =>
    record === undefined || record === null
      ? undefined
      : Object.fromEntries(Object.keys(record).map((key) => [key, '<redacted>']));
  return {
    id: server.id,
    tool: server.tool,
    scope: server.scope,
    name: server.name,
    transport: server.transport,
    command: server.command ?? undefined,
    args: server.args?.length ? server.args : undefined,
    url: server.url ?? undefined,
    enabled: server.enabled,
    managed: server.managed,
    env: redact(server.env),
    headers: redact(server.headers),
    path: server.path,
  };
}

/** The tool description teaches the model the whole surface in one place. */
const TOOL_DESCRIPTION = [
  'Manage agent skills and MCP servers across DSH, Claude Code, Codex, Cursor and the shared ~/.agents skills hub.',
  'Skills are SKILL.md bundles (or flat <name>.md files) discovered in the user roots (dsh, agents, claude, codex, cursor) and in the tracked project directories (.dsh/skills, .agents/skills, .claude/skills, .codex/skills, .cursor/skills).',
  'MCP servers live in the DSH profile patch, ~/.claude.json, ~/.codex/config.toml and ~/.cursor/mcp.json, plus project .mcp.json / .cursor/mcp.json files.',
  'Actions: overview (counts and tracked projects), list_skills, read_skill (frontmatter + body), save_skill (create or edit; optional roots expose it to those tool roots via symlinks), delete_skill (backs up first), set_skill_visibility, list_mcp, save_mcp, delete_mcp, copy_mcp (copy one server to other tool targets), doctor (consistency report).',
  'A market is available too: market_search_skills / market_install_skill (skills.sh sources installed from GitHub) and market_search_mcp / market_install_mcp (official MCP registry).',
  'Call overview first, then read/list before editing. Prefer editing an existing skill over creating a near-duplicate; share one skill across tools with set_skill_visibility instead of copying it.',
].join(' ');

/** Build the ToolDefinition without importing the tools package. */
function managerTool(paths) {
  const parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: TOOL_ACTIONS, description: 'The operation to run.' },
      skillKey: { type: 'string', description: 'Stable skill key from list_skills.' },
      name: { type: 'string', description: 'Skill name (kebab-case) or MCP server name.' },
      description: { type: 'string', description: 'Skill description used in model catalogs.' },
      whenToUse: { type: 'string', description: 'Optional skill whenToUse frontmatter.' },
      body: { type: 'string', description: 'Full Markdown body of the skill.' },
      targetRootId: {
        type: 'string',
        description: 'Skill root id (e.g. "agents:user") or MCP target id to write to.',
      },
      targetId: { type: 'string', description: 'MCP target id, as returned by list_mcp.' },
      originalName: { type: 'string', description: 'Previous MCP server name when renaming.' },
      renameFrom: { type: 'string', description: 'Previous skill name when renaming.' },
      roots: {
        type: 'array',
        items: { type: 'string' },
        description: 'Skill root ids the skill should be visible in.',
      },
      toTargetIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'MCP target ids to copy the server to.',
      },
      modelInvocable: { type: 'boolean', description: 'false sets disable-model-invocation: true.' },
      userInvocable: { type: 'boolean', description: 'false sets user-invocable: false.' },
      metadata: { type: 'object', description: 'Skill metadata frontmatter map.' },
      server: {
        type: 'object',
        description:
          'MCP server definition for save_mcp: { transport, command, args, env, cwd, url, headers, enabled }.',
      },
      backupId: { type: 'string', description: 'Backup snapshot id from list_backups.' },
      path: { type: 'string', description: 'Absolute skill directory (or directory of skills) to import.' },
      query: { type: 'string', description: 'Full-text query for search_skills (at least 2 characters).' },
    },
  };
  return {
    name: 'mcp_skill_manager',
    description: TOOL_DESCRIPTION,
    parameters,
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [
        { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
      ],
    },
    execute: async (args) => {
      const action = typeof args?.action === 'string' ? args.action : '';
      const params = args !== null && typeof args === 'object' ? args : {};
      switch (action) {
        case 'overview': {
          const state = await buildState(paths, await loadSettings(paths));
          return {
            skills: state.skills.length,
            invalidSkills: state.skills.filter((skill) => !skill.valid).length,
            mcpServers: state.mcpServers.length,
            projects: state.projects,
            skillRoots: state.skillRoots.map((root) => ({ id: root.id, path: root.path, exists: root.exists })),
            mcpTargets: state.mcpTargets.map((target) => ({
              id: target.id,
              path: target.path,
              format: target.format,
            })),
            warnings: state.warnings.length,
          };
        }
        case 'list_skills': {
          const state = await buildState(paths, await loadSettings(paths));
          return { skills: state.skills.map(skillSummary), roots: state.skillRoots };
        }
        case 'read_skill': {
          const { skill, body } = await readSkill(requireString(params, 'skillKey'));
          return { skill: skillSummary(skill), body };
        }
        case 'save_skill':
          return pickState(await runAction(paths, 'skill/save', params));
        case 'delete_skill':
          return pickState(await runAction(paths, 'skill/delete', params));
        case 'set_skill_visibility':
          return pickState(await runAction(paths, 'skill/visibility', params));
        case 'search_skills': {
          const query = requireString(params, 'query');
          return await searchSkillBodies(paths, (await loadSettings(paths)).projects, {}, query, {
            limit: Number.isInteger(params.limit) ? params.limit : 20,
          });
        }
        case 'list_mcp': {
          const state = await buildState(paths, await loadSettings(paths));
          return {
            servers: state.mcpServers.map(mcpSummary),
            targets: state.mcpTargets.map((target) => ({ id: target.id, path: target.path, format: target.format })),
          };
        }
        case 'save_mcp':
          return pickState(await runAction(paths, 'mcp/save', params));
        case 'delete_mcp':
          return pickState(await runAction(paths, 'mcp/delete', params));
        case 'copy_mcp':
          return pickState(await runAction(paths, 'mcp/copy', params));
        case 'list_backups': {
          const state = await buildState(paths, await loadSettings(paths));
          return {
            backups: state.backups.map((snapshot) => ({
              id: snapshot.id,
              createdAt: snapshot.createdAt,
              entries: snapshot.entries.map((entry) => ({
                name: entry.name,
                kind: entry.kind,
                target: entry.target,
              })),
            })),
          };
        }
        case 'restore_backup':
          return pickState(await runAction(paths, 'backup/restore', params));
        case 'export_skills': {
          const result = await runAction(paths, 'skill/export_to_file', params);
          return { path: result.path, count: result.count };
        }
        case 'import_skill':
          return pickState(await runAction(paths, 'skill/import_path', params));
        case 'mcp_health': {
          const result = await runAction(paths, 'mcp/health', params);
          return result.health;
        }
        case 'market_search_skills': {
          return await marketSkills(
            requireString(params, 'query'),
            Number.isInteger(params.limit) ? params.limit : 20,
          );
        }
        case 'market_install_skill':
          return pickState(await runAction(paths, 'market/install_skill', params));
        case 'market_search_mcp': {
          return await marketMcp(
            requireString(params, 'query'),
            Number.isInteger(params.limit) ? params.limit : 20,
          );
        }
        case 'market_install_mcp':
          return pickState(await runAction(paths, 'market/install_mcp', params));
        case 'doctor': {
          const report = await doctor(paths, (await loadSettings(paths)).projects);
          return report;
        }
        default:
          throw new Error(`unknown action "${action}"; expected one of ${TOOL_ACTIONS.join(', ')}`);
      }
    },
  };
}

/** Reduce a mutation result to the compact facts a model needs. */
function pickState(result) {
  const { state, ...rest } = result;
  return {
    ...rest,
    skills: state.skills.length,
    mcpServers: state.mcpServers.map((server) => `${server.tool}:${server.name}`),
    warnings: state.warnings,
  };
}

// ---------------------------------------------------------------------------
// Plugin entry
// ---------------------------------------------------------------------------

/** The browser carrier is the only hard dependency; both callers stay optional. */
export const inject = ['webServer'];

/**
 * Internals exported for the package's own integration test (`scripts/test-actions.mjs`).
 * Not part of the plugin API; no other module should read this.
 */
export const __test = { buildState, managerTool, resolvePaths, runAction };

/**
 * Register the data routes and the agent tool.
 * @param ctx - plugin context carrying the web server.
 */
/** Refuse to activate on a runtime without the Host APIs this plugin needs. */
function assertCompatibleRuntime(ctx) {
  if (ctx === null || typeof ctx !== 'object' || typeof ctx.webServer?.register !== 'function') {
    throw new Error(
      'dsh-mcp-skill-manage requires DeepSeek Harness >=0.2.1-rc.3: ctx.webServer.register is unavailable.',
    );
  }
}

export function apply(ctx) {
  assertCompatibleRuntime(ctx);
  const paths = resolvePaths(process.env);
  // The Desktop Host process does not inherit $DSH_PROFILE_DIR, but the launcher provides
  // the composed profile as a context value. Prefer it so DSH MCP edits land in the patch
  // file the running loader actually watches, instead of the home layer.
  const profile = ctx.get('profileContext');
  if (profile !== null && typeof profile === 'object') {
    if (typeof profile.dir === 'string' && profile.dir.length > 0) paths.profileDir = profile.dir;
    if (typeof profile.patchPath === 'string' && profile.patchPath.length > 0) {
      paths.profilePatchFile = profile.patchPath;
    } else if (paths.profileDir !== '') {
      paths.profilePatchFile = join(paths.profileDir, 'cordis.patch.yml');
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return;
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('allow', 'GET');
            res.end();
            return;
          }
          try {
            const state = await buildState(paths, await loadSettings(paths));
            sendJson(res, 200, { ok: true, value: { state } });
          } catch (error) {
            sendFailure(res, error);
          }
        },
      }),
    'mcp-skill-manager: state route',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_ACTION,
        handler: async (req, res) => {
          if (rejected(ctx, req, res)) return;
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('allow', 'POST');
            res.end();
            return;
          }
          const body = await readJsonBody(req);
          if (body === undefined || typeof body !== 'object' || body === null) {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'invalid-body', message: 'Expected a JSON object body' },
            });
            return;
          }
          const { action, ...params } = body;
          if (typeof action !== 'string' || action.length === 0) {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'invalid-action', message: 'Missing "action"' },
            });
            return;
          }
          try {
            sendJson(res, 200, { ok: true, value: await runAction(paths, action, params) });
          } catch (error) {
            sendFailure(res, error);
          }
        },
      }),
    'mcp-skill-manager: action route',
  );

  ctx.inject(['tools'], (child) => {
    child.effect(() => child.tools.register(managerTool(paths)), 'mcp-skill-manager: agent tool');
  });
}
