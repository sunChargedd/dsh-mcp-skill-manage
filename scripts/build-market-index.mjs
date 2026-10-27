#!/usr/bin/env node
/**
 * Build a self-hosted format-1 plugin market index (market/index.json).
 *
 * The official Awesome DSH Plugin index only lists npm-published packages. This script
 * produces an equivalent index that installs the plugin straight from this Git
 * repository, pinned to one commit, so it can be used before/without an npm release:
 *
 *   npm run market:build                       # pin the current HEAD commit (git source)
 *   node scripts/build-market-index.mjs --commit <40-hex-sha> --version 0.2.2
 *   node scripts/build-market-index.mjs --source npm --version 0.5.5
 *
 * Once the package is on npm, `--source npm` is the smoother option: installs resolve
 * through the registry and get normal npm update behavior instead of a pinned commit.
 *
 * Users then add the raw URL of market/index.json in
 * Settings → Plugins → Discover → Index sources.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/** Read `--name value` from argv. */
function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}

const repositoryUrl = 'https://github.com/sunChargedd/dsh-mcp-skill-manage';
const version = option('version') ?? manifest.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`invalid version: ${version}`);
const sourceType = option('source') ?? 'git';
if (sourceType !== 'git' && sourceType !== 'npm') throw new Error(`invalid source: ${sourceType}`);
if (sourceType === 'npm' && version !== manifest.version) {
  throw new Error('--source npm expects the current package.json version');
}
const commit = option('commit') ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`invalid commit: ${commit}`);

const index = {
  format: 1,
  title: {
    en: 'MCP & Skill Manager',
    zh: 'MCP 与技能管理',
  },
  description: {
    en: 'Manage skills and MCP servers across DSH, Claude Code, Codex, Cursor and other agent tools from one DSH sidebar page.',
    zh: '在 DSH 侧边栏统一管理 DSH、Claude Code、Codex、Cursor 等 agent 工具的 skill 与 MCP 服务器。',
  },
  metadata: {
    categories: {
      tools: {
        title: { en: 'Tools & Capabilities', zh: '工具与能力' },
      },
    },
  },
  plugins: [
    {
      name: manifest.name,
      title: { en: 'MCP & Skill Manager', zh: 'MCP 与技能管理' },
      description: {
        en: 'Sidebar page for skills and MCP servers across agent tools: CRUD, cross-tool symlink sharing, import/export, backups, MCP health checks.',
        zh: '侧边栏页面统一管理多工具 skill 与 MCP：增删改查、跨工具共享、导入导出、备份恢复、连接体检。',
      },
      icon: 'https://raw.githubusercontent.com/sunChargedd/dsh-mcp-skill-manage/main/icon.svg',
      author: 'sunChargedd',
      homepage: `${repositoryUrl}#readme`,
      repository: { url: repositoryUrl },
      metadata: {
        category: 'tools',
        keywords: ['dsh', 'mcp', 'skills', 'claude-code', 'codex', 'cursor'],
        labels: [],
      },
      versions: [
        {
          version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source:
            sourceType === 'npm'
              ? { type: 'npm' }
              : { type: 'git', url: repositoryUrl, commit },
          engines: manifest.engines?.dsh ? { dsh: manifest.engines.dsh } : {},
        },
      ],
    },
  ],
};

const destination = join(root, 'market', 'index.json');
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`market index written: market/index.json (v${version}, ${sourceType} source${sourceType === 'git' ? ` @ ${commit.slice(0, 12)}` : ''})`);
console.log('raw URL: https://raw.githubusercontent.com/sunChargedd/dsh-mcp-skill-manage/main/market/index.json');
