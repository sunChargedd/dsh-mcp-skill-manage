# 发布与上架 / Publishing & distribution

这个仓库有三条分发路径，按上手成本排序：

| 方式 | 需要什么 | 用户怎么安装 | 出现在 DSH 默认市场（Discover） |
| --- | --- | --- | --- |
| **自建索引** | 仓库 + 一个 raw JSON | Settings → Plugins → Discover → 添加索引 URL | 否，用户手动加索引 |
| **GitHub-only 收录** | 仓库满足收录要求 + PR | 网站给出一条 `dsh plugin add` 命令 | 否（默认索引只收 npm 包） |
| **npm 发布 + Awesome 索引** | npm 账号 + PR | Discover 里搜索一键安装 | 是 |

> **当前状态**：**已发布到 npm** 的 `dsh-mcp-skill-manage@0.5.5`（https://www.npmjs.com/package/dsh-mcp-skill-manage），`private: false` + `publishConfig.access: public`，`engines.dsh` 已带上。自建索引已切到 `--source npm`。剩余步骤：仓库满 1 天后提交 Awesome PR（合并后进默认 Discover 市场）。
>
> **发布注意（2FA）**：npm 账号开了 2FA 时，`npm publish` 需要 `--otp <6位码>`，或使用带 **Bypass 2FA** 的 granular token（本机曾用后者发布）。用 bypass token 发布时 npm 可能走 *staged publishing*：先产生 `0.0.0-stage` 占位版本，真实版本延迟几十秒到几分钟才出现在 registry，`npm view` 初始可能只看到占位版本，稍等再查即可（本次发布即为此情况，最终 `dist-tags.latest` 正确指向 `0.5.5`）。需要显式 stage/approve 时用 npm >= 11.15：`npm stage publish` → `npm stage list` → `npm stage approve <uuid> --otp <code>`（本机 npm 10 不支持 `npm stage`，可用 `npx npm@12`）。

---

## 1. 自建索引（已可 npm source）

仓库里能生成 format-1 的市场索引。**已发布 npm 后推荐 npm source**（安装走 registry，有正常版本更新）：

```bash
node scripts/build-market-index.mjs --source npm --version 0.5.5
git add market/index.json && git commit -m "chore: refresh market index" && git push
```

未发布 npm 时也可用 **git source**（固定 commit，不依赖 npm）：

```bash
npm run market:build -- --version <version> --commit "$(git rev-parse 'v<version>^{commit}')"
```

索引地址（用户加到 Settings → Plugins → Discover → Index sources）：

```text
https://raw.githubusercontent.com/sunChargedd/dsh-mcp-skill-manage/main/market/index.json
```

git source 的 `source.commit` 固定到发布 commit；npm source 只需版本号。每次发新版本后重新生成一次即可。生成脚本：`scripts/build-market-index.mjs`。

## 2. 收录进 Awesome DSH Plugin（网站列表）

市场网站与默认 Discover 索引都来自 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：

- 一个插件一个文件：`data/plugins/<owner>__<repo>.yml`
- 收录要求（PR 自动检查）：
  - `package.json` 声明 **`dsh.bundle`** manifest（本仓库 ✓）
  - 仓库创建满 **1 天**（本仓库创建于 2026-10-26T18:06Z，2026-10-27T18:06Z 起可提交）
  - 仓库带 **`dsh-plugin`** topic（本仓库 ✓）
- 模板（放在本仓库 [market/awesome-plugin.yml](awesome-plugin.yml)，提交时复制到对方仓库）：

```yaml
url: https://github.com/sunChargedd/dsh-mcp-skill-manage
name: sunChargedd/dsh-mcp-skill-manage
category: tools
description:
  en: Manage skills and MCP servers across DSH, Claude Code, Codex, Cursor and other agent tools from one sidebar page.
  zh: 在 DSH 侧边栏统一管理 DSH、Claude Code、Codex、Cursor 等 agent 工具的 skill 与 MCP 服务器。
icon: https://raw.githubusercontent.com/sunChargedd/dsh-mcp-skill-manage/main/icon.svg
```

