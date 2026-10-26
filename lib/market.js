/**
 * Read-only market adapters: skills.sh (Agent Skill search) and the official
 * Model Context Protocol registry (MCP server search), plus install planning.
 *
 * Zero dependencies. Every network call takes an injectable `fetchImpl` and a
 * timeout so tests never touch the network and a slow source cannot stall the Host.
 *
 * @module dsh-mcp-skill-manage/market
 */

export const SKILLS_SEARCH_URL = 'https://skills.sh/api/search'
export const MCP_REGISTRY_URL = 'https://registry.modelcontextprotocol.io/v0/servers'
export const GITHUB_API = 'https://api.github.com'
export const GITHUB_RAW = 'https://raw.githubusercontent.com'

const DEFAULT_TIMEOUT_MS = 12000
const MAX_SKILL_FILES = 60
const MAX_SKILL_BYTES = 8 * 1024 * 1024
const MAX_SKILL_FILE_BYTES = 1024 * 1024

/** Fetch JSON with a timeout and a useful error message. */
async function requestJson(url, fetchImpl, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let response
  const headers = { accept: 'application/json', 'user-agent': 'dsh-mcp-skill-manage' }
  // Optional: a classic token lifts GitHub's 60 requests/hour anonymous limit.
  if (url.startsWith(GITHUB_API) && process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  try {
    response = await fetchImpl(url, {
      headers,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new Error(`Request failed: ${url} (${error && error.message ? error.message : String(error)})`)
  }
  if (!response.ok) throw new Error(`Request failed: ${url} (HTTP ${response.status})`)
  try {
    return await response.json()
  } catch {
    throw new Error(`Invalid JSON from ${url}`)
  }
}

/** Search the skills.sh market. */
export async function searchSkillMarket(query, options = {}) {
  const term = String(query ?? '').trim()
  if (term.length < 2) throw new Error('Search needs at least 2 characters')
  const limit = normalizeLimit(options.limit, 20)
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${SKILLS_SEARCH_URL}?q=${encodeURIComponent(term)}&limit=${limit}`
  const payload = await requestJson(url, fetchImpl, options)
  const results = (Array.isArray(payload.skills) ? payload.skills : [])
    .map((entry) => ({
      id: String(entry.id ?? `${entry.source}/${entry.skillId}`),
      source: String(entry.source ?? ''),
      skillId: String(entry.skillId ?? ''),
      name: String(entry.name ?? entry.skillId ?? ''),
      installs: Number.isFinite(entry.installs) ? entry.installs : 0,
    }))
    .filter((entry) => entry.source && entry.skillId)
  return { query: term, results, count: results.length, source: 'skills.sh', url }
}

/** Normalize one registry server entry. */
export function normalizeRegistryEntry(server) {
  const packages = (Array.isArray(server.packages) ? server.packages : []).map((pkg) => ({
    registryType: String(pkg.registryType ?? ''),
    identifier: String(pkg.identifier ?? ''),
    version: String(pkg.version ?? ''),
    runtimeHint: String(pkg.runtimeHint ?? ''),
    runtimeArguments: (Array.isArray(pkg.runtimeArguments) ? pkg.runtimeArguments : [])
      .map((arg) => (typeof arg?.value === 'string' ? arg.value : ''))
      .filter(Boolean),
    environmentVariables: (Array.isArray(pkg.environmentVariables) ? pkg.environmentVariables : []).map(
      (env) => ({
        name: String(env.name ?? ''),
        required: env.isRequired === true,
        secret: env.isSecret === true,
        description: String(env.description ?? ''),
        default: env.default === undefined ? undefined : String(env.default),
      }),
    ),
  }))
  const remotes = (Array.isArray(server.remotes) ? server.remotes : [])
    .map((remote) => ({ type: String(remote.type ?? ''), url: String(remote.url ?? '') }))
    .filter((remote) => remote.url)
  return {
    id: String(server.name ?? ''),
    name: String(server.name ?? ''),
    title: String(server.title ?? server.name ?? ''),
    description: String(server.description ?? ''),
    version: String(server.version ?? ''),
    repository: server.repository?.url ? String(server.repository.url) : undefined,
    websiteUrl: server.websiteUrl ? String(server.websiteUrl) : undefined,
    remotes,
    packages,
  }
}

/** Search the official MCP registry (name substring match, latest version only). */
export async function searchMcpRegistry(query, options = {}) {
  const term = String(query ?? '').trim()
  if (term.length < 2) throw new Error('Search needs at least 2 characters')
  const limit = normalizeLimit(options.limit, 20)
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${MCP_REGISTRY_URL}?search=${encodeURIComponent(term)}&version=latest&limit=${limit}`
  const payload = await requestJson(url, fetchImpl, options)
  const results = (Array.isArray(payload.servers) ? payload.servers : [])
    .map((entry) => normalizeRegistryEntry(entry?.server ?? {}))
    .filter((entry) => entry.name)
  return { query: term, results, count: results.length, source: 'mcp-registry', url }
}

/** Clamp a page size into the range every source accepts. */
function normalizeLimit(value, fallback) {
  if (!Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, 1), 50)
}

/** Lowercase slug that is a valid DSH MCP server name. */
export function sanitizeMcpName(value) {
  const base = String(value ?? '')
    .replace(/^[a-z0-9]+\./i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  if (base.length > 0) return base
  return 'mcp-server'
}

/** Plan one MCP server config from a normalized registry entry. */
export function mcpInstallPlan(entry, options = {}) {
  const remote =
    entry.remotes.find((candidate) => candidate.type === 'streamable-http') ?? entry.remotes[0]
  const name = sanitizeMcpName(options.name ?? entry.title ?? entry.name)
  if (remote) {
    return {
      name,
      server: { transport: 'http', url: remote.url, enabled: true },
      warnings: [],
    }
  }
  const npmPackage = entry.packages.find((pkg) => pkg.registryType === 'npm')
  const pypiPackage = entry.packages.find((pkg) => pkg.registryType === 'pypi')
  const pkg = npmPackage ?? pypiPackage
  if (!pkg || !pkg.identifier) {
    throw new Error(`MCP server "${entry.title || entry.name}" has no npm/pypi package or remote endpoint`)
  }
  const command = pkg.registryType === 'pypi' ? 'uvx' : pkg.runtimeHint === 'npx' ? 'npx' : pkg.runtimeHint || 'npx'
  const args = [...pkg.runtimeArguments]
  args.push(pkg.registryType === 'pypi' ? pkg.identifier : pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier)
  const env = {}
  const warnings = []
  for (const variable of pkg.environmentVariables) {
    if (!variable.name) continue
    env[variable.name] = variable.default ?? ''
    if (variable.required) warnings.push(`Set ${variable.name} before connecting.`)
  }
  return {
    name,
    server: { transport: 'stdio', command, args, env, enabled: true },
    warnings,
  }
}

/** Pick the skill directory and blob list out of a GitHub tree. */
export function pickSkillBundle(tree, repo, skillId) {
  const blobs = (Array.isArray(tree.tree) ? tree.tree : []).filter((entry) => entry.type === 'blob')
  const candidates = blobs.filter((entry) => entry.path.endsWith('/SKILL.md') || entry.path === 'SKILL.md')
  const target = String(skillId)
  let match = candidates.find((entry) => {
    const parts = entry.path.split('/')
    return parts[parts.length - 2] === target
  })
  if (!match) match = candidates.find((entry) => entry.path.toLowerCase().includes(`/${target.toLowerCase()}/`))
  if (!match) match = candidates.find((entry) => entry.path === 'SKILL.md')
  if (!match) throw new Error(`Skill "${skillId}" was not found in ${repo}`)
  const dir = match.path === 'SKILL.md' ? '' : match.path.slice(0, -'/SKILL.md'.length)
  const files = blobs.filter((entry) => (dir === '' ? true : entry.path.startsWith(`${dir}/`)))
  return { dir, files, skillFile: match.path }
}

/** Download one skill bundle from GitHub, ready for the zip importer. */
export async function fetchSkillBundle(entry, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const repo = String(entry.source ?? '')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error(`Invalid skill repository: ${entry.source}`)
  const info = await requestJson(`${GITHUB_API}/repos/${repo}`, fetchImpl, options)
  const branch = String(info.default_branch ?? 'main')
  const tree = await requestJson(
    `${GITHUB_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    fetchImpl,
    options,
  )
  const { dir, files } = pickSkillBundle(tree, repo, entry.skillId)
  const limited = files.slice(0, MAX_SKILL_FILES)
  const entries = []
  let totalBytes = 0
  for (const file of limited) {
    if (Number.isFinite(file.size) && file.size > MAX_SKILL_FILE_BYTES) continue
    const rawPath = file.path.split('/').map(encodeURIComponent).join('/')
    let response
    try {
      response = await fetchImpl(`${GITHUB_RAW}/${repo}/${encodeURIComponent(branch)}/${rawPath}`, {
        signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
    } catch (error) {
      throw new Error(`Cannot download ${file.path}: ${error && error.message ? error.message : String(error)}`)
    }
    if (!response.ok) throw new Error(`Cannot download ${file.path} (HTTP ${response.status})`)
    const data = Buffer.from(await response.arrayBuffer())
    totalBytes += data.length
    if (totalBytes > MAX_SKILL_BYTES) throw new Error('Skill bundle is too large to install')
    const relative = dir === '' ? file.path : file.path.slice(dir.length + 1)
    entries.push({ name: `${entry.skillId}/${relative}`, data })
  }
  if (!entries.some((file) => file.name.endsWith('/SKILL.md'))) {
    throw new Error(`Skill "${entry.skillId}" has no SKILL.md`)
  }
  return { entries, repo, branch, dir }
}
