/**
 * Headless render smoke test for `client.js`.
 *
 * There is no browser control in this environment and no React copy on the package's
 * resolution path, so this test loads the real browser module, captures its slot
 * registration, and renders the page with a minimal hook-capable React shim against a
 * real snapshot. It catches render-time crashes (the class of bug that blanks the slot)
 * without pretending to verify layout or styling.
 *
 * Run: node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __test } from '../index.js';
import { resolvePaths } from '../lib/adapters.js';

// ---------------------------------------------------------------------------
// Minimal React (createElement + hooks) — enough for this component tree.
// ---------------------------------------------------------------------------
const FRAGMENT = Symbol('dsh-msm.fragment');
const hooksByKey = new Map();
let current = null;
let pending = false;
let effectQueue = [];

/** Read or create the hook slot at the current index for one component instance. */
function hook(init) {
  const instance = current;
  const index = instance.index++;
  if (instance.hooks.length <= index) instance.hooks.push({ value: init(), deps: undefined, cleanup: null, lastDeps: undefined });
  return { instance, index, slot: instance.hooks[index] };
}

const React = {
  Fragment: FRAGMENT,
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}) };
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged };
  },
  useState(initial) {
    const entry = hook(() => (typeof initial === 'function' ? initial() : initial));
    const set = (next) => {
      const value = typeof next === 'function' ? next(entry.slot.value) : next;
      if (!Object.is(value, entry.slot.value)) {
        entry.slot.value = value;
        pending = true;
      }
    };
    return [entry.slot.value, set];
  },
  useReducer(reducer, initial) {
    return React.useState(initial);
  },
  useRef(initial) {
    return hook(() => ({ current: initial })).slot.value;
  },
  useCallback(fn) {
    return fn;
  },
  useMemo(fn) {
    return hook(fn).slot.value;
  },
  useEffect(fn, deps) {
    const entry = hook(() => null);
    entry.slot.fn = fn;
    entry.slot.deps = deps;
    effectQueue.push(entry.slot);
  },
  useLayoutEffect(fn, deps) {
    React.useEffect(fn, deps);
  },
};

let clicks = [];

/** Render one node to text, running function components and their hooks. */
function renderNode(node, key) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child, index) => renderNode(child, `${key}[${index}]`)).join('');
  const { type, props } = node;
  if (type === FRAGMENT) return renderNode(props.children, key);
  if (typeof type === 'function') {
    const previous = current;
    // React keys hooks by component type + position; two different components rendered at the
    // same tree position (tab switching below) must not share hook slots.
    const componentKey = `${key}:${type.name || 'anonymous'}`;
    current = { key: componentKey, hooks: hooksByKey.get(componentKey) ?? [], index: 0 };
    hooksByKey.set(componentKey, current.hooks);
    let output;
    try {
      output = type({ ...props });
    } finally {
      current = previous;
    }
    return renderNode(output, key);
  }
  const text = renderNode(props.children, `${key}/${type}`);
  const fieldValue =
    (type === 'input' || type === 'textarea') && typeof props.value === 'string' ? props.value : '';
  if ((type === 'button' || props.role === 'button') && typeof props.onClick === 'function') {
    clicks.push({ text, title: props.title ?? '', onClick: props.onClick });
  }
  return text + fieldValue;
}

/** Run queued effects whose dependencies changed. */
function flushEffects() {
  const queued = effectQueue;
  effectQueue = [];
  const seen = new Set();
  for (const slot of queued) {
    if (seen.has(slot)) continue;
    seen.add(slot);
    const deps = slot.deps;
    const previous = slot.lastDeps;
    const changed =
      !previous || !deps || deps.length !== previous.length || deps.some((value, index) => !Object.is(value, previous[index]));
    if (!changed) continue;
    if (typeof slot.cleanup === 'function') slot.cleanup();
    const cleanup = slot.fn();
    slot.cleanup = typeof cleanup === 'function' ? cleanup : null;
    slot.lastDeps = deps;
  }
}

// ---------------------------------------------------------------------------
// Load the real browser module and render it.
// ---------------------------------------------------------------------------
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
let definition;
globalThis.window = { __ModuleLoader__: { load(value) { definition = value; } } };
new Function('window', source)(globalThis.window);
assert.equal(definition?.id, 'dsh-mcp-skill-manage', 'client module registers under the package name');

