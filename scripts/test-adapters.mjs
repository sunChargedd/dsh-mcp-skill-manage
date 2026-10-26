/**
 * Self test for lib/adapters.js.
 *
 * Runs entirely inside a throwaway temp tree (`HOME`, `DSH_HOME`, all tool
 * homes) and removes it afterwards. Run with: `node scripts/test-adapters.mjs`.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  backupRoot,
  copyMcpServer,
  deleteMcpServer,
  deleteSkill,
  doctor,
  listMcpServers,
  mcpTargets,
  readSkill,
  resolvePaths,
  saveMcpServer,
  saveSkill,
  scanSkills,
  setSkillVisibility,
  skillRoots,
} from '../lib/adapters.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-msm-test-'))
const home = path.join(tmp, 'home')
const dshHome = path.join(tmp, 'dsh')
const agentsHome = path.join(tmp, 'agents')
const codexHome = path.join(tmp, 'codex')
const claudeHome = path.join(tmp, 'claude')
const profileDir = path.join(dshHome, 'profiles', 'desktop')
const projectPath = path.join(tmp, 'projects', 'demo-project')
const customSkillDir = path.join(tmp, 'custom-skills')
const customMcpFile = path.join(tmp, 'custom-mcp', 'settings.json')

const env = {
  HOME: home,
  DSH_HOME: dshHome,
  DSH_AGENTS_HOME: agentsHome,
  CODEX_HOME: codexHome,
  CLAUDE_CONFIG_DIR: claudeHome,
  DSH_PROFILE_DIR: profileDir,
}
const paths = resolvePaths(env)
const projects = [{ id: 'p1', path: projectPath }]
const custom = {
  skillDirs: [{ id: 'mine', path: customSkillDir, label: 'My skills' }],
  mcpTargets: [
    {
      id: 'vscode',
      path: customMcpFile,
      format: 'jsonc',
      keyPath: ['mcp', 'servers'],
      label: 'VS Code settings',
    },
  ],
}

let checks = 0
function ok(value, message) {
  assert.ok(value, message)
  checks += 1
}
function eq(actual, expected, message) {
  assert.deepEqual(actual, expected, message)
  checks += 1
}
function includes(text, needle, message) {
  assert.ok(text.includes(needle), `${message}: expected to include ${JSON.stringify(needle)}`)
  checks += 1
}
async function rejects(promiseFactory, regex, message) {
  await assert.rejects(promiseFactory, regex, message)
  checks += 1
}
async function writeFile(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text, 'utf8')
}
async function readFile(file) {
  return fs.readFile(file, 'utf8')
}
async function makeSkill(dir, name, description, extra = '') {
  await writeFile(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n`)
  return path.join(dir, name, 'SKILL.md')
}
async function findInBackups(dir, needle) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (await findInBackups(entryPath, needle)) return true
      continue
    }
    const text = await fs.readFile(entryPath, 'utf8').catch(() => '')
    if (text.includes(needle)) return true
  }
  return false
}

try {
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  await fs.mkdir(claudeHome, { recursive: true })
  await fs.mkdir(projectPath, { recursive: true })
  await fs.mkdir(customSkillDir, { recursive: true })

  // -------------------------------------------------------------------------
  // 1. resolvePaths / skillRoots / mcpTargets ids and paths
  // -------------------------------------------------------------------------
  eq(paths.home, home, 'paths.home')
  eq(paths.dshHome, dshHome, 'paths.dshHome')
  eq(paths.agentsHome, agentsHome, 'paths.agentsHome')
  eq(paths.codexHome, codexHome, 'paths.codexHome')
  eq(paths.claudeHome, claudeHome, 'paths.claudeHome')
  eq(paths.cursorHome, path.join(home, '.cursor'), 'paths.cursorHome')
  eq(paths.profilePatchFile, path.join(profileDir, 'cordis.patch.yml'), 'paths.profilePatchFile')
  eq(backupRoot(paths), path.join(dshHome, '.mcp-skill-manager', 'backups'), 'backupRoot')

  const defaults = resolvePaths({ HOME: home })
  eq(defaults.dshHome, path.join(home, '.dsh'), 'default dshHome')
  eq(defaults.codexHome, path.join(home, '.codex'), 'default codexHome')
  eq(defaults.claudeHome, path.join(home, '.claude'), 'default claudeHome')
  eq(defaults.profilePatchFile, path.join(home, '.dsh', 'cordis.patch.yml'), 'default patch file')

  const roots = skillRoots(paths, projects)
  eq(
    roots.map((root) => root.id),
    [
      'agents:user',
      'dsh:user',
      'claude:user',
      'codex:user',
      'cursor:user',
      'project:p1:agents',
      'project:p1:dsh',
      'project:p1:claude',
      'project:p1:codex',
      'project:p1:cursor',
    ],
    'skillRoots ids',
  )
  eq(roots[0].path, path.join(agentsHome, 'skills'), 'agents root path')
  eq(roots[0].scope, 'shared', 'agents scope')
  eq(roots[0].label, 'Shared agents hub', 'agents label')
  eq(roots[0].labelZh, '共享 agents 目录', 'agents labelZh')
  eq(roots[1].label, 'DSH', 'dsh label')
  eq(roots[5].label, 'demo-project · Shared agents hub', 'project root label')
  eq(roots[5].path, path.join(projectPath, '.agents', 'skills'), 'project agents path')
  eq(roots[5].scope, 'project', 'project scope')
  eq(roots[5].projectId, 'p1', 'project id')
  ok(roots.every((root) => root.writable === true), 'all roots writable')
  ok(roots.every((root) => root.exists === false && root.detected === false), 'initial roots missing/undetected')

  const rootsWithCustom = skillRoots(paths, projects, custom)
  const customRoot = rootsWithCustom[rootsWithCustom.length - 1]
  eq(customRoot.id, 'custom:mine', 'custom root id')
  eq(customRoot.tool, 'custom', 'custom root tool')
  eq(customRoot.scope, 'custom', 'custom root scope')
  eq(customRoot.label, 'My skills', 'custom root label')
  eq(customRoot.exists, true, 'custom root exists')
  ok(customRoot.detected === true, 'custom root detected')

  const targets = mcpTargets(paths, projects)
  eq(
    targets.map((target) => target.id),
    ['dsh:user', 'claude:user', 'codex:user', 'cursor:user'],
    'mcpTargets ids',
  )
  eq(targets[0].format, 'yaml-patch', 'dsh target format')
  eq(targets[1].format, 'json', 'claude target format')
  eq(targets[1].path, path.join(home, '.claude.json'), 'claude target path')
  eq(targets[1].keyPath, ['mcpServers'], 'claude keyPath')
  eq(targets[1].style, 'standard', 'claude style')
  eq(targets[2].format, 'toml', 'codex target format')
  eq(targets[3].path, path.join(home, '.cursor', 'mcp.json'), 'cursor target path')
  ok(targets.every((target) => target.exists === false && target.detected === false), 'initial targets missing')
  eq(targets[0].labelZh, 'DSH（profile 配置）', 'dsh labelZh')

  const targetsWithCustom = mcpTargets(paths, projects, custom)
  const customTarget = targetsWithCustom[targetsWithCustom.length - 1]
  eq(customTarget.id, 'custom:vscode', 'custom target id')
  eq(customTarget.tool, 'custom', 'custom target tool')
  eq(customTarget.format, 'jsonc', 'custom target format')
  eq(customTarget.keyPath, ['mcp', 'servers'], 'custom target keyPath')
  eq(customTarget.scope, 'custom', 'custom target scope')
  eq(customTarget.exists, false, 'custom target missing')

  // -------------------------------------------------------------------------
  // 2. Skill lifecycle: create → scan → read → edit/rename → visibility → delete
  // -------------------------------------------------------------------------
  const created = await saveSkill({
    paths,
    projects,
    targetRootId: 'agents:user',
    name: 'demo-skill',
    description: 'Demo skill for tests',
    whenToUse: 'Testing adapters',
    metadata: { origin: 'test' },
    modelInvocable: true,
    userInvocable: false,
    body: '\n# Demo\n\nHello world.\n',
  })
  const demoDir = path.join(agentsHome, 'skills', 'demo-skill')
  eq(created.key, await fs.realpath(demoDir), 'new skill key')
  eq(created.canonicalPath, path.join(demoDir, 'SKILL.md'), 'new skill canonicalPath')
  ok(existsSync(created.canonicalPath), 'new SKILL.md exists')
  await rejects(
    () => saveSkill({ paths, projects, targetRootId: 'agents:user', name: 'demo-skill', description: 'dup', body: '' }),
    /already exists/,
    'duplicate skill rejected',
  )
  await rejects(
    () => saveSkill({ paths, projects, targetRootId: 'agents:user', name: 'Bad Name', description: 'x', body: '' }),
    /Invalid skill name/,
    'invalid name rejected',
  )
  await rejects(
    () => saveSkill({ paths, projects, targetRootId: 'agents:user', name: 'valid-name', description: '  ', body: '' }),
    /description is required/,
    'empty description rejected',
  )

  let scan = await scanSkills(paths, projects)
  let demo = scan.skills.find((skill) => skill.name === 'demo-skill')
  ok(!!demo, 'demo-skill scanned')
  ok(demo.valid, 'demo-skill valid')
  eq(demo.format, 'dir', 'demo format')
  eq(demo.description, 'Demo skill for tests', 'demo description')
  eq(demo.whenToUse, 'Testing adapters', 'demo whenToUse')
  eq(demo.metadata, { origin: 'test' }, 'demo metadata')
  eq(demo.modelInvocable, true, 'demo modelInvocable')
  eq(demo.userInvocable, false, 'demo userInvocable')
  eq(demo.primaryRootId, 'agents:user', 'demo primaryRoot')
  eq(demo.visibility.agents, 'dir', 'demo agents visibility')
  eq(demo.visibility.dsh, null, 'demo dsh visibility')
  eq(demo.roots.length, 1, 'demo roots')
  eq(demo.roots[0].link, false, 'demo root real')
  eq(demo.error, null, 'demo error')
  ok(typeof demo.updatedAt === 'number' && demo.updatedAt > 0, 'demo updatedAt')
  ok(typeof demo.size === 'number' && demo.size > 0, 'demo size')

  const read = await readSkill(created.key)
  eq(read.body, '\n# Demo\n\nHello world.\n', 'readSkill body')
  eq(read.skill.name, 'demo-skill', 'readSkill name')
  eq(read.skill.valid, true, 'readSkill valid')

  const edited = await saveSkill({
    paths,
    projects,
    skillKey: created.key,
    name: 'demo-renamed',
    description: 'Renamed skill',
    body: '\n# Renamed\n',
    modelInvocable: false,
    renameFrom: 'demo-skill',
  })
  const renamedDir = path.join(agentsHome, 'skills', 'demo-renamed')
  ok(!existsSync(demoDir), 'old skill dir removed after rename')
  ok(existsSync(path.join(renamedDir, 'SKILL.md')), 'renamed SKILL.md exists')
  eq(edited.key, await fs.realpath(renamedDir), 'renamed key')
  const editedText = await readFile(path.join(renamedDir, 'SKILL.md'))
  includes(editedText, 'disable-model-invocation: true', 'edit writes model flag')
  includes(editedText, 'description: Renamed skill', 'edit writes description')
  ok(!editedText.includes('whenToUse'), 'edit dropped empty whenToUse')
  ok(!editedText.includes('metadata:'), 'edit dropped empty metadata')
  eq((await readSkill(edited.key)).body, '\n# Renamed\n', 'edited body round-trips')

  const visibility = await setSkillVisibility({
    paths,
    projects,
    skillKey: edited.key,
    roots: ['dsh:user', 'claude:user', 'codex:user'],
  })
  eq(visibility.changed.slice().sort(), ['claude:user', 'codex:user', 'dsh:user'], 'visibility changed roots')
  eq(visibility.warnings, [], 'visibility warnings empty')
  const unknownRoots = await setSkillVisibility({
    paths,
    projects,
    skillKey: edited.key,
    roots: ['dsh:user', 'claude:user', 'codex:user', 'gemini:user'],
  })
  eq(unknownRoots.warnings, [{ rootId: 'gemini:user', path: '', message: 'Unknown skill root' }], 'unknown root warning')
  eq(unknownRoots.changed, [], 'unknown root changes nothing')
  const dshLink = path.join(dshHome, 'skills', 'demo-renamed')
  for (const linkPath of [dshLink, path.join(claudeHome, 'skills', 'demo-renamed'), path.join(codexHome, 'skills', 'demo-renamed')]) {
    ok(existsSync(linkPath), `link exists ${linkPath}`)
    const stat = await fs.lstat(linkPath)
    ok(stat.isSymbolicLink(), `link is symlink ${linkPath}`)
    const target = await fs.readlink(linkPath)
    ok(!path.isAbsolute(target), `link target is relative ${linkPath}`)
    eq(await fs.realpath(linkPath), await fs.realpath(renamedDir), `link resolves ${linkPath}`)
  }
  scan = await scanSkills(paths, projects)
  demo = scan.skills.find((skill) => skill.name === 'demo-renamed')
  eq(demo.visibility.agents, 'dir', 'scan agents dir')
  eq(demo.visibility.dsh, 'link', 'scan dsh link')
  eq(demo.visibility.claude, 'link', 'scan claude link')
  eq(demo.visibility.codex, 'link', 'scan codex link')
  eq(demo.visibility.cursor, null, 'scan cursor null')
  eq(demo.roots.length, 4, 'scan roots count')

  const trimmed = await setSkillVisibility({ paths, projects, skillKey: edited.key, roots: ['dsh:user', 'claude:user'] })
  eq(trimmed.changed, ['codex:user'], 'visibility removes unrequested link')
  ok(!existsSync(path.join(codexHome, 'skills', 'demo-renamed')), 'codex link removed')
  ok(existsSync(dshLink), 'dsh link kept')

  const renamedReal = await fs.realpath(renamedDir)
  const deleted = await deleteSkill({ paths, projects, skillKey: edited.key })
  ok(deleted.removed.includes(path.join(dshHome, 'skills', 'demo-renamed')), 'delete removed dsh link')
  ok(deleted.removed.includes(path.join(claudeHome, 'skills', 'demo-renamed')), 'delete removed claude link')
  ok(deleted.removed.includes(renamedReal), 'delete removed canonical dir')
  ok(deleted.backup.startsWith(backupRoot(paths)), 'delete backup under backupRoot')
  ok(existsSync(path.join(deleted.backup, 'SKILL.md')), 'delete backup contains SKILL.md')
  ok(!existsSync(renamedDir) && !existsSync(dshLink), 'delete filesystem state')
  eq(await deleteSkill({ paths, projects, skillKey: edited.key }), { removed: [], backup: null }, 'delete idempotent')

  // Custom root skill.
  const customCreated = await saveSkill({
    paths,
    projects,
    custom,
    targetRootId: 'custom:mine',
    name: 'custom-demo',
    description: 'Custom root skill',
    body: '\n# Custom\n',
  })
  const customScan = await scanSkills(paths, projects, custom)
  const customSkill = customScan.skills.find((skill) => skill.name === 'custom-demo')
  eq(customSkill.primaryRootId, 'custom:mine', 'custom skill primary root')
  eq(customSkill.visibility.custom, 'dir', 'custom skill visibility')
  await deleteSkill({ paths, projects, custom, skillKey: customCreated.key })
  ok(!existsSync(path.join(customSkillDir, 'custom-demo')), 'custom skill deleted')

  // -------------------------------------------------------------------------
  // 3. Flat `<name>.md` skills round-trip
  // -------------------------------------------------------------------------
  const codexSkills = path.join(codexHome, 'skills')
  const flatFile = path.join(codexSkills, 'flat-skill.md')
  await writeFile(
    flatFile,
    '---\nname: flat-skill\ndescription: Flat file skill\nlicense: MIT\nallowed-tools:\n  - Read\n---\n\n# Flat\n\nContent here.\n',
  )
  scan = await scanSkills(paths, projects)
  let flat = scan.skills.find((skill) => skill.name === 'flat-skill')
  eq(flat.format, 'file', 'flat format')
  ok(flat.valid, 'flat valid')
  eq(flat.canonicalPath, await fs.realpath(flatFile), 'flat canonicalPath')
  eq(flat.visibility.codex, 'dir', 'flat codex visibility')
  eq((await readSkill(flat.key)).body, '\n# Flat\n\nContent here.\n', 'flat body')
  ok(flat.extraRaw.includes('license: MIT'), 'flat extraRaw captured')

  const flatEdited = await saveSkill({
    paths,
    projects,
    skillKey: flat.key,
    name: 'flat-skill',
    description: 'Flat file skill edited',
    body: '\n# Flat v2\n',
    extraRaw: flat.extraRaw,
  })
  eq(flatEdited.canonicalPath, await fs.realpath(flatFile), 'flat edit path unchanged')
  ok(!existsSync(path.join(codexSkills, 'flat-skill')), 'flat edit stays flat')
  let flatText = await readFile(flatFile)
  includes(flatText, 'license: MIT', 'flat keeps unknown key')
  includes(flatText, '  - Read', 'flat keeps unknown block')
  includes(flatText, 'description: Flat file skill edited', 'flat description edited')
  eq((await readSkill(flatEdited.key)).body, '\n# Flat v2\n', 'flat edited body')

  const flatVisibility = await setSkillVisibility({ paths, projects, skillKey: flatEdited.key, roots: ['agents:user'] })
  eq(flatVisibility.changed, ['agents:user'], 'flat visibility changed')
  const flatLink = path.join(agentsHome, 'skills', 'flat-skill')
  ok(existsSync(flatLink), 'flat link exists')
  eq(await fs.realpath(flatLink), await fs.realpath(flatFile), 'flat link resolves')

  const flatRenamed = await saveSkill({
    paths,
    projects,
    skillKey: flatEdited.key,
    name: 'flat-renamed',
    description: 'Flat file skill edited',
    body: '\n# Flat v2\n',
    renameFrom: 'flat-skill',
  })
  const newFlat = path.join(codexSkills, 'flat-renamed.md')
  const flatLinkRenamed = path.join(agentsHome, 'skills', 'flat-renamed')
  ok(!existsSync(flatFile), 'flat old file renamed away')
  ok(existsSync(newFlat), 'flat new file exists')
  eq(flatRenamed.canonicalPath, await fs.realpath(newFlat), 'flat renamed canonicalPath')
  ok(!existsSync(flatLink), 'flat old link name removed on rename')
  ok(existsSync(flatLinkRenamed), 'flat new link name created on rename')
  eq(await fs.realpath(flatLinkRenamed), await fs.realpath(newFlat), 'flat link target updated')

  const flatDeleted = await deleteSkill({ paths, projects, skillKey: flatRenamed.key })
  ok(flatDeleted.removed.includes(flatLinkRenamed), 'flat delete removed renamed link')
  ok(!existsSync(newFlat) && !existsSync(flatLinkRenamed), 'flat delete filesystem state')
  ok(flatDeleted.backup && existsSync(path.join(flatDeleted.backup, 'flat-renamed.md')), 'flat backup contains file')

  // -------------------------------------------------------------------------
  // 4. Invalid frontmatter / broken symlink entries, no exceptions
  // -------------------------------------------------------------------------
  await writeFile(path.join(agentsHome, 'skills', 'bad-fm', 'SKILL.md'), 'no frontmatter at all\n')
  await makeSkill(path.join(agentsHome, 'skills'), 'bad-name', 'Bad Name skill', '')
  await writeFile(
    path.join(agentsHome, 'skills', 'bad-name', 'SKILL.md'),
    '---\nname: Bad Name\ndescription: nope\n---\n\nBody\n',
  )
  await writeFile(
    path.join(agentsHome, 'skills', 'bad-bool', 'SKILL.md'),
    '---\nname: bad-bool\ndescription: nope\ndisable-model-invocation: maybe\n---\n\nBody\n',
  )
  await fs.symlink(path.join(tmp, 'does-not-exist'), path.join(agentsHome, 'skills', 'broken-skill'))
  const noReadFile = await makeSkill(path.join(agentsHome, 'skills'), 'no-read', 'Unreadable')
  await fs.chmod(noReadFile, 0o000)

  const invalidScan = await scanSkills(paths, projects)
  const badFm = invalidScan.skills.find((skill) => skill.name === 'bad-fm')
  ok(!!badFm && badFm.valid === false, 'bad frontmatter invalid')
  ok(typeof badFm.error === 'string' && badFm.error.length > 0, 'bad frontmatter error')
  eq(badFm.description, '', 'bad frontmatter description empty')
  const badName = invalidScan.skills.find((skill) => skill.name === 'bad-name')
  ok(!badName.valid, 'bad name invalid')
  eq(badName.error, 'Invalid name "Bad Name"', 'bad name error')
  const badBool = invalidScan.skills.find((skill) => skill.name === 'bad-bool')
  ok(!badBool.valid, 'bad bool invalid')
  eq(badBool.error, 'invalid disable-model-invocation', 'bad bool error')
  const broken = invalidScan.skills.find((skill) => skill.key === 'broken:agents:user:broken-skill')
  ok(!!broken, 'broken symlink listed')
  eq(broken.valid, false, 'broken invalid')
  eq(broken.format, 'dir', 'broken format')
  eq(broken.canonicalPath, null, 'broken canonicalPath null')
  includes(broken.error, 'Broken symlink: ', 'broken error')
  const noRead = invalidScan.skills.find((skill) => skill.name === 'no-read')
  ok(!!noRead, 'unreadable skill still listed')
  if (!noRead.valid) ok(typeof noRead.error === 'string' && noRead.error.length > 0, 'unreadable error reported')
  await fs.chmod(noReadFile, 0o644)
  ok(invalidScan.warnings.length >= 2, 'invalid scan warnings')
  const validFlags = invalidScan.skills.map((skill) => skill.valid)
  ok(validFlags.indexOf(false) === -1 || validFlags.slice(validFlags.indexOf(false)).every((flag) => !flag), 'valid skills sorted first')
  eq((await readSkill(badFm.key)).body, 'no frontmatter at all\n', 'read invalid skill body')

  // -------------------------------------------------------------------------
  // 5a. MCP JSON target: add / edit / rename / delete
  // -------------------------------------------------------------------------
  const cursorFile = path.join(home, '.cursor', 'mcp.json')
  await writeFile(
    cursorFile,
    `${JSON.stringify({ note: 'keep-me', mcpServers: { legacy: { command: 'old-bin', args: ['--old'] } } }, null, 2)}\n`,
  )
  eq((await saveMcpServer({
    paths,
    projects,
    targetId: 'cursor:user',
    name: 'alpha',
    server: {
      transport: 'stdio',
      command: 'node',
      args: ['server.js', '--flag'],
      env: { TOKEN: 'abc' },
      cwd: '/tmp',
      enabled: true,
    },
  })).saved, true, 'json save')
  let cursorData = JSON.parse(await readFile(cursorFile))
  eq(cursorData.note, 'keep-me', 'json unrelated key preserved')
  eq(cursorData.mcpServers.legacy.command, 'old-bin', 'json unrelated server preserved')
  eq(
    cursorData.mcpServers.alpha,
    { type: 'stdio', command: 'node', args: ['server.js', '--flag'], env: { TOKEN: 'abc' }, cwd: '/tmp', enabled: true },
    'json saved entry',
  )
  let list = await listMcpServers(paths, projects)
  let alpha = list.servers.find((server) => server.targetId === 'cursor:user' && server.name === 'alpha')
  eq(alpha.id, 'cursor:user:alpha', 'json server id')
  eq(alpha.transport, 'stdio', 'json transport')
  eq(alpha.args, ['server.js', '--flag'], 'json args')
  eq(alpha.env, { TOKEN: 'abc' }, 'json env')
  eq(alpha.cwd, '/tmp', 'json cwd')
  eq(alpha.managed, true, 'json managed')
  eq(alpha.error, null, 'json error')

  await saveMcpServer({ paths, projects, targetId: 'cursor:user', name: 'alpha-renamed', originalName: 'alpha', server: { transport: 'stdio', command: 'node2' } })
  cursorData = JSON.parse(await readFile(cursorFile))
  ok(!('alpha' in cursorData.mcpServers), 'json rename removed old')
  eq(cursorData.mcpServers['alpha-renamed'].command, 'node2', 'json rename kept new')
  ok(!('args' in cursorData.mcpServers['alpha-renamed']), 'json rename dropped empty args')
  eq(cursorData.note, 'keep-me', 'json rename kept unrelated key')
  eq((await deleteMcpServer({ paths, projects, targetId: 'cursor:user', name: 'alpha-renamed' })).removed, true, 'json delete')
  cursorData = JSON.parse(await readFile(cursorFile))
  ok(!('alpha-renamed' in cursorData.mcpServers), 'json delete removed entry')
  eq(cursorData.mcpServers.legacy.command, 'old-bin', 'json delete kept unrelated server')
  eq((await deleteMcpServer({ paths, projects, targetId: 'cursor:user', name: 'alpha-renamed' })).removed, false, 'json delete idempotent')

  // -------------------------------------------------------------------------
  // 5b. TOML target: add / edit / rename / delete, unrelated lines untouched
  // -------------------------------------------------------------------------
  const codexConfig = path.join(codexHome, 'config.toml')
  await writeFile(
    codexConfig,
    'model = "test-model"\n\n[model_providers.custom]\nname = "custom"\nbase_url = "http://localhost:1234/v1"\n\n[mcp_servers.existing]\ncommand = "old-bin"\nargs = ["--old"]\n\n[other]\nfoo = 1\n',
  )
  const seedBlocks = [
    'model = "test-model"',
    '[model_providers.custom]\nname = "custom"\nbase_url = "http://localhost:1234/v1"',
    '[mcp_servers.existing]\ncommand = "old-bin"\nargs = ["--old"]',
    '[other]\nfoo = 1',
  ]
  await saveMcpServer({
    paths,
    projects,
    targetId: 'codex:user',
    name: 'gamma',
    server: { transport: 'stdio', command: '/bin/echo', args: ['a', 'b'], env: { A: '1', B: '2' }, cwd: '/tmp', enabled: false },
  })
  let tomlText = await readFile(codexConfig)
  includes(tomlText, '[mcp_servers.gamma]', 'toml block added')
  includes(tomlText, 'type = "stdio"', 'toml type')
  includes(tomlText, 'enabled = false', 'toml enabled false')
  includes(tomlText, '[mcp_servers.gamma.env]', 'toml env table')
  includes(tomlText, 'A = "1"', 'toml env value')
  for (const block of seedBlocks) includes(tomlText, block, 'toml unrelated block intact')

  list = await listMcpServers(paths, projects)
  let gamma = list.servers.find((server) => server.targetId === 'codex:user' && server.name === 'gamma')
  eq(gamma.transport, 'stdio', 'toml transport')
  eq(gamma.command, '/bin/echo', 'toml command')
  eq(gamma.args, ['a', 'b'], 'toml args')
  eq(gamma.env, { A: '1', B: '2' }, 'toml env')
  eq(gamma.cwd, '/tmp', 'toml cwd')
  eq(gamma.enabled, false, 'toml enabled')
  ok(gamma.managed === true, 'toml managed')

  await saveMcpServer({
    paths,
    projects,
    targetId: 'codex:user',
    name: 'delta',
    originalName: 'gamma',
    server: { transport: 'stdio', command: '/bin/true', enabled: true },
  })
  tomlText = await readFile(codexConfig)
  ok(!tomlText.includes('[mcp_servers.gamma]'), 'toml rename removed old')
  includes(tomlText, '[mcp_servers.delta]', 'toml rename added new')
  ok(!tomlText.includes('[mcp_servers.delta.env]'), 'toml rename dropped empty env')
  ok(!tomlText.includes('enabled = false'), 'toml rename dropped disabled flag')
  for (const block of seedBlocks) includes(tomlText, block, 'toml rename kept unrelated block')

  eq((await deleteMcpServer({ paths, projects, targetId: 'codex:user', name: 'delta' })).removed, true, 'toml delete')
  tomlText = await readFile(codexConfig)
  ok(!tomlText.includes('[mcp_servers.delta]'), 'toml delete removed block')
  for (const block of seedBlocks) includes(tomlText, block, 'toml delete kept unrelated block')
  eq((await deleteMcpServer({ paths, projects, targetId: 'codex:user', name: 'delta' })).removed, false, 'toml delete idempotent')

  // -------------------------------------------------------------------------
  // 5c. YAML patch target: managed rows, row-level disabled, unrelated rows
  // -------------------------------------------------------------------------
  const patchFile = paths.profilePatchFile
  const patchSeed = `# dsh profile patch (test)\n- id: ui-theme\n  name: "@deepseek-ai/dsh-client-ui-theme"\n  config:\n    fontSize: 13\n- id: plugin-market\n  name: "@deepseek-ai/dsh-plugin-market"\n  config:\n    indexes:\n      - https://example.test/index.json\n- id: custom-mcp\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: legacy-mcp\n    transport: stdio\n    command: legacy-bin\n`
  await writeFile(patchFile, patchSeed)
  const seedRows = [
    '- id: ui-theme\n  name: "@deepseek-ai/dsh-client-ui-theme"\n  config:\n    fontSize: 13',
    '- id: plugin-market\n  name: "@deepseek-ai/dsh-plugin-market"\n  config:\n    indexes:\n      - https://example.test/index.json',
    "- id: custom-mcp\n  name: '@deepseek-ai/dsh-mcp-client'\n  config:\n    serverName: legacy-mcp\n    transport: stdio\n    command: legacy-bin",
  ]
  await saveMcpServer({
    paths,
    projects,
    targetId: 'dsh:user',
    name: 'files',
    server: { transport: 'http', url: 'http://localhost:9999/mcp', headers: { Authorization: 'Bearer t' } },
  })
  let patchText = await readFile(patchFile)
  includes(patchText, '- id: mcp-files', 'patch managed id')
  includes(patchText, "name: '@deepseek-ai/dsh-mcp-client'", 'patch client name')
  includes(patchText, 'serverName: files', 'patch serverName')
  includes(patchText, 'transport: streamable-http', 'patch transport mapping')
  includes(patchText, 'url: http://localhost:9999/mcp', 'patch url')
  includes(patchText, '      Authorization: Bearer t', 'patch header')
  ok(!patchText.includes('    enabled:'), 'patch never writes config-level enabled')
  for (const row of seedRows) includes(patchText, row, 'patch seed row intact')

  list = await listMcpServers(paths, projects)
  let files = list.servers.find((server) => server.targetId === 'dsh:user' && server.name === 'files')
  eq(files.transport, 'http', 'patch transport')
  eq(files.url, 'http://localhost:9999/mcp', 'patch url read')
  eq(files.headers, { Authorization: 'Bearer t' }, 'patch headers read')
  eq(files.managed, true, 'patch managed row')
  eq(files.raw.__patchId, 'mcp-files', 'patch raw patchId')
  eq(files.enabled, true, 'patch enabled default')
  const legacy = list.servers.find((server) => server.targetId === 'dsh:user' && server.name === 'legacy-mcp')
  eq(legacy.managed, false, 'patch unmanaged row')
  eq(legacy.command, 'legacy-bin', 'patch unmanaged command')

  await saveMcpServer({
    paths,
    projects,
    targetId: 'dsh:user',
    name: 'docs',
    originalName: 'files',
    server: { transport: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { NODE_ENV: 'test' }, enabled: false },
  })
  patchText = await readFile(patchFile)
  includes(patchText, '- id: mcp-files', 'patch edit reuses row id')
  includes(patchText, 'serverName: docs', 'patch rename serverName')
  includes(patchText, '  disabled: true', 'patch row-level disabled written')
  ok(!patchText.includes('    enabled:'), 'patch edit never writes config-level enabled')
  includes(patchText, "args: ['-y', pkg]", 'patch args serialized')
  includes(patchText, '    env:\n      NODE_ENV: test', 'patch env serialized')
  for (const row of seedRows) includes(patchText, row, 'patch rename kept seed row')
  list = await listMcpServers(paths, projects)
  const docs = list.servers.find((server) => server.targetId === 'dsh:user' && server.name === 'docs')
  eq(docs.enabled, false, 'patch row-level disabled read')
  eq(docs.command, 'npx', 'patch edit command')
  eq(docs.args, ['-y', 'pkg'], 'patch edit args')
  eq(docs.raw.__patchId, 'mcp-files', 'patch edit kept id')

  await saveMcpServer({ paths, projects, targetId: 'dsh:user', name: 'docs', server: { transport: 'stdio', command: 'npx', args: ['-y', 'pkg'], enabled: true } })
  patchText = await readFile(patchFile)
  ok(!patchText.includes('  disabled: true'), 'patch disabled removed when enabled')
  eq((await deleteMcpServer({ paths, projects, targetId: 'dsh:user', name: 'docs' })).removed, true, 'patch delete')
  patchText = await readFile(patchFile)
  ok(!patchText.includes('serverName: docs'), 'patch delete removed row')
  for (const row of seedRows) includes(patchText, row, 'patch delete kept seed row')
  eq((await deleteMcpServer({ paths, projects, targetId: 'dsh:user', name: 'docs' })).removed, false, 'patch delete idempotent')

  // -------------------------------------------------------------------------
  // 5d. JSONC tolerance, nested keyPath, OpenCode style, custom target
  // -------------------------------------------------------------------------
  const geminiFile = path.join(home, '.gemini', 'settings.json')
  await writeFile(
    geminiFile,
    '{\n  // gemini test settings\n  "mcpServers": {\n    "gem": { "command": "node", "args": ["g.js"] }, /* trailing */\n  },\n}\n',
  )
  const geminiTarget = (await mcpTargets(paths, projects)).find((target) => target.id === 'gemini:user')
  ok(!!geminiTarget, 'gemini target detected')
  eq(geminiTarget.format, 'jsonc', 'gemini format jsonc')
  list = await listMcpServers(paths, projects)
  const gem = list.servers.find((server) => server.targetId === 'gemini:user' && server.name === 'gem')
  ok(!!gem, 'jsonc server parsed')
  eq(gem.command, 'node', 'jsonc command')
  eq(gem.args, ['g.js'], 'jsonc args')
  eq(list.warnings.filter((warning) => warning.rootId === 'gemini:user').length, 0, 'jsonc no warnings')
  await saveMcpServer({ paths, projects, targetId: 'gemini:user', name: 'gem-remote', server: { transport: 'http', url: 'https://example.test/mcp' } })
  const geminiData = JSON.parse(await readFile(geminiFile))
  eq(geminiData.mcpServers['gem-remote'].url, 'https://example.test/mcp', 'jsonc rewrite parsed as JSON')
  eq(geminiData.mcpServers.gem.command, 'node', 'jsonc rewrite kept sibling server')
  ok(await findInBackups(backupRoot(paths), '// gemini test settings'), 'jsonc backup preserves original bytes')

  const opencodeFile = path.join(home, '.config', 'opencode', 'opencode.json')
  await writeFile(
    opencodeFile,
    `${JSON.stringify({
      theme: 'dark',
      mcp: {
        local1: { type: 'local', command: ['node', 'server.js'], environment: { TOKEN: 'x' }, enabled: true },
      },
    }, null, 2)}\n`,
  )
  const opencodeTarget = (await mcpTargets(paths, projects)).find((target) => target.id === 'opencode:user')
  ok(!!opencodeTarget, 'opencode target detected')
  eq(opencodeTarget.keyPath, ['mcp'], 'opencode keyPath')
  eq(opencodeTarget.style, 'opencode', 'opencode style')
  list = await listMcpServers(paths, projects)
  const local1 = list.servers.find((server) => server.targetId === 'opencode:user' && server.name === 'local1')
  eq(local1.transport, 'stdio', 'opencode local transport')
  eq(local1.command, 'node', 'opencode local command')
  eq(local1.args, ['server.js'], 'opencode local args')
  eq(local1.env, { TOKEN: 'x' }, 'opencode local environment')
  eq(local1.enabled, true, 'opencode local enabled')

  await saveMcpServer({
    paths,
    projects,
    targetId: 'opencode:user',
    name: 'remote1',
    server: { transport: 'http', url: 'https://example.test/mcp', headers: { 'X-Key': 'v' }, enabled: true },
  })
  let opencodeData = JSON.parse(await readFile(opencodeFile))
  eq(opencodeData.theme, 'dark', 'opencode unrelated key preserved')
  eq(opencodeData.mcp.remote1, { type: 'remote', url: 'https://example.test/mcp', headers: { 'X-Key': 'v' }, enabled: true }, 'opencode remote entry')

  await saveMcpServer({
    paths,
    projects,
    targetId: 'opencode:user',
    name: 'local2',
    originalName: 'local1',
    server: { transport: 'stdio', command: 'node', args: ['s2.js'], enabled: false },
  })
  opencodeData = JSON.parse(await readFile(opencodeFile))
  ok(!('local1' in opencodeData.mcp), 'opencode rename removed old')
  eq(opencodeData.mcp.local2, { type: 'local', command: ['node', 's2.js'], enabled: false }, 'opencode local entry')
  list = await listMcpServers(paths, projects)
  const local2 = list.servers.find((server) => server.targetId === 'opencode:user' && server.name === 'local2')
  eq(local2.args, ['s2.js'], 'opencode rename args')
  eq(local2.enabled, false, 'opencode rename enabled')

  eq((await saveMcpServer({
    paths,
    projects,
    custom,
    targetId: 'custom:vscode',
    name: 'c1',
    server: { transport: 'stdio', command: 'npx', args: ['pkg'] },
  })).saved, true, 'custom target save')
  const customData = JSON.parse(await readFile(customMcpFile))
  eq(customData.mcp.servers.c1.type, 'stdio', 'custom target nested keyPath')
  list = await listMcpServers(paths, projects, custom)
  const c1 = list.servers.find((server) => server.targetId === 'custom:vscode' && server.name === 'c1')
  eq(c1.command, 'npx', 'custom target list')
  eq((await deleteMcpServer({ paths, projects, custom, targetId: 'custom:vscode', name: 'c1' })).removed, true, 'custom target delete')
  eq(JSON.parse(await readFile(customMcpFile)).mcp.servers, {}, 'custom target delete leaves nested map')

  // Windsurf stores the endpoint as `serverUrl`.
  const windsurfFile = path.join(home, '.codeium', 'windsurf', 'mcp_config.json')
  await writeFile(
    windsurfFile,
    `${JSON.stringify({ mcpServers: { ws: { serverUrl: 'https://w.example/mcp', headers: { 'X-Key': 'k' } } } }, null, 2)}\n`,
  )
  ok(!!(await mcpTargets(paths, projects)).find((target) => target.id === 'windsurf:user'), 'windsurf target detected')
  list = await listMcpServers(paths, projects)
  const ws = list.servers.find((server) => server.targetId === 'windsurf:user' && server.name === 'ws')
  eq(ws.transport, 'http', 'windsurf serverUrl transport')
  eq(ws.url, 'https://w.example/mcp', 'windsurf serverUrl read')
  eq(ws.headers, { 'X-Key': 'k' }, 'windsurf headers read')
  await saveMcpServer({
    paths,
    projects,
    targetId: 'windsurf:user',
    name: 'ws2',
    server: { transport: 'http', url: 'https://w2.example/mcp', headers: { 'X-Key': '2' } },
  })
  const windsurfData = JSON.parse(await readFile(windsurfFile))
  eq(windsurfData.mcpServers.ws2, { type: 'http', serverUrl: 'https://w2.example/mcp', headers: { 'X-Key': '2' } }, 'windsurf writes serverUrl')
  ok(!('url' in windsurfData.mcpServers.ws2), 'windsurf does not write url')
  eq(windsurfData.mcpServers.ws.serverUrl, 'https://w.example/mcp', 'windsurf keeps existing entry')

  // -------------------------------------------------------------------------
  // 5e. copyMcpServer: copy into two targets, second copy skipped
  // -------------------------------------------------------------------------
  await saveMcpServer({ paths, projects, targetId: 'cursor:user', name: 'shared', server: { transport: 'stdio', command: 'npx', args: ['shared-pkg'] } })
  const copy1 = await copyMcpServer({
    paths,
    projects,
    targetId: 'cursor:user',
    name: 'shared',
    toTargetIds: ['claude:user', 'codex:user', 'claude:user', 'cursor:user'],
  })
  eq(copy1.copied.slice().sort(), ['claude:user', 'codex:user'], 'copy destinations')
  eq(copy1.skipped, [], 'copy first run skipped none')
  const copy2 = await copyMcpServer({ paths, projects, targetId: 'cursor:user', name: 'shared', toTargetIds: ['claude:user', 'codex:user'] })
  eq(copy2.copied, [], 'copy second run copied none')
  eq(copy2.skipped.slice().sort(), ['claude:user', 'codex:user'], 'copy second run skipped both')
  list = await listMcpServers(paths, projects)
  eq(list.servers.find((server) => server.targetId === 'claude:user' && server.name === 'shared').command, 'npx', 'copied into claude')
  eq(list.servers.find((server) => server.targetId === 'codex:user' && server.name === 'shared').command, 'npx', 'copied into codex')

  // -------------------------------------------------------------------------
  // 6. doctor reports the seeded problems
  // -------------------------------------------------------------------------
  await makeSkill(path.join(codexHome, 'skills'), 'dup-skill', 'Codex duplicate')
  await makeSkill(path.join(projectPath, '.codex', 'skills'), 'dup-skill', 'Project duplicate')
  await writeFile(path.join(projectPath, '.gemini', 'settings.json'), '{ this is not jsonc\n')
  await saveMcpServer({ paths, projects, targetId: 'codex:user', name: 'off', server: { transport: 'stdio', command: 'off-bin', enabled: false } })
  await writeFile(patchFile, 'foo: bar\n')
  const codexBefore = await readFile(codexConfig)
  const patchBefore = await readFile(patchFile)

  const patchList = await listMcpServers(paths, projects)
  eq(patchList.servers.filter((server) => server.tool === 'dsh').length, 0, 'non-array patch yields no dsh servers')
  ok(patchList.warnings.some((warning) => warning.message.includes('not a YAML entry list')), 'non-array patch warning listed')
  await rejects(
    () => saveMcpServer({ paths, projects, targetId: 'dsh:user', name: 'nope', server: { transport: 'stdio' } }),
    /The profile patch .* is not a YAML entry list/,
    'non-array patch rejects saves',
  )

  const report = await doctor(paths, projects)
  const messages = report.issues.map((issue) => issue.message)
  ok(report.issues.length > 0, 'doctor reports issues')
  ok(messages.some((message) => message === 'Skill root does not exist'), 'doctor missing skill root')
  ok(messages.some((message) => message.startsWith('Broken symlink: ')), 'doctor broken symlink')
  ok(messages.some((message) => message.startsWith('Invalid skill "')), 'doctor invalid skill')
  ok(messages.some((message) => message === 'Duplicate skill name "dup-skill" is visible to Codex'), 'doctor duplicate skill name')
  ok(messages.some((message) => message.includes('Malformed JSON')), 'doctor unreadable mcp file')
  ok(messages.some((message) => message.includes('MCP server "off" is disabled in Codex')), 'doctor disabled mcp row')
  ok(messages.some((message) => message.includes('not a YAML entry list')), 'doctor non-array patch')
  eq(report.summary.ok, false, 'doctor summary not ok')
  eq(report.summary.issues, report.issues.length, 'doctor issue count')
  ok(report.summary.skills >= 1 && report.summary.invalidSkills >= 2, 'doctor skill counts')
  ok(report.summary.brokenLinks >= 1, 'doctor broken link count')
  ok(report.summary.mcpServers >= 1 && report.summary.disabledMcpServers >= 1, 'doctor mcp counts')
  eq(report.summary.duplicateSkillNames, 1, 'doctor duplicate count')
  eq(await readFile(codexConfig), codexBefore, 'doctor does not mutate codex config')
  eq(await readFile(patchFile), patchBefore, 'doctor does not mutate patch file')

  // Revision 2: custom-only shapes stay clean of the seeded problems that are
  // specific to the preset roots (doctor still reports missing preset roots).
  const customOnlyReport = await doctor(paths, projects, {
    skillDirs: [{ id: 'extra', path: path.join(customSkillDir, 'missing'), label: 'Extra' }],
  })
  ok(customOnlyReport.issues.some((issue) => issue.rootId === 'custom:extra' && issue.message === 'Skill root does not exist'), 'doctor custom root detection')

  console.log(`ok - adapters self test (${checks} checks)`)
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
  if (existsSync(tmp)) throw new Error(`temp dir was not removed: ${tmp}`)
}
