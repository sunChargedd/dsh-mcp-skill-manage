# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version bumps are scripted: record your change under the `Unreleased` section at the top,
then run `npm run bump:patch|minor|major` to cut a dated release section and update
`package.json`.

## [Unreleased]

## [0.5.5] - 2026-10-27

### Added

- Explicit DSH compatibility metadata: `package.json` declares
  `engines.dsh: ">=0.2.1-rc.3 <0.3.0"`, the Host refuses to activate when
  `ctx.webServer.register` is missing, the market index carries the same requirement,
  and both READMEs document the tested runtime (DSH 0.2.1-rc.3, Node >=20).

### Changed

- DSH compatibility metadata for safe installs.

## [0.5.4] - 2026-10-27

### Fixed

- Registry entries with optional environment-variable defaults no longer carry an
  `undefined` field, which had made the market agent tools reject their own output.

### Changed

- Omit optional env defaults from market entries.

## [0.5.3] - 2026-10-27

### Fixed

- Market search results no longer contain `undefined` fields, so the
  `market_search_mcp` / `market_search_skills` agent tools return lossless JSON.

### Changed

- Market tool results are lossless JSON.

## [0.5.2] - 2026-10-27

### Fixed

- MCP market search now uses a single unfiltered registry request (the `version=latest`
  filter was frequently slow), keeps the newest entry per server name, and falls back to
  a built-in popular-server list with a UI warning when the registry is unreachable.

### Changed

- MCP market keeps the newest entry and falls back to a curated list.

## [0.5.1] - 2026-10-27

### Fixed

- MCP market search no longer fails when the registry's slow `version=latest`
  query times out: it retries the unfiltered list, keeps the entry flagged as latest
  per server name, and caches searches for five minutes.

### Changed

- More reliable MCP market search with fallback and caching.

## [0.5.0] - 2026-10-27

### Added

- **Market tab**: search Agent Skills on skills.sh and MCP servers in the official
  Model Context Protocol registry, then install with one click.
  - Skills are downloaded as a whole directory from their GitHub repository and
    imported into any writable skills root (conflicts are renamed, never overwritten).
  - MCP entries use the registry's remote HTTP endpoint when present, otherwise an
    npm/pypi package is mapped to `npx`/`uvx` stdio config with required environment
    variables pre-filled as placeholders and reported in the install toast.
- New agent tool actions: `market_search_skills`, `market_install_skill`,
  `market_search_mcp`, `market_install_mcp`.
- Optional `GITHUB_TOKEN` support raises the GitHub API rate limit when downloading
  skill bundles.
- `scripts/test-market.mjs`: fake-network tests for search normalization, GitHub tree
  picking, bundle download and MCP install planning; CI runs it as its own step.

### Changed

- Skills and MCP market with one-click install.

## [0.4.0] - 2026-10-27

### Added

- **Full-text skill search**: new `skill/search` Host action and `search_skills` agent
  tool; the skills toolbar gains a "Body" toggle that searches inside `SKILL.md` bodies,
  shows matching snippets on the cards and a hit count.
- **Bulk operations**: select multiple skill cards, then share them to a skill root,
  export them as one zip, or delete them with a single inline confirmation.
- **Starter templates**: new skills can start from Blank / Code review / Documentation /
  Debugging; new MCP servers from Context7 / Filesystem / GitHub / SQLite / Playwright.
- MCP detail pages list the tools reported by the latest health check.

### Tests

- Action suite covers full-text search and the `search_skills` tool.
- Render suite covers template prefill, bulk selection/delete and the body-search toggle.

### Changed

- Full-text search, bulk operations and starter templates.

## [0.3.0] - 2026-10-27

### Changed

- Renamed the distribution package and GitHub repository to `dsh-mcp-skill-manage`
  (`dsh-mcp-skill-manager` was already taken on npm). `package.json` is publishable
  (`private: false`, `publishConfig.access: public`); the client module id and the
  loader row name follow the package name.
