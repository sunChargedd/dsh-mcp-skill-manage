# dsh-mcp-skill-manage — internal contract

Two independent work areas:

- `lib/adapters.js` — pure Node data layer (skills + MCP config files across agent tools). Implemented by `host-adapters`.
- `index.js` + `client.js` — Host plugin entry / web routes / agent tool, and the browser UI. Implemented by the Lead.

The package is ESM (`"type": "module"`), Node ≥ 20, **no npm dependencies**: only `node:fs`, `node:fs/promises`, `node:path`, `node:os`, `node:crypto`. `lib/adapters.js` must not import anything else.

All adapter functions are `async`, return plain JSON-serializable objects (`null`/string/number/boolean/array/plain object), never class instances, and throw `Error` with a human-readable message for invalid input. Read-only adapters never mutate; mutating adapters back up before writing and write atomically (tmp file + rename in the same directory).

Stable ids used by both halves (do not invent new spellings):

Tool ids: `dsh`, `agents`, `claude`, `codex`, `cursor`.
Root id format: `<tool>:user` for user roots, `project:<projectId>:<tool>` for project roots.
MCP target id format: `<tool>:user` or `project:<projectId>:<tool>`.

## 1. Path resolution

```js
export function resolvePaths(env = process.env) => {
  home,            // env.HOME || os.homedir()
  dshHome,         // env.DSH_HOME || ~/.dsh
  agentsHome,      // env.DSH_AGENTS_HOME || ~/.agents
  codexHome,       // env.CODEX_HOME || ~/.codex
  claudeHome,      // env.CLAUDE_CONFIG_DIR || ~/.claude
  cursorHome,      // ~/.cursor
  profileDir,      // env.DSH_PROFILE_DIR || ''
  profilePatchFile // profileDir ? <profileDir>/cordis.patch.yml : <dshHome>/cordis.patch.yml
}
```

`projects` is always an array of `{ id, path }` supplied by the caller (persisted by index.js); adapters only read/write inside those paths.

## 2. Skill roots

> **Revision 2 (authoritative):** the hard-coded per-tool tables below are replaced by the preset
> tables in `lib/presets.js` (`SKILL_ROOT_PRESETS`) plus user-defined additions. The Root shape and
> the id format stay exactly as specified here.

```js
export function skillRoots(paths, projects = [], custom = {}) => Root[]
```

`custom` is `{ skillDirs: [{ id, path, label }], mcpTargets: [...] }` supplied by `index.js` from the
user's settings; treat it as optional.

Root:
```js
{
  id: 'agents:user',            // <tool>:user | <tool>:user:<n> | project:<projectId>:<tool> | custom:<id>
  tool: 'agents',               // preset tool id, or 'custom'
  label: 'Shared agents hub',
  labelZh: '共享 agents 目录',   // parallel localized label ('custom' label = user supplied)
  path: '/Users/x/.agents/skills',
  scope: 'user' | 'shared' | 'project' | 'custom',
  projectId: undefined,         // set only for project roots
  exists: true,
  writable: true,
  detected: true,               // false for an `always` preset whose path does not exist yet
}
```

Rules:
- Iterate `SKILL_ROOT_PRESETS` from `lib/presets.js`. Each preset has `candidates(paths) => string[]`,
  optional `project(project) => string`, `always: true|false`, `tool`, `label`, `labelZh`, `scope`.
- User root: include when `preset.always` **or** any candidate path exists. With several candidates,
  emit one root per candidate that exists; when none exists and `always`, emit the first candidate.
  id = `<tool>:user` for the first candidate, `<tool>:user:<index>` for the rest.
- Project roots: for each project, emit a root when `preset.always` **or** the tool's user root was
  emitted **or** that project path exists. id = `project:<project.id>:<tool>`.
- Append `custom.skillDirs` entries as roots with `tool: 'custom'`, `scope: 'custom'`,
  `id: 'custom:<id>'`, `exists` computed; they are always writable.
- `detected` = `exists` for non-always roots; an `always` root may have `exists: false`.
- Sort: user/shared roots first in preset order, then project roots (project order), then custom.