PR 流程：

```bash
git clone https://github.com/<你的账号>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
cp <本仓库>/market/awesome-plugin.yml data/plugins/sunChargedd__dsh-mcp-skill-manage.yml
git checkout -b add/sunchargedd-dsh-mcp-skill-manage
git add data/plugins && git commit -m "Add sunChargedd/dsh-mcp-skill-manage"
git push origin HEAD   # 然后在 GitHub 上开 PR
```

合并后：网站与列表自动更新；默认 Discover 索引只会在 npm 上有已发布版本时收录它（见下一节）。

## 3. npm 发布（进入默认市场）

### 3.1 包名与需要同步的三个位置

包名已确定为 `dsh-mcp-skill-manage`（npm 上可用）。改名前约定的规则仍然成立：下面三处必须完全一致，否则 loader 解析不到——

1. `package.json` 的 `"name"`
2. `client.js` 顶部 `window.__ModuleLoader__.load({ id: '...' })` 的 id
3. `cordis.patch.yml` 中插件行的 `name:`

另外 `scripts/test-render.mjs` 的模块 id 断言、`lib/probe.js` 的 CLIENT_INFO 也随包名更新。当前仓库已全部完成，无需再改。

### 3.2 发布（本机 OTP 或 Trusted Publishing）

**方式一：本机发布（需要 2FA 验证码）**

```bash
npm publish --access public --otp=<6位验证码>
```

**方式二：GitHub Actions + npm Trusted Publishing（推荐，之后无需 OTP/token）**

1. npm 包页面 → Settings → **Trusted Publisher** → GitHub Actions：
   - Organization/user: `sunChargedd`
   - Repository: `dsh-mcp-skill-manage`
   - Workflow filename: `npm-publish.yml`
2. 在 GitHub Actions 手动运行 **npm publish** 工作流，输入与 `package.json` 一致的版本号。
3. 工作流用 OIDC（`id-token: write` + `--provenance`）发布，不需要任何 token。

### 3.3 手动发布（旧）

```bash
npm login                    # 一次性
npm pack --dry-run           # 检查打进去的文件（应只有运行时文件）
npm publish --access public  # 2FA 账号需 --otp <code>
```

发布后用户可以直接：

```text
plugin_manager action=install_bundle target=<包名>@<版本>
```

或用 DSH CLI：`dsh plugin add <包名>@<版本>`。

> 说明：本仓库当前 `private: true` 是有意的——本地 link 安装不需要 npm 发布，也避免误发。确认包名后再改。

### 3.3 进入默认发现索引

Awesome DSH Plugin 的索引生成器会读取 npm 上已发布的版本。完成「GitHub 收录 + npm 发布」后，条目会带版本进入 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，用户在 Discover 里就能搜索并一键安装。

---

## 版本与 Release 自动化

- 版本号：SemVer + Keep a Changelog；每次用户可见变更都记到 `## [Unreleased]`。
- 发布：
  ```bash
  npm run bump:patch   # 或 bump:minor / bump:major
  git add -A && git commit -m "chore(release): vX.Y.Z"
  git tag vX.Y.Z
  git push && git push --follow-tags
  ```
- 推送 `v*` tag 后，[Release workflow](../.github/workflows/release.yml) 会自动：
  1. 用 `scripts/release-notes.mjs` 取该版本说明：优先 `docs/release-notes/<version>.md`（可写中英双语），否则从 `CHANGELOG.md` 截取该版本段落；
  2. 创建（或跳过已存在的）GitHub Release。
- 发版检查清单：CI 通过；Release 已生成；`market/index.json` 已刷新（如果使用自建索引）。

## Checklist

- [ ] 仓库 topic 含 `dsh-plugin`
- [ ] `package.json` 有 `dsh.bundle.patch`
- [ ] `package.json` 的 `engines.dsh` 与 README 兼容性表一致（市场索引会带上它）
- [ ] 仓库满 1 天后提 Awesome PR
- [ ] npm 包名可用并已 `npm publish`
- [ ] Release 自动生成
- [ ] 自建索引 commit 已更新（可选）