### Added

- `docs/release-notes/<version>.md`: curated (bilingual) release notes; the Release
  workflow's `scripts/release-notes.mjs` prefers them over the generated CHANGELOG
  section.
- `market/index.json`: self-hosted format-1 market index (git source pinned to the
  release commit), validated with DSH's own index validator.

## [0.2.2] - 2026-10-27

### Added

- GitHub Actions **Release** workflow: pushing a `v*` tag publishes a GitHub Release
  using that version's `CHANGELOG.md` section (`scripts/release-notes.mjs`, idempotent).
- `scripts/build-market-index.mjs` + `market/`: self-hosted format-1 market index
  (git source pinned to the release commit) and the Awesome DSH Plugin submission
  template.
- `docs/PUBLISHING.md`: npm publication, Awesome list submission and self-hosted index
  instructions, including the current npm package-name collision.

### Changed

- Automated GitHub releases from tags and a market publishing guide.

## [0.2.1] - 2026-10-27

### Added

- Open-source packaging: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, GitHub Actions CI, issue templates and a pull-request template.
- `scripts/bump-version.mjs` and the `npm run bump:patch|minor|major` scripts; a
  release cuts the `## [Unreleased]` section into a dated `## [x.y.z]` section.
- The render smoke test now seeds a temporary HOME, so it no longer depends on the
  developer's real agent configuration and runs in CI.

### Changed

- `package.json` metadata: license, repository, homepage, bugs, keywords, engines and
  test/release scripts.
- First public, open-source release.

## [0.2.0] - 2026-10-27

### Added

- **Backups tab**: every skill delete and MCP config write keeps a snapshot under
  `~/.dsh/.mcp-skill-manager/backups/` (newest 80 kept). Restore a skill into any
  writable root (name conflicts get a `-restored` suffix) or write a config snapshot
  back over its original file. New snapshots carry a `manifest.json`; legacy snapshots
  are matched to targets automatically.
- **Skill import/export**: export all or one skill as a `.zip` (directory structure
  preserved), import a `.zip` containing one or many `SKILL.md` bundles or flat
  `<name>.md` files, or import a local directory. Zero-dependency zip reader/writer
  with CRC verification and path-traversal protection.
- **MCP health check**: per-row and per-detail "test connection" performs a real MCP
  handshake (stdio child process, HTTP or SSE), reporting tool count, latency,
  server name/version and tool names, with an 8 s timeout and guaranteed child cleanup.
- **Agent tool parity**: `mcp_skill_manager` gained `list_backups`,
  `restore_backup`, `export_skills`, `import_skill` and `mcp_health`.
- Project tracking, custom skill directories and custom MCP config files in the
  settings page, plus a diagnostics section.

### Changed

- The page follows the DSH design system: underline tabs, card grid for skills, table
  for MCP servers, full-width detail pages with back navigation, theme tokens only.
- iOS-style switches (white thumb, gray/green track) with explicit state words.
- List search and tool filter survive navigation into a detail page and back.

### Fixed

- Quick-delete on a skill card bubbled into the card's own click handler, opening the
  detail page of the already-deleted skill and reporting "Skill not found".
- MCP toggles now state their value in words instead of relying on color alone.

## [0.1.0] - 2026-10-27

### Added

- Initial plugin: sidebar panel entry plus a full-width management page in the DSH Web
  client.
- Skill discovery and CRUD across the shared `~/.agents` hub, DSH, Claude Code, Codex,
  Cursor and other detected agent tools, including project-level roots.
- Cross-tool visibility via relative symlinks, with rename-safe link maintenance.
- MCP server CRUD for the DSH profile patch, `~/.claude.json`, `~/.codex/config.toml`,
  `~/.cursor/mcp.json` and other detected configs, including cross-tool copy.
- Write-ahead backups, atomic writes and a `mcp_skill_manager` agent tool sharing the
  same Host action layer as the UI.
