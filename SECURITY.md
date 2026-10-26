# Security policy

## Supported versions

The latest published minor release receives fixes. This is a local-first plugin that
edits files on your machine, so please upgrade to the latest release before reporting.

## What this plugin touches

- Files under the agent tool directories listed in the README (skills roots and MCP
  config files), plus `~/.dsh/.mcp-skill-manager/` for settings, exports and backups.
- The DSH profile's `cordis.patch.yml` when you add, edit or remove a DSH MCP server.
- Network access only when you explicitly run **Test connection** on an MCP server: the
  probe contacts exactly the URL/command configured for that server.

The Host routes are guarded by `connection.requestRejection` and reject unauthenticated
requests. Nothing is sent to a third party by this plugin.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's private
[security advisory](https://github.com/sunChargedd/dsh-mcp-skill-manage/security/advisories/new)
flow, or contact the maintainer at `sun@charged.asia`.

Include: affected version, reproduction steps, impact, and any suggested fix. We aim to
acknowledge reports within a few days.
