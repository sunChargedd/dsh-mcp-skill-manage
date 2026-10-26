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
      (env) => {
        const variable = {
          name: String(env.name ?? ''),
          required: env.isRequired === true,
          secret: env.isSecret === true,
          description: String(env.description ?? ''),
        }
        if (env.default !== undefined) variable.default = String(env.default)
        return variable
      },
    ),
  }))
  const remotes = (Array.isArray(server.remotes) ? server.remotes : [])
    .map((remote) => ({ type: String(remote.type ?? ''), url: String(remote.url ?? '') }))
    .filter((remote) => remote.url)
  const entry = {
    id: String(server.name ?? ''),
    name: String(server.name ?? ''),
    title: String(server.title ?? server.name ?? ''),
    description: String(server.description ?? ''),
    version: String(server.version ?? ''),
    remotes,
    packages,
  }
  if (server.repository?.url) entry.repository = String(server.repository.url)
  if (server.websiteUrl) entry.websiteUrl = String(server.websiteUrl)
  return entry
}

/** Compare two version strings numerically (prerelease ignored). */
function compareVersions(left, right) {
  const parse = (value) => String(value).split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.length, b.length, 3); index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Keep the newest entry per server name from a raw registry page. */
function latestRegistryEntries(payload, limit) {
  const byName = new Map()
  for (const entry of Array.isArray(payload.servers) ? payload.servers : []) {
    const server = entry?.server ?? {}
    const name = String(server.name ?? '')
    if (!name) continue
    const official = entry?._meta?.['io.modelcontextprotocol.registry/official']
    const previous = byName.get(name)
    const isLatest = official?.isLatest === true
    if (!previous) {
      byName.set(name, { server, isLatest })
    } else if (isLatest && !previous.isLatest) {
      byName.set(name, { server, isLatest })
    } else if (!previous.isLatest && compareVersions(server.version, previous.server.version) > 0) {
      byName.set(name, { server, isLatest })
    }
    if (byName.size > limit * 4) break
  }
  return [...byName.values()]
    .slice(0, limit)
    .map((entry) => normalizeRegistryEntry(entry.server))
}

/** Curated servers used when the registry is unreachable, and for popular lookups. */
const POPULAR_MCP = [
  {
    name: 'context7',
    title: 'Context7',
    description: 'Up-to-date library documentation over Streamable HTTP.',
    remotes: [{ type: 'streamable-http', url: 'https://mcp.context7.com/mcp' }],
  },
  {
    name: 'filesystem',
    title: 'Filesystem',
    description: 'Read and write files under a workspace directory.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-filesystem', runtimeHint: 'npx', runtimeArguments: ['-y', '/path/to/directory'], environmentVariables: [] }],
  },
  {
    name: 'github',
    title: 'GitHub',
    description: 'Repositories, issues and pull requests (needs GITHUB_TOKEN).',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-github', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [{ name: 'GITHUB_TOKEN', required: true, secret: true }] }],
  },
  {
    name: 'sqlite',
    title: 'SQLite',
    description: 'Query a local SQLite database.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-sqlite', runtimeHint: 'npx', runtimeArguments: ['-y', '/path/to/database.sqlite'], environmentVariables: [] }],
  },
  {
    name: 'playwright',
    title: 'Playwright',
    description: 'Browser automation tools.',
    packages: [{ registryType: 'npm', identifier: '@playwright/mcp@latest', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [] }],
  },
  {
    name: 'memory',
    title: 'Memory',
    description: 'Knowledge-graph memory for the assistant.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-memory', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [] }],
  },
  {
    name: 'sequential-thinking',
    title: 'Sequential Thinking',
    description: 'Structured step-by-step reasoning tool.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-sequential-thinking', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [] }],
  },
  {
    name: 'brave-search',
    title: 'Brave Search',
    description: 'Web search through the Brave Search API (needs BRAVE_API_KEY).',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-brave-search', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [{ name: 'BRAVE_API_KEY', required: true, secret: true }] }],
  },
  {
    name: 'postgres',
    title: 'PostgreSQL',
    description: 'Read-only SQL against a PostgreSQL connection string.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-postgres', runtimeHint: 'npx', runtimeArguments: ['-y', 'postgresql://user:password@localhost/database'], environmentVariables: [] }],
  },
  {
    name: 'fetch',
    title: 'Fetch',
    description: 'Fetch URLs and return their Markdown content.',
    packages: [{ registryType: 'npm', identifier: '@modelcontextprotocol/server-fetch', runtimeHint: 'npx', runtimeArguments: ['-y'], environmentVariables: [] }],
  },
]

/** Normalize one curated entry into the registry shape. */
function popularEntry(entry) {
  return normalizeRegistryEntry({
    name: entry.name,
    title: entry.title,
    description: entry.description,
    version: '',
    remotes: (entry.remotes ?? []).map((remote) => ({ type: remote.type, url: remote.url })),
    packages: (entry.packages ?? []).map((pkg) => ({
      registryType: pkg.registryType,
      identifier: pkg.identifier,
      version: '',
      runtimeHint: pkg.runtimeHint,
      runtimeArguments: pkg.runtimeArguments.map((value) => ({ value })),
      environmentVariables: (pkg.environmentVariables ?? []).map((env) => ({
        name: env.name,
        isRequired: env.required,
        isSecret: env.secret,
        description: env.description,
      })),
    })),
  })
}

/** Search the curated list when the registry cannot answer. */
function searchPopularMcp(term, limit) {
  const needle = term.toLowerCase()
  return POPULAR_MCP.filter(
    (entry) =>
      entry.name.toLowerCase().includes(needle) ||
      entry.title.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle),
  )
    .slice(0, limit)
    .map(popularEntry)
}

/**
 * Search the official MCP registry (name substring match, newest version only).
 *
 * The registry's `version=latest` filter is frequently slow, so this fetches the
 * unfiltered page and keeps the flagged/newest entry per name. When the registry is
 * unreachable it falls back to a small curated list of popular servers.
 */
export async function searchMcpRegistry(query, options = {}) {
  const term = String(query ?? '').trim()
  if (term.length < 2) throw new Error('Search needs at least 2 characters')
  const limit = normalizeLimit(options.limit, 20)
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${MCP_REGISTRY_URL}?search=${encodeURIComponent(term)}&limit=${Math.min(limit * 4, 100)}`
  try {
    const payload = await requestJson(url, fetchImpl, { timeoutMs: 8000, ...options })
    const results = latestRegistryEntries(payload, limit)
    if (results.length > 0) {
      return { query: term, results, count: results.length, source: 'mcp-registry', url, fallback: false }
    }
  } catch {
    /* fall back to the curated list below */
  }
  const results = searchPopularMcp(term, limit)
  if (results.length === 0) throw new Error('MCP registry is unavailable and no curated server matches that search')
  return {
    query: term,
    results,
    count: results.length,
    source: 'mcp-registry',
    url,
    fallback: true,
    warning: 'MCP registry unavailable; showing built-in popular servers.',
  }
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