## 3. Skill scanning

A skill is either a directory bundle `<root>/<name>/SKILL.md` or a flat file `<root>/<name>.md`. Only direct children are scanned. Skip a directory named `.system` (Codex built-in). Skip names starting with `.` otherwise.

```js
export async function scanSkills(paths, projects = []) => {
  skills: Skill[],
  warnings: Warning[]
}
```

Warning: `{ rootId, path, message }` (non-fatal: unreadable entry, invalid frontmatter, broken symlink).

Skill:
```js
{
  key,                 // stable id: realpath of canonical dir (dir skills) / realpath of the .md file (flat skills);
                       // for a broken symlink: `broken:<rootId>:<name>`
  name,                // directory/file base name (from path, not frontmatter)
  description,         // '' when missing/invalid
  whenToUse,           // '' when absent
  metadata,            // plain object, {} when absent
  modelInvocable,      // !disable-model-invocation, default true
  userInvocable,       // user-invocable, default true
  valid,               // false when frontmatter missing/invalid/broken link
  error,               // string | null
  format,              // 'dir' | 'file'
  canonicalPath,       // absolute path of the canonical SKILL.md (dir skill) or the .md file (flat skill)
  dirPath,             // absolute directory holding the skill (dir skill) or its parent (flat skill)
  primaryRootId,       // root whose entry was resolved as canonical
  roots,               // [{ rootId, tool, label, path, link }] every managed root where this skill is discoverable
  visibility,          // { dsh: 'dir'|'link'|null, agents: ..., claude: ..., codex: ..., cursor: ... }
  updatedAt,           // mtimeMs integer | null
  size,                // SKILL.md byte size | null
}
```

Dedup rules: group candidates by realpath (`fs.realpath`). The canonical entry is a real directory/file (not a symlink) located in a managed root; prefer `agents:user`, then `dsh:user`, then `claude:user`, `codex:user`, `cursor:user`, then project roots. A symlink entry adds its root to `roots` with `link: true`; a real entry adds `link: false`. A broken symlink becomes a skill with `valid: false`, `error: 'Broken symlink: <target>', format: 'dir'`, `key: 'broken:<rootId>:<name>'`, and no canonicalPath.

`visibility[tool]` is `'dir'` when a real entry lives in one of that tool's managed roots, `'link'` when only symlinked entries exist there, `null` otherwise (project roots count too — project visibility is per tool, not per project).

Frontmatter parsing (minimal YAML subset):
- File must start with a line `---`, then frontmatter, then a line `---`, then the Markdown body.
- Top-level `key: value` scalars; `metadata:` followed by indented `key: value` lines (one level, values are scalars); unknown top-level keys are kept as raw text lines in the Skill's `extraRaw` array (used to round-trip on save — do not expose to the UI).
- Scalars: single-quoted ('' escapes), double-quoted (with `\"`, `\\`, `\n`), plain. Inline comments after a plain scalar (` # ...`) are stripped.
- Block scalars `|`, `>-`, `>`, `|-` for `description`/`whenToUse`: fold (`>`) or keep (`|`) the indented continuation lines.
- Booleans for `disable-model-invocation` / `user-invocable`: accept `true/false/yes/no/on/off/1/0` case-insensitively and YAML booleans; any other value makes the skill invalid (`error: 'invalid <key>'`).
- Invalid: missing opening/closing fence, missing/empty `name` or `description`, or `name` not matching `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Set `valid: false` + `error`, keep the skill in the list.

Sorting: `valid` first, then `name` ascending (localeCompare, `numeric: true`).

```js
export async function readSkill(skillKey) => { body, skill } // skill = re-scanned Skill; throws if missing
```

`body` is the Markdown after the frontmatter (exactly as on disk, no trimming beyond the leading newline after the closing `---`).

## 4. Skill mutations

```js
export async function saveSkill(input) => { key, canonicalPath, path }
```

`input`:
```js
{
  paths, projects,
  skillKey,          // null/undefined for a new skill; existing canonical key for an edit
  targetRootId,      // required for a new skill; root id from skillRoots()
  name,              // kebab-case
  description,       // required non-empty
  whenToUse,         // optional string
  metadata,          // optional plain object of string→string
  modelInvocable,    // boolean
  userInvocable,     // boolean
  body,              // Markdown string
  extraRaw,          // optional: raw frontmatter lines to preserve (from scanSkills)
  renameFrom,        // optional: previous file base name when editing and renaming
}
```

Rules:
- New skill: create `<rootPath>/<name>/SKILL.md` (mkdir -p root path). Throw `Skill "<name>" already exists in <root>` if that path exists.
- Edit: locate the canonical path behind `skillKey`; rewrite it in place, keeping dir vs flat format. Rename (`renameFrom && renameFrom !== name`): build the new path next to the old one, `fs.rename`, then rewrite every managed symlink that pointed at the old path to the new one. Throw on collision.
- Serialized frontmatter order: `name`, `description`, `whenToUse` (only when non-empty), `metadata` (only when non-empty, as nested block), `disable-model-invocation: true` (only when `!modelInvocable`), `user-invocable: false` (only when `!userInvocable`), then `extraRaw` lines.
- Quote a scalar with single quotes when it is empty, has leading/trailing whitespace, contains `: ` or ` #`, starts with one of `-?:,[]{}#&*!|>'"%@\``, or equals a YAML boolean/null/number spelling. Escape `'` as `''`.
- Atomic write via `<file>.tmp-<random>` + rename.
- Do not write `name` from frontmatter differently from the directory name.

