/**
 * dsh-mcp-skill-manage — data layer.
 *
 * Pure Node (>= 20) adapters for skill bundles and MCP server config files
 * across agent tools. Every adapter returns plain JSON-serializable data and
 * never lets one unreadable file abort a whole scan. Writes are atomic
 * (tmp file + rename) and the previous file is backed up first.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { MCP_TARGET_PRESETS, SKILL_ROOT_PRESETS, TOOL_LABELS } from './presets.js'

const PRESET_TOOLS = SKILL_ROOT_PRESETS.map((preset) => preset.tool)
const MCP_FORMATS = new Set(['json', 'jsonc', 'toml', 'yaml-patch'])
const DEFAULT_KEY_PATH = ['mcpServers']

function toolLabel(tool) {
  const entry = TOOL_LABELS[tool]
  if (entry) return entry.label
  return tool === 'custom' ? 'Custom' : String(tool)
}

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MCP_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'
const TOML_CHILD_TABLES = new Set(['env', 'http_headers', 'env_http_headers'])
const TOML_INVALID = Symbol('toml-invalid')

const BACKUP_DIR = '.mcp-skill-manager'

// ---------------------------------------------------------------------------
// Small generic helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function pathExistsSync(target) {
  try {
    return existsSync(target)
  } catch {
    return false
  }
}

async function pathExists(target) {
  try {
    await fsp.lstat(target)
    return true
  } catch {
    return false
  }
}

async function statOrNull(target) {
  try {
    return await fsp.stat(target)
  } catch {
    return null
  }
}

async function realpathOrNull(target) {
  try {
    return await fsp.realpath(target)
  } catch {
    return null
  }
}

/** Read a text file; ENOENT is reported as `missing`, any other error as `error`. */
async function readTextFile(filePath) {
  try {
    return { text: await fsp.readFile(filePath, 'utf8') }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { missing: true }
    return { error: err }
  }
}

function warn(rootId, filePath, message) {
  return { rootId, path: filePath, message }
}

function errorMessage(err) {
  return err && err.message ? err.message : String(err)
}

function countIndent(line) {
  let i = 0
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
  return i
}

function isBlankOrComment(line) {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function sanitizeForBackup(absolutePath) {
  const cleaned = String(absolutePath)
    .replace(/^[A-Za-z]:/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return cleaned || 'root'
}

function emptyVisibility() {
  const visibility = {}
  for (const tool of PRESET_TOOLS) visibility[tool] = null
  return visibility
}

/**
 * Relative symlink target, computed in the realpath namespace, with an absolute
 * fallback so a link never breaks when the two paths live in different namespaces
 * (e.g. macOS `/var` vs `/private/var`) or on different volumes.
 */
function symlinkTargetFor(linkDir, targetPath) {
  const relative = path.relative(linkDir, targetPath)
  const parentSegments = relative.split(path.sep).filter((segment) => segment === '..').length
  if (!relative || parentSegments > 16 || path.resolve(linkDir, relative) !== targetPath) return targetPath
  return relative
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'server'
}

// ---------------------------------------------------------------------------
// Atomic writes and backups
// ---------------------------------------------------------------------------

export function backupRoot(paths) {
  if (!paths || !paths.dshHome) throw new Error('paths.dshHome is required')
  return path.join(paths.dshHome, BACKUP_DIR, 'backups')
}

const BACKUP_MANIFEST = 'manifest.json'
const BACKUP_KEEP = 80

/** Merge one entry into the backup snapshot's manifest (best effort). */
async function recordBackupEntry(paths, stamp, entry) {
  const stampDir = path.join(backupRoot(paths), stamp)
  const manifestPath = path.join(stampDir, BACKUP_MANIFEST)
  let manifest = { version: 1, entries: [] }
  try {
    const parsed = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
    if (parsed && Array.isArray(parsed.entries)) manifest = parsed
  } catch {
    /* first entry of this snapshot */
  }
  manifest.entries = manifest.entries.filter((item) => item.name !== entry.name)
  manifest.entries.push({ ...entry, createdAt: new Date().toISOString() })
  await writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await pruneBackups(paths)
}

/** Keep the newest `BACKUP_KEEP` snapshots. */
async function pruneBackups(paths) {
  let names
  try {
    names = await fsp.readdir(backupRoot(paths))
  } catch {
    return
  }
  const stamps = names.filter((name) => /^[0-9TZ-]+$/.test(name)).sort().reverse()
  for (const name of stamps.slice(BACKUP_KEEP)) {
    await fsp.rm(path.join(backupRoot(paths), name), { recursive: true, force: true }).catch(() => {})
  }
}

/** List restorable backup snapshots, newest first. */
export async function listBackups(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const root = backupRoot(paths)
  const warnings = []
  let names
  try {
    names = await fsp.readdir(root)
  } catch {
    return { backups: [], warnings }
  }
  const targets = mcpTargets(paths, projects, custom)
  const backups = []
  for (const name of names.filter((entry) => /^[0-9TZ-]+$/.test(entry)).sort().reverse()) {
    const stampDir = path.join(root, name)
    let stat
    try {
      stat = await fsp.stat(stampDir)
    } catch (error) {
      warnings.push({ rootId: 'backup', path: stampDir, message: errorMessage(error) })
      continue
    }
    if (!stat.isDirectory()) continue
    let manifest
    try {
      manifest = JSON.parse(await fsp.readFile(path.join(stampDir, BACKUP_MANIFEST), 'utf8'))
    } catch {
      manifest = undefined
    }
    const entries = []
    const recorded = new Map(
      (Array.isArray(manifest?.entries) ? manifest.entries : []).map((entry) => [entry.name, entry]),
    )
    let childNames = []
    try {
      childNames = await fsp.readdir(stampDir)
    } catch (error) {
      warnings.push({ rootId: 'backup', path: stampDir, message: errorMessage(error) })
      continue
    }
    for (const child of childNames) {
      if (child === BACKUP_MANIFEST) continue
      const entryPath = path.join(stampDir, child)
      let entryStat
      try {
        entryStat = await fsp.lstat(entryPath)
      } catch {
        continue
      }
      const known = recorded.get(child)
      const kind = known?.kind ?? (entryStat.isDirectory() ? 'skill' : 'config')
      let target = known?.target ?? null
      let targetId = known?.targetId ?? null
      if (kind === 'config' && target === null) {
        const matched = targets.find((candidate) => sanitizeForBackup(candidate.path) === child)
        if (matched) {
          target = matched.path
          targetId = matched.id
        }
      }
      entries.push({
        name: child,
        kind,
        target,
        targetId,
        format: known?.format ?? (entryStat.isDirectory() ? 'dir' : 'file'),
        size: entryStat.isDirectory() ? null : entryStat.size,
      })
    }
    backups.push({
      id: name,
      createdAt: stat.mtime.toISOString(),
      path: stampDir,
      entries,
    })
  }
  return { backups, warnings }
}

/** Restore one backup entry: a skill bundle into a skill root, or a config file over its target. */
export async function restoreBackup({ paths, projects = [], custom = {}, backupId, name, targetRootId } = {}) {
  if (!paths) throw new Error('paths is required')
  if (typeof backupId !== 'string' || !/^[0-9TZ-]+$/.test(backupId)) throw new Error('Invalid backup id')
  if (typeof name !== 'string' || name === '' || name.includes('/') || name.includes('\\')) {
    throw new Error('Invalid backup entry name')
  }
  const stampDir = path.join(backupRoot(paths), backupId)
  const entryPath = path.join(stampDir, name)
  const stat = await statOrNull(entryPath)
  if (!stat) throw new Error(`Backup entry not found: ${name}`)
  if (!stat.isDirectory()) {
    const { backups } = await listBackups(paths, projects, custom)
    const snapshot = backups.find((entry) => entry.id === backupId)
    const entry = snapshot?.entries.find((item) => item.name === name)
    const target = entry?.target ?? null
    if (target === null) throw new Error(`Cannot resolve the original path for ${name}`)
    const content = await fsp.readFile(entryPath, 'utf8')
    await writeWithBackup(paths, target, content)
    return { restored: target, kind: 'config' }
  }
  const root = skillRoots(paths, projects, custom).find((candidate) => candidate.id === targetRootId)
    ?? skillRoots(paths, projects, custom).find((candidate) => candidate.writable && candidate.scope !== 'project')
  if (!root) throw new Error('No writable skill root to restore into')
  const hasBundle = pathExistsSync(path.join(entryPath, 'SKILL.md'))
  let destinationName = name
  let index = 1
  const taken = (candidate) => pathExistsSync(path.join(root.path, candidate))
    || pathExistsSync(path.join(root.path, `${candidate}.md`))
  while (taken(destinationName)) {
    index += 1
    destinationName = `${name}-restored${index > 2 ? `-${index}` : ''}`
  }
  await fsp.mkdir(root.path, { recursive: true })
  if (hasBundle) {
    const destination = path.join(root.path, destinationName)
    await copyTree(entryPath, destination)
    return { restored: destination, kind: 'skill', format: 'dir', rootId: root.id }
  }
  const files = await fsp.readdir(entryPath)
  const flat = files.find((file) => file.endsWith('.md'))
  if (!flat) throw new Error(`Backup entry ${name} is not a skill bundle`)
  const destination = path.join(root.path, `${destinationName}.md`)
  await fsp.copyFile(path.join(entryPath, flat), destination)
  return { restored: destination, kind: 'skill', format: 'file', rootId: root.id }
}

/** Delete one backup snapshot. */
export async function deleteBackup(paths, backupId) {
  if (!paths) throw new Error('paths is required')
  if (typeof backupId !== 'string' || !/^[0-9TZ-]+$/.test(backupId)) throw new Error('Invalid backup id')
  await fsp.rm(path.join(backupRoot(paths), backupId), { recursive: true, force: true })
  return { deleted: backupId }
}

async function writeAtomic(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${randomBytes(6).toString('hex')}`
  try {
    await fsp.writeFile(tmp, content, 'utf8')
    await fsp.rename(tmp, filePath)
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

/** Back up an existing file to `<backupRoot>/<stamp>/<sanitized-path>`; null when absent. */
async function backupExistingFile(paths, filePath) {
  if (!pathExistsSync(filePath)) return null
  const stamp = nowStamp()
  const name = sanitizeForBackup(filePath)
  const dest = path.join(backupRoot(paths), stamp, name)
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  await fsp.copyFile(filePath, dest)
  await recordBackupEntry(paths, stamp, { name, kind: 'config', target: filePath })
  return dest
}

async function writeWithBackup(paths, filePath, content) {
  await backupExistingFile(paths, filePath)
  await writeAtomic(filePath, content)
}

async function copyTree(src, dest) {
  const st = await fsp.lstat(src)
  if (st.isSymbolicLink()) {
    await fsp.symlink(await fsp.readlink(src), dest)
  } else if (st.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true })
    for (const name of await fsp.readdir(src)) await copyTree(path.join(src, name), path.join(dest, name))
  } else {
    await fsp.copyFile(src, dest)
  }
}

// ---------------------------------------------------------------------------
// 1. Path resolution
// ---------------------------------------------------------------------------

export function resolvePaths(env = process.env) {
  const home = env.HOME || os.homedir()
  const dshHome = env.DSH_HOME || path.join(home, '.dsh')
  const profileDir = env.DSH_PROFILE_DIR || ''
  return {
    home,
    dshHome,
    agentsHome: env.DSH_AGENTS_HOME || path.join(home, '.agents'),
    codexHome: env.CODEX_HOME || path.join(home, '.codex'),
    claudeHome: env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
    cursorHome: path.join(home, '.cursor'),
    profileDir,
    profilePatchFile: profileDir
      ? path.join(profileDir, 'cordis.patch.yml')
      : path.join(dshHome, 'cordis.patch.yml'),
  }
}

// ---------------------------------------------------------------------------
// 2. Skill roots
// ---------------------------------------------------------------------------

export function skillRoots(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const roots = []
  const emittedUserTools = new Set()

  for (const preset of SKILL_ROOT_PRESETS) {
    const candidates = preset.candidates(paths) || []
    const existing = candidates.filter((candidate) => pathExistsSync(candidate))
    // A tool that is installed but has no skills directory yet still has its config home:
    // treat that home as detection so the first skill can be published there.
    const installed = candidates.filter((candidate) => pathExistsSync(path.dirname(candidate)))
    if (!preset.always && existing.length === 0 && installed.length === 0) continue
    emittedUserTools.add(preset.tool)
    const chosen = existing.length ? existing : installed.length ? installed : candidates.slice(0, 1)
    chosen.forEach((candidatePath, index) => {
      const exists = pathExistsSync(candidatePath)
      roots.push({
        id: index === 0 ? `${preset.tool}:user` : `${preset.tool}:user:${index}`,
        tool: preset.tool,
        label: preset.label,
        labelZh: preset.labelZh,
        path: candidatePath,
        scope: preset.scope ?? 'user',
        projectId: undefined,
        exists,
        writable: true,
        detected: exists,
      })
    })
  }

  for (const project of projects || []) {
    const projectLabel = path.basename(project.path) || project.path
    for (const preset of SKILL_ROOT_PRESETS) {
      if (typeof preset.project !== 'function') continue
      const projectPath = preset.project(project)
      const exists = pathExistsSync(projectPath)
      if (!preset.always && !emittedUserTools.has(preset.tool) && !exists) continue
      roots.push({
        id: `project:${project.id}:${preset.tool}`,
        tool: preset.tool,
        label: `${projectLabel} · ${preset.label}`,
        labelZh: `${projectLabel} · ${preset.labelZh}`,
        path: projectPath,
        scope: 'project',
        projectId: project.id,
        exists,
        writable: true,
        detected: exists,
      })
    }
  }

  for (const entry of customEntries(custom).skillDirs) {
    const exists = pathExistsSync(entry.path)
    roots.push({
      id: `custom:${entry.id}`,
      tool: 'custom',
      label: entry.label || path.basename(entry.path) || entry.path,
      labelZh: entry.label || path.basename(entry.path) || entry.path,
      path: entry.path,
      scope: 'custom',
      projectId: undefined,
      exists,
      writable: true,
      detected: exists,
    })
  }
  return roots
}

function customEntries(custom) {
  const source = isPlainObject(custom) ? custom : {}
  const skillDirs = Array.isArray(source.skillDirs)
    ? source.skillDirs.filter(
        (entry) => isPlainObject(entry) && typeof entry.id === 'string' && typeof entry.path === 'string',
      )
    : []
  const mcpTargets = Array.isArray(source.mcpTargets)
    ? source.mcpTargets.filter(
        (entry) => isPlainObject(entry) && typeof entry.id === 'string' && typeof entry.path === 'string',
      )
    : []
  return { skillDirs, mcpTargets }
}

// ---------------------------------------------------------------------------
// Scalar parsing / formatting (frontmatter & YAML subset)
// ---------------------------------------------------------------------------

const YAML_SPECIAL_START = /^[-?:,[\]{}#&*!|>'"%@`]/
const YAML_AMBIGUOUS = /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)$/i
const YAML_TRUE = new Set(['true', 'yes', 'on', '1'])
const YAML_FALSE = new Set(['false', 'no', 'off', '0'])

function parseQuotedScalar(text) {
  if (text.startsWith("'")) {
    let out = ''
    for (let i = 1; i < text.length; i++) {
      if (text[i] === "'") {
        if (text[i + 1] === "'") {
          out += "'"
          i++
        } else {
          return { value: out }
        }
      } else {
        out += text[i]
      }
    }
    return { value: out }
  }
  if (text.startsWith('"')) {
    let out = ''
    for (let i = 1; i < text.length; i++) {
      const ch = text[i]
      if (ch === '\\') {
        const next = text[i + 1]
        i++
        if (next === 'n') out += '\n'
        else if (next === 't') out += '\t'
        else if (next === 'r') out += '\r'
        else if (next === '"') out += '"'
        else if (next === '\\') out += '\\'
        else out += next === undefined ? '\\' : next
      } else if (ch === '"') {
        return { value: out }
      } else {
        out += ch
      }
    }
    return { value: out }
  }
  return null
}

function parseScalarValue(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed === '') return ''
  const quoted = parseQuotedScalar(trimmed)
  if (quoted) return quoted.value
  return trimmed.replace(/\s+#.*$/, '').trim()
}

function parseBoolScalar(value) {
  if (typeof value !== 'string') return { ok: false }
  const normalized = value.trim().toLowerCase()
  if (YAML_TRUE.has(normalized)) return { ok: true, value: true }
  if (YAML_FALSE.has(normalized)) return { ok: true, value: false }
  return { ok: false }
}

function needsQuotes(value) {
  return (
    value === '' ||
    value !== value.trim() ||
    value.includes(': ') ||
    value.includes(' #') ||
    YAML_SPECIAL_START.test(value) ||
    YAML_AMBIGUOUS.test(value)
  )
}

function formatScalar(value) {
  const text = String(value ?? '')
  if (/[\n\r\t\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
    return `"${text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`
  }
  if (needsQuotes(text)) return `'${text.replace(/'/g, "''")}'`
  return text
}

// ---------------------------------------------------------------------------
// 3. Frontmatter
// ---------------------------------------------------------------------------

function splitFrontmatter(text) {
  const src = stripBom(text)
  const lines = []
  let pos = 0
  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos)
    const end = nl === -1 ? src.length : nl
    lines.push({
      text: src.slice(pos, end).replace(/\r$/, ''),
      next: nl === -1 ? src.length : nl + 1,
    })
    if (nl === -1) break
    pos = nl + 1
  }
  if (lines.length === 0 || lines[0].text.trim() !== '---') {
    return { ok: false, error: 'Missing frontmatter opening fence', body: src, lines: [] }
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].text.trim() === '---') {
      return { ok: true, body: src.slice(lines[i].next), lines: lines.slice(1, i).map((line) => line.text) }
    }
  }
  return { ok: false, error: 'Missing frontmatter closing fence', body: src, lines: [] }
}