const components = {};
const dictionaries = {};
let localeRevision = 1;
const ctx = {
  effect(callback) {
    const disposer = callback();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  get() {
    return undefined;
  },
  on() {
    return () => {};
  },
  slots: {
    inject(name, callback) {
      return callback();
    },
    register(options, component) {
      components[options.name] = { options, component };
      return () => {};
    },
  },
  locale: {
    register(namespace, locale, dictionary) {
      dictionaries[locale] = dictionary;
      localeRevision += 1;
      return () => {};
    },
    bind() {
      return (key, params) => {
        const template = dictionaries.zh?.[key] ?? key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
      };
    },
    subscribe() {
      return () => {};
    },
    getSnapshot() {
      return { active: 'zh', locales: ['zh', 'en'], revision: localeRevision };
    },
  },
};

const module = definition.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`unexpected require(${id})`);
});
module.apply(ctx);
assert.ok(components.main, 'registers a main panel');
assert.ok(components['sidebar.panellist'], 'registers a sidebar entry');
assert.equal(components['sidebar.panellist'].options.id, 'mcp-skill-manager');
assert.equal(components.main.options.key, 'mcp-skill-manager');

// Hermetic fixture: the render test never reads the developer's real agent configs.
const tempRoot = await mkdtemp(join(tmpdir(), 'msm-render-'));
const env = {
  HOME: tempRoot,
  DSH_HOME: join(tempRoot, '.dsh'),
  DSH_AGENTS_HOME: join(tempRoot, '.agents'),
  CODEX_HOME: join(tempRoot, '.codex'),
  CLAUDE_CONFIG_DIR: join(tempRoot, '.claude'),
  DSH_PROFILE_DIR: join(tempRoot, '.dsh', 'profiles', 'test'),
};
let state;
try {
  const skillDir = join(env.DSH_AGENTS_HOME, 'skills', 'render-skill');
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, 'SKILL.md'),
    '---\nname: render-skill\ndescription: Render smoke test skill\n---\n\n# Render skill\n\nBody text.\n',
  );
  const secondSkill = join(env.DSH_AGENTS_HOME, 'skills', 'render-skill-two');
  await mkdir(secondSkill, { recursive: true });
  await writeFile(
    join(secondSkill, 'SKILL.md'),
    '---\nname: render-skill-two\ndescription: Second render fixture\n---\n\n# Two\n\nAnother body.\n',
  );
  await mkdir(join(env.DSH_PROFILE_DIR), { recursive: true });
  await writeFile(join(env.DSH_PROFILE_DIR, 'cordis.patch.yml'), '[]\n');
  await mkdir(join(tempRoot, '.cursor'), { recursive: true });
  await writeFile(
    join(tempRoot, '.cursor', 'mcp.json'),
    `${JSON.stringify({ mcpServers: { 'render-server': { command: 'node', args: ['server.js'] } } }, null, 2)}\n`,
  );
  const backupStamp = '2026-01-01T00-00-00-000Z';
  const backupDir = join(env.DSH_HOME, '.mcp-skill-manager', 'backups', backupStamp);
  await mkdir(join(backupDir, 'old-skill'), { recursive: true });
  await writeFile(
    join(backupDir, 'old-skill', 'SKILL.md'),
    '---\nname: old-skill\ndescription: Backup fixture\n---\n\n# Old skill\n',
  );
  await writeFile(
    join(backupDir, 'manifest.json'),
    `${JSON.stringify({ version: 1, entries: [{ name: 'old-skill', kind: 'skill' }] }, null, 2)}\n`,
  );

  state = await __test.buildState(resolvePaths(env), {
    version: 1,
    projects: [],
    customSkillDirs: [],
    customMcpTargets: [],
  });
let fakeState = state;
const stateResponse = (next) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, value: { state: next } }),
});
const valueResponse = (value) => ({ ok: true, status: 200, json: async () => ({ ok: true, value }) });
globalThis.fetch = async (url, init) => {
  let body;
  try {
    body = init?.body ? JSON.parse(init.body) : undefined;
  } catch {
    body = undefined;
  }
  const action = body?.action;
  if (action === 'skill/read') {
    const skill = fakeState.skills.find((entry) => entry.key === body.skillKey);
    return valueResponse({ skill, body: `# ${skill?.name ?? 'missing'}\n\nRendered body.` });
  }
  if (action === 'skill/delete') {
    fakeState = { ...fakeState, skills: fakeState.skills.filter((entry) => entry.key !== body.skillKey) };
    return stateResponse(fakeState);
  }
  if (action === 'mcp/delete') {
    fakeState = {
      ...fakeState,
      mcpServers: fakeState.mcpServers.filter(
        (entry) => !(entry.targetId === body.targetId && entry.name === body.name),
      ),
    };
    return stateResponse(fakeState);
  }
  return stateResponse(fakeState);
};