```js
export async function deleteSkill({ paths, projects, skillKey }) => { removed: string[], backup: string | null }
```

- Remove every managed-root symlink entry pointing at the canonical path (unlink only symlinks; never recurse through them).
- Back up the skill (copy dir or file) into `<dshHome>/.mcp-skill-manager/backups/<ISO-timestamp>/<name>/` first; return that path.
- Remove the canonical dir/file recursively (`fs.rm(..., { recursive: true, force: true })`).
- Idempotent: deleting an already-missing skill returns empty `removed` and `backup: null` without throwing.

```js
export async function setSkillVisibility({ paths, projects, skillKey, roots }) => { changed: string[], warnings: Warning[] }
```

`roots` = array of root ids that must expose this skill (managed roots only; the canonical root is skipped).
- Entry missing and root writable: `mkdir -p rootPath`, create a **relative** symlink `<rootPath>/<name>` → canonical dir/file using `fs.symlink(target, linkPath, 'dir'|'file')`. Record the root id in `changed`. If symlink creation fails (e.g. EPERM), throw `Cannot create symlink in <rootPath>: <reason>`.
- Entry already a symlink to the canonical path: no-op.
- Entry exists but is a real dir/file or points elsewhere: keep it, push warning `{ rootId, path, message: 'A different entry already exists' }`.
- Entry is a symlink to the canonical path but its root id is not requested: unlink it, record in `changed`. Only touch entries that are symlinks whose realpath equals the canonical realpath.
- Never create a root directory that does not already have a writable parent; `mkdir -p` is allowed for the root itself.

## 5. MCP targets and servers

> **Revision 2 (authoritative):** targets come from `MCP_TARGET_PRESETS` in `lib/presets.js` plus
> `custom.mcpTargets`; the four user targets below are the `always` presets. Two new flexibility
> fields appear on targets: `keyPath` (object path to the server map) and `style` (`standard` or
> `opencode`), and `format` may be `json`, `jsonc`, `toml` or `yaml-patch`.

```js
export function mcpTargets(paths, projects = [], custom = {}) => Target[]
```

Target:
```js
{
  id: 'claude:user',        // <tool>:user | <tool>:user:<n> | project:<projectId>:<tool> | custom:<id>
  tool: 'claude',
  label: 'Claude Code',
  labelZh: 'Claude Code',
  scope: 'user' | 'project' | 'custom',
  projectId: undefined,
  path: '/Users/x/.claude.json',
  format: 'json' | 'jsonc' | 'toml' | 'yaml-patch',
  keyPath: ['mcpServers'],   // json/jsonc only; default ['mcpServers']
  style: 'standard',         // json/jsonc only; 'opencode' for OpenCode's mcp map
  writable: true,
  managed: true,
  exists: true,
  detected: true,
}
```