function deindent(lines) {
  const content = lines.filter((line) => line.trim() !== '')
  const indent = content.length ? Math.min(...content.map(countIndent)) : 0
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(indent)))
}

function blockScalar(lines, indicator) {
  const fold = indicator.startsWith('>')
  let text = lines.join('\n')
  if (fold) {
    text = text
      .split(/\n[ \t]*\n/)
      .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).join(' '))
      .join('\n')
  }
  return text.replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}

function parseFrontmatterLines(lines) {
  const result = { metadata: {}, extraRaw: [] }
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    if (raw.trim() === '') {
      i++
      continue
    }
    if (countIndent(raw) > 0) {
      i++
      continue
    }
    const match = /^([^:#]+?):(?:[ \t]+(.*))?$/.exec(raw)
    if (!match) {
      i++
      continue
    }
    const key = match[1].trim()
    const rest = (match[2] ?? '').trim()

    if (key === 'metadata') {
      i++
      while (i < lines.length) {
        const line = lines[i]
        if (line.trim() === '') {
          i++
          continue
        }
        if (countIndent(line) === 0) break
        const nested = /^\s+([^:]+?):(?:[ \t]+(.*))?$/.exec(line)
        if (nested) result.metadata[parseScalarValue(nested[1])] = parseScalarValue(nested[2] ?? '')
        i++
      }
      continue
    }

    if (key === 'description' || key === 'whenToUse') {
      if (/^[|>][+-]?$/.test(rest)) {
        i++
        const continuation = []
        while (i < lines.length) {
          const line = lines[i]
          if (line.trim() === '') {
            continuation.push('')
            i++
            continue
          }
          if (countIndent(line) === 0) break
          continuation.push(line)
          i++
        }
        result[key] = blockScalar(deindent(continuation), rest)
        continue
      }
      result[key] = parseScalarValue(rest)
      i++
      continue
    }

    if (key === 'name' || key === 'disable-model-invocation' || key === 'user-invocable') {
      result[key] = parseScalarValue(rest)
      i++
      continue
    }

    // Unknown top-level key: keep the raw lines for round-tripping on save.
    const captured = [raw]
    i++
    while (i < lines.length) {
      const line = lines[i]
      if (line.trim() === '') {
        let j = i
        while (j < lines.length && lines[j].trim() === '') j++
        if (j < lines.length && countIndent(lines[j]) > 0) {
          for (; i < j; i++) captured.push(lines[i])
          continue
        }
        break
      }
      if (countIndent(line) === 0) break
      captured.push(line)
      i++
    }
    result.extraRaw.push(...captured)
  }
  return result
}

function parseSkillDocument(text) {
  const emptyFields = {
    name: '',
    description: '',
    whenToUse: '',
    metadata: {},
    extraRaw: [],
    modelInvocable: true,
    userInvocable: true,
  }
  const split = splitFrontmatter(text)
  if (!split.ok) return { ok: false, error: split.error, body: split.body, fields: emptyFields }

  const frontmatter = parseFrontmatterLines(split.lines)
  const fields = { ...emptyFields }
  if (typeof frontmatter.name === 'string') fields.name = frontmatter.name.trim()
  if (typeof frontmatter.description === 'string') fields.description = frontmatter.description
  if (typeof frontmatter.whenToUse === 'string') fields.whenToUse = frontmatter.whenToUse
  if (isPlainObject(frontmatter.metadata)) fields.metadata = frontmatter.metadata
  fields.extraRaw = frontmatter.extraRaw

  let error = null
  if (frontmatter['disable-model-invocation'] !== undefined) {
    const parsed = parseBoolScalar(frontmatter['disable-model-invocation'])
    if (!parsed.ok) error = 'invalid disable-model-invocation'
    else fields.modelInvocable = !parsed.value
  }
  if (!error && frontmatter['user-invocable'] !== undefined) {
    const parsed = parseBoolScalar(frontmatter['user-invocable'])
    if (!parsed.ok) error = 'invalid user-invocable'
    else fields.userInvocable = parsed.value
  }
  if (!error) {
    if (!fields.name) error = 'Missing name'
    else if (!SKILL_NAME_RE.test(fields.name)) error = `Invalid name "${fields.name}"`
    else if (!String(fields.description ?? '').trim()) error = 'Missing description'
  }
  return { ok: !error, error, body: split.body, fields }
}

function serializeFrontmatterLines(fields) {
  const lines = [`name: ${formatScalar(fields.name)}`, `description: ${formatScalar(fields.description)}`]
  if (fields.whenToUse) lines.push(`whenToUse: ${formatScalar(fields.whenToUse)}`)
  const metadataKeys = Object.keys(fields.metadata || {})
  if (metadataKeys.length) {
    lines.push('metadata:')
    for (const key of metadataKeys) lines.push(`  ${formatScalar(key)}: ${formatScalar(fields.metadata[key])}`)
  }
  if (!fields.modelInvocable) lines.push('disable-model-invocation: true')
  if (!fields.userInvocable) lines.push('user-invocable: false')
  for (const raw of fields.extraRaw || []) {
    const line = String(raw)
    if (line.trim() !== '') lines.push(line)
  }
  return lines
}

function serializeSkillDocument(fields, body) {
  return `---\n${serializeFrontmatterLines(fields).join('\n')}\n---\n${body ?? ''}`
}

// ---------------------------------------------------------------------------
// 3. Skill scanning
// ---------------------------------------------------------------------------

export async function scanSkills(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const roots = skillRoots(paths, projects, custom)
  const rootOrder = new Map(roots.map((root, index) => [root.id, index]))
  const warnings = []
  const candidates = []

  for (const root of roots) {
    let names
    try {
      names = await fsp.readdir(root.path)
    } catch (err) {
      if (err && err.code === 'ENOENT') continue
      warnings.push(warn(root.id, root.path, `Cannot read skill root: ${errorMessage(err)}`))
      continue
    }
    for (const name of names.sort()) {
      if (name.startsWith('.')) continue
      const entryPath = path.join(root.path, name)
      let entryStat
      try {
        entryStat = await fsp.lstat(entryPath)
      } catch (err) {
        warnings.push(warn(root.id, entryPath, `Cannot read entry: ${errorMessage(err)}`))
        continue
      }

      if (entryStat.isSymbolicLink()) {
        const targetStat = await statOrNull(entryPath)
        if (!targetStat) {
          const target = await fsp.readlink(entryPath).catch(() => 'unknown')
          candidates.push({ kind: 'broken', root, name, entryPath, target })
          continue
        }
        const canonical = await resolveEntrySkill(entryPath, name, targetStat, true)
        if (!canonical) {
          if (targetStat.isDirectory()) {
            warnings.push(warn(root.id, entryPath, 'Missing SKILL.md in linked directory'))
          }
          continue
        }
        candidates.push({ kind: 'skill', root, name, entryPath, ...canonical })
        continue
      }

      const canonical = await resolveEntrySkill(entryPath, name, entryStat, false)
      if (!canonical) {
        if (entryStat.isDirectory()) {
          const skillFile = path.join(entryPath, 'SKILL.md')
          const st = await statOrNull(skillFile)
          if (!st) {
            const lstat = await fsp.lstat(skillFile).catch(() => null)
            if (lstat === null) continue
          }
          warnings.push(warn(root.id, skillFile, 'Cannot read SKILL.md'))
        }
        continue
      }
      candidates.push({ kind: 'skill', root, name, entryPath, ...canonical })
    }
  }

  async function resolveEntrySkill(entryPath, name, entryStat, link) {
    if (entryStat.isDirectory()) {
      const skillFile = path.join(entryPath, 'SKILL.md')
      const skillStat = await statOrNull(skillFile)
      if (!skillStat || !skillStat.isFile()) return null
      const realDir = (await realpathOrNull(entryPath)) ?? entryPath
      return {
        link,
        format: 'dir',
        key: realDir,
        canonicalPath: path.join(realDir, 'SKILL.md'),
        dirPath: realDir,
        entryName: name,
      }
    }
    if (!entryStat.isFile()) return null
    const realFile = (await realpathOrNull(entryPath)) ?? entryPath
    if (!name.endsWith('.md') && !realFile.endsWith('.md')) return null
    return {
      link,
      format: 'file',
      key: realFile,
      canonicalPath: realFile,
      dirPath: path.dirname(realFile),
      entryName: name.replace(/\.md$/, ''),
    }
  }

  const canonicalRank = (rootId) => rootOrder.get(rootId) ?? 999

  const groups = new Map()
  const skills = []
  for (const candidate of candidates) {
    if (candidate.kind === 'broken') {
      const rootsEntry = {
        rootId: candidate.root.id,
        tool: candidate.root.tool,
        label: candidate.root.label,
        path: candidate.root.path,
        link: true,
      }
      const visibility = emptyVisibility()
      visibility[candidate.root.tool] = 'link'
      skills.push({
        key: `broken:${candidate.root.id}:${candidate.name}`,
        name: candidate.name,
        description: '',
        whenToUse: '',
        metadata: {},
        modelInvocable: true,
        userInvocable: true,
        valid: false,
        error: `Broken symlink: ${candidate.target}`,
        format: 'dir',
        canonicalPath: null,
        dirPath: candidate.root.path,
        primaryRootId: candidate.root.id,
        roots: [rootsEntry],
        visibility,
        updatedAt: null,
        size: null,
        extraRaw: [],
      })
      warnings.push(warn(candidate.root.id, candidate.entryPath, `Broken symlink: ${candidate.target}`))
      continue
    }
    const group = groups.get(candidate.key) ?? { key: candidate.key, entries: [] }
    group.entries.push(candidate)
    groups.set(candidate.key, group)
  }

  for (const group of groups.values()) {
    const entries = group.entries
      .slice()
      .sort((a, b) => (a.link === b.link ? 0 : a.link ? 1 : -1) || canonicalRank(a.root.id) - canonicalRank(b.root.id))
    const primary = entries[0]
    const name = primary.entryName

    const fileRead = await readTextFile(primary.canonicalPath)
    let document
    if (fileRead.text !== undefined) {
      document = parseSkillDocument(fileRead.text)
    } else {
      document = {
        ok: false,
        error: `Cannot read SKILL.md: ${fileRead.missing ? 'missing' : errorMessage(fileRead.error)}`,
        body: '',
        fields: { name: '', description: '', whenToUse: '', metadata: {}, extraRaw: [], modelInvocable: true, userInvocable: true },
      }
    }

    const byRoot = new Map()
    for (const entry of entries) {
      const current = byRoot.get(entry.root.id)
      if (!current || (current.link && !entry.link)) byRoot.set(entry.root.id, entry)
    }
    const rootsList = [...byRoot.values()]
      .sort((a, b) => canonicalRank(a.root.id) - canonicalRank(b.root.id))
      .map((entry) => ({
        rootId: entry.root.id,
        tool: entry.root.tool,
        label: entry.root.label,
        path: entry.root.path,
        link: entry.link,
      }))

    const visibility = emptyVisibility()
    const visibleTools = new Set([...PRESET_TOOLS, ...rootsList.map((entry) => entry.tool)])
    for (const tool of visibleTools) {
      const toolEntries = rootsList.filter((entry) => entry.tool === tool)
      if (!toolEntries.length) visibility[tool] = null
      else visibility[tool] = toolEntries.some((entry) => !entry.link) ? 'dir' : 'link'
    }

    const stat = await statOrNull(primary.canonicalPath)
    skills.push({
      key: group.key,
      name,
      description: document.fields.description || '',
      whenToUse: document.fields.whenToUse || '',
      metadata: document.fields.metadata || {},
      modelInvocable: document.fields.modelInvocable,
      userInvocable: document.fields.userInvocable,
      valid: document.ok,
      error: document.ok ? null : document.error,
      format: primary.format,
      canonicalPath: primary.canonicalPath,
      dirPath: primary.dirPath,
      primaryRootId: primary.root.id,
      roots: rootsList,
      visibility,
      updatedAt: stat ? Math.round(stat.mtimeMs) : null,
      size: stat ? stat.size : null,
      extraRaw: document.fields.extraRaw || [],
    })
    if (!document.ok) {
      warnings.push(warn(primary.root.id, primary.canonicalPath, `Invalid skill "${name}": ${document.error}`))
    }
  }

  skills.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true }) || a.key.localeCompare(b.key)
  })
  return { skills, warnings }
}

