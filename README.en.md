<div align="center">

<img src="icon.svg" width="96" height="96" alt="MCP & Skill Manager icon" />

# dsh-mcp-skill-manage

**One sidebar page for every agent tool's skills and MCP servers.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![npm](https://img.shields.io/npm/v/dsh-mcp-skill-manage.svg)](https://www.npmjs.com/package/dsh-mcp-skill-manage)
[![CI](https://github.com/sunChargedd/dsh-mcp-skill-manage/actions/workflows/ci.yml/badge.svg)](https://github.com/sunChargedd/dsh-mcp-skill-manage/actions/workflows/ci.yml)

[中文](README.md) | **English**

</div>

---

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web plugin that manages **skills** (`SKILL.md`) and **MCP servers** across DSH, Claude Code, Codex, Cursor, Windsurf, Gemini CLI, OpenCode, Qwen Code, iFlow, Kimi, Qoder, Trae, Lingma, CodeBuddy and Cline/Roo/Kilo — instead of hand-editing `~/.claude.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json` and the DSH profile patch.

## Features

- **Skill CRUD**: card grid, search and per-tool filters, full frontmatter editing, Markdown body editor; directory bundles (`<name>/SKILL.md`) and flat `<name>.md` files; rename-safe.
- **Cross-tool sharing**: tick a tool to create a relative symlink from its skills root to the single canonical copy (the `~/.claude/skills -> ~/.agents/skills` pattern, made clickable).
- **Skill import/export**: export one or all skills as a `.zip` (directory structure preserved); import a zip with one or many `SKILL.md` bundles, flat `.md` files, or a local directory. Conflicts are renamed, never overwritten.
- **MCP CRUD**: table view with inline enable switches; stdio and HTTP/SSE transports; rename; copy a server to other tool configs; edits touch only the target entry.
- **MCP health check**: a real MCP handshake (stdio child process / HTTP / SSE) reports tool count, latency, server name/version and tool names, or a concrete error.
- **Backups & restore**: every delete and config write keeps a snapshot; restore a skill into any writable root or write a config snapshot back over its original file.
- **Projects & custom locations**: track project directories to pick up project-level skills/MCP configs; add any skill directory or JSON/JSONC/TOML/YAML-patch MCP config manually.
- **Diagnostics**: invalid frontmatter, broken symlinks, duplicate names, unreadable configs.
- **Market**: search Agent Skills on [skills.sh](https://skills.sh) and MCP servers in the official MCP Registry, then install a whole skill bundle from its GitHub repository into any skills root, or add an MCP server (remote HTTP, or npx/uvx stdio with env placeholders) to any config. Also exposed as `market_search_skills` / `market_install_skill` / `market_search_mcp` / `market_install_mcp` agent-tool actions.
- **Agent tool `mcp_skill_manager`**: the model can inspect and maintain the same data through the same Host action layer.
- Theme-token styling, dark/light mode and narrow-window support.

## Compatibility

| | Requirement |
| --- | --- |
| **DSH** | `>=0.2.1-rc.3 <0.3.0` (developed and verified against DSH Desktop / `@deepseek-ai/dsh-app-boot` **0.2.1-rc.3**) |
| **Node.js** | `>=20` (the runtime DSH ships; the plugin has zero npm dependencies) |
| **Platform** | verified on macOS; the test suite is cross-platform (CI runs on Linux without a DSH runtime) |

`package.json` declares `engines.dsh`, so DSH checks compatibility before installing or loading the plugin and refuses it with a clear message instead of crashing at runtime. The self-hosted market index carries the same requirement. The plugin uses the `sidebar.panellist` / `main` slots, `ctx.locale`, `ctx.webServer.register`, `ctx.tools.register`, `profileContext` and `connection.requestRejection`; a future DSH 0.3 that changes those APIs will need a matching plugin release.

## Install

### From npm (recommended)

Package: [`dsh-mcp-skill-manage`](https://www.npmjs.com/package/dsh-mcp-skill-manage) (current version `0.5.5`).

```text
plugin_manager action=install_bundle target=dsh-mcp-skill-manage@0.5.5
```

or with the DSH CLI:

```bash
dsh plugin add dsh-mcp-skill-manage@0.5.5
```

Then refresh the Web page: a plug icon named “MCP & Skills” appears in the left sidebar (entry id `mcp-skill-manager`).

### Local development

Link this directory into your DSH profile so source edits reload immediately:

```text
plugin_manager action=install_bundle target=<absolute path to this repo>
```

## Development

Node.js >= 20, zero runtime dependencies, no build step.

```bash
git clone https://github.com/sunChargedd/dsh-mcp-skill-manage.git
cd dsh-mcp-skill-manage
npm test
```

| Command | What it covers |
| --- | --- |
| `npm run check` | syntax check for every source file |
| `npm run test:adapters` | filesystem data layer (304 checks, temp HOME) |
| `npm run test:tools` | zip reader/writer and the MCP probe |
| `npm run test:actions` | Host actions end-to-end (real stdio MCP handshake, backups, zip round-trip) |
| `npm run test:render` | headless render of the page (temp HOME) |

## Versioning

Semantic Versioning + Keep a Changelog. Record changes under `## [Unreleased]`, then run
`npm run bump:patch|minor|major` to cut a dated release and update `package.json`.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

The plugin only touches the agent-tool paths listed in the Chinese README plus
`~/.dsh/.mcp-skill-manager/`; Host routes require an authenticated DSH connection. Report
vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 sunChargedd