Rules:
- Iterate `MCP_TARGET_PRESETS`. User target: include a candidate when it exists, or when
  `preset.always` (then emit the first candidate even if missing). id = `<tool>:user` for the first
  emitted candidate, `<tool>:user:<index>` for the rest.
- Project target: emit when `preset.project` exists and the project-scoped file exists OR the
  tool's user target was emitted. id = `project:<project.id>:<tool>`.
- Append `custom.mcpTargets` as ids `custom:<id>` with `tool: 'custom'`, the user-supplied
  `format`, optional `keyPath`/`style`, always writable/managed.
- `dsh` is the only `yaml-patch` target; `codex` the only `toml` target.
- JSONC files: tolerate `//` and `/* */` comments and trailing commas when parsing. Writing
  rewrites the document as pretty JSON (comments are lost); the pre-write backup preserves the
  original bytes.
- `keyPath`: read/write/delete the server map at that nested object path, creating intermediate
  objects on write and leaving every sibling key untouched.
- `style: 'opencode'`: stored entries look like
  `{ type: 'local', command: ['npx','-y','pkg'], environment: {K:'V'}, enabled: true }` or
  `{ type: 'remote', url, headers, enabled }`. Normalize to/from the common server shape:
  local → command/args/env, remote → url/headers, `enabled` passes through; unknown keys are
  preserved on edit when possible (carry `raw`).

The rest of this section (McpServer shape, parsing, save/delete/copy rules, DSH patch `disabled`
handling, backups, atomic writes, unrelated-line preservation) is unchanged; the only signature
change is the extra `custom` argument:

```js
export async function listMcpServers(paths, projects = [], custom = {}) => { servers, warnings }
export async function saveMcpServer({ paths, projects, custom, targetId, name, originalName, server })
export async function deleteMcpServer({ paths, projects, custom, targetId, name })
export async function copyMcpServer({ paths, projects, custom, targetId, name, toTargetIds })
```

`scanSkills`, `readSkill`, `saveSkill`, `deleteSkill`, `setSkillVisibility` likewise take
`{ paths, projects, custom, ... }`, and `doctor(paths, projects = [], custom = {})`.

## 6. Misc exports

```js
export function backupRoot(paths) => string   // <dshHome>/.mcp-skill-manager/backups
export async function revealInFileManager(absolutePath) => { ok: boolean, error?: string }
  // macOS: `open -R <path>`; linux: `xdg-open <dirname>`; win32: `explorer /select,<path>`;
  // spawn detached, ignore errors; never throw.
export async function doctor(paths, projects = []) => { issues: Warning[], summary: {...} }
  // Non-mutating sanity report: skill roots that do not exist, broken symlinks, invalid skills,
  // duplicate skill names visible to the same tool, unreadable MCP files, MCP rows of other tools
  // that are disabled, and DSH patch files whose top-level YAML is not an array.
```

## 7. Self test

`scripts/test-adapters.mjs` must cover, with a temp `HOME`/`DSH_HOME`:
1. `resolvePaths`/`skillRoots` ids and paths.
2. Create → scan → read → edit (including rename and body) → visibility to 3 roots → delete, asserting filesystem state (symlink targets, backup dir) after each step.
3. Flat `<name>.md` skills round-trip.
4. Invalid frontmatter and broken symlink become `valid: false` entries, not exceptions.
5. MCP: add/edit/rename/delete on a JSON target, a TOML target and a YAML patch target; assert unrelated lines in a pre-seeded TOML/patch file are byte-identical after edits; `copyMcpServer` into two targets, second copy skipped.
6. `doctor` reports the seeded problems.

Run it with `node scripts/test-adapters.mjs` from the package directory; it must exit 0 with a short `ok` summary and leave no temp files.