async function resolveSkillFile(skillKey, options = {}) {
  if (typeof skillKey !== 'string' || skillKey.trim() === '') throw new Error('skillKey is required')
  if (!path.isAbsolute(skillKey)) throw new Error(`skillKey must be an absolute path: ${skillKey}`)
  const st = await statOrNull(skillKey)
  if (!st) {
    if (options.optional) return null
    throw new Error(`Skill not found: ${skillKey}`)
  }
  const real = (await realpathOrNull(skillKey)) ?? skillKey
  if (st.isDirectory()) {
    const canonicalPath = path.join(real, 'SKILL.md')
    const skillStat = await statOrNull(canonicalPath)
    if (!skillStat || !skillStat.isFile()) {
      if (options.optional) return null
      throw new Error(`Skill not found: ${skillKey} (missing SKILL.md)`)
    }
    return { key: real, format: 'dir', canonicalPath, dirPath: real, name: path.basename(real) }
  }
  if (st.isFile()) {
    if (!real.endsWith('.md')) {
      if (options.optional) return null
      throw new Error(`Not a skill file: ${skillKey}`)
    }
    return {
      key: real,
      format: 'file',
      canonicalPath: real,
      dirPath: path.dirname(real),
      name: path.basename(real).replace(/\.md$/, ''),
    }
  }
  if (options.optional) return null
  throw new Error(`Not a skill: ${skillKey}`)
}

export async function readSkill(skillKey, paths = null, projects = [], custom = {}) {
  if (typeof skillKey === 'string' && skillKey.startsWith('broken:')) {
    throw new Error('Cannot read a broken symlink skill')
  }
  const info = await resolveSkillFile(skillKey)
  const fileRead = await readTextFile(info.canonicalPath)
  if (fileRead.text === undefined) {
    throw new Error(`Cannot read skill: ${fileRead.missing ? 'missing' : errorMessage(fileRead.error)}`)
  }
  const document = parseSkillDocument(fileRead.text)

  let scanned = null
  if (paths) {
    const result = await scanSkills(paths, projects, custom)
    scanned =
      result.skills.find(
        (skill) => skill.key === info.key || skill.canonicalPath === info.canonicalPath,
      ) ?? null
  }
  const stat = await statOrNull(info.canonicalPath)
  const skill = scanned ?? {
    key: info.key,
    name: info.name,
    description: document.fields.description,
    whenToUse: document.fields.whenToUse,
    metadata: document.fields.metadata,
    modelInvocable: document.fields.modelInvocable,
    userInvocable: document.fields.userInvocable,
    valid: document.ok,
    error: document.ok ? null : document.error,
    format: info.format,
    canonicalPath: info.canonicalPath,
    dirPath: info.dirPath,
    primaryRootId: null,
    roots: [],
    visibility: emptyVisibility(),
    updatedAt: stat ? Math.round(stat.mtimeMs) : null,
    size: stat ? stat.size : null,
    extraRaw: document.fields.extraRaw,
  }
  return { body: document.body, skill }
}

// ---------------------------------------------------------------------------
// 4. Skill mutations
// ---------------------------------------------------------------------------

function normalizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return {}
  if (!isPlainObject(metadata)) throw new Error('metadata must be an object of strings')
  const out = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') out[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value)
    else throw new Error(`metadata value for "${key}" must be a string`)
  }
  return out
}

