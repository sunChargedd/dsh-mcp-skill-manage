<div align="center">

<img src="icon.svg" width="96" height="96" alt="MCP & Skill Manager icon" />

# dsh-mcp-skill-manager

**One sidebar page for every agent tool's skills and MCP servers.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![CI](https://github.com/sunChargedd/dsh-mcp-skill-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/sunChargedd/dsh-mcp-skill-manager/actions/workflows/ci.yml)

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
- **Agent tool `mcp_skill_manager`**: the model can inspect and maintain the same data through the same Host action layer.
- Theme-token styling, dark/light mode and narrow-window support.

## Install

Install this directory into your DSH profile with the Plugin Manager:

```text
plugin_manager action=install_bundle target=<absolute path to this repo>
```

Then refresh the Web page: a plug icon named “MCP & Skills” appears in the left sidebar (entry id `mcp-skill-manager`).

## Development

Node.js >= 20, zero runtime dependencies, no build step.

```bash
git clone https://github.com/sunChargedd/dsh-mcp-skill-manager.git
cd dsh-mcp-skill-manager
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
