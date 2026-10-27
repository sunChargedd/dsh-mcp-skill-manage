<div align="center">

<img src="icon.svg" width="96" height="96" alt="MCP & Skill Manager icon" />

# dsh-mcp-skill-manage

**一个侧边栏页面，管理所有 agent 工具的 skill 与 MCP 服务器。**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![npm](https://img.shields.io/npm/v/dsh-mcp-skill-manage.svg)](https://www.npmjs.com/package/dsh-mcp-skill-manage)
[![CI](https://github.com/sunChargedd/dsh-mcp-skill-manage/actions/workflows/ci.yml/badge.svg)](https://github.com/sunChargedd/dsh-mcp-skill-manage/actions/workflows/ci.yml)
[![DSH](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4E7CF6)](https://github.com/deepseek-ai/deepseek-harness)

**中文** | [English](README.en.md)

</div>

---

## 这是什么

`dsh-mcp-skill-manage` 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的 Web 插件。它在你常用的 agent 工具（DSH、Claude Code、Codex、Cursor、Windsurf、Qoder、Trae、通义灵码、CodeBuddy、Qwen Code、iFlow、Kimi、OpenCode、Cline/Roo/Kilo）之间，统一管理两样东西：

- **Skills**：`SKILL.md` 技能包，增删改查、正文编辑、跨工具共享（符号链接）、导入导出、备份恢复；
- **MCP Servers**：stdio / HTTP 服务器配置，增删改查、启停、跨工具复制、连接体检、备份恢复。

不用再手动打开 `~/.claude.json`、`~/.codex/config.toml`、`~/.cursor/mcp.json`、profile 的 `cordis.patch.yml` 逐个复制粘贴。

## 特性

### Skills

- 卡片网格浏览，搜索、按工具过滤；点击进入全宽详情页编辑，返回保留筛选。
- **全文搜索**：工具栏「搜索正文」直接搜 `SKILL.md` 正文，卡片显示命中片段与命中次数。
- **批量操作**：多选后可一次「共享到某个根目录 / 导出为一个 zip / 删除（内联确认）」。
- **新建模板**：空白、代码审查、文档撰写、问题排查，一键填好 frontmatter 与正文。
- 完整编辑 frontmatter：`name`、`description`、`whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`，以及 Markdown 正文。
- 支持目录式 `<name>/SKILL.md` 与扁平 `<name>.md`；重命名自动维护已建立的符号链接。
- **跨工具共享**：勾选工具即创建相对符号链接（与 `~/.claude/skills -> ~/.agents/skills` 的常见做法一致），单一主副本，不复制多份。
- 卡片上可直接「打开主副本位置 / 删除（内联二次确认）」。
- **导入 / 导出**：导出全部或单个 skill 为 `.zip`（保留 `references/`、`scripts/` 等目录）；从 zip 或本地目录导入，重名自动避让，不覆盖。
- 非法 frontmatter、坏符号链接会标记为无效项，而不是让页面失败。

### MCP

- 表格视图：服务器 / 传输方式 / 命令或 URL / 目标 / 状态；行内开关直接启停，行内可删除、打开配置位置、测试连接。
- **快速添加模板**：Context7 / Filesystem / GitHub / SQLite / Playwright 一键填好 transport、command/url 与 env 占位。
- stdio（command/args/env/cwd）与 HTTP/SSE（url/headers）两种传输；支持重命名。
- **跨工具复制**：把某个 server 一键复制到其它工具配置（同名已存在则跳过）。
- **连接体检**：真实执行一次 MCP 握手，显示工具数量、延迟、server 名称版本与工具名，或具体失败原因；体检通过后详情页会列出全部工具。
- env/headers 默认打码，点「显示内容」才展开。
- 只修改目标条目，其它行尽量保持原样；写前备份、原子写入；解析失败拒绝写入而不是覆盖。

### 市场（Skills / MCP）

- **Skills 市场**：数据来自 [skills.sh](https://skills.sh) 的 Agent Skill 索引；搜索后可直接安装到任意 skill 根目录——从对应 GitHub 仓库下载整个 skill 目录（保留 references/scripts 等文件），不覆盖同名项。
- **MCP 市场**：数据来自官方 [Model Context Protocol Registry](https://registry.modelcontextprotocol.io)；搜索结果可一键加入任意 MCP 配置：优先使用 registry 的 remote HTTP 端点，否则按 npm/pypi 包生成 `npx`/`uvx` stdio 配置，必填环境变量会以空值占位并提示。
- 两个市场都在同一个「市场」标签页里，可切换来源、搜索关键字、选择安装目标；网络请求只在你主动搜索/安装时发生，搜索结果缓存 5 分钟。
- Agent 工具同步提供 `market_search_skills`、`market_install_skill`、`market_search_mcp`、`market_install_mcp`。
- MCP Registry 的 `version=latest` 查询经常很慢，插件改为直接取无过滤列表并按 latest 标记/版本去重；registry 不可用时自动回退到内置常用服务器列表（Context7、Filesystem、GitHub、SQLite、Playwright、Memory 等）并给出提示。
- 可选：设置 `GITHUB_TOKEN` 环境变量可提高 GitHub API 速率限制（不设置也能用，匿名 60 次/小时）。

### 备份与恢复

- 删除 skill、修改/删除 MCP 配置前自动留快照，保留最近 80 份。
- 「备份」标签页按时间列出快照：skill 可恢复到任意可写根目录（重名加 `-restored`），配置文件可写回原目标（写回前再备份当前文件）；支持打开备份目录、删除快照。

### 其它

- **项目管理**：添加项目路径后自动纳入其项目级 skill / MCP 配置。
- **自定义位置**：任意 skill 目录、任意 JSON / JSONC / TOML / YAML-patch MCP 配置文件都可手动接入。
- **诊断**：汇总非法 skill、坏链接、同名冲突、不可读配置等问题。
- **Agent 工具**：`mcp_skill_manager` 把页面能力开放给模型（`overview`、`list_skills`、`read_skill`、`save_skill`、`delete_skill`、`set_skill_visibility`、`search_skills`、`market_search_skills`、`market_install_skill`、`market_search_mcp`、`market_install_mcp`、`list_mcp`、`save_mcp`、`delete_mcp`、`copy_mcp`、`list_backups`、`restore_backup`、`export_skills`、`import_skill`、`mcp_health`、`doctor`），与页面走同一套 Host 逻辑。
- 深色 / 浅色主题、窄屏自适应，全部使用 DSH 主题 token。

## 支持的工具

| 工具 | Skills 根目录（用户级） | MCP 配置 |
| --- | --- | --- |
| 共享 hub | `~/.agents/skills` | — |
| DSH | `~/.dsh/skills` | 当前 profile 的 `cordis.patch.yml`（HMR 即时生效） |
| Claude Code | `~/.claude/skills` | `~/.claude.json` |
| Codex | `~/.codex/skills` | `~/.codex/config.toml` |
| Cursor | `~/.cursor/skills` | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/skills` | `~/.codeium/windsurf/mcp_config.json` |
| Gemini CLI | `~/.gemini/skills` | `~/.gemini/settings.json` |
| OpenCode | `~/.config/opencode/skills` | `~/.config/opencode/opencode.json` |
| Qwen Code | `~/.qwen/skills` | `~/.qwen/settings.json` |
| iFlow CLI | `~/.iflow/skills` | `~/.iflow/settings.json` |
| Kimi Code CLI | `~/.kimi/skills` | `~/.kimi/config.json` |
| Qoder | `~/.qoder/skills` | `~/.qoder/mcp.json` |
| Trae | `~/.trae/skills` | `~/.trae/mcp.json` |
| 通义灵码 | `~/.lingma/skills` | `~/.lingma/mcp.json` |
| CodeBuddy | `~/.codebuddy/skills` | `~/.codebuddy/mcp.json` |
| Cline / Roo / Kilo | — | VS Code `globalStorage` 下的 MCP 设置 |

> 部分工具的路径为社区约定，**只有在检测到对应文件/目录时才会显示**；你的版本路径不同也没关系，在「设置」里用「自定义位置」接入即可。项目级根目录（`.dsh/`、`.agents/`、`.claude/`、`.codex/`、`.cursor/`、`.gemini/`、`.opencode/`、`.qwen/`、`.iflow/`、`.kimi/`、`.qoder/`、`.trae/`、`.lingma/`、`.codebuddy/` 下的 `skills/`）会按已跟踪项目自动发现。

## 安装

### 从 npm 安装（推荐）

npm 包：[`dsh-mcp-skill-manage`](https://www.npmjs.com/package/dsh-mcp-skill-manage)（当前版本 `0.5.5`）。

```text
plugin_manager action=install_bundle target=dsh-mcp-skill-manage@0.5.5
```

或使用 DSH CLI：

```bash
dsh plugin add dsh-mcp-skill-manage@0.5.5
```

安装后刷新 Web 页面，左侧栏会出现插头图标「MCP 与技能」。入口 id 为 `mcp-skill-manager`。

### 本地开发安装

直接把仓库目录 link 进 DSH profile（改代码即时生效）：

```text
plugin_manager action=install_bundle target=<仓库绝对路径>
```

### 手动

在 profile 的 `cordis.patch.yml` 中加入：

```yaml
- insert:
    - id: mcp-skill-manager
      name: 'dsh-mcp-skill-manage'
      config: {}
```

并确保包已可被 profile 解析（例如 `link:` 到本地目录）。

## 兼容性

| | 要求 |
| --- | --- |
| **DSH** | **`>=0.2.1-rc.3 <0.3.0`**（开发与实机验证版本：DSH Desktop / `@deepseek-ai/dsh-app-boot` **0.2.1-rc.3**） |
| **Node.js** | `>=20`（跟随 DSH 内置运行时；插件本身零 npm 依赖） |
| **平台** | 实机验证 macOS；测试套件跨平台（CI 在 Linux 运行，不依赖 DSH 运行时） |

- `package.json` 声明了 `engines.dsh`。DSH 在安装/启动前会做兼容性检查：版本不满足时会**阻止加载并给出提示**，而不是加载后崩溃。
- 自建市场索引 `market/index.json` 的版本条目同样携带 `engines.dsh`，Discover 可据此展示兼容性。
- 用到的 DSH 扩展点：`sidebar.panellist` / `main` 槽位、`ctx.locale`、`ctx.webServer.register`、`ctx.tools.register`、`profileContext`、`connection.requestRejection`。Host 侧在激活时会检查 `webServer.register` 是否存在，缺失时抛出明确错误。
- 如果 DSH 提示不兼容：升级到 0.2.x 即可；确需在其它版本上试用，可在 Plugin Manager 里对精确版本授予豁免（`dsh plugin allow-version`），风险自负。
- DSH 0.3 若调整上述扩展点，本插件会同步升级并更新此表；请勿在 0.3 上直接安装当前版本。

## 使用

左侧栏 →「MCP 与技能」：

- **Skills**：搜索 / 过滤 skill；卡片右侧按钮可直接打开位置或删除；点击卡片进入编辑页。
- **MCP**：表格里直接启停、删除、测试连接；点击行进入详情页编辑。
- **备份**：任何一次删除或配置写入都会出现在这里，可恢复。
- **设置与诊断**：跟踪项目、自定义 skill 目录 / MCP 配置文件、查看检测到的工具位置与问题列表。

## 架构

```
┌───────────────────────────── 浏览器 ─────────────────────────────┐
│  client.js                                                       │
│  sidebar.panellist 入口  +  main 面板（列表页 / 详情页）           │
│  React（module table）+ ctx.slots / ctx.locale，无第三方依赖       │
└───────────────▲───────────────────────────────┬──────────────────┘
                │ GET /mcp-skill-manager/state   │ POST /mcp-skill-manager/action
                │ (JSON, 同源 + connection 鉴权)  │
┌───────────────┴───────────────────────────────▼──────────────────┐
│  index.js（Host 插件）                                            │
│  action 分发 · 快照组装 · 设置持久化 · `mcp_skill_manager` 工具     │
└───────┬──────────────────────┬──────────────────────┬────────────┘
        │                      │                      │
┌───────▼────────┐   ┌─────────▼────────┐   ┌─────────▼─────────┐
│ lib/adapters.js│   │ lib/zip.js       │   │ lib/probe.js      │
│ 扫描 / 解析 /   │   │ 无依赖 zip 读写   │   │ MCP 握手探测       │
│ 写入 / 链接 /   │   │ STORE + DEFLATE  │   │ stdio / HTTP / SSE│
│ 备份恢复        │   └──────────────────┘   └───────────────────┘
└───────┬────────┘
        │
   agent 工具配置文件（skills + MCP）+ ~/.dsh/.mcp-skill-manager/
```

| 文件 | 职责 |
| --- | --- |
| `index.js` | Host 插件：路由、action 分发、`mcp_skill_manager` 工具、设置。 |
| `client.js` | 浏览器插件：侧边栏入口与管理页；不 import 任何 Harness Client 包。 |
| `lib/adapters.js` | 文件系统数据层：SKILL.md / JSON(C) / TOML / YAML-patch 读写、符号链接、备份恢复。 |
| `lib/presets.js` | 各工具路径候选表（纯数据）。 |
| `lib/zip.js` | 无依赖 zip 读写。 |
| `lib/market.js` | skills.sh / MCP Registry 搜索与安装计划（可注入 fetch）。 |
| `lib/probe.js` | MCP 连接探测。 |
| `docs/CONTRACT.md` | Host / adapters / client 之间的内部契约。 |
| `docs/PUBLISHING.md` | 发布、收录与市场索引指南。 |
| `market/` | 自建市场索引与 Awesome 收录模板。 |

## 数据与安全

- 只操作 README 表格里列出的目录与文件，以及 `~/.dsh/.mcp-skill-manager/`（设置、导出、备份）。
- 所有写操作：先备份 → 原子写入；文本配置只改目标条目，尽量保留其它内容。
- 两条 Host 路由使用 `connection.requestRejection` 鉴权，未认证请求返回 401。
- 插件本身不向外发送任何数据；「测试连接」只会访问你为该 MCP server 配置的地址或命令。
- 「市场」只在主动搜索/安装时访问 skills.sh、GitHub API/raw 与 MCP Registry；安装的是第三方内容，运行前请自行审查。
- DSH 的 MCP 修改写入当前 profile 的 patch 文件，由 loader 监听热生效。

## 开发

要求 Node.js >= 20，无运行时依赖、无构建步骤。

```bash
git clone https://github.com/sunChargedd/dsh-mcp-skill-manage.git
cd dsh-mcp-skill-manage
npm test
```

| 命令 | 说明 |
| --- | --- |
| `npm run check` | 所有源文件语法检查 |
| `npm run test:adapters` | 数据层（临时 HOME） |
| `npm run test:tools` | zip 与 MCP 探针 |
| `npm run test:market` | 市场搜索、skill 下载合并、MCP 安装计划（假网络） |
| `npm run test:actions` | Host action 端到端（含真实 stdio MCP 握手、备份恢复、zip 往返、全文搜索） |
| `npm run test:render` | 无头渲染 UI（临时 HOME，覆盖列表→详情→返回、快捷操作、备份页） |
| `npm test` | 以上全部 |

贡献流程、代码约定与如何新增一个工具支持见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 版本与发布

本项目遵循 [Semantic Versioning](https://semver.org/) 与 [Keep a Changelog](https://keepachangelog.com/)。

**每次面向用户的功能变更都要加版本号**：

1. 在 `CHANGELOG.md` 的 `## [Unreleased]` 下记录改动；
2. 发布时执行 `npm run bump:patch`（修复/文档）、`npm run bump:minor`（新功能）或 `npm run bump:major`（破坏性变更）；
   脚本会把 `[Unreleased]` 切成带日期的版本段，并同步 `package.json`；
3. 提交后打 tag 并推送：`git tag vX.Y.Z && git push --follow-tags`。

推送 tag 后，GitHub Actions 的 **Release** workflow 会自动创建 GitHub Release：优先使用 `docs/release-notes/<version>.md`（可写中英双语），没有则使用该版本的 CHANGELOG 段落（见 `.github/workflows/release.yml`）。

### 发布到插件市场

三条路径（自建索引 / Awesome 列表收录 / npm + 默认市场）的完整步骤、当前 npm 包名占用情况与收录要求，见 **[docs/PUBLISHING.md](docs/PUBLISHING.md)**。仓库内已包含：

- `npm run market:build`：生成自建 format-1 市场索引（git source，固定 commit）；
- `market/awesome-plugin.yml`：提交给 Awesome DSH Plugin 的条目模板。

## 已知限制

- 部分工具的配置路径是社区约定（Qoder、Trae、灵码、CodeBuddy 等），检测不到时用「自定义位置」补。
- JSONC 文件写入会丢失注释（写前有备份）；TOML 目前仅用于 Codex。
- 直接在卡片/表格里的快捷删除**不会**再次弹窗，但会内联二次确认并保留备份。
- MCP 体检会按配置真实启动进程或发起请求，请只对自己信任的 server 使用。
- 市场安装不改写已有同名条目：skill 会自动加后缀，MCP server 名冲突会自动追加序号；匿名 GitHub API 有速率限制。

## 参与贡献

欢迎 Issue、PR、以及「支持某个新工具」的路径情报。开始之前请阅读
[CONTRIBUTING.md](CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)；
安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

如果这个插件帮到了你，点个 ⭐ Star 是最好的支持。

## 许可证

[MIT](LICENSE) © 2026 sunChargedd