function normalizeExtraRaw(extraRaw) {
  if (extraRaw === undefined || extraRaw === null) return []
  if (!Array.isArray(extraRaw) || extraRaw.some((line) => typeof line !== 'string')) {
    throw new Error('extraRaw must be an array of strings')
  }
  return extraRaw
}

async function collectLinksTo(paths, projects, custom, canonicalKey) {
  const links = []
  for (const root of skillRoots(paths, projects, custom)) {
    let names
    try {
      names = await fsp.readdir(root.path)
    } catch {
      continue
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const entryPath = path.join(root.path, name)
      const stat = await fsp.lstat(entryPath).catch(() => null)
      if (!stat || !stat.isSymbolicLink()) continue
      if ((await realpathOrNull(entryPath)) === canonicalKey) links.push({ root, entryPath })
    }
  }
  return links
}

export async function saveSkill(input) {
  const params = input ?? {}
  const { paths, projects = [], custom = {} } = params
  if (!paths) throw new Error('paths is required')

  const name = params.name
  if (typeof name !== 'string' || !SKILL_NAME_RE.test(name)) {
    throw new Error('Invalid skill name; use kebab-case (lowercase letters, digits and dashes)')
  }
  if (typeof params.description !== 'string' || params.description.trim() === '') {
    throw new Error('Skill description is required')
  }
  const whenToUse = params.whenToUse ?? ''
  if (typeof whenToUse !== 'string') throw new Error('whenToUse must be a string')
  const body = params.body ?? ''
  if (typeof body !== 'string') throw new Error('body must be a string')
  const metadata = normalizeMetadata(params.metadata)
  const extraRaw = normalizeExtraRaw(params.extraRaw)
  const modelInvocable = params.modelInvocable === undefined ? true : params.modelInvocable
  const userInvocable = params.userInvocable === undefined ? true : params.userInvocable
  if (typeof modelInvocable !== 'boolean') throw new Error('modelInvocable must be a boolean')
  if (typeof userInvocable !== 'boolean') throw new Error('userInvocable must be a boolean')

  const fields = { name, description: params.description, whenToUse, metadata, modelInvocable, userInvocable, extraRaw }
  const content = serializeSkillDocument(fields, body)

  if (!params.skillKey) {
    if (!params.targetRootId) throw new Error('targetRootId is required for a new skill')
    const root = skillRoots(paths, projects, custom).find((candidate) => candidate.id === params.targetRootId)
    if (!root) throw new Error(`Unknown skill root "${params.targetRootId}"`)
    const skillDir = path.join(root.path, name)
    if (await pathExists(skillDir)) throw new Error(`Skill "${name}" already exists in ${root.label}`)
    await fsp.mkdir(root.path, { recursive: true })
    const canonicalPath = path.join(skillDir, 'SKILL.md')
    await writeAtomic(canonicalPath, content)
    return {
      key: (await realpathOrNull(skillDir)) ?? skillDir,
      canonicalPath,
      path: root.path,
      dirPath: skillDir,
    }
  }

  const info = await resolveSkillFile(params.skillKey)
  const rename = typeof params.renameFrom === 'string' && params.renameFrom !== '' && params.renameFrom !== name
  const links = rename ? await collectLinksTo(paths, projects, custom, info.key) : []

  let canonicalPath = info.canonicalPath
  let dirPath = info.dirPath

  if (rename) {
    if (info.format === 'dir') {
      const parent = path.dirname(info.dirPath)
      const newDir = path.join(parent, name)
      if (newDir !== info.dirPath) {
        if (await pathExists(newDir)) throw new Error(`Skill "${name}" already exists in ${parent}`)
        await fsp.rename(info.dirPath, newDir)
        dirPath = (await realpathOrNull(newDir)) ?? newDir
        canonicalPath = path.join(dirPath, 'SKILL.md')
      }
    } else {
      const parent = info.dirPath
      const newFile = path.join(parent, `${name}.md`)
      if (newFile !== info.canonicalPath) {
        if (await pathExists(newFile)) throw new Error(`Skill "${name}" already exists in ${parent}`)
        await fsp.rename(info.canonicalPath, newFile)
        canonicalPath = (await realpathOrNull(newFile)) ?? newFile
      }
    }
    const linkTarget = info.format === 'dir' ? dirPath : canonicalPath
    for (const link of links) {
      try {
        const linkRoot = path.dirname(link.entryPath)
        const linkDir = (await realpathOrNull(linkRoot)) ?? linkRoot
        const nextEntryPath = path.join(linkRoot, name)
        // Move the entry to the new name; never overwrite a different entry.
        if (nextEntryPath !== link.entryPath && (await pathExists(nextEntryPath))) continue
        await fsp.unlink(link.entryPath)
        await fsp.symlink(symlinkTargetFor(linkDir, linkTarget), nextEntryPath, info.format === 'dir' ? 'dir' : 'file')
      } catch {
        // Best effort: a root that went away must not abort the edit.
      }
    }
  }

  await backupExistingFile(paths, canonicalPath)
  await writeAtomic(canonicalPath, content)
  const key =
    info.format === 'dir'
      ? (await realpathOrNull(dirPath)) ?? dirPath
      : (await realpathOrNull(canonicalPath)) ?? canonicalPath
  return {
    key,
    canonicalPath,
    path: info.format === 'dir' ? path.dirname(dirPath) : info.dirPath,
    dirPath,
  }
}

async function backupSkill(paths, info) {
  const stamp = nowStamp()
  const destDir = path.join(backupRoot(paths), stamp, info.name)
  await fsp.mkdir(destDir, { recursive: true })
  if (info.format === 'dir') {
    await copyTree(info.dirPath, destDir)
  } else {
    await fsp.copyFile(info.canonicalPath, path.join(destDir, path.basename(info.canonicalPath)))
  }
  await recordBackupEntry(paths, stamp, {
    name: info.name,
    kind: 'skill',
    target: info.dirPath,
    format: info.format,
  })
  return destDir
}

async function removeBrokenSkill(paths, projects, custom, skillKey) {
  const roots = skillRoots(paths, projects, custom)
  let match = null
  for (const root of roots) {
    const prefix = `broken:${root.id}:`
    if (skillKey.startsWith(prefix) && (!match || root.id.length > match.root.id.length)) {
      match = { root, name: skillKey.slice(prefix.length) }
    }
  }
  if (!match || !match.name) return { removed: [], backup: null }
  const entryPath = path.join(match.root.path, match.name)
  const stat = await fsp.lstat(entryPath).catch(() => null)
  if (!stat || !stat.isSymbolicLink()) return { removed: [], backup: null }
  await fsp.unlink(entryPath)
  return { removed: [entryPath], backup: null }
}

export async function deleteSkill({ paths, projects = [], custom = {}, skillKey } = {}) {
  if (!paths) throw new Error('paths is required')
  if (typeof skillKey !== 'string' || skillKey.trim() === '') throw new Error('skillKey is required')
  if (skillKey.startsWith('broken:')) return removeBrokenSkill(paths, projects, custom, skillKey)

  const info = await resolveSkillFile(skillKey, { optional: true })
  if (!info) return { removed: [], backup: null }

  const removed = []
  const links = await collectLinksTo(paths, projects, custom, info.key)
  const backup = await backupSkill(paths, info)
  for (const link of links) {
    try {
      await fsp.unlink(link.entryPath)
      removed.push(link.entryPath)
    } catch {
      // The link may already be gone.
    }
  }
  const target = info.format === 'dir' ? info.dirPath : info.canonicalPath
  await fsp.rm(target, { recursive: true, force: true })
  removed.push(target)
  return { removed, backup }
}

export async function setSkillVisibility({
  paths,
  projects = [],
  custom = {},
  skillKey,
  roots: requestedRoots,
} = {}) {
  if (!paths) throw new Error('paths is required')
  const info = await resolveSkillFile(skillKey)
  if (!Array.isArray(requestedRoots)) throw new Error('roots must be an array of skill root ids')
  const requested = new Set(requestedRoots)
  const allRoots = skillRoots(paths, projects, custom)
  const changed = []
  const warnings = []
  const knownRootIds = new Set(allRoots.map((root) => root.id))
  for (const rootId of requested) {
    if (!knownRootIds.has(rootId)) warnings.push(warn(rootId, '', 'Unknown skill root'))
  }

  const canonicalRootIds = new Set()
  for (const root of allRoots) {
    const entryPath =
      info.format === 'dir' ? path.join(root.path, info.name) : path.join(root.path, `${info.name}.md`)
    const stat = await fsp.lstat(entryPath).catch(() => null)
    if (!stat || stat.isSymbolicLink()) continue
    if ((await realpathOrNull(entryPath)) === info.key) canonicalRootIds.add(root.id)
  }

  const linkTarget = info.format === 'dir' ? info.dirPath : info.canonicalPath
  for (const root of allRoots) {
    if (canonicalRootIds.has(root.id)) continue
    const entryPath = path.join(root.path, info.name)
    const stat = await fsp.lstat(entryPath).catch(() => null)
    const wanted = requested.has(root.id)

    if (stat && stat.isSymbolicLink()) {
      const pointsHere = (await realpathOrNull(entryPath)) === info.key
      if (wanted) {
        if (!pointsHere) {
          warnings.push(warn(root.id, entryPath, 'A different entry already exists'))
        }
        continue
      }
      if (pointsHere) {
        try {
          await fsp.unlink(entryPath)
          changed.push(root.id)
        } catch (err) {
          warnings.push(warn(root.id, entryPath, `Cannot remove symlink: ${errorMessage(err)}`))
        }
      }
      continue
    }

    if (stat) {
      if (wanted) warnings.push(warn(root.id, entryPath, 'A different entry already exists'))
      continue
    }

    if (!wanted) continue

    const parent = path.dirname(root.path)
    if (!(await pathExists(parent))) {
      warnings.push(warn(root.id, root.path, 'Root parent directory does not exist'))
      continue
    }
    try {
      await fsp.mkdir(root.path, { recursive: true })
    } catch (err) {
      warnings.push(warn(root.id, root.path, `Cannot create skill root: ${errorMessage(err)}`))
      continue
    }
    try {
      const realRoot = (await realpathOrNull(root.path)) ?? root.path
      await fsp.symlink(symlinkTargetFor(realRoot, linkTarget), entryPath, info.format === 'dir' ? 'dir' : 'file')
      changed.push(root.id)
    } catch (err) {
      throw new Error(`Cannot create symlink in ${root.path}: ${errorMessage(err)}`)
    }
  }
  return { changed, warnings }
}

// ---------------------------------------------------------------------------
// 5. MCP targets
// ---------------------------------------------------------------------------