const EVT = { stopPropagation() {}, preventDefault() {}, key: 'Enter' };

const Page = components.main.component;

/** Render until no state update is pending, returning the settled HTML. */
async function settle() {
  let html = '';
  for (let pass = 0; pass < 30; pass += 1) {
    pending = false;
    clicks = [];
    html = renderNode(React.createElement(Page, {}), 'page');
    flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (!pending && pass > 2) break;
  }
  return html;
}

/** Click the first clickable element with exactly this text, then settle again. */
async function clickExact(text) {
  const target = clicks.find((entry) => entry.text === text);
  assert.ok(target, `button "${text}" is rendered`);
  target.onClick(EVT);
  return settle();
}

/** Click the first clickable element with this icon title, then settle again. */
async function clickTitle(title) {
  const target = clicks.find((entry) => entry.title === title);
  assert.ok(target, `action "${title}" is rendered`);
  target.onClick(EVT);
  return settle();
}

/** Click a rendered button whose text starts with `label`, then settle again. */
async function clickTab(label) {
  const button = clicks.find((entry) => entry.text.startsWith(label));
  assert.ok(button, `button "${label}" is rendered`);
  button.onClick(EVT);
  return settle();
}

/** Click the first clickable element whose text contains `text`. */
async function clickContains(text) {
  const target = clicks.find((entry) => entry.text.includes(text));
  assert.ok(target, `clickable "${text}" is rendered`);
  target.onClick(EVT);
  return settle();
}

// --- Skills list ------------------------------------------------------------
let html = await settle();
assert.ok(html.length > 2000, 'renders a page, not an empty slot');
assert.match(html, /MCP 与技能管理/, 'header title renders');
assert.match(html, /Skills/, 'skills tab renders');
assert.match(html, /设置与诊断/, 'settings tab renders');
const expectedSkill = state.skills.find((skill) => skill.valid)?.name;
assert.ok(expectedSkill, 'the snapshot has at least one valid skill');
assert.ok(html.includes(expectedSkill), `skill card "${expectedSkill}" renders`);
assert.ok(clicks.some((entry) => entry.title === '删除'), 'card delete action renders');
assert.ok(html.includes('导入'), 'skills import action renders');
assert.ok(html.includes('导出'), 'skills export action renders');

assert.ok(clicks.some((entry) => entry.title === '打开配置所在位置'), 'card reveal action renders');
assert.equal(clicks.some((entry) => entry.title === '复制一份'), false, 'duplicate quick action is gone');
assert.ok(html.includes('搜索正文'), 'body search toggle renders');
console.log('ok - skills list renders with real data, quick actions included');

// --- Skill detail -----------------------------------------------------------
html = await clickContains(expectedSkill);
assert.ok(html.includes('基本信息'), 'skill detail basics section renders');
assert.ok(html.includes('可见性'), 'skill detail visibility section renders');
assert.ok(html.includes('内容'), 'skill detail body section renders');
assert.ok(html.includes('保存'), 'skill detail save action renders');
assert.ok(html.includes('导出'), 'skill detail export action renders');
assert.ok(html.includes('已开启') || html.includes('已关闭'), 'skill toggles show their state in words');
console.log('ok - skill detail renders');
html = await clickTab('Skills');
assert.ok(html.includes('新建 Skill'), 'back returns to the skills list');
console.log('ok - skill detail back navigation works');

// --- Skill templates --------------------------------------------------------
html = await clickTab('新建 Skill');
assert.ok(html.includes('模板'), 'skill template section renders');
assert.ok(html.includes('代码审查'), 'skill template chips render');
html = await clickContains('代码审查');
assert.ok(html.includes('code-review'), 'applying a skill template fills the name');
assert.ok(html.includes('Review a diff'), 'applying a skill template fills the description');
html = await clickTab('Skills');
console.log('ok - skill templates prefill the editor');