## 8. HTTP contract (index.js ↔ client.js)

Host routes (`ctx.webServer.register`, no `/api` prefix):
- `GET  /mcp-skill-manager/state` → `{ ok: true, value: Snapshot }`
- `POST /mcp-skill-manager/action` → body `{ action, ...params }` → `{ ok: true, value }` or `{ ok: false, error: { code, message } }` (HTTP 200 for handled failures, 400 for malformed bodies).

Actions (every mutation returns the refreshed snapshot as `state`, so the page never merges stale data):
- `state/refresh` `{}` → `{ state }`
- `skill/read` `{ skillKey }` → `{ skill, body }`
- `skill/save` `{ skillKey?, targetRootId?, name, description, whenToUse?, metadata?, modelInvocable?, userInvocable?, body, extraRaw?, renameFrom?, visibility?: string[] }` → `{ key, state }`
- `skill/delete` `{ skillKey }` → `{ removed, backup, state }`
- `skill/reveal` `{ skillKey }` → `{ result }`
- `skill/search` `{ query, limit? }` → `{ query, results: [{ skillKey, name, matches: [{ line, text }] }], scanned }` (reveals the skill's `SKILL.md` in the OS file manager)
- `skill/visibility` `{ skillKey, roots: string[] }` → `{ changed, warnings, state }`
- `skill/duplicate` `{ skillKey, targetRootId, name }` → `{ key, changed, state }`
- `mcp/save` `{ targetId, name, originalName?, server }` → `{ state }`
- `mcp/delete` `{ targetId, name }` → `{ removed, state }`
- `mcp/copy` `{ targetId, name, toTargetIds }` → `{ copied, skipped, state }`
- `mcp/reveal` `{ targetId }` → `{ result }`
- `project/add` `{ path }` → `{ state }`
- `project/remove` `{ projectId }` → `{ state }`
- `custom/add_skill_dir` `{ path, label? }` → `{ state }`
- `custom/remove_skill_dir` `{ id }` → `{ state }`
- `custom/add_mcp_target` `{ path, format, keyPath?, style?, label? }` → `{ state }`
- `custom/remove_mcp_target` `{ id }` → `{ state }`
- `skill/reveal` `{ skillKey }` → `{ result }`
- `skill/search` `{ query, limit? }` → `{ query, results: [{ skillKey, name, matches: [{ line, text }] }], scanned }`
- `skill/export` `{ skillKeys }` → `{ filename, base64, count }`
- `skill/export_to_file` `{ skillKeys }` → `{ path, count }`
- `skill/import_zip` `{ targetRootId, base64, filename? }` → `{ imported, warnings, state }`
- `skill/import_path` `{ targetRootId, path }` → `{ imported, state }`
- `backup/restore` `{ backupId, name, targetRootId? }` → `{ restored, kind, state }`
- `backup/delete` `{ backupId }` → `{ deleted, state }`
- `backup/reveal` `{ backupId }` → `{ result }`
- `mcp/health` `{ targetId, name, timeoutMs? }` → `{ health }`
- `market/skills` `{ query, limit? }` → `{ query, results, count, source }`
- `market/mcp` `{ query, limit? }` → `{ query, results, count, source }`
- `market/install_skill` `{ source, skillId, targetRootId }` → `{ imported, warnings, source, skillId, state }`
- `market/install_mcp` `{ targetId, entry | name }` → `{ name, warnings, state }`

Snapshot:
```js
{
  version: 1,
  paths: { home, dshHome, agentsHome, profileDir },   // display only
  projects: [{ id, path }],
  skillRoots: Root[],
  skills: Skill[],
  mcpTargets: Target[],
  mcpServers: McpServer[],
  warnings: Warning[],
  doctor: { issues: Warning[], summary: object },
  capabilities: { dshPatchWritable: boolean, symlinks: boolean },
}
```

The Host snapshots settings in `<dshHome>/.mcp-skill-manager/settings.json` (`{ version: 1, projects: [{id,path}] }`) and treats a missing/corrupt file as empty.