export function mcpTargets(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const targets = []
  const emittedUserTools = new Set()

  for (const preset of MCP_TARGET_PRESETS) {
    const candidates = preset.candidates(paths) || []
    const existing = candidates.filter((candidate) => pathExistsSync(candidate))
    if (!preset.always && existing.length === 0) continue
    emittedUserTools.add(preset.tool)
    const chosen = existing.length ? existing : candidates.slice(0, 1)
    chosen.forEach((candidatePath, index) => {
      const exists = pathExistsSync(candidatePath)
      targets.push({
        id: index === 0 ? `${preset.tool}:user` : `${preset.tool}:user:${index}`,
        tool: preset.tool,
        label: preset.label,
        labelZh: preset.labelZh,
        scope: 'user',
        projectId: undefined,
        path: candidatePath,
        format: MCP_FORMATS.has(preset.format) ? preset.format : 'json',
        keyPath: targetKeyPath(preset),
        style: preset.style === 'opencode' ? 'opencode' : 'standard',
        writable: true,
        managed: true,
        exists,
        detected: exists,
      })
    })
  }

  for (const project of projects || []) {
    const projectLabel = path.basename(project.path) || project.path
    for (const preset of MCP_TARGET_PRESETS) {
      if (typeof preset.project !== 'function') continue
      const projectPath = preset.project(project)
      const exists = pathExistsSync(projectPath)
      if (!emittedUserTools.has(preset.tool) && !exists) continue
      targets.push({
        id: `project:${project.id}:${preset.tool}`,
        tool: preset.tool,
        label: `${projectLabel} · ${preset.label}`,
        labelZh: `${projectLabel} · ${preset.labelZh}`,
        scope: 'project',
        projectId: project.id,
        path: projectPath,
        format: MCP_FORMATS.has(preset.format) ? preset.format : 'json',
        keyPath: targetKeyPath(preset),
        style: preset.style === 'opencode' ? 'opencode' : 'standard',
        writable: true,
        managed: true,
        exists,
        detected: exists,
      })
    }
  }

  for (const entry of customEntries(custom).mcpTargets) {
    const exists = pathExistsSync(entry.path)
    targets.push({
      id: `custom:${entry.id}`,
      tool: 'custom',
      label: entry.label || path.basename(entry.path) || entry.path,
      labelZh: entry.label || path.basename(entry.path) || entry.path,
      scope: 'custom',
      projectId: undefined,
      path: entry.path,
      format: MCP_FORMATS.has(entry.format) ? entry.format : 'json',
      keyPath: targetKeyPath(entry),
      style: entry.style === 'opencode' ? 'opencode' : 'standard',
      writable: true,
      managed: true,
      exists,
      detected: exists,
    })
  }
  return targets
}

function targetKeyPath(source) {
  return Array.isArray(source.keyPath) && source.keyPath.length
    ? source.keyPath.map((segment) => String(segment))
    : [...DEFAULT_KEY_PATH]
}

function findMcpTarget(paths, projects, custom, targetId) {
  if (typeof targetId !== 'string' || targetId === '') throw new Error('targetId is required')
  const target = mcpTargets(paths, projects, custom).find((candidate) => candidate.id === targetId)
  if (!target) throw new Error(`Unknown MCP target "${targetId}"`)
  return target
}

// ---------------------------------------------------------------------------
// 5. MCP parsing helpers
// ---------------------------------------------------------------------------

function toStringMap(value) {
  if (!isPlainObject(value)) return {}
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item
    else if (typeof item === 'number' || typeof item === 'boolean') out[key] = String(item)
  }
  return out
}

function normalizeTransport(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'stdio') return 'stdio'
  if (normalized === 'http' || normalized === 'streamable-http' || normalized === 'streamablehttp') return 'http'
  if (normalized === 'sse') return 'sse'
  return null
}

function firstString(...values) {
  for (const value of values) if (typeof value === 'string' && value !== '') return value
  return null
}

function toStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
    .map((item) => String(item))
}

function applyEnabledField(server, raw) {
  if (typeof raw.enabled === 'boolean') server.enabled = raw.enabled
  else if (typeof raw.enabled === 'string') {
    const parsed = parseBoolScalar(raw.enabled)
    if (parsed.ok) server.enabled = parsed.value
  } else if (raw.disabled === true) {
    server.enabled = false
  }
}

function applyStandardServerFields(server, raw, target) {
  const rawUrl =
    target.tool === 'windsurf'
      ? firstString(raw.serverUrl, raw.server_url, raw.url)
      : firstString(raw.url)
  const type = normalizeTransport(firstString(raw.type, raw.transport, raw.transportType))
  if (type) server.transport = type
  else if (rawUrl) server.transport = 'http'

  if (typeof raw.command === 'string') server.command = raw.command
  server.args = toStringArray(raw.args)
  server.env = toStringMap(raw.env)
  if (typeof raw.cwd === 'string') server.cwd = raw.cwd
  if (rawUrl) server.url = rawUrl
  server.headers =
    Object.keys(toStringMap(raw.headers)).length > 0
      ? toStringMap(raw.headers)
      : Object.keys(toStringMap(raw.http_headers)).length > 0
        ? toStringMap(raw.http_headers)
        : toStringMap(raw.httpHeaders)
  applyEnabledField(server, raw)
}

function applyOpencodeServerFields(server, raw) {
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : ''
  if (type === 'local' || type === 'stdio') server.transport = 'stdio'
  else if (type === 'remote') server.transport = 'http'
  else {
    const normalized = normalizeTransport(firstString(raw.type, raw.transport, raw.transportType))
    if (normalized) server.transport = normalized
    else if (typeof raw.url === 'string' && raw.url !== '') server.transport = 'http'
  }

  if (Array.isArray(raw.command)) {
    server.command = raw.command.length ? String(raw.command[0]) : null
    server.args = toStringArray(raw.command.slice(1))
  } else if (typeof raw.command === 'string') {
    server.command = raw.command
    server.args = toStringArray(raw.args)
  }
  server.env = toStringMap(isPlainObject(raw.environment) ? raw.environment : raw.env)
  if (typeof raw.cwd === 'string') server.cwd = raw.cwd
  if (typeof raw.url === 'string') server.url = raw.url
  server.headers = toStringMap(raw.headers)
  applyEnabledField(server, raw)
}

function normalizeMcpServer(target, name, raw, managed) {
  const server = {
    id: `${target.id}:${name}`,
    targetId: target.id,
    tool: target.tool,
    scope: target.scope,
    projectId: target.projectId,
    path: target.path,
    name,
    transport: 'stdio',
    command: null,
    args: [],
    env: {},
    cwd: null,
    url: null,
    headers: {},
    enabled: true,
    managed,
    raw,
    error: null,
  }
  if (!isPlainObject(raw)) {
    server.error = 'Server entry is not an object'
    return server
  }
  if (target.style === 'opencode') applyOpencodeServerFields(server, raw)
  else applyStandardServerFields(server, raw, target)
  return server
}

/** Strip `//` and `/* *\/` comments plus trailing commas (JSONC tolerance). */
function stripJsonComments(text) {
  const input = stripBom(text)
  const output = []
  let quote = null
  let lastComma = -1
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (quote) {
      output.push(ch)
      if (ch === '\\') {
        if (i + 1 < input.length) {
          output.push(input[i + 1])
          i += 2
          continue
        }
        i++
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"') {
      quote = ch
      output.push(ch)
      lastComma = -1
      i++
      continue
    }
    if (ch === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++
      continue
    }
    if (ch === '/' && input[i + 1] === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (ch === ',') {
      lastComma = output.length
      output.push(ch)
      i++
      continue
    }
    if (ch === '}' || ch === ']') {
      if (lastComma >= 0) output.splice(lastComma, 1)
      lastComma = -1
      output.push(ch)
      i++
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      output.push(ch)
      i++
      continue
    }
    lastComma = -1
    output.push(ch)
    i++
  }
  return output.join('')
}

function parseJsonDocument(text, tolerant) {
  try {
    return { data: JSON.parse(stripBom(text)) }
  } catch (strictError) {
    if (!tolerant) return { error: strictError }
    try {
      return { data: JSON.parse(stripJsonComments(text)) }
    } catch (tolerantError) {
      return { error: tolerantError }
    }
  }
}

function keyPathLabel(keyPath) {
  return keyPath.join('.')
}

function getAtPath(data, keyPath) {
  let cursor = data
  for (const segment of keyPath) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) return undefined
    if (!(segment in cursor)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

function ensureMapAtPath(data, keyPath, filePath) {
  let cursor = data
  for (const segment of keyPath) {
    if (cursor[segment] === undefined) cursor[segment] = {}
    if (!isPlainObject(cursor[segment])) {
      throw new Error(`"${keyPathLabel(keyPath)}" in ${filePath} is not an object`)
    }
    cursor = cursor[segment]
  }
  return cursor
}

async function readJsonTarget(target, warnings) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.missing) return []
  if (fileRead.error) {
    warnings.push(warn(target.id, target.path, `Cannot read file: ${errorMessage(fileRead.error)}`))
    return []
  }
  const parsed = parseJsonDocument(fileRead.text, target.format === 'jsonc')
  if (parsed.error) {
    warnings.push(warn(target.id, target.path, `Malformed JSON: ${errorMessage(parsed.error)}`))
    return []
  }
  if (!isPlainObject(parsed.data)) {
    warnings.push(warn(target.id, target.path, 'Expected a JSON object'))
    return []
  }
  const keyPath = targetKeyPath(target)
  const map = getAtPath(parsed.data, keyPath)
  if (map === undefined) return []
  if (!isPlainObject(map)) {
    warnings.push(warn(target.id, target.path, `"${keyPathLabel(keyPath)}" is not an object`))
    return []
  }
  return Object.entries(map).map(([name, raw]) => normalizeMcpServer(target, name, raw, true))
}

// --- TOML ------------------------------------------------------------------

function stripTomlComment(line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '#') return line.slice(0, i)
  }
  return line
}

function readTomlString(text, start) {
  const quote = text[start]
  if (quote !== '"' && quote !== "'") return null
  let value = ''
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (quote === "'") {
      if (ch === "'") return { value, next: i + 1 }
      value += ch
      i++
      continue
    }
    if (ch === '\\') {
      const next = text[i + 1]
      i += 2
      if (next === 'n') value += '\n'
      else if (next === 't') value += '\t'
      else if (next === 'r') value += '\r'
      else if (next === '"') value += '"'
      else if (next === '\\') value += '\\'
      else if (next === 'b') value += '\b'
      else if (next === 'f') value += '\f'
      else if (next === 'u' || next === 'U') {
        const length = next === 'u' ? 4 : 8
        const hex = text.slice(i, i + length)
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === length) {
          value += String.fromCodePoint(parseInt(hex, 16))
          i += length
        }
      } else value += next ?? ''
      continue
    }
    if (ch === '"') return { value, next: i + 1 }
    value += ch
    i++
  }
  return { value, next: i }
}

function parseTomlKeyPath(input) {
  const parts = []
  let current = ''
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === '"' || ch === "'") {
      const parsed = readTomlString(input, i)
      if (!parsed) return null
      current += parsed.value
      i = parsed.next
      continue
    }
    if (ch === '.') {
      parts.push(current.trim())
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  parts.push(current.trim())
  return parts
}

function parseTomlHeader(line) {
  if (!line.startsWith('[') || !line.endsWith(']')) return null
  const inner = line.slice(1, -1).trim()
  if (inner === '' || inner.startsWith('[')) return null
  const segments = parseTomlKeyPath(inner)
  if (!segments || segments.some((segment) => segment === '')) return null
  return { path: segments }
}

function tomlKeyPathText(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${tomlEscape(key)}"`
}