// --- MCP list ---------------------------------------------------------------
html = await clickTab('MCP');
const expectedServer = state.mcpServers[0]?.name;
assert.ok(expectedServer, 'the snapshot has at least one MCP server');
assert.ok(html.includes(expectedServer), `MCP row "${expectedServer}" renders`);
assert.ok(html.includes('添加服务器'), 'MCP toolbar renders');
assert.ok(html.includes('已启用') || html.includes('已禁用'), 'MCP rows show their enabled state in words');
assert.ok(clicks.some((entry) => entry.title === '测试连接'), 'MCP health action renders');
console.log('ok - MCP list renders with real data');

// --- MCP templates ----------------------------------------------------------
html = await clickTab('添加服务器');
assert.ok(html.includes('Context7'), 'MCP template chips render');
html = await clickContains('Context7');
assert.ok(html.includes('https://mcp.context7.com/mcp'), 'applying an MCP template fills the URL');
html = await clickTab('MCP');
console.log('ok - MCP templates prefill the editor');

// --- MCP detail -------------------------------------------------------------
html = await clickContains(expectedServer);
assert.ok(html.includes('环境变量与请求头'), 'MCP detail secrets section renders');
assert.ok(html.includes('复制到其他工具'), 'MCP detail copy section renders');
assert.ok(html.includes('连接'), 'MCP detail connection section renders');
assert.ok(html.includes('测试连接'), 'MCP detail health action renders');
console.log('ok - MCP detail renders');
html = await clickTab('MCP');
assert.ok(html.includes('添加服务器'), 'back returns to the MCP list');
console.log('ok - MCP detail back navigation works');

// --- Settings & doctor ------------------------------------------------------
html = await clickTab('设置与诊断');
assert.ok(html.includes(state.capabilities.backups), 'backup directory is shown');
assert.ok(html.includes('检测到的工具位置'), 'detected tool locations render');
assert.ok(html.includes('诊断'), 'diagnostics section renders');
assert.ok(html.includes(state.mcpTargets[0]?.path ?? ''), 'detected target path renders');
console.log('ok - settings & doctor page renders');

// --- Market tab -------------------------------------------------------------
html = await clickTab('市场');
assert.ok(html.includes('Skills 市场'), 'skills market segment renders');
assert.ok(html.includes('MCP 市场'), 'MCP market segment renders');
assert.ok(html.includes('搜索'), 'market search action renders');
assert.ok(html.includes('发现 skill 与 MCP'), 'market empty state renders');
console.log('ok - market tab renders both sources');

// --- Backups tab ------------------------------------------------------------
html = await clickTab('备份');
assert.ok(html.includes('恢复'), 'backup restore actions render');
assert.ok(html.includes(state.backups[0]?.entries?.[0]?.name ?? ''), 'backup entry names render');
assert.ok(html.includes('打开备份目录'), 'backup reveal action renders');
console.log('ok - backups page renders real snapshots');

// --- Bulk selection & delete ------------------------------------------------
html = await clickTab('Skills');
html = await clickTab('批量');
assert.ok(html.includes('已选择 0 项'), 'bulk bar renders with an empty selection');
html = await clickContains('render-skill-two');
assert.ok(html.includes('已选择 1 项'), 'clicking a card toggles its selection');
html = await clickContains('删除');
assert.ok(html.includes('删除 1 项？'), 'bulk delete asks for confirmation');
html = await clickContains('删除 1 项？');
assert.ok(html.includes('已删除 1 个 skill'), 'bulk delete reports how many skills were removed');
assert.equal(html.includes('render-skill-two'), false, 'bulk-deleted skill is gone');
assert.ok(html.includes('render-skill'), 'other skills stay in the list');
assert.ok(html.includes('批量'), 'selection mode ends after the bulk action');
console.log('ok - bulk selection and delete work');

// --- Quick delete stays on the list (no card-click navigation) --------------
html = await clickTab('Skills');
assert.ok(html.includes(expectedSkill), 'skill still listed before deletion');
html = await clickTitle('删除');
assert.ok(html.includes('确认删除'), 'delete asks for confirmation inline');
html = await clickExact('删除');
assert.ok(html.includes('已删除'), 'delete shows a toast');
assert.ok(html.includes('新建 Skill'), 'delete keeps the list page (card click did not fire)');
assert.equal(html.includes('基本信息'), false, 'delete did not open the skill detail');
assert.equal(html.includes(expectedSkill), false, 'deleted skill is gone from the list');
console.log('ok - quick delete stays on the list and refreshes it');

console.log(`ok - render smoke test (${state.skills.length} skills, ${state.mcpServers.length} MCP servers)`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
