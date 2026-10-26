/**
 * Tool presets: where the popular agent tools keep their skills and MCP servers.
 *
 * Data only — discovery rules live in `adapters.js`. A preset is *detected* when one of
 * its candidate paths exists on disk; undetected presets never appear in the UI, so an
 * outdated guess cannot create a bogus entry. `always: true` presets (the four tools the
 * manager was requested for, plus the shared hub) are listed even before they exist so the
 * user can create the first skill there.
 *
 * User-defined additions (settings.customSkillDirs / settings.customMcpTargets) are merged
 * on top by the adapters.
 */
import { join } from 'node:path';

/** App-support root for a desktop application name, per platform. */
function appSupport(paths, name) {
  if (process.platform === 'darwin') return join(paths.home, 'Library', 'Application Support', name);
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(paths.home, 'AppData', 'Roaming'), name);
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(paths.home, '.config'), name);
}

/** VS Code-family MCP settings file for one extension id and application name. */
function extensionMcp(paths, appName, extensionId) {
  return join(appSupport(paths, appName), 'User', 'globalStorage', extensionId, 'settings', 'mcp_settings.json');
}

/** Skill roots, in display order. */
export const SKILL_ROOT_PRESETS = [
  {
    tool: 'agents',
    label: 'Shared agents hub',
    labelZh: '共享 agents 目录',
    scope: 'shared',
    always: true,
    candidates: (paths) => [join(paths.agentsHome, 'skills')],
    project: (project) => join(project.path, '.agents', 'skills'),
  },
  {
    tool: 'dsh',
    label: 'DSH',
    labelZh: 'DSH',
    scope: 'user',
    always: true,
    candidates: (paths) => [join(paths.dshHome, 'skills')],
    project: (project) => join(project.path, '.dsh', 'skills'),
  },
  {
    tool: 'claude',
    label: 'Claude Code',
    labelZh: 'Claude Code',
    scope: 'user',
    always: true,
    candidates: (paths) => [join(paths.claudeHome, 'skills')],
    project: (project) => join(project.path, '.claude', 'skills'),
  },
  {
    tool: 'codex',
    label: 'Codex',
    labelZh: 'Codex',
    scope: 'user',
    always: true,
    candidates: (paths) => [join(paths.codexHome, 'skills')],
    project: (project) => join(project.path, '.codex', 'skills'),
  },
  {
    tool: 'cursor',
    label: 'Cursor',
    labelZh: 'Cursor',
    scope: 'user',
    always: true,
    candidates: (paths) => [join(paths.cursorHome, 'skills')],
    project: (project) => join(project.path, '.cursor', 'skills'),
  },
  {
    tool: 'windsurf',
    label: 'Windsurf',
    labelZh: 'Windsurf',
    candidates: (paths) => [join(paths.home, '.codeium', 'windsurf', 'skills')],
    project: (project) => join(project.path, '.windsurf', 'skills'),
  },
  {
    tool: 'gemini',
    label: 'Gemini CLI',
    labelZh: 'Gemini CLI',
    candidates: (paths) => [join(paths.home, '.gemini', 'skills')],
    project: (project) => join(project.path, '.gemini', 'skills'),
  },
  {
    tool: 'opencode',
    label: 'OpenCode',
    labelZh: 'OpenCode',
    candidates: (paths) => [
      join(paths.home, '.config', 'opencode', 'skills'),
      join(paths.home, '.opencode', 'skills'),
    ],
    project: (project) => join(project.path, '.opencode', 'skills'),
  },
  {
    tool: 'qwen',
    label: 'Qwen Code',
    labelZh: '通义 Qwen Code',
    candidates: (paths) => [join(paths.home, '.qwen', 'skills')],
    project: (project) => join(project.path, '.qwen', 'skills'),
  },
  {
    tool: 'iflow',
    label: 'iFlow CLI',
    labelZh: '心流 iFlow CLI',
    candidates: (paths) => [join(paths.home, '.iflow', 'skills')],
    project: (project) => join(project.path, '.iflow', 'skills'),
  },
  {
    tool: 'kimi',
    label: 'Kimi Code CLI',
    labelZh: 'Kimi Code CLI',
    candidates: (paths) => [join(paths.home, '.kimi', 'skills')],
    project: (project) => join(project.path, '.kimi', 'skills'),
  },
  {
    tool: 'qoder',
    label: 'Qoder',
    labelZh: 'Qoder',
    candidates: (paths) => [join(paths.home, '.qoder', 'skills')],
    project: (project) => join(project.path, '.qoder', 'skills'),
  },
  {
    tool: 'trae',
    label: 'Trae',
    labelZh: 'Trae',
    candidates: (paths) => [join(paths.home, '.trae', 'skills')],
    project: (project) => join(project.path, '.trae', 'skills'),
  },
  {
    tool: 'lingma',
    label: 'Lingma',
    labelZh: '通义灵码',
    candidates: (paths) => [join(paths.home, '.lingma', 'skills')],
    project: (project) => join(project.path, '.lingma', 'skills'),
  },
  {
    tool: 'codebuddy',
    label: 'CodeBuddy',
    labelZh: '腾讯 CodeBuddy',
    candidates: (paths) => [join(paths.home, '.codebuddy', 'skills')],
    project: (project) => join(project.path, '.codebuddy', 'skills'),
  },
];