function tomlEscape(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function tomlString(value) {
  return `"${tomlEscape(value)}"`
}

function tomlValue(value) {
  if (typeof value === 'string') return tomlString(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`
  return tomlString(String(value))
}

function parseTomlValue(text) {
  const trimmed = text.trim()
  if (trimmed === '') return TOML_INVALID
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^[+-]?\d+$/.test(trimmed)) return Number(trimmed.replace(/_/g, ''))
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const parsed = readTomlString(trimmed, 0)
    if (!parsed || trimmed.slice(parsed.next).trim() !== '') return TOML_INVALID
    return parsed.value
  }
  if (trimmed.startsWith('[')) {
    if (!trimmed.endsWith(']')) return TOML_INVALID
    const items = splitFlowItems(trimmed.slice(1, -1))
    const array = []
    for (const item of items) {
      const value = parseTomlValue(item)
      if (value === TOML_INVALID) return TOML_INVALID
      array.push(value)
    }
    return array
  }
  if (trimmed.startsWith('{')) return TOML_INVALID
  // Dates, times and unknown scalar forms: keep the raw text.
  return trimmed
}

function splitFlowItems(text) {
  const items = []
  let current = ''
  let depth = 0
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      current += ch
      if (quote === "'" && ch === "'" && text[i + 1] === "'") {
        current += text[i + 1]
        i++
        continue
      }
      if (quote === '"' && ch === '\\') {
        current += text[i + 1] ?? ''
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '[' || ch === '{') {
      depth++
      current += ch
      continue
    }
    if (ch === ']' || ch === '}') {
      depth--
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      items.push(current)
      current = ''
      continue
    }
    current += ch
  }
  items.push(current)
  return items.map((item) => item.trim()).filter((item) => item !== '')
}

function parseTomlServers(text) {
  const lines = String(text).split(/\r?\n/)
  const rawServers = new Map()
  const invalid = new Map()
  let block = null
  let i = 0
  while (i < lines.length) {
    const original = lines[i]
    const line = stripTomlComment(original).trim()
    i++
    if (line === '') continue

    if (line.startsWith('[')) {
      const header = parseTomlHeader(line)
      if (!header || header.path[0] !== 'mcp_servers') {
        block = null
        continue
      }
      const segments = header.path
      if (segments.length === 1) {
        block = { skip: true }
        continue
      }
      const name = segments[1]
      if (!rawServers.has(name)) rawServers.set(name, {})
      if (segments.length === 2) {
        block = { name, child: null }
      } else if (segments.length === 3 && TOML_CHILD_TABLES.has(segments[2])) {
        const raw = rawServers.get(name)
        if (!isPlainObject(raw[segments[2]])) raw[segments[2]] = {}
        block = { name, child: segments[2] }
      } else {
        block = { name, skip: true }
      }
      continue
    }

    if (!block || block.skip) continue
    const equals = topLevelEqualsIndex(line)
    if (equals < 0) {
      invalid.set(block.name, `Malformed TOML line: ${original.trim()}`)
      continue
    }
    const key = parseTomlKeyPath(line.slice(0, equals))
    let valueText = line.slice(equals + 1)
    if (!key || key.length !== 1) {
      invalid.set(block.name, `Malformed TOML key: ${original.trim()}`)
      continue
    }
    let balance = bracketBalance(valueText)
    while (balance > 0 && i < lines.length) {
      const nextLine = stripTomlComment(lines[i])
      i++
      valueText += `\n${nextLine}`
      balance += bracketBalance(nextLine)
    }
    const value = parseTomlValue(valueText)
    if (value === TOML_INVALID) {
      invalid.set(block.name, `Malformed TOML value in [mcp_servers.${block.name}]`)
      continue
    }
    const raw = rawServers.get(block.name)
    if (block.child) raw[block.child][key[0]] = value
    else raw[key[0]] = value
  }
  return { rawServers, invalid }
}

function topLevelEqualsIndex(line) {
  let quote = null
  let depth = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    else if (ch === '=' && depth === 0) return i
  }
  return -1
}

function bracketBalance(text) {
  let balance = 0
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (quote === '"' && ch === '\\') {
        i++
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[') balance++
    else if (ch === ']') balance--
  }
  return balance
}

async function readTomlTarget(target, warnings) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.missing) return []
  if (fileRead.error) {
    warnings.push(warn(target.id, target.path, `Cannot read file: ${errorMessage(fileRead.error)}`))
    return []
  }
  const { rawServers, invalid } = parseTomlServers(fileRead.text)
  const servers = []
  for (const [name, message] of invalid.entries()) {
    warnings.push(warn(target.id, target.path, `Cannot parse [mcp_servers.${name}]: ${message}`))
  }
  for (const [name, raw] of rawServers.entries()) {
    if (invalid.has(name)) continue
    servers.push(normalizeMcpServer(target, name, raw, true))
  }
  return servers
}

function removeTomlServer(text, name) {
  const lines = String(text).split('\n')
  const output = []
  let skipping = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      const header = parseTomlHeader(stripTomlComment(trimmed))
      skipping = !!(header && header.path[0] === 'mcp_servers' && header.path[1] === name)
      if (skipping) continue
      output.push(line)
      continue
    }
    if (skipping) continue
    output.push(line)
  }
  return output.join('\n')
}

function tomlHasServer(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = stripTomlComment(line).trim()
    if (!trimmed.startsWith('[')) continue
    const header = parseTomlHeader(trimmed)
    if (header && header.path[0] === 'mcp_servers' && header.path[1] === name) return true
  }
  return false
}

function buildTomlServerBlock(name, server) {
  const lines = [`[mcp_servers.${tomlKeyPathText(name)}]`, `type = ${tomlString(server.transport)}`]
  if (server.command) lines.push(`command = ${tomlString(server.command)}`)
  if (server.args.length) lines.push(`args = [${server.args.map(tomlString).join(', ')}]`)
  if (server.cwd) lines.push(`cwd = ${tomlString(server.cwd)}`)
  if (server.url) lines.push(`url = ${tomlString(server.url)}`)
  if (server.enabled === false) lines.push('enabled = false')
  const envKeys = Object.keys(server.env)
  if (envKeys.length) {
    lines.push('', `[mcp_servers.${tomlKeyPathText(name)}.env]`)
    for (const key of envKeys) lines.push(`${tomlKeyPathText(key)} = ${tomlString(server.env[key])}`)
  }
  const headerKeys = Object.keys(server.headers)
  if (headerKeys.length) {
    lines.push('', `[mcp_servers.${tomlKeyPathText(name)}.http_headers]`)
    for (const key of headerKeys) lines.push(`${tomlKeyPathText(key)} = ${tomlString(server.headers[key])}`)
  }
  return lines.join('\n')
}

// --- YAML patch ------------------------------------------------------------

function parseYamlScalar(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed === '') return ''
  if (trimmed.startsWith('!!')) return trimmed
  const quoted = parseQuotedScalar(trimmed)
  if (quoted) return quoted.value
  if (trimmed.startsWith('[')) {
    const end = trimmed.lastIndexOf(']')
    if (end > 0) return splitFlowItems(trimmed.slice(1, end)).map(parseYamlScalar)
    return trimmed
  }
  if (trimmed === '~' || trimmed === 'null' || trimmed === 'Null' || trimmed === 'NULL') return null
  if (/^(?:true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true'
  return trimmed.replace(/\s+#.*$/, '').trim()
}

function parseYamlKey(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quoted = parseQuotedScalar(trimmed)
    if (quoted) return quoted.value
  }
  return trimmed
}

function parseYamlBlockValue(lines, index, indent) {
  let j = index
  while (j < lines.length && isBlankOrComment(lines[j])) j++
  if (j >= lines.length) return [null, j]
  const content = lines[j].slice(countIndent(lines[j]))
  if (countIndent(lines[j]) < indent) return [null, j]
  if (content === '-' || content.startsWith('- ')) return parseYamlSequence(lines, j, indent)
  if (/^[^:]+:/.test(content)) return parseYamlMapping(lines, j, indent)
  return [parseYamlScalar(content), j + 1]
}

function parseYamlSequence(lines, index, indent) {
  const array = []
  let i = index
  while (i < lines.length) {
    const line = lines[i]
    if (isBlankOrComment(line)) {
      i++
      continue
    }
    if (countIndent(line) < indent) break
    if (countIndent(line) !== indent) break
    const content = line.slice(indent)
    if (!(content === '-' || content.startsWith('- '))) break
    const rest = content === '-' ? '' : content.slice(2).trim()
    i++
    if (rest === '') {
      let j = i
      while (j < lines.length && isBlankOrComment(lines[j])) j++
      if (j < lines.length && countIndent(lines[j]) > indent) {
        const [value, next] = parseYamlBlockValue(lines, j, countIndent(lines[j]))
        array.push(value)
        i = next
      } else {
        array.push(null)
      }
      continue
    }
    if (/^[^:]+:(?:\s|$)/.test(rest) && !rest.startsWith('!!')) {
      const childIndent = indent + 2
      const block = [rest]
      while (i < lines.length) {
        if (isBlankOrComment(lines[i])) {
          i++
          continue
        }
        if (countIndent(lines[i]) <= indent) break
        block.push(lines[i].length >= childIndent ? lines[i].slice(childIndent) : lines[i].trimStart())
        i++
      }
      const [mapping] = parseYamlMapping(block, 0, 0)
      array.push(mapping)
      continue
    }
    array.push(parseYamlScalar(rest))
  }
  return [array, i]
}

function parseYamlMapping(lines, index, indent) {
  const object = {}
  let i = index
  while (i < lines.length) {
    const line = lines[i]
    if (isBlankOrComment(line)) {
      i++
      continue
    }
    const lineIndent = countIndent(line)
    if (lineIndent < indent) break
    if (lineIndent > indent) {
      i++
      continue
    }
    const content = line.slice(indent)
    const match = /^([^:]+?):(?:[ \t]+(.*))?$/.exec(content)
    if (!match) break
    const key = parseYamlKey(match[1])
    const rest = (match[2] ?? '').trim()
    i++
    if (rest !== '') {
      object[key] = parseYamlScalar(rest)
      continue
    }
    let j = i
    while (j < lines.length && isBlankOrComment(lines[j])) j++
    if (j < lines.length && countIndent(lines[j]) > indent) {
      const [value, next] = parseYamlBlockValue(lines, j, countIndent(lines[j]))
      object[key] = value
      i = next
    } else {
      object[key] = null
    }
  }
  return [object, i]
}

/** Parse the top-level list of a DSH patch file into `{ start, end, obj }` rows. */
function parsePatchItems(text) {
  const lines = String(text).split(/\r?\n/)
  const items = []
  let i = 0
  while (i < lines.length) {
    if (isBlankOrComment(lines[i])) {
      i++
      continue
    }
    const first = lines[i]
    if (!(first.trim() === '-' || /^-\s/.test(first))) break
    const start = i
    let j = i + 1
    while (j < lines.length) {
      const line = lines[j]
      if (isBlankOrComment(line)) {
        j++
        continue
      }
      if (countIndent(line) === 0) break
      j++
    }
    let end = j
    while (end > start + 1 && lines[end - 1].trim() === '') end--
    items.push({ start, end, obj: parsePatchItemObject(lines, start, end) })
    i = j
  }
  return items
}

function parsePatchItemObject(lines, start, end) {
  try {
    const first = lines[start]
    let contentStart = first.indexOf('-') + 1
    while (contentStart < first.length && (first[contentStart] === ' ' || first[contentStart] === '\t')) contentStart++
    const childIndent = contentStart
    const block = [first.slice(contentStart)]
    for (let k = start + 1; k < end; k++) {
      const line = lines[k]
      if (line.trim() === '') {
        block.push('')
        continue
      }
      if (childIndent > 0 && line.length >= childIndent && line.slice(0, childIndent).trim() === '') {
        block.push(line.slice(childIndent))
      } else {
        block.push(line.replace(/^[ \t]+/, ''))
      }
    }
    const [object] = parseYamlMapping(block, 0, 0)
    return isPlainObject(object) ? object : null
  } catch {
    return null
  }
}

function removePatchRows(text, items, predicate) {
  const lines = String(text).split('\n')
  const remove = new Set()
  for (const item of items) {
    if (!predicate(item)) continue
    for (let k = item.start; k < item.end; k++) remove.add(k)
  }
  if (!remove.size) return { text, removed: 0 }
  const output = []
  for (let k = 0; k < lines.length; k++) if (!remove.has(k)) output.push(lines[k])
  return { text: output.join('\n'), removed: remove.size }
}

function yamlTopLevelArrayState(text) {
  const meaningful = String(text)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      return trimmed !== '' && !trimmed.startsWith('#')
    })
  if (!meaningful.length) return 'empty'
  const first = meaningful[0].trim()
  return first === '-' || first.startsWith('- ') ? 'array' : 'other'
}

function isManagedMcpRow(object) {
  return isPlainObject(object) && object.name === MCP_CLIENT_NAME
}

function patchRowServerName(object) {
  if (!isManagedMcpRow(object) || !isPlainObject(object.config)) return null
  return typeof object.config.serverName === 'string' && object.config.serverName !== ''
    ? object.config.serverName
    : null
}

function patchRowId(object) {
  return isPlainObject(object) && typeof object.id === 'string' ? object.id : null
}

function findPatchRow(items, predicate) {
  for (const item of items) if (predicate(item.obj)) return item
  return null
}

async function readPatchTarget(target, warnings) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.missing) return []
  if (fileRead.error) {
    warnings.push(warn(target.id, target.path, `Cannot read file: ${errorMessage(fileRead.error)}`))
    return []
  }
  const state = yamlTopLevelArrayState(fileRead.text)
  if (state === 'other') {
    warnings.push(warn(target.id, target.path, `The profile patch ${target.path} is not a YAML entry list`))
    return []
  }
  const items = parsePatchItems(fileRead.text)
  const servers = []
  for (const item of items) {
    const object = item.obj
    if (!isManagedMcpRow(object)) continue
    const id = patchRowId(object) ?? ''
    const managed = id.startsWith('mcp-')
    const config = isPlainObject(object.config) ? object.config : null
    let name = config && typeof config.serverName === 'string' ? config.serverName : ''
    let error = null
    if (!config) error = 'Missing config block'
    else if (!name) {
      error = 'Missing serverName'
      name = id.replace(/^mcp-/, '') || 'unknown'
    }
    const raw = { ...(config || {}), __patchId: id }
    const server = normalizeMcpServer(target, name, raw, managed)
    // DSH rows are enabled/disabled at the patch-item level, never inside `config:`.
    server.enabled = object.disabled !== true
    if (error) server.error = error
    servers.push(server)
  }
  return servers
}

function buildPatchRow(rowId, name, server) {
  const lines = [
    `- id: ${rowId}`,
    `  name: '${MCP_CLIENT_NAME}'`,
  ]
  if (server.enabled === false) lines.push('  disabled: true')
  lines.push(
    '  config:',
    `    serverName: ${formatScalar(name)}`,
    `    transport: ${server.transport === 'stdio' ? 'stdio' : 'streamable-http'}`,
  )
  if (server.command) lines.push(`    command: ${formatScalar(server.command)}`)
  if (server.args.length) lines.push(`    args: [${server.args.map(formatScalar).join(', ')}]`)
  if (Object.keys(server.env).length) {
    lines.push('    env:')
    for (const [key, value] of Object.entries(server.env)) lines.push(`      ${formatScalar(key)}: ${formatScalar(value)}`)
  }
  if (server.cwd) lines.push(`    cwd: ${formatScalar(server.cwd)}`)
  if (server.url) lines.push(`    url: ${formatScalar(server.url)}`)
  if (Object.keys(server.headers).length) {
    lines.push('    headers:')
    for (const [key, value] of Object.entries(server.headers)) lines.push(`      ${formatScalar(key)}: ${formatScalar(value)}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 5. MCP server list / mutations
// ---------------------------------------------------------------------------

export async function listMcpServers(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const servers = []
  const warnings = []
  for (const target of mcpTargets(paths, projects, custom)) {
    if (!target.exists) continue
    if (target.format === 'json' || target.format === 'jsonc') {
      servers.push(...(await readJsonTarget(target, warnings)))
    } else if (target.format === 'toml') servers.push(...(await readTomlTarget(target, warnings)))
    else servers.push(...(await readPatchTarget(target, warnings)))
  }
  return { servers, warnings }
}

function cleanServerPayload(server) {
  const clean = {
    transport: server.transport,
    command: null,
    args: [],
    env: {},
    cwd: null,
    url: null,
    headers: {},
    enabled: undefined,
  }
  if (server.command !== undefined && server.command !== null) {
    if (typeof server.command !== 'string') throw new Error('server.command must be a string')
    clean.command = server.command
  }
  if (server.args !== undefined && server.args !== null) {
    if (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== 'string')) {
      throw new Error('server.args must be an array of strings')
    }
    clean.args = server.args
  }
  if (server.env !== undefined && server.env !== null) {
    if (!isPlainObject(server.env) || Object.values(server.env).some((value) => typeof value !== 'string')) {
      throw new Error('server.env must be an object of strings')
    }
    clean.env = server.env
  }
  if (server.cwd !== undefined && server.cwd !== null) {
    if (typeof server.cwd !== 'string') throw new Error('server.cwd must be a string')
    clean.cwd = server.cwd
  }
  if (server.url !== undefined && server.url !== null) {
    if (typeof server.url !== 'string') throw new Error('server.url must be a string')
    clean.url = server.url
  }
  if (server.headers !== undefined && server.headers !== null) {
    if (!isPlainObject(server.headers) || Object.values(server.headers).some((value) => typeof value !== 'string')) {
      throw new Error('server.headers must be an object of strings')
    }
    clean.headers = server.headers
  }
  if (server.enabled !== undefined) {
    if (typeof server.enabled !== 'boolean') throw new Error('server.enabled must be a boolean')
    clean.enabled = server.enabled
  }
  return clean
}

function buildStandardJsonEntry(existing, server, target) {
  const entry = { ...existing, type: server.transport }
  if (server.command) entry.command = server.command
  else delete entry.command
  if (server.args.length) entry.args = server.args
  else delete entry.args
  if (Object.keys(server.env).length) entry.env = server.env
  else delete entry.env
  if (server.cwd) entry.cwd = server.cwd
  else delete entry.cwd
  if (target.tool === 'windsurf') {
    if (server.url) entry.serverUrl = server.url
    else delete entry.serverUrl
    delete entry.url
  } else if (server.url) {
    entry.url = server.url
  } else {
    delete entry.url
  }
  if (Object.keys(server.headers).length) entry.headers = server.headers
  else delete entry.headers
  if (typeof server.enabled === 'boolean') entry.enabled = server.enabled
  else delete entry.enabled
  return entry
}

function buildOpencodeJsonEntry(existing, server) {
  const entry = { ...existing }
  if (server.transport === 'stdio') {
    entry.type = 'local'
    const command = server.command ? [server.command, ...server.args] : [...server.args]
    if (command.length) entry.command = command
    else delete entry.command
    if (Object.keys(server.env).length) entry.environment = server.env
    else delete entry.environment
    delete entry.url
    delete entry.headers
  } else {
    entry.type = 'remote'
    if (server.url) entry.url = server.url
    else delete entry.url
    if (Object.keys(server.headers).length) entry.headers = server.headers
    else delete entry.headers
    delete entry.command
    delete entry.environment
  }
  if (server.cwd) entry.cwd = server.cwd
  else delete entry.cwd
  if (typeof server.enabled === 'boolean') entry.enabled = server.enabled
  else delete entry.enabled
  return entry
}

async function saveJsonServer(paths, target, name, originalName, server) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.error) throw new Error(`Cannot read ${target.path}: ${errorMessage(fileRead.error)}`)
  let data = {}
  if (fileRead.text !== undefined && fileRead.text.trim() !== '') {
    const parsed = parseJsonDocument(fileRead.text, target.format === 'jsonc')
    if (parsed.error) throw new Error(`Cannot parse ${target.path}: ${errorMessage(parsed.error)}`)
    data = parsed.data
  }
  if (!isPlainObject(data)) throw new Error(`${target.path} is not a JSON object`)
  const map = ensureMapAtPath(data, targetKeyPath(target), target.path)
  const previous = originalName ?? name
  const existing = isPlainObject(map[previous]) ? map[previous] : {}
  map[name] =
    target.style === 'opencode'
      ? buildOpencodeJsonEntry(existing, server)
      : buildStandardJsonEntry(existing, server, target)
  if (originalName && originalName !== name) delete map[originalName]
  await writeWithBackup(paths, target.path, `${JSON.stringify(data, null, 2)}\n`)
}

