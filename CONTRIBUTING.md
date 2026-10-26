# Contributing to dsh-mcp-skill-manage

Thanks for taking the time to contribute! This project is a zero-dependency DSH Web
plugin, so setup is deliberately small.

## Ways to contribute

- **Bug reports**: open an issue with the template, including your OS, DSH version, the
  tool whose config you were editing, and the exact error text.
- **New tool support**: add an entry to `lib/presets.js` (see below).
- **Feature requests**: describe the workflow you want, not only the UI you imagine.
- **Documentation**: README, CHANGELOG wording, translations.

## Development setup

Requirements: Node.js >= 20, and a DSH installation whose profile you can install plugins
into.

```bash
git clone https://github.com/sunChargedd/dsh-mcp-skill-manage.git
cd dsh-mcp-skill-manage
npm test
```

The plugin has **no runtime dependencies** and no build step. Install the checkout into
your DSH profile with the Plugin Manager (`install_bundle` with the absolute package
directory), then refresh the Web page. Later edits are picked up by DSH's HMR
recomposition; a plain page refresh (Cmd/Ctrl+R) reloads the client half.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.js` | Host plugin: two JSON routes, action dispatch, `mcp_skill_manager` tool, settings. |
| `client.js` | Browser plugin: sidebar entry + management page (no client-package imports). |
| `lib/adapters.js` | Filesystem data layer: skill scan/parse/write, JSON(C)/TOML/YAML-patch editing, symlinks, backups. |
| `lib/presets.js` | Candidate paths for every supported agent tool (data only). |
| `lib/zip.js` | Zero-dependency zip reader/writer for skill import/export. |
| `lib/probe.js` | MCP health probe (stdio JSON-RPC, HTTP, SSE). |
| `lib/market.js` | skills.sh / MCP Registry market adapters and install planning. |
| `scripts/test-*.mjs` | Self tests: data layer, utilities, Host actions, headless UI render. |
| `scripts/bump-version.mjs` | Cuts `[Unreleased]` into a dated CHANGELOG release and bumps `package.json`. |
| `scripts/release-notes.mjs` | Extracts one released CHANGELOG section (used by the Release workflow). |
| `scripts/build-market-index.mjs` | Generates the self-hosted format-1 market index. |
| `docs/CONTRACT.md` | Internal interface contract between Host, adapters and client. |
| `docs/PUBLISHING.md` | npm / Awesome list / self-hosted index distribution guide. |

## Adding support for another agent tool

1. Add a **skill root preset** and/or **MCP target preset** in `lib/presets.js`. A preset
   is only detected when one of its candidate paths exists, so an outdated guess can
   never create a bogus entry.
2. If the tool uses a non-standard MCP shape, describe it in the contract and handle it
   in the relevant adapter/builder (`keyPath`, `style`).
3. Add a line to the supported-tools table in the README and a `CHANGELOG.md` entry.
4. Run `npm test`.

## Coding conventions

- Plain ESM JavaScript, Node builtins only. Do not add npm dependencies.
- 2-space indentation, single quotes, no semicolons in `lib/*.js` style; match the
  surrounding file.
- The client half must not import Harness Client packages or use literal colors; use
  `--dsw-*` theme tokens so light/dark themes keep working.
- Keep `package.json` `engines.dsh` in sync with the DSH APIs the plugin uses. When a change needs a newer DSH runtime, raise the lower bound and update the compatibility tables in both READMEs.
- Every mutating adapter backs up first and writes atomically.
- Keep the Host action layer as the single implementation: the UI and the agent tool
  call the same functions.

## Tests

```bash
npm test                # everything (syntax + 4 suites)
npm run test:adapters   # filesystem data layer
npm run test:tools      # zip + MCP probe
npm run test:market      # market adapters (faked network)
npm run test:actions     # Host actions end-to-end (temp HOME)
npm run test:render     # headless render of the page (temp HOME)
```

All suites create their own temporary HOME and clean it up, so they never read or write
your real agent configuration. Add a regression test for every bug fix.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/).

1. Add your user-visible change under `## [Unreleased]` in `CHANGELOG.md`.
2. When releasing, run:
   ```bash
   npm run bump:patch   # bug fixes / docs
   npm run bump:minor   # new features, backwards compatible
   npm run bump:major   # breaking changes
   ```
   This moves `[Unreleased]` into a dated section and updates `package.json`.
3. Commit `package.json` + `CHANGELOG.md` as `chore(release): vX.Y.Z`, tag `vX.Y.Z`, and
   push with `git push --follow-tags`. The Release workflow creates the GitHub Release
   from that changelog section automatically.

## Pull requests

- One logical change per PR; describe the user-visible effect and how you verified it.
- `npm test` must pass.
- Update `CHANGELOG.md` (and README when behavior or supported tools change).
- Screenshots / short recordings are very welcome for UI changes; check first that they
  do not contain private paths, tokens or session titles.