/** MCP configuration targets, in display order. */
export const MCP_TARGET_PRESETS = [
  {
    tool: 'dsh',
    label: 'DSH profile',
    labelZh: 'DSH（profile 配置）',
    candidates: (paths) => [paths.profilePatchFile],
    format: 'yaml-patch',
    always: true,
  },
  {
    tool: 'claude',
    label: 'Claude Code',
    labelZh: 'Claude Code',
    candidates: (paths) => [join(paths.home, '.claude.json')],
    format: 'json',
    keyPath: ['mcpServers'],
    always: true,
  },
  {
    tool: 'codex',
    label: 'Codex',
    labelZh: 'Codex',
    candidates: (paths) => [join(paths.codexHome, 'config.toml')],
    format: 'toml',
    always: true,
  },
  {
    tool: 'cursor',
    label: 'Cursor',
    labelZh: 'Cursor',
    candidates: (paths) => [join(paths.cursorHome, 'mcp.json')],
    format: 'json',
    keyPath: ['mcpServers'],
    always: true,
  },
  {
    tool: 'windsurf',
    label: 'Windsurf',
    labelZh: 'Windsurf',
    candidates: (paths) => [
      join(paths.home, '.codeium', 'windsurf', 'mcp_config.json'),
      join(paths.home, '.codeium', 'windsurf', 'mcp.json'),
    ],
    format: 'json',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.windsurf', 'mcp_config.json'),
  },
  {
    tool: 'gemini',
    label: 'Gemini CLI',
    labelZh: 'Gemini CLI',
    candidates: (paths) => [join(paths.home, '.gemini', 'settings.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.gemini', 'settings.json'),
  },
  {
    tool: 'opencode',
    label: 'OpenCode',
    labelZh: 'OpenCode',
    candidates: (paths) => [
      join(paths.home, '.config', 'opencode', 'opencode.json'),
      join(paths.home, '.opencode', 'opencode.json'),
    ],
    format: 'jsonc',
    keyPath: ['mcp'],
    style: 'opencode',
    project: (project) => join(project.path, 'opencode.json'),
  },
  {
    tool: 'qwen',
    label: 'Qwen Code',
    labelZh: '通义 Qwen Code',
    candidates: (paths) => [join(paths.home, '.qwen', 'settings.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.qwen', 'settings.json'),
  },
  {
    tool: 'iflow',
    label: 'iFlow CLI',
    labelZh: '心流 iFlow CLI',
    candidates: (paths) => [join(paths.home, '.iflow', 'settings.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.iflow', 'settings.json'),
  },
  {
    tool: 'kimi',
    label: 'Kimi Code CLI',
    labelZh: 'Kimi Code CLI',
    candidates: (paths) => [join(paths.home, '.kimi', 'config.json'), join(paths.home, '.kimi', 'mcp.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
  },
  {
    tool: 'qoder',
    label: 'Qoder',
    labelZh: 'Qoder',
    candidates: (paths) => [join(paths.home, '.qoder', 'mcp.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.qoder', 'mcp.json'),
  },
  {
    tool: 'trae',
    label: 'Trae',
    labelZh: 'Trae',
    candidates: (paths) => [join(paths.home, '.trae', 'mcp.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.trae', 'mcp.json'),
  },
  {
    tool: 'lingma',
    label: 'Lingma',
    labelZh: '通义灵码',
    candidates: (paths) => [join(paths.home, '.lingma', 'mcp.json')],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.lingma', 'mcp.json'),
  },
  {
    tool: 'codebuddy',
    label: 'CodeBuddy',
    labelZh: '腾讯 CodeBuddy',
    candidates: (paths) => [
      join(paths.home, '.codebuddy', 'mcp.json'),
      join(paths.home, '.codebuddy', 'config.json'),
    ],
    format: 'jsonc',
    keyPath: ['mcpServers'],
    project: (project) => join(project.path, '.codebuddy', 'mcp.json'),
  },
  {
    tool: 'cline',
    label: 'Cline',
    labelZh: 'Cline',
    candidates: (paths) => [
      extensionMcp(paths, 'Code', 'saoudrizwan.claude-dev'),
      extensionMcp(paths, 'Code - Insiders', 'saoudrizwan.claude-dev'),
      extensionMcp(paths, 'VSCodium', 'saoudrizwan.claude-dev'),
    ],
    format: 'json',
    keyPath: ['mcpServers'],
  },
  {
    tool: 'roo',
    label: 'Roo Code',
    labelZh: 'Roo Code',
    candidates: (paths) => [
      extensionMcp(paths, 'Code', 'rooveterinaryinc.roo-cline'),
      extensionMcp(paths, 'VSCodium', 'rooveterinaryinc.roo-cline'),
    ],
    format: 'json',
    keyPath: ['mcpServers'],
  },
  {
    tool: 'kilo',
    label: 'Kilo Code',
    labelZh: 'Kilo Code',
    candidates: (paths) => [
      extensionMcp(paths, 'Code', 'kilocode.kilo-code'),
      extensionMcp(paths, 'VSCodium', 'kilocode.kilo-code'),
    ],
    format: 'json',
    keyPath: ['mcpServers'],
  },
];

/** Tool display labels (used to group rows when a tool has no detected target). */
export const TOOL_LABELS = Object.fromEntries(
  [...SKILL_ROOT_PRESETS, ...MCP_TARGET_PRESETS].map((preset) => [
    preset.tool,
    { label: preset.label, labelZh: preset.labelZh },
  ]),
);