async function saveTomlServer(paths, target, name, originalName, server) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.error) throw new Error(`Cannot read ${target.path}: ${errorMessage(fileRead.error)}`)
  let text = fileRead.text ?? ''
  text = removeTomlServer(text, originalName ?? name)
  const normalized = text.replace(/\n+$/, '')
  const block = buildTomlServerBlock(name, server)
  const next = normalized === '' ? `${block}\n` : `${normalized}\n\n${block}\n`
  await writeWithBackup(paths, target.path, next)
}

async function savePatchServer(paths, target, name, originalName, server) {
  const fileRead = await readTextFile(target.path)
  if (fileRead.error) throw new Error(`Cannot read ${target.path}: ${errorMessage(fileRead.error)}`)
  const sourceText = fileRead.text ?? ''
  if (yamlTopLevelArrayState(sourceText) === 'other') {
    throw new Error(`The profile patch ${target.path} is not a YAML entry list`)
  }
  const items = parsePatchItems(sourceText)

  let rowId = null
  if (originalName) {
    const existing = findPatchRow(items, (object) => patchRowServerName(object) === originalName)
    rowId = patchRowId(existing?.obj)
  }
  if (!rowId) {
    const existing = findPatchRow(items, (object) => patchRowServerName(object) === name)
    rowId = patchRowId(existing?.obj)
  }
  if (!rowId) rowId = `mcp-${slugify(name)}`

  const removeIds = new Set([rowId])
  const removal = removePatchRows(sourceText, items, (item) => {
    const object = item.obj
    if (!isManagedMcpRow(object)) return false
    const id = patchRowId(object)
    if (id && removeIds.has(id)) return true
    const serverName = patchRowServerName(object)
    return !!id && id.startsWith('mcp-') && (serverName === name || serverName === originalName)
  })
  if (removal.removed === 0 && !originalName) {
    const duplicate = findPatchRow(items, (object) => patchRowServerName(object) === name)
    if (duplicate) throw new Error(`MCP server "${name}" already exists in ${target.path}`)
  }

  const block = buildPatchRow(rowId, name, server)
  const normalized = removal.text.replace(/\n+$/, '')
  const next = normalized === '' ? `${block}\n` : `${normalized}\n\n${block}\n`
  await writeWithBackup(paths, target.path, next)
}

export async function saveMcpServer({
  paths,
  projects = [],
  custom = {},
  targetId,
  name,
  originalName,
  server,
} = {}) {
  if (!paths) throw new Error('paths is required')
  const target = findMcpTarget(paths, projects, custom, targetId)
  if (typeof name !== 'string' || !MCP_NAME_RE.test(name)) {
    throw new Error('Invalid MCP server name; use 1-32 letters, digits, "_" or "-"')
  }
  if (originalName !== undefined && originalName !== null) {
    if (typeof originalName !== 'string' || !MCP_NAME_RE.test(originalName)) {
      throw new Error('Invalid originalName')
    }
  }
  if (!isPlainObject(server)) throw new Error('server is required')
  const transport = normalizeTransport(server.transport)
  if (!transport) throw new Error('server.transport must be "stdio", "http" or "sse"')
  const clean = cleanServerPayload({ ...server, transport })
  const previousName = typeof originalName === 'string' && originalName !== '' ? originalName : null
  if (target.format === 'json' || target.format === 'jsonc') {
    await saveJsonServer(paths, target, name, previousName, clean)
  } else if (target.format === 'toml') await saveTomlServer(paths, target, name, previousName, clean)
  else await savePatchServer(paths, target, name, previousName, clean)
  return { saved: true }
}

export async function deleteMcpServer({ paths, projects = [], custom = {}, targetId, name } = {}) {
  if (!paths) throw new Error('paths is required')
  const target = findMcpTarget(paths, projects, custom, targetId)
  if (typeof name !== 'string' || !MCP_NAME_RE.test(name)) {
    throw new Error('Invalid MCP server name; use 1-32 letters, digits, "_" or "-"')
  }
  if (!target.exists) return { removed: false }

  if (target.format === 'json' || target.format === 'jsonc') {
    const fileRead = await readTextFile(target.path)
    if (fileRead.missing) return { removed: false }
    if (fileRead.error) throw new Error(`Cannot read ${target.path}: ${errorMessage(fileRead.error)}`)
    const parsed = parseJsonDocument(fileRead.text, target.format === 'jsonc')
    if (parsed.error) throw new Error(`Cannot parse ${target.path}: ${errorMessage(parsed.error)}`)
    if (!isPlainObject(parsed.data)) return { removed: false }
    const map = getAtPath(parsed.data, targetKeyPath(target))
    if (!isPlainObject(map)) return { removed: false }
    if (!Object.prototype.hasOwnProperty.call(map, name)) return { removed: false }
    delete map[name]
    await writeWithBackup(paths, target.path, `${JSON.stringify(parsed.data, null, 2)}\n`)
    return { removed: true }
  }

  const fileRead = await readTextFile(target.path)
  if (fileRead.missing) return { removed: false }
  if (fileRead.error) throw new Error(`Cannot read ${target.path}: ${errorMessage(fileRead.error)}`)
  const text = fileRead.text

  if (target.format === 'toml') {
    if (!tomlHasServer(text, name)) return { removed: false }
    const next = removeTomlServer(text, name).replace(/\n+$/, '')
    await writeWithBackup(paths, target.path, next === '' ? '' : `${next}\n`)
    return { removed: true }
  }

  const items = parsePatchItems(text)
  const removal = removePatchRows(text, items, (item) => {
    const object = item.obj
    if (!isManagedMcpRow(object)) return false
    const serverName = patchRowServerName(object)
    const id = patchRowId(object) ?? ''
    return serverName === name || id === `mcp-${slugify(name)}`
  })
  if (removal.removed === 0) return { removed: false }
  const next = removal.text.replace(/\n+$/, '')
  await writeWithBackup(paths, target.path, next === '' ? '' : `${next}\n`)
  return { removed: true }
}

export async function copyMcpServer({
  paths,
  projects = [],
  custom = {},
  targetId,
  name,
  toTargetIds,
} = {}) {
  if (!paths) throw new Error('paths is required')
  if (typeof name !== 'string' || name === '') throw new Error('name is required')
  const { servers } = await listMcpServers(paths, projects, custom)
  const source = servers.find((server) => server.targetId === targetId && server.name === name)
  if (!source) throw new Error(`MCP server "${name}" not found in ${targetId}`)

  const targets = mcpTargets(paths, projects, custom)
  const destinations = [...new Set(Array.isArray(toTargetIds) ? toTargetIds : [])].filter(
    (id) => id !== targetId,
  )
  const copied = []
  const skipped = []
  for (const destinationId of destinations) {
    const destination = targets.find((target) => target.id === destinationId)
    if (!destination) throw new Error(`Unknown MCP target "${destinationId}"`)
    if (servers.some((server) => server.targetId === destinationId && server.name === name)) {
      skipped.push(destinationId)
      continue
    }
    await saveMcpServer({
      paths,
      projects,
      custom,
      targetId: destinationId,
      name,
      server: {
        transport: source.transport,
        command: source.command,
        args: source.args,
        env: source.env,
        cwd: source.cwd,
        url: source.url,
        headers: source.headers,
        enabled: source.enabled,
      },
    })
    copied.push(destinationId)
  }
  return { copied, skipped }
}

// ---------------------------------------------------------------------------
// 6. Misc
// ---------------------------------------------------------------------------

export async function revealInFileManager(absolutePath) {
  try {
    if (typeof absolutePath !== 'string' || !path.isAbsolute(absolutePath)) {
      return { ok: false, error: 'Path must be absolute' }
    }
    let command
    let args
    if (process.platform === 'darwin') {
      command = 'open'
      args = ['-R', absolutePath]
    } else if (process.platform === 'win32') {
      command = 'explorer'
      args = [`/select,${absolutePath}`]
    } else {
      command = 'xdg-open'
      args = [path.dirname(absolutePath)]
    }
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

async function patchArrayIssue(paths) {
  const fileRead = await readTextFile(paths.profilePatchFile)
  if (fileRead.missing) return null
  if (fileRead.error) {
    return warn('dsh:user', paths.profilePatchFile, `Cannot read DSH patch file: ${errorMessage(fileRead.error)}`)
  }
  if (yamlTopLevelArrayState(fileRead.text) === 'other') {
    return warn('dsh:user', paths.profilePatchFile, `The profile patch ${paths.profilePatchFile} is not a YAML entry list`)
  }
  return null
}

/**
 * Full-text search across skill bodies (frontmatter excluded).
 * @param {object} paths Resolved paths.
 * @param {Array<object>} projects Tracked projects.
 * @param {object} custom Custom roots/targets.
 * @param {string} query Search term, at least 2 characters, case-insensitive.
 * @param {{limit?: number}} options Result cap.
 * @returns {Promise<{query: string, results: Array<{skillKey: string, name: string, matches: Array<{line: number, text: string}>}>, scanned: number}>}
 */
export async function searchSkillBodies(paths, projects = [], custom = {}, query, options = {}) {
  if (!paths) throw new Error('paths is required')
  const term = String(query ?? '').trim()
  if (term.length < 2) throw new Error('Search needs at least 2 characters')
  const needle = term.toLowerCase()
  const limit = Number.isInteger(options.limit) ? Math.min(Math.max(options.limit, 1), 200) : 50
  const { skills } = await scanSkills(paths, projects, custom)
  const results = []
  for (const skill of skills) {
    if (!skill.valid || !skill.canonicalPath) continue
    let text
    try {
      text = await fsp.readFile(skill.canonicalPath, 'utf8')
    } catch {
      continue
    }
    if (text.length > 512 * 1024) text = text.slice(0, 512 * 1024)
    const body = stripFrontmatter(text)
    if (!body.toLowerCase().includes(needle)) continue
    const matches = []
    const lines = body.split('\n')
    for (let index = 0; index < lines.length && matches.length < 3; index++) {
      if (!lines[index].toLowerCase().includes(needle)) continue
      matches.push({ line: index + 1, text: lines[index].trim().slice(0, 240) })
    }
    results.push({ skillKey: skill.key, name: skill.name, matches })
    if (results.length >= limit) break
  }
  return { query: term, results, scanned: skills.length }
}

/** Body of a skill file without its YAML frontmatter block. */
function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') return text
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].trim() === '---') return lines.slice(index + 1).join('\n')
  }
  return text
}

export async function doctor(paths, projects = [], custom = {}) {
  if (!paths) throw new Error('paths is required')
  const issues = []
  const roots = skillRoots(paths, projects, custom)
  for (const root of roots) {
    if (!root.exists) issues.push(warn(root.id, root.path, 'Skill root does not exist'))
  }

  const scan = await scanSkills(paths, projects, custom)
  issues.push(...scan.warnings)

  const byTool = new Map()
  for (const skill of scan.skills) {
    if (skill.key.startsWith('broken:')) continue
    for (const tool of new Set(skill.roots.map((root) => root.tool))) {
      if (!byTool.has(tool)) byTool.set(tool, new Map())
      const nameMap = byTool.get(tool)
      const list = nameMap.get(skill.name) ?? []
      list.push(skill)
      nameMap.set(skill.name, list)
    }
  }
  let duplicateNames = 0
  for (const [tool, nameMap] of byTool.entries()) {
    for (const [name, list] of nameMap.entries()) {
      if (list.length < 2) continue
      duplicateNames++
      for (const skill of list.slice(1)) {
        issues.push(
          warn(
            skill.primaryRootId ?? tool,
            skill.canonicalPath ?? skill.dirPath ?? '',
            `Duplicate skill name "${name}" is visible to ${toolLabel(tool)}`,
          ),
        )
      }
    }
  }

  const mcp = await listMcpServers(paths, projects, custom)
  issues.push(...mcp.warnings)
  let disabledServers = 0
  for (const server of mcp.servers) {
    if (server.enabled || server.tool === 'dsh') continue
    disabledServers++
    issues.push(
      warn(
        server.targetId,
        server.path,
        `MCP server "${server.name}" is disabled in ${toolLabel(server.tool)}`,
      ),
    )
  }

  const patchIssue = await patchArrayIssue(paths)
  if (patchIssue) issues.push(patchIssue)

  const brokenLinks = scan.skills.filter((skill) => skill.key.startsWith('broken:')).length
  const invalidSkills = scan.skills.filter((skill) => !skill.valid && !skill.key.startsWith('broken:')).length
  return {
    issues,
    summary: {
      ok: issues.length === 0,
      issues: issues.length,
      skillRoots: roots.length,
      missingSkillRoots: roots.filter((root) => !root.exists).length,
      skills: scan.skills.length,
      invalidSkills,
      brokenLinks,
      duplicateSkillNames: duplicateNames,
      mcpTargets: mcpTargets(paths, projects, custom).length,
      mcpServers: mcp.servers.length,
      disabledMcpServers: disabledServers,
      unreadableMcpFiles: mcp.warnings.length,
    },
  }
}
