/**
 * MCP & Skill Manager — browser half.
 *
 * Registers the sidebar panel entry and the management page. All data operations go
 * through the Host's two JSON routes; no Harness Client package is imported, only React
 * from the module table and the restricted Cordis context (`slots`, `locale`, optional
 * `uiWorkspace` for directory picking).
 *
 * IDs must match package.json: the factory id equals the package name.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-skill-manage',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'mcp-skill-manager';
    /** Sidebar entry id; it is also the `main` panel key. */
    const PANEL_ID = 'mcp-skill-manager';
    const STATE_ROUTE = 'mcp-skill-manager/state';
    const ACTION_ROUTE = 'mcp-skill-manager/action';

    // -----------------------------------------------------------------------
    // Dictionaries
    // -----------------------------------------------------------------------
    const EN = {
      panel: 'MCP & Skills',
      title: 'MCP & Skill Manager',
      subtitle: 'Skills and MCP servers for DSH, Claude Code, Codex, Cursor and other agent tools',
      refresh: 'Refresh',
      loading: 'Loading…',
      retry: 'Retry',
      'tab.skills': 'Skills',
      'tab.mcp': 'MCP',
      'tab.settings': 'Settings & Doctor',
      'search.placeholder': 'Search name or description',
      'search.body': 'Body',
      'search.searching': 'Searching…',
      'search.matches': '{count} body hits',
      'filter.all': 'All',
      'new.skill': 'New skill',
      'new.mcp': 'Add server',
      create: 'Create',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      'confirm.delete': 'Confirm delete',
      duplicate: 'Duplicate',
      copy: 'Copy',
      'copy.to': 'Copy to',
      'copy.result': 'Copied to {copied} target(s); skipped {skipped} existing.',
      reveal: 'Reveal config',
      'select.skill': 'Select a skill on the left, or create a new one.',
      'select.mcp': 'Select an MCP server on the left, or add a new one.',
      'field.name': 'Name',
      'field.description': 'Description',
      'field.whenToUse': 'When to use',
      'field.body': 'SKILL.md body (Markdown)',
      'field.root': 'Canonical location',
      'field.modelInvocable': 'Model can invoke',
      'field.userInvocable': 'User can invoke',
      'field.visibility': 'Visible to',
      'field.path': 'Path',
      'field.transport': 'Transport',
      'field.command': 'Command',
      'field.args': 'Arguments (one per line)',
      'field.cwd': 'Working directory',
      'field.url': 'URL',
      'field.headers': 'Headers (KEY=VALUE per line)',
      'field.env': 'Environment (KEY=VALUE per line)',
      'field.enabled': 'Enabled',
      'field.target': 'Target config',
      'field.format': 'Format',
      'field.keyPath': 'Key path (comma separated)',
      'field.label': 'Label',
      'toggle.show': 'Show values',
      'toggle.hide': 'Hide values',
      'visibility.hint': 'Checked tools get a symlink; the canonical copy stays at {path}.',
      'project.title': 'Tracked projects',
      'project.add': 'Add project',
      'project.hint': 'Project-level skills and MCP configs are discovered under tracked directories.',
      remove: 'Remove',
      'custom.skillTitle': 'Custom skill directories',
      'custom.skillAdd': 'Add directory',
      'custom.mcpTitle': 'Custom MCP config files',
      'custom.mcpAdd': 'Add config file',
      'custom.none': 'None',
      'detected.title': 'Detected tool locations',
      'doctor.title': 'Diagnostics',
      'doctor.none': 'No issues found.',
      'doctor.count': '{count} issue(s)',
      'mcp.disabled': 'disabled',
      'mcp.error': 'error',
      'mcp.empty': 'No MCP servers here yet.',
      'mcp.secrets': 'Values are hidden by default.',
      'skill.invalid': 'invalid',
      'skill.modelOff': 'model off',
      'skill.link': 'shared',
      'state.error': 'Could not load the manager data: {message}',
      'state.saved': 'Saved.',
      'state.deleted': 'Deleted.',
      'state.backup': 'Backup: {path}',
      'empty.skills': 'No skills found. Create one, or add a custom directory in Settings.',
      'settings.note': 'Every edit is backed up under {backups}. DSH MCP changes apply live through the profile patch watcher.',
      'busy': 'Working…',
      'warning': 'Warning',
      'invalid.name': 'Use kebab-case: lowercase letters, digits and hyphens.',
      'name.required': 'A name is required.',
      'description.required': 'A description is required.',
      'transport.stdio': 'stdio',
      'transport.http': 'http',
      'transport.sse': 'sse',
      'section.templates': 'Templates',
      'section.templatesHint': 'Start from a common server.',
      'section.tools': 'Tools',
      'section.basic': 'Basics',
      'section.body': 'Content',
      'section.visibility': 'Visibility',
      'section.connection': 'Connection',
      'section.secrets': 'Environment & headers',
      'section.copy': 'Copy to other tools',
      'empty.filter': 'No matches',
      'bulk.select': 'Select',
      'bulk.cancel': 'Done',
      'bulk.selected': '{count} selected',
      'bulk.share': 'Share',
      'bulk.shareTarget': 'Add to',
      'bulk.confirmDelete': 'Delete {count}?',
      'bulk.deleted': 'Deleted {count} skill(s).',
      'bulk.shared': 'Shared {count} skill(s).',
      'empty.mcpTitle': 'No MCP servers yet',
      'empty.skillsTitle': 'No skills found',
      'empty.add': 'Add one',
      'error.title': 'Could not load data',
      'state.on': 'On',
      'state.off': 'Off',
      'mcp.enabled': 'Enabled',
      'mcp.disabledLabel': 'Disabled',
      'tab.market': 'Market',
      'tab.backups': 'Backups',
      'market.skills': 'Skills market',
      'market.mcp': 'MCP market',
      'market.search': 'Search',
      'market.searching': 'Searching…',
      'market.install': 'Install',
      'market.installing': 'Installing…',
      'market.installedSkill': 'Installed {name}.',
      'market.installedMcp': 'Added {name}.',
      'market.installs': '{count} installs',
      'market.remote': 'Remote',
      'market.package': 'Package',
      'market.envHint': '{count} env vars to fill',
      'market.empty': 'Search the {source} to find something to install.',
      'market.emptyTitle': 'Find skills and MCP servers',
      'market.noResults': 'No results for that search.',
      'market.targetRoot': 'Install into',
      'market.targetConfig': 'Add to',
      'market.resultCount': '{count} results',
      'market.failed': 'Market request failed: {message}',
      'market.fallbackWarning': 'MCP Registry is unreachable; showing built-in popular servers.',
      'backup.note': 'Every edit and delete keeps a snapshot. Restoring a config writes the old file back (a fresh backup is taken first); restoring a skill adds a -restored suffix when the name is taken.',
      'backup.empty': 'No backups yet.',
      'backup.emptyHint': 'Snapshots appear here after the first edit or delete.',
      'backup.entry.skill': 'Skill',
      'backup.entry.config': 'Config',
      'backup.restore': 'Restore',
      'backup.restored': 'Restored to {path}',
      'backup.delete': 'Delete snapshot',
      'backup.confirmDelete': 'Delete this snapshot?',
      'backup.reveal': 'Open backups folder',
      'backup.unknownTarget': 'Target unknown (legacy backup)',
      'action.import': 'Import',
      'action.export': 'Export',
      'action.check': 'Test connection',
      'action.checking': 'Testing…',
      'health.ok': '{tools} tools · {ms} ms',
      'health.failed': '{error}',
      'import.result': 'Imported {count} skill(s).',
      'import.none': 'No skill in that archive.',
      'export.done': 'Export started.',
      'export.failed': 'Export failed.',
      'import.hint': 'Import a .zip containing SKILL.md bundles or flat <name>.md files.',
    };

    const ZH = {
      panel: 'MCP 与技能',
      title: 'MCP 与技能管理',
      subtitle: '统一管理 DSH、Claude Code、Codex、Cursor 等 agent 工具的 skill 与 MCP',
      refresh: '刷新',
      loading: '加载中…',
      retry: '重试',
      'tab.skills': 'Skills',
      'tab.mcp': 'MCP',
      'tab.settings': '设置与诊断',
      'search.placeholder': '搜索名称或描述',
      'search.body': '搜索正文',
      'search.searching': '搜索中…',
      'search.matches': '正文 {count} 处',
      'filter.all': '全部',
      'new.skill': '新建 Skill',
      'new.mcp': '添加服务器',
      create: '创建',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      'confirm.delete': '确认删除',
      duplicate: '复制一份',
      copy: '复制',
      'copy.to': '复制到',
      'copy.result': '已复制到 {copied} 个目标，跳过 {skipped} 个已存在项。',
      reveal: '打开配置所在位置',
      'select.skill': '从左侧选择一个 skill，或新建一个。',
      'select.mcp': '从左侧选择一个 MCP 服务器，或新增一个。',
      'field.name': '名称',
      'field.description': '描述',
      'field.whenToUse': '何时使用',
      'field.body': 'SKILL.md 正文（Markdown）',
      'field.root': '主副本位置',
      'field.modelInvocable': '允许模型调用',
      'field.userInvocable': '允许用户调用',
      'field.visibility': '对以下工具可见',
      'field.path': '路径',
      'field.transport': '传输方式',
      'field.command': '命令',
      'field.args': '参数（每行一个）',
      'field.cwd': '工作目录',
      'field.url': 'URL',
      'field.headers': '请求头（每行 KEY=VALUE）',
      'field.env': '环境变量（每行 KEY=VALUE）',
      'field.enabled': '启用',
      'field.target': '目标配置文件',
      'field.format': '格式',
      'field.keyPath': '键路径（逗号分隔）',
      'field.label': '显示名称',
      'toggle.show': '显示内容',
      'toggle.hide': '隐藏内容',
      'visibility.hint': '勾选的工具会创建符号链接，主副本仍在 {path}。',
      'project.title': '已跟踪的项目',
      'project.add': '添加项目',
      'project.hint': '在已跟踪的目录下会发现项目级 skill 与 MCP 配置。',
      remove: '移除',
      'custom.skillTitle': '自定义 skill 目录',
      'custom.skillAdd': '添加目录',
      'custom.mcpTitle': '自定义 MCP 配置文件',
      'custom.mcpAdd': '添加配置文件',
      'custom.none': '无',
      'detected.title': '已检测到的工具位置',
      'doctor.title': '诊断',
      'doctor.none': '未发现问题。',
      'doctor.count': '{count} 个问题',
      'mcp.disabled': '已禁用',
      'mcp.error': '错误',
      'mcp.empty': '这里还没有 MCP 服务器。',
      'mcp.secrets': '敏感值默认隐藏。',
      'skill.invalid': '无效',
      'skill.modelOff': '模型不可用',
      'skill.link': '共享',
      'state.error': '无法加载管理数据：{message}',
      'state.saved': '已保存。',
      'state.deleted': '已删除。',
      'state.backup': '备份：{path}',
      'empty.skills': '没有找到 skill。新建一个，或在设置里添加自定义目录。',
      'settings.note': '所有编辑都会备份到 {backups}。DSH 的 MCP 修改会通过 profile patch 监听即时生效。',
      busy: '处理中…',
      warning: '警告',
      'invalid.name': '需使用 kebab-case：小写字母、数字和连字符。',
      'name.required': '请填写名称。',
      'description.required': '请填写描述。',
      'transport.stdio': 'stdio',
      'transport.http': 'http',
      'transport.sse': 'sse',
      'section.templates': '模板',
      'section.templatesHint': '从常用服务器开始。',
      'section.tools': '工具',
      'section.basic': '基本信息',
      'section.body': '内容',
      'section.visibility': '可见性',
      'section.connection': '连接',
      'section.secrets': '环境变量与请求头',
      'section.copy': '复制到其他工具',
      'empty.filter': '没有匹配项',
      'bulk.select': '批量',
      'bulk.cancel': '完成',
      'bulk.selected': '已选择 {count} 项',
      'bulk.share': '共享',
      'bulk.shareTarget': '共享到',
      'bulk.confirmDelete': '删除 {count} 项？',
      'bulk.deleted': '已删除 {count} 个 skill。',
      'bulk.shared': '已共享 {count} 个 skill。',
      'empty.mcpTitle': '还没有 MCP 服务器',
      'empty.skillsTitle': '没有找到 skill',
      'empty.add': '新建一个',
      'error.title': '无法加载数据',
      'state.on': '已开启',
      'state.off': '已关闭',
      'mcp.enabled': '已启用',
      'mcp.disabledLabel': '已禁用',
      'tab.market': '市场',
      'tab.backups': '备份',
      'market.skills': 'Skills 市场',
      'market.mcp': 'MCP 市场',
      'market.search': '搜索',
      'market.searching': '搜索中…',
      'market.install': '安装',
      'market.installing': '安装中…',
      'market.installedSkill': '已安装 {name}。',
      'market.installedMcp': '已添加 {name}。',
      'market.installs': '{count} 次安装',
      'market.remote': '远程',
      'market.package': '包',
      'market.envHint': '需填写 {count} 个环境变量',
      'market.empty': '搜索 {source}，找到合适的 skill / MCP 直接安装。',
      'market.emptyTitle': '发现 skill 与 MCP',
      'market.noResults': '没有找到匹配结果。',
      'market.targetRoot': '安装到',
      'market.targetConfig': '添加到',
      'market.resultCount': '{count} 个结果',
      'market.failed': '市场请求失败：{message}',
      'market.fallbackWarning': 'MCP Registry 暂时不可用，已切换为内置常用服务器列表。',
      'backup.note': '每次编辑和删除都会留一份快照。恢复配置文件会写回旧内容（写回前会再备份一次当前文件）；恢复 skill 时若重名会自动加 -restored 后缀。',
      'backup.empty': '还没有备份。',
      'backup.emptyHint': '第一次编辑或删除后会在这里出现快照。',
      'backup.entry.skill': 'Skill',
      'backup.entry.config': '配置',
      'backup.restore': '恢复',
      'backup.restored': '已恢复到 {path}',
      'backup.delete': '删除快照',
      'backup.confirmDelete': '删除这个快照？',
      'backup.reveal': '打开备份目录',
      'backup.unknownTarget': '目标不明（旧版备份）',
      'action.import': '导入',
      'action.export': '导出',
      'action.check': '测试连接',
      'action.checking': '测试中…',
      'health.ok': '{tools} 个工具 · {ms} ms',
      'health.failed': '{error}',
      'import.result': '已导入 {count} 个 skill。',
      'import.none': '压缩包里没有可导入的 skill。',
      'export.done': '已开始下载导出文件。',
      'export.failed': '导出失败。',
      'import.hint': '导入包含 SKILL.md 目录或扁平 <name>.md 的 .zip。',
    };

    // -----------------------------------------------------------------------
    // Small utilities
    // -----------------------------------------------------------------------

    /** Build a class list from truthy entries. */
    function cx(...parts) {
      return parts.filter(Boolean).join(' ');
    }

    /** Read `KEY=VALUE` lines into an object; blank lines and `#` comments are skipped. */
    function parseKeyValues(text) {
      const result = {};
      for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim();
        if (line.length === 0 || line.startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index <= 0) continue;
        const key = line.slice(0, index).trim();
        if (key.length === 0) continue;
        result[key] = line.slice(index + 1).trim();
      }
      return result;
    }

    /** Render an object as `KEY=VALUE` lines. */
    function formatKeyValues(value) {
      if (value === null || typeof value !== 'object') return '';
      return Object.entries(value)
        .map(([key, entry]) => `${key}=${typeof entry === 'string' ? entry : String(entry)}`)
        .join('\n');
    }

    /** Split a textarea into trimmed non-empty lines. */
    function parseLines(text) {
      return String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    /** Kebab-case skill name test shared with the Host adapter. */
    const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    /** MCP server name test shared with the Host adapter. */
    const MCP_NAME = /^[A-Za-z0-9_-]{1,32}$/;

    /** Ordered list of transport options for one target format. */
    function transportOptions(format) {
      if (format === 'yaml-patch') return ['stdio', 'http'];
      return ['stdio', 'http', 'sse'];
    }

    /** Uint8Array → base64 without blowing the call stack. */
    function bytesToBase64(bytes) {
      let binary = '';
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
      }
      return btoa(binary);
    }

    /** Trigger a browser download for a base64 payload. */
    function downloadBase64(filename, base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Localized tool/root/target label for the active locale. */
    function localized(entry, locale) {
      if (entry === undefined || entry === null) return '';
      return (locale === 'zh' && entry.labelZh) || entry.label || entry.path || '';
    }

    // -----------------------------------------------------------------------
    // API
    // -----------------------------------------------------------------------

    /** Read one request and unwrap the envelope. */
    async function requestJson(url, init) {
      let response;
      try {
        response = await fetch(url, init);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      if (!response.ok || payload === undefined || payload.ok !== true) {
        const message = payload?.error?.message ?? `HTTP ${response.status}`;
        throw new Error(message);
      }
      return payload.value;
    }

    /** Read the whole snapshot; the route wraps it as `{ state }`. */
    async function fetchState() {
      const value = await requestJson(STATE_ROUTE, { headers: { accept: 'application/json' } });
      return value.state;
    }

    /** Run one mutation through the shared action route. */
    async function callAction(action, params) {
      return await requestJson(ACTION_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(params ?? {}) }),
      });
    }

    // -----------------------------------------------------------------------
    // Hooks
    // -----------------------------------------------------------------------

    /** Bind the plugin namespace and re-render on locale changes. */
    function useT(ctx) {
      const [, force] = React.useReducer((value) => value + 1, 0);
      React.useEffect(() => ctx.locale.subscribe(() => force()), [ctx]);
      return ctx.locale.bind(NS);
    }

    /** Active locale id ('zh' | 'en'). */
    function useLocaleId(ctx) {
      const [, force] = React.useReducer((value) => value + 1, 0);
      React.useEffect(() => ctx.locale.subscribe(() => force()), [ctx]);
      return ctx.locale.getSnapshot().active;
    }

    /** Snapshot state plus mutation helpers shared by every tab. */
    function useManager() {
      const [state, setState] = React.useState(null);
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);

      const load = React.useCallback(async () => {
        setBusy(true);
        setError('');
        try {
          setState(await fetchState());
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          setBusy(false);
        }
      }, []);

      React.useEffect(() => {
        void load();
      }, [load]);

      const run = React.useCallback(async (action, params) => {
        setBusy(true);
        setError('');
        try {
          const value = await callAction(action, params);
          if (value !== null && typeof value === 'object' && value.state) setState(value.state);
          return value;
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          throw cause;
        } finally {
          setBusy(false);
        }
      }, []);

      React.useEffect(() => {
        if (typeof window.addEventListener !== 'function') return undefined;
        const onFocus = () => {
          void load();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
      }, [load]);

      return { state, error, busy, load, run };
    }

    // -----------------------------------------------------------------------
    // UI primitives (host theme tokens only)
    // -----------------------------------------------------------------------

    /** Square SVG wrapper whose glyph inherits the surrounding text color. */
    function Svg({ size = 16, viewBox = '0 0 24 24', children }) {
      return h(
        'svg',
        { width: size, height: size, viewBox, fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        children,
      );
    }

    /** Magnifier. */
    function IconSearch() {
      return h(
        Svg,
        null,
        h('circle', { cx: 11, cy: 11, r: 6.4, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M15.8 15.8 20 20', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      );
    }

    /** Circular refresh arrows. */
    function IconRefresh() {
      return h(
        Svg,
        null,
        h('path', {
          d: 'M20 12a8 8 0 1 1-2.34-5.66',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M20 3.5V8h-4.5',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Down chevron for selects and rows. */
    function IconChevron() {
      return h(
        Svg,
        { size: 14 },
        h('path', {
          d: 'm6 9 6 6 6-6',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Left chevron for the detail back action. */
    function IconChevronLeft() {
      return h(
        Svg,
        { size: 15 },
        h('path', {
          d: 'm14 6-6 6 6 6',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Trash can. */
    function IconTrash() {
      return h(
        Svg,
        null,
        h('path', { d: 'M4.5 6.5h15', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', {
          d: 'M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M6.5 6.5 7.3 19c.05.9.8 1.5 1.7 1.5h6c.9 0 1.65-.6 1.7-1.5l.8-12.5',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Reveal in the file manager: arrow leaving a box. */
    function IconReveal() {
      return h(
        Svg,
        null,
        h('path', {
          d: 'M13 4.5h6.5V11',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M19.5 4.5 11 13', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('path', {
          d: 'M19 14.5v3A2.5 2.5 0 0 1 16.5 20h-10A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5h3',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
      );
    }

    /** Activity pulse for the MCP health check. */
    function IconPulse() {
      return h(
        Svg,
        null,
        h('path', {
          d: 'M3 12h4l2.5-6 4 12 2.5-6h5',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Plug glyph used by the header mark and empty states. */
    function IconPlug({ size = 20 }) {
      return h(
        Svg,
        { size },
        h('path', { d: 'M9 3v3.4M15 3v3.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('rect', { x: 7, y: 6.4, width: 10, height: 6.6, rx: 2.6, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M12 13v5.4', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
        h('circle', { cx: 12, cy: 20.4, r: 1.1, fill: 'currentColor' }),
      );
    }

    /** Sidebar entry glyph, sized by the sidebar. */
    function PanelIcon({ size }) {
      return h(IconPlug, { size: typeof size === 'number' && size > 0 ? size : 18 });
    }

    /** Text/action button. */
    function Button({ children, onClick, variant, disabled, title, iconOnly, stopPropagation }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('msm-btn', variant, iconOnly && 'iconOnly'),
          onClick: (event) => {
            if (stopPropagation === true) event.stopPropagation();
            onClick(event);
          },
          disabled,
          title,
        },
        children,
      );
    }

    /** Labelled form field with an optional hint. */
    function Field({ label, hint, children }) {
      return h(
        'label',
        { className: 'msm-field' },
        label ? h('span', { className: 'msm-label' }, label) : null,
        children,
        hint ? h('span', { className: 'msm-hint' }, hint) : null,
      );
    }

    /** Single-line text input bound to a string draft. */
    function TextInput({ value, onChange, placeholder, mono, disabled, spellCheck }) {
      return h('input', {
        className: cx('msm-input', mono && 'mono'),
        type: 'text',
        value: value ?? '',
        placeholder,
        disabled,
        spellCheck: spellCheck === true,
        onChange: (event) => onChange(event.target.value),
      });
    }

    /** Multi-line text input. */
    function TextArea({ value, onChange, rows, mono, placeholder, spellCheck, readOnly }) {
      return h('textarea', {
        className: cx('msm-textarea', mono && 'mono'),
        value: value ?? '',
        rows: rows ?? 4,
        placeholder,
        readOnly: readOnly === true,
        spellCheck: spellCheck === true,
        onChange: (event) => onChange(event.target.value),
      });
    }

    /** Search field with a leading glyph. */
    function SearchInput({ value, onChange, placeholder }) {
      return h(
        'span',
        { className: 'msm-searchWrap' },
        h(IconSearch),
        h(TextInput, { value, onChange, placeholder }),
      );
    }

    /** Native select with a host-style chevron. */
    function Select({ value, onChange, options }) {
      return h(
        'span',
        { className: 'msm-selectWrap' },
        h(
          'select',
          { className: 'msm-select', value, onChange: (event) => onChange(event.target.value) },
          options.map((option) =>
            h('option', { key: option.value, value: option.value }, option.label ?? option.value),
          ),
        ),
        h(IconChevron),
      );
    }

    /** Segmented control for small exclusive choices. */
    function Segmented({ value, onChange, options }) {
      return h(
        'div',
        { className: 'msm-segmented' },
        options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              type: 'button',
              className: cx('msm-segment', value === option.value && 'on'),
              onClick: () => onChange(option.value),
            },
            option.label ?? option.value,
          ),
        ),
      );
    }

    /** Switch row (role=switch, native button toggling). */
    function Toggle({ checked, onChange, label, stateText }) {
      return h(
        'span',
        { className: 'msm-toggleRow' },
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': checked,
            className: 'msm-switch',
            onClick: () => onChange(!checked),
          },
          h('span', { className: 'msm-knob' }),
        ),
        label ? h('span', { className: 'msm-switchLabel' }, label) : null,
        stateText ? h('span', { className: cx('msm-switchState', checked && 'on') }, stateText) : null,
      );
    }

    /** Compact icon-only action button. */
    function IconButton({ title, onClick, tone, disabled, children }) {
      return h(
        'button',
        {
          type: 'button',
          className: cx('msm-iconBtn', tone),
          title,
          disabled,
          onClick: (event) => {
            event.stopPropagation();
            onClick();
          },
        },
        children,
      );
    }

    /** Small inline badge. */
    function Badge({ children, tone }) {
      return h('span', { className: cx('msm-badge', tone) }, children);
    }

    /** Toggleable pill used for visibility and copy targets. */
    function Chip({ on, onClick, children }) {
      return h(
        'button',
        { type: 'button', className: cx('msm-chip', on && 'on'), onClick, 'aria-pressed': on === true },
        h('span', { className: 'msm-chipDot' }),
        children,
      );
    }

    /** Status message line. */
    function Note({ tone, children }) {
      return h('div', { className: cx('msm-note', tone) }, children);
    }

    /** Centered empty state. */
    function Empty({ title, hint, action }) {
      return h(
        'div',
        { className: 'msm-empty' },
        h('span', { className: 'msm-emptyIcon' }, h(IconPlug, { size: 22 })),
        title ? h('span', { className: 'msm-emptyTitle' }, title) : null,
        hint ? h('span', null, hint) : null,
        action ?? null,
      );
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    /** Component-local stylesheet; removed when the panel unmounts. Host tokens only. */
    const CSS = `
.msm-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;overflow:hidden}
.msm-root *{box-sizing:border-box}
.msm-header{display:flex;align-items:center;gap:14px;padding:22px 28px 16px}
.msm-mark{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-brand-primary)}
.msm-heading{min-width:0}
.msm-title{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em}
.msm-sub{font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msm-headerActions{display:flex;align-items:center;gap:8px;margin-left:auto}
.msm-tabs{display:flex;gap:26px;padding:0 28px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.msm-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;line-height:20px;font-weight:500;padding:10px 0 11px;cursor:pointer;position:relative;display:inline-flex;align-items:center;gap:6px;transition:color .12s ease}
.msm-tab:hover{color:var(--dsw-alias-label-primary)}
.msm-tab.active{color:var(--dsw-alias-label-primary);font-weight:600}
.msm-tab.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.msm-tabCount{font-size:11px;font-weight:500;color:var(--dsw-alias-label-dimmed);font-variant-numeric:tabular-nums}
.msm-tab.active .msm-tabCount{color:var(--dsw-alias-label-secondary)}
.msm-tabCount.warn{color:var(--dsw-alias-state-warn-primary)}
.msm-page{flex:1;min-height:0;overflow:auto;padding:20px 28px 56px}
.msm-pageInner{max-width:1200px}
.msm-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.msm-bulkBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:14px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.msm-bulkBar .msm-selectWrap{flex:0 0 200px;width:200px}
.msm-selectMark{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary-foreground);font-size:11px;line-height:1}
.msm-selectMark.on{background:var(--dsw-alias-brand-primary);border-color:transparent}
.msm-skillCard.selected{border-color:var(--dsw-alias-brand-primary)}
.msm-toolbar .msm-searchWrap{max-width:320px;flex:1}
.msm-toolbar .msm-selectWrap{flex:0 0 168px;width:168px}
.msm-toolbarSpacer{flex:1}
.msm-count{font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.msm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.msm-skillCard{position:relative;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-base);cursor:pointer;text-align:left;font:inherit;color:inherit;outline:none;transition:background .14s ease,border-color .14s ease}
.msm-skillCard:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l4)}
.msm-skillCard:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.msm-static{cursor:default}
.msm-static:hover{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-border-l2)}
.msm-skillCardHead{display:flex;align-items:center;gap:10px;min-width:0}
.msm-avatar{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;text-transform:uppercase}
.msm-skillCardTitles{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
.msm-skillName{font-size:13.5px;line-height:19px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msm-skillDesc{font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:36px}
.msm-skillFoot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:26px}
.msm-cardActions{display:inline-flex;align-items:center;gap:2px}
.msm-iconBtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .12s ease,color .12s ease}
.msm-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.msm-iconBtn.danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.msm-iconBtn:disabled{opacity:.4;cursor:not-allowed}
.msm-iconBtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.msm-toolPill{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);font-size:10.5px;line-height:1;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.msm-tableWrap{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);overflow:hidden;background:var(--dsw-alias-bg-base)}
.msm-table{width:100%;border-collapse:collapse;font-size:13px}
.msm-table th{font-size:11.5px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-tertiary);text-align:left;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1);white-space:nowrap}
.msm-table td{padding:11px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1);vertical-align:middle}
.msm-table tbody tr:last-child td{border-bottom:none}
.msm-table tbody tr{cursor:pointer;transition:background .1s ease}
.msm-table tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
.msm-table .msm-colChevron{width:110px;padding-right:12px;color:var(--dsw-alias-label-dimmed);text-align:right}
.msm-cellName{display:flex;align-items:center;gap:10px;min-width:0}
.msm-cellName .msm-avatar{width:28px;height:28px;border-radius:8px;font-size:12px}
.msm-cellText{min-width:0;display:flex;flex-direction:column;gap:0}
.msm-cellTitle{font-size:13px;line-height:18px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msm-cellSub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msm-status{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.msm-miniSwitch{flex:0 0 auto;width:32px;height:19px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;display:inline-flex;align-items:center;transition:background .18s ease}
.msm-miniSwitch[aria-checked=true]{background:var(--dsw-alias-state-success-primary)}
.msm-miniThumb{display:block;width:15px;height:15px;border-radius:50%;background:var(--dsw-static-neutral-bluish-00);box-shadow:0 1px 1.5px var(--dsw-alias-bg-mask-1);transition:transform .18s ease}
.msm-miniSwitch[aria-checked=true] .msm-miniThumb{transform:translateX(13px)}
.msm-topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:12px 24px;background:var(--dsw-alias-bg-base);border-bottom:.5px solid var(--dsw-alias-border-l1)}
.msm-topbarTitle{font-size:15px;line-height:22px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.msm-topbarActions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:0 0 auto}
.msm-detailWrap{flex:1;min-height:0;overflow:auto}
.msm-detailBody{max-width:760px;margin:0 auto;padding:24px 28px 72px;display:flex;flex-direction:column;gap:30px}
.msm-section{display:flex;flex-direction:column;gap:12px;min-width:0}
.msm-sectionHead{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.msm-sectionTitle{font-size:13px;font-weight:600}
.msm-sectionHint{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.msm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.msm-gridName{display:grid;grid-template-columns:minmax(160px,1fr) 2fr;gap:14px}
.msm-inline{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.msm-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.msm-label{font-size:12px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.msm-hint{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.msm-input,.msm-textarea{width:100%;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:0 12px;height:34px;outline:none;transition:border-color .12s ease}
.msm-textarea{height:auto;padding:9px 12px;line-height:1.65;resize:vertical;min-height:72px}
.msm-input::placeholder,.msm-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}
.msm-input:focus,.msm-textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.msm-input.mono,.msm-textarea.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.msm-searchWrap{position:relative;display:flex;align-items:center;min-width:0}
.msm-searchWrap svg{position:absolute;left:11px;color:var(--dsw-alias-label-dimmed);pointer-events:none}
.msm-searchWrap .msm-input{padding-left:32px}
.msm-selectWrap{position:relative;display:flex;align-items:center;min-width:0}
.msm-selectWrap svg{position:absolute;right:10px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.msm-select{appearance:none;width:100%;height:34px;padding:0 30px 0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;outline:none;cursor:pointer}
.msm-select:focus{border-color:var(--dsw-alias-state-business-primary)}
.msm-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 13px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
.msm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.msm-btn:disabled{opacity:.4;cursor:not-allowed}
.msm-btn.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}
.msm-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.msm-btn.ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.msm-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.msm-btn.danger{background:transparent;border-color:transparent;color:var(--dsw-alias-state-error-primary)}
.msm-btn.danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.msm-btn.iconOnly{width:30px;padding:0}
.msm-btn:focus-visible,.msm-tab:focus-visible,.msm-chip:focus-visible,.msm-segment:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.msm-chip{appearance:none;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:all .12s ease}
.msm-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.msm-chip.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3)}
.msm-chipDot{width:6px;height:6px;border-radius:50%;border:.5px solid currentColor;flex:0 0 auto}
.msm-chip.on .msm-chipDot{background:currentColor}
.msm-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);font-size:10.5px;line-height:1;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.msm-badge.warn{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary))}
.msm-badge.ok{color:var(--dsw-alias-state-success-primary)}
.msm-badge.brand{color:var(--dsw-alias-brand-primary)}
.msm-note{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px;padding:9px 12px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.msm-note::before{content:"";width:6px;height:6px;border-radius:50%;margin-top:6px;flex:0 0 auto;background:var(--dsw-alias-label-tertiary)}
.msm-note.ok{color:var(--dsw-alias-state-success-primary)}
.msm-note.warn{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary))}
.msm-note.error{color:var(--dsw-alias-state-error-primary)}
.msm-note.ok::before,.msm-note.warn::before,.msm-note.error::before{background:currentColor}
.msm-toggleRow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.msm-switch{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;width:40px;height:24px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;transition:background .18s ease}
.msm-switch[aria-checked=true]{background:var(--dsw-alias-state-success-primary)}
.msm-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.msm-knob{display:block;width:20px;height:20px;border-radius:50%;background:var(--dsw-static-neutral-bluish-00);box-shadow:0 1px 2px var(--dsw-alias-bg-mask-1),0 0 .5px var(--dsw-alias-bg-mask-1);transition:transform .18s ease}
.msm-switch[aria-checked=true] .msm-knob{transform:translateX(16px)}
.msm-switchLabel{font-size:12.5px}
.msm-switchState{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.msm-switchState.on{color:var(--dsw-alias-state-success-primary);font-weight:500}
.msm-segmented{display:inline-flex;gap:2px;padding:3px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform)}
.msm-segment{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;height:26px;padding:0 12px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.msm-segment:hover{color:var(--dsw-alias-label-primary)}
.msm-segment.on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}
.msm-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);word-break:break-all;min-width:0}
.msm-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:56px 32px;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:18px;text-align:center}
.msm-emptyIcon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-dimmed)}
.msm-emptyTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.msm-settingsPage{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:30px}
.msm-backupList{display:flex;flex-direction:column;gap:12px}
.msm-backupCard{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-base)}
.msm-backupHead{display:flex;align-items:center;gap:10px;min-width:0}
.msm-backupTime{font-size:13px;font-weight:600}
.msm-backupEntries{display:flex;flex-direction:column;gap:2px}
.msm-backupEntry{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:.5px solid var(--dsw-alias-border-l1);min-width:0}
.msm-backupEntry .msm-rowMain{flex:1;min-width:0}
.msm-backupEntry .msm-selectWrap{flex:0 0 190px;width:190px}
.msm-backupEmpty{display:flex;flex-direction:column;gap:4px;padding:24px 0;color:var(--dsw-alias-label-tertiary);font-size:12.5px;text-align:center}
.msm-rowItem{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);min-width:0}
.msm-rowItem:last-child{border-bottom:none}
.msm-rowMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.msm-rowTitle{font-size:13px;line-height:19px;font-weight:500}
.msm-rowDesc{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);word-break:break-all}
.msm-error{margin:0 28px 12px;padding:10px 12px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;display:flex;align-items:center;gap:10px}
.msm-loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:12.5px}
.msm-spinner{width:22px;height:22px;border-radius:50%;border:2px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-brand-primary);animation:msmSpin .8s linear infinite}
@keyframes msmSpin{to{transform:rotate(360deg)}}
.msm-spacer{flex:1}
.msm-toast{position:fixed;right:28px;bottom:28px;z-index:20;padding:9px 14px;border-radius:10px;background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));font-size:12.5px;line-height:18px;box-shadow:var(--dsw-shadow-lv3);animation:msmToastIn .16s ease}
@keyframes msmToastIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.msm-page::-webkit-scrollbar,.msm-detailWrap::-webkit-scrollbar{width:10px;height:10px}
.msm-page::-webkit-scrollbar-thumb,.msm-detailWrap::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l1);border-radius:999px;border:2px solid transparent;background-clip:padding-box}
.msm-page::-webkit-scrollbar-thumb:hover,.msm-detailWrap::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l1);border:2px solid transparent;background-clip:padding-box}
@media (max-width: 1100px){.msm-table .msm-colTarget{display:none}}
@media (max-width: 860px){.msm-table .msm-colEndpoint{display:none}}
@media (max-width: 720px){.msm-gridName,.msm-grid2{grid-template-columns:1fr}.msm-header{padding:18px 16px 12px}.msm-tabs{padding:0 16px}.msm-page{padding:16px 16px 40px}.msm-detailBody{padding:18px 16px 56px}}
`;

    // -----------------------------------------------------------------------
    // Skills
    // -----------------------------------------------------------------------

    /** Draft shape for the skill editor. */
    function draftFromSkill(skill) {
      return {
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse ?? '',
        modelInvocable: skill.modelInvocable,
        userInvocable: skill.userInvocable,
      };
    }

    /** Default draft for a new skill. */
    function newSkillDraft(roots) {
      const root = roots.find((entry) => entry.writable) ?? roots[0];
      return {
        name: '',
        description: '',
        whenToUse: '',
        modelInvocable: true,
        userInvocable: true,
        body: '# New skill\n\nExplain when to use this skill and how to apply it.\n',
        targetRootId: root ? root.id : 'agents:user',
      };
    }

    /** Starter templates for a new skill. */
    const SKILL_TEMPLATES = [
      {
        id: 'blank',
        label: { en: 'Blank', zh: '空白' },
        name: '',
        description: '',
        body: '# New skill\n\nExplain when to use this skill and how to apply it.\n',
      },
      {
        id: 'review',
        label: { en: 'Code review', zh: '代码审查' },
        name: 'code-review',
        description: 'Review a diff or a change set for correctness, clarity and missing tests.',
        body: [
          '# Code review',
          '',
          'Review the supplied diff or change set.',
          '',
          '- Check correctness and edge cases first.',
          '- Flag missing tests, error handling and unintended behavior changes.',
          '- Keep style comments secondary and specific.',
          '- End with a short list of blocking vs non-blocking findings.',
        ].join('\n'),
      },
      {
        id: 'docs',
        label: { en: 'Documentation', zh: '文档撰写' },
        name: 'docs-writer',
        description: 'Write or update developer documentation for a module, command or workflow.',
        body: [
          '# Documentation writer',
          '',
          'Read the relevant source before writing.',
          '',
          '- Lead with what the reader can do, then explain how.',
          '- Include one runnable example and one failure example.',
          '- Link to the exact files instead of duplicating code.',
        ].join('\n'),
      },
      {
        id: 'debug',
        label: { en: 'Debugging', zh: '问题排查' },
        name: 'debug-helper',
        description: 'Investigate a failing command, test or runtime error down to a root cause.',
        body: [
          '# Debug helper',
          '',
          'Reproduce the failure before changing anything, then form one hypothesis at a time.',
          '',
          '- Capture the exact command, environment and error text.',
          '- Narrow the failure with logging or a minimal reproduction.',
          '- Fix the root cause and add a regression test.',
        ].join('\n'),
      },
    ];

    /** Starter templates for a new MCP server. */
    const MCP_TEMPLATES = [
      {
        id: 'context7',
        label: { en: 'Context7', zh: 'Context7 文档' },
        description: { en: 'Docs lookup over Streamable HTTP.', zh: 'HTTP 文档检索服务。' },
        server: { name: 'context7', transport: 'http', url: 'https://mcp.context7.com/mcp' },
      },
      {
        id: 'filesystem',
        label: { en: 'Filesystem', zh: '文件系统' },
        description: { en: 'Local filesystem access; replace the path argument.', zh: '本地文件访问；替换路径参数。' },
        server: {
          name: 'filesystem',
          transport: 'stdio',
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-filesystem\n/path/to/directory',
        },
      },
      {
        id: 'github',
        label: { en: 'GitHub', zh: 'GitHub' },
        description: { en: 'Repository tools; fill in GITHUB_TOKEN.', zh: '仓库工具；填写 GITHUB_TOKEN。' },
        server: {
          name: 'github',
          transport: 'stdio',
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-github',
          env: 'GITHUB_TOKEN=',
        },
      },
      {
        id: 'sqlite',
        label: { en: 'SQLite', zh: 'SQLite' },
        description: { en: 'Query a local SQLite database; replace the path.', zh: '查询本地 SQLite 数据库；替换路径。' },
        server: {
          name: 'sqlite',
          transport: 'stdio',
          command: 'npx',
          args: '-y\n@modelcontextprotocol/server-sqlite\n/path/to/database.sqlite',
        },
      },
      {
        id: 'playwright',
        label: { en: 'Playwright', zh: 'Playwright' },
        description: { en: 'Browser automation tools.', zh: '浏览器自动化工具。' },
        server: { name: 'playwright', transport: 'stdio', command: 'npx', args: '-y\n@playwright/mcp@latest' },
      },
    ];

    /** Localized template label/description. */
    function templateText(value, locale) {
      if (typeof value === 'string') return value;
      return (locale === 'zh' && value.zh) || value.en || value.zh || '';
    }

    /** Roots that can receive a symlink for a skill (user/shared/custom, not project). */
    function linkableRoots(roots, canonicalRootId) {
      return roots.filter(
        (root) => root.writable && root.scope !== 'project' && root.id !== canonicalRootId,
      );
    }

    /** First character used by the monogram avatar. */
    function monogram(name) {
      const value = typeof name === 'string' && name.length > 0 ? name : '?';
      return value.slice(0, 1).toUpperCase();
    }

    /** Skill list page. */
    function SkillsList({ ctx, manager, state, onOpen, onCreate, filter, onFilterChange }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const [pending, setPending] = React.useState(null);
      const [confirming, setConfirming] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [bodySearch, setBodySearch] = React.useState(false);
      const [bodyMatches, setBodyMatches] = React.useState({});
      const [searching, setSearching] = React.useState(false);
      const [selecting, setSelecting] = React.useState(false);
      const [selected, setSelected] = React.useState([]);
      const [bulkRoot, setBulkRoot] = React.useState('agents:user');
      const [bulkConfirm, setBulkConfirm] = React.useState(false);
      const [bulkBusy, setBulkBusy] = React.useState(false);
      const importRef = React.useRef(null);
      const { search, tool } = filter;

      const toolNames = {};
      const tools = [];
      for (const root of state.skillRoots) {
        if (!(root.tool in toolNames)) toolNames[root.tool] = localized(root, locale);
      }
      for (const skill of state.skills) {
        for (const [entry, kind] of Object.entries(skill.visibility)) {
          if (kind !== null && !tools.includes(entry)) tools.push(entry);
        }
      }

      React.useEffect(() => {
        const term = search.trim();
        if (!bodySearch || term.length < 2) {
          setBodyMatches({});
          setSearching(false);
          return undefined;
        }
        let alive = true;
        setSearching(true);
        const timer = setTimeout(() => {
          manager
            .run('skill/search', { query: term, limit: 100 })
            .then((value) => {
              if (!alive) return;
              const map = {};
              for (const item of value?.results ?? []) map[item.skillKey] = item.matches ?? [];
              setBodyMatches(map);
            })
            .catch(() => {
              if (alive) setBodyMatches({});
            })
            .finally(() => {
              if (alive) setSearching(false);
            });
        }, 240);
        return () => {
          alive = false;
          clearTimeout(timer);
        };
      }, [bodySearch, search, manager.run]);

      const query = search.trim().toLowerCase();
      const bodyHitKeys = new Set(Object.keys(bodyMatches));
      const skills = state.skills.filter((skill) => {
        if (tool !== 'all' && skill.visibility[tool] === null) return false;
        if (query.length === 0) return true;
        const textHit =
          skill.name.toLowerCase().includes(query) ||
          (skill.description ?? '').toLowerCase().includes(query);
        return textHit || bodyHitKeys.has(skill.key);
      });

      const reveal = async (skill) => {
        try {
          await manager.run('skill/reveal', { skillKey: skill.key });
        } catch {
          /* non-fatal */
        }
      };

      const importRoot =
        state.skillRoots.find((root) => root.writable && (tool === 'all' || root.tool === tool)) ??
        state.skillRoots.find((root) => root.writable) ?? { id: 'agents:user' };

      const flash = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 2600);
      };

      const exportAll = async () => {
        try {
          const value = await manager.run('skill/export', {
            skillKeys: state.skills.map((skill) => skill.key),
          });
          if (value?.filename && value?.base64) {
            downloadBase64(value.filename, value.base64);
            flash(t('export.done'));
          }
        } catch {
          /* the page-level error banner reports it */
        }
      };

      const importArchive = async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const buffer = await file.arrayBuffer();
          const value = await manager.run('skill/import_zip', {
            targetRootId: importRoot.id,
            base64: bytesToBase64(new Uint8Array(buffer)),
            filename: file.name,
          });
          flash(t('import.result', { count: value?.imported?.length ?? 0 }));
        } catch {
          /* the page-level error banner reports it */
        } finally {
          event.target.value = '';
        }
      };

      const toggleSelected = (key) => {
        setBulkConfirm(false);
        setSelected((current) =>
          current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
        );
      };

      const leaveSelection = () => {
        setSelecting(false);
        setSelected([]);
        setBulkConfirm(false);
      };

      const bulkShare = async () => {
        if (selected.length === 0) return;
        setBulkBusy(true);
        let count = 0;
        try {
          for (const key of selected) {
            const skill = state.skills.find((entry) => entry.key === key);
            if (!skill) continue;
            const roots = [...new Set([...skill.roots.map((root) => root.rootId), bulkRoot])];
            await manager.run('skill/visibility', { skillKey: key, roots });
            count += 1;
          }
          flash(t('bulk.shared', { count }));
          leaveSelection();
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setBulkBusy(false);
        }
      };

      const bulkExport = async () => {
        if (selected.length === 0) return;
        setBulkBusy(true);
        try {
          const value = await manager.run('skill/export', { skillKeys: selected });
          if (value?.filename && value?.base64) downloadBase64(value.filename, value.base64);
          flash(t('export.done'));
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setBulkBusy(false);
        }
      };

      const bulkDelete = async () => {
        if (selected.length === 0) return;
        if (!bulkConfirm) {
          setBulkConfirm(true);
          return;
        }
        setBulkBusy(true);
        let count = 0;
        try {
          for (const key of selected) {
            await manager.run('skill/delete', { skillKey: key });
            count += 1;
          }
          flash(t('bulk.deleted', { count }));
          leaveSelection();
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setBulkBusy(false);
        }
      };

      const remove = async (skill) => {
        setConfirming(null);
        setPending(skill.key);
        try {
          await manager.run('skill/delete', { skillKey: skill.key });
          setNotice(t('state.deleted'));
          setTimeout(() => setNotice(null), 2200);
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setPending(null);
        }
      };

      return h(
        'div',
        { className: 'msm-page' },
        h(
          'div',
          { className: 'msm-pageInner' },
          h(
            'div',
            { className: 'msm-toolbar' },
            h(SearchInput, {
              value: search,
              onChange: (value) => onFilterChange({ search: value }),
              placeholder: t('search.placeholder'),
            }),
            h(Select, {
              value: tool,
              onChange: (value) => onFilterChange({ tool: value }),
              options: [
                { value: 'all', label: t('filter.all') },
                ...tools.map((entry) => ({ value: entry, label: toolNames[entry] ?? entry })),
              ],
            }),
            h(
              Chip,
              { on: bodySearch, onClick: () => setBodySearch((value) => !value) },
              searching ? t('search.searching') : t('search.body'),
            ),
            h('span', { className: 'msm-count' }, `${skills.length} / ${state.skills.length}`),
            h('span', { className: 'msm-toolbarSpacer' }),
            h(
              Button,
              {
                variant: selecting ? 'primary' : 'ghost',
                onClick: () => (selecting ? leaveSelection() : setSelecting(true)),
              },
              selecting ? t('bulk.cancel') : t('bulk.select'),
            ),
            h(
              'input',
              {
                type: 'file',
                accept: '.zip,application/zip',
                style: { display: 'none' },
                ref: (node) => {
                  importRef.current = node;
                },
                onChange: importArchive,
              },
            ),
            h(Button, { variant: 'ghost', onClick: () => importRef.current?.click() }, t('action.import')),
            h(Button, { variant: 'ghost', onClick: () => void exportAll() }, t('action.export')),
            h(Button, { variant: 'primary', onClick: onCreate }, t('new.skill')),
          ),
          selecting
            ? h(
                'div',
                { className: 'msm-bulkBar' },
                h('span', { className: 'msm-count' }, t('bulk.selected', { count: selected.length })),
                h(
                  Select,
                  {
                    value: bulkRoot,
                    onChange: setBulkRoot,
                    options: state.skillRoots
                      .filter((root) => root.writable)
                      .map((root) => ({ value: root.id, label: localized(root, locale) })),
                  },
                ),
                h(Button, { disabled: bulkBusy || selected.length === 0, onClick: () => void bulkShare() }, t('bulk.share')),
                h(Button, { disabled: bulkBusy || selected.length === 0, onClick: () => void bulkExport() }, t('action.export')),
                h(
                  Button,
                  {
                    variant: bulkConfirm ? 'danger' : undefined,
                    disabled: bulkBusy || selected.length === 0,
                    onClick: () => void bulkDelete(),
                  },
                  bulkConfirm ? t('bulk.confirmDelete', { count: selected.length }) : t('delete'),
                ),
              )
            : null,
          notice ? h('div', { className: 'msm-toast' }, notice) : null,
          skills.length === 0
            ? h(Empty, {
                title: query.length > 0 ? t('empty.filter') : t('empty.skillsTitle'),
                hint: query.length > 0 ? null : t('empty.skills'),
                action: query.length > 0 ? null : h(Button, { variant: 'primary', onClick: onCreate }, t('new.skill')),
              })
            : h(
                'div',
                { className: 'msm-grid' },
                skills.map((skill) =>
                  h(
                    'div',
                    {
                      key: skill.key,
                      role: 'button',
                      tabIndex: 0,
                      className: cx('msm-skillCard', selecting && selected.includes(skill.key) && 'selected'),
                      onClick: () => (selecting ? toggleSelected(skill.key) : onOpen(skill.key)),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          if (selecting) toggleSelected(skill.key);
                          else onOpen(skill.key);
                        }
                      },
                    },
                    h(
                      'div',
                      { className: 'msm-skillCardHead' },
                      selecting
                        ? h(
                            'span',
                            { className: cx('msm-selectMark', selected.includes(skill.key) && 'on') },
                            selected.includes(skill.key) ? '✓' : '',
                          )
                        : null,
                      h('span', { className: 'msm-avatar' }, monogram(skill.name)),
                      h(
                        'span',
                        { className: 'msm-skillCardTitles' },
                        h('span', { className: 'msm-skillName' }, skill.name),
                        h(
                          'span',
                          { className: 'msm-cellSub' },
                          Object.entries(skill.visibility)
                            .filter(([, kind]) => kind !== null)
                            .map(([entry]) => toolNames[entry] ?? entry)
                            .join(' · '),
                        ),
                      ),
                      skill.roots.length > 1 ? h(Badge, { tone: 'brand' }, t('skill.link')) : null,
                      bodyMatches[skill.key]?.length
                        ? h(Badge, { tone: 'brand' }, t('search.matches', { count: bodyMatches[skill.key].length }))
                        : null,
                      skill.valid ? null : h(Badge, { tone: 'warn' }, t('skill.invalid')),
                    ),
                    h(
                      'span',
                      { className: 'msm-skillDesc' },
                      bodyMatches[skill.key]?.[0]?.text ?? (skill.description || skill.error || ''),
                    ),
                    selecting
                      ? null
                      : confirming === skill.key
                      ? h(
                          'div',
                          { className: 'msm-skillFoot' },
                          h('span', { className: 'msm-hint' }, t('confirm.delete')),
                          h('span', { className: 'msm-spacer' }),
                          h(
                            Button,
                            {
                              variant: 'danger',
                              stopPropagation: true,
                              onClick: () => void remove(skill),
                              disabled: pending === skill.key,
                            },
                            t('delete'),
                          ),
                          h(
                            Button,
                            { variant: 'ghost', stopPropagation: true, onClick: () => setConfirming(null) },
                            t('cancel'),
                          ),
                        )
                      : h(
                          'div',
                          { className: 'msm-skillFoot' },
                          skill.modelInvocable ? null : h(Badge, null, t('skill.modelOff')),
                          h('span', { className: 'msm-spacer' }),
                          h(
                            'span',
                            { className: 'msm-cardActions' },
                            h(
                              IconButton,
                              { title: t('reveal'), disabled: pending === skill.key, onClick: () => void reveal(skill) },
                              h(IconReveal),
                            ),
                            h(
                              IconButton,
                              {
                                title: t('delete'),
                                tone: 'danger',
                                disabled: pending === skill.key,
                                onClick: () => setConfirming(skill.key),
                              },
                              h(IconTrash),
                            ),
                          ),
                        ),
                  ),
                ),
              ),
        ),
      );
    }

    /** Skill detail page (create or edit). */
    function SkillDetail({ ctx, manager, state, skillKey, onBack, onSaved }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const isNew = skillKey === null;
      const found = isNew ? null : state.skills.find((skill) => skill.key === skillKey) ?? null;
      const [skill, setSkill] = React.useState(found);
      const [draft, setDraft] = React.useState(() => (isNew ? newSkillDraft(state.skillRoots) : draftFromSkill(found)));
      const [body, setBody] = React.useState(isNew ? newSkillDraft(state.skillRoots).body : null);
      const [visible, setVisible] = React.useState(() => (isNew ? [] : (found?.roots ?? []).map((root) => root.rootId)));
      const [loading, setLoading] = React.useState(!isNew);
      const [saving, setSaving] = React.useState(false);
      const [message, setMessage] = React.useState(null);
      const [confirming, setConfirming] = React.useState(false);
      const [duplicating, setDuplicating] = React.useState(false);
      const [duplicateName, setDuplicateName] = React.useState('');
      const [duplicateRoot, setDuplicateRoot] = React.useState(
        (state.skillRoots.find((root) => root.writable) ?? { id: 'agents:user' }).id,
      );

      const run = manager.run;
      React.useEffect(() => {
        if (isNew) return undefined;
        let alive = true;
        setLoading(true);
        run('skill/read', { skillKey })
          .then((value) => {
            if (!alive) return;
            setSkill(value.skill);
            setDraft(draftFromSkill(value.skill));
            setBody(value.body);
            setVisible(value.skill.roots.map((root) => root.rootId));
          })
          .catch((cause) => {
            if (alive) setMessage({ tone: 'error', text: cause.message });
          })
          .finally(() => {
            if (alive) setLoading(false);
          });
        return () => {
          alive = false;
        };
      }, [isNew, skillKey, run]);

      const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));
      const applySkillTemplate = (template) => {
        setDraft((current) => ({
          ...current,
          name: template.name,
          description: template.description,
          whenToUse: '',
        }));
        setBody(template.body);
      };
      const candidates = linkableRoots(state.skillRoots, isNew ? draft.targetRootId : skill?.primaryRootId);
      const toggleVisible = (rootId) => {
        setVisible((current) =>
          current.includes(rootId) ? current.filter((id) => id !== rootId) : [...current, rootId],
        );
      };

      const save = async () => {
        if (!SKILL_NAME.test(draft.name)) {
          setMessage({ tone: 'error', text: t('invalid.name') });
          return;
        }
        if (draft.description.trim().length === 0) {
          setMessage({ tone: 'error', text: t('description.required') });
          return;
        }
        setSaving(true);
        setMessage(null);
        try {
          const value = await manager.run('skill/save', {
            skillKey: isNew ? undefined : skillKey,
            targetRootId: isNew ? draft.targetRootId : undefined,
            name: draft.name,
            description: draft.description,
            whenToUse: draft.whenToUse,
            modelInvocable: draft.modelInvocable,
            userInvocable: draft.userInvocable,
            body: body ?? '',
            metadata: isNew ? undefined : skill?.metadata,
            extraRaw: isNew ? undefined : skill?.extraRaw,
            renameFrom: isNew ? undefined : skill?.name,
            visibility: visible,
          });
          setMessage({ tone: 'ok', text: t('state.saved') });
          if (onSaved) onSaved(value.key);
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const remove = async () => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        setSaving(true);
        try {
          await manager.run('skill/delete', { skillKey });
          if (onBack) onBack();
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const duplicate = async () => {
        if (!SKILL_NAME.test(duplicateName)) {
          setMessage({ tone: 'error', text: t('invalid.name') });
          return;
        }
        setSaving(true);
        try {
          const value = await manager.run('skill/duplicate', {
            skillKey,
            targetRootId: duplicateRoot,
            name: duplicateName,
          });
          setDuplicating(false);
          if (onSaved) onSaved(value.key);
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const exportOne = async () => {
        try {
          const value = await manager.run('skill/export', { skillKeys: [skillKey] });
          if (value?.filename && value?.base64) downloadBase64(value.filename, value.base64);
        } catch {
          /* the page-level error banner reports it */
        }
      };

      const rootOptions = state.skillRoots
        .filter((root) => root.writable)
        .map((root) => ({ value: root.id, label: `${localized(root, locale)} — ${root.path}` }));

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'msm-topbar' },
          h(Button, { variant: 'ghost', onClick: onBack }, h(IconChevronLeft), t('tab.skills')),
          h('span', { className: 'msm-topbarTitle' }, isNew ? t('new.skill') : draft.name || skill?.name || ''),
          isNew ? null : h(Badge, null, skill?.format ?? ''),
          isNew ? null : h(Badge, null, localized(state.skillRoots.find((root) => root.id === skill?.primaryRootId), locale) || skill?.primaryRootId || ''),
          h(
            'div',
            { className: 'msm-topbarActions' },
            isNew
              ? h(Button, { variant: 'ghost', onClick: onBack }, t('cancel'))
              : h(Button, { variant: 'ghost', onClick: () => void exportOne() }, t('action.export')),
            isNew
              ? null
              : h(Button, { variant: 'ghost', onClick: () => setDuplicating((value) => !value) }, t('duplicate')),
            isNew
              ? null
              : h(Button, { variant: 'danger', onClick: remove, disabled: saving }, confirming ? t('confirm.delete') : t('delete')),
            h(Button, { variant: 'primary', onClick: save, disabled: saving || loading || body === null }, t('save')),
          ),
        ),
        h(
          'div',
          { className: 'msm-detailWrap' },
          h(
            'div',
            { className: 'msm-detailBody' },
            message ? h(Note, { tone: message.tone }, message.text) : null,
            isNew
              ? h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('section.templates')),
                  ),
                  h(
                    'div',
                    { className: 'msm-inline' },
                    SKILL_TEMPLATES.map((template) =>
                      h(
                        Chip,
                        {
                          key: template.id,
                          on: draft.name === template.name && template.id !== 'blank',
                          onClick: () => applySkillTemplate(template),
                        },
                        templateText(template.label, locale),
                      ),
                    ),
                  ),
                )
              : null,
            isNew
              ? h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('field.root')),
                  ),
                  h(Select, {
                    value: draft.targetRootId,
                    onChange: (value) => patch({ targetRootId: value }),
                    options: rootOptions,
                  }),
                )
              : h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('field.path')),
                  ),
                  h('span', { className: 'msm-code' }, skill?.canonicalPath ?? ''),
                ),
            duplicating
              ? h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('duplicate')),
                  ),
                  h(
                    'div',
                    { className: 'msm-grid2' },
                    h(TextInput, {
                      value: duplicateName,
                      onChange: setDuplicateName,
                      placeholder: `${draft.name}-copy`,
                      mono: true,
                    }),
                    h(Select, { value: duplicateRoot, onChange: setDuplicateRoot, options: rootOptions }),
                  ),
                  h(
                    'div',
                    { className: 'msm-inline' },
                    h(Button, { variant: 'primary', onClick: duplicate, disabled: saving }, t('duplicate')),
                  ),
                )
              : null,
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('section.basic')),
              ),
              h(
                'div',
                { className: 'msm-gridName' },
                h(Field, { label: t('field.name') }, h(TextInput, {
                  value: draft.name,
                  onChange: (value) => patch({ name: value }),
                  mono: true,
                  placeholder: 'my-skill',
                })),
                h(Field, { label: t('field.description') }, h(TextInput, {
                  value: draft.description,
                  onChange: (value) => patch({ description: value }),
                  placeholder: 'What this skill does',
                })),
              ),
              h(Field, { label: t('field.whenToUse') }, h(TextArea, {
                value: draft.whenToUse,
                rows: 2,
                onChange: (value) => patch({ whenToUse: value }),
              })),
              h(
                'div',
                { className: 'msm-inline' },
                h(Toggle, {
                  checked: draft.modelInvocable,
                  onChange: (value) => patch({ modelInvocable: value }),
                  label: t('field.modelInvocable'),
                  stateText: draft.modelInvocable ? t('state.on') : t('state.off'),
                }),
                h(Toggle, {
                  checked: draft.userInvocable,
                  onChange: (value) => patch({ userInvocable: value }),
                  label: t('field.userInvocable'),
                  stateText: draft.userInvocable ? t('state.on') : t('state.off'),
                }),
              ),
            ),
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('section.visibility')),
                h('span', { className: 'msm-sectionHint' }, t('visibility.hint')),
              ),
              h(
                'div',
                { className: 'msm-inline' },
                candidates.length === 0
                  ? h('span', { className: 'msm-hint' }, t('custom.none'))
                  : candidates.map((root) =>
                      h(
                        Chip,
                        {
                          key: root.id,
                          on: visible.includes(root.id),
                          onClick: () => toggleVisible(root.id),
                        },
                        localized(root, locale),
                      ),
                    ),
              ),
            ),
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('section.body')),
                h('span', { className: 'msm-sectionHint' }, 'SKILL.md'),
              ),
              body === null
                ? h('span', { className: 'msm-hint' }, t('loading'))
                : h(TextArea, { value: body, onChange: setBody, rows: 22, mono: true, spellCheck: false }),
            ),
          ),
        ),
      );
    }

    // -----------------------------------------------------------------------
    // MCP
    // -----------------------------------------------------------------------

    /** Draft shape for the MCP editor. */
    function draftFromServer(server) {
      return {
        name: server.name,
        transport: server.transport,
        command: server.command ?? '',
        args: (server.args ?? []).join('\n'),
        cwd: server.cwd ?? '',
        url: server.url ?? '',
        env: formatKeyValues(server.env),
        headers: formatKeyValues(server.headers),
        enabled: server.enabled,
      };
    }

    /** Default draft for a new server. */
    function newServerDraft(transport) {
      return {
        name: '',
        transport: transport ?? 'stdio',
        command: '',
        args: '',
        cwd: '',
        url: '',
        env: '',
        headers: '',
        enabled: true,
      };
    }

    /** Mask the values of `KEY=VALUE` lines while keeping the keys visible. */
    function maskLines(text) {
      return String(text ?? '')
        .split('\n')
        .map((line) => {
          const index = line.indexOf('=');
          if (index <= 0) return line;
          return `${line.slice(0, index)}=••••`;
        })
        .join('\n');
    }

    /** The stored fields of one server, ready for another save. */
    function serverPayload(server, enabled) {
      return {
        transport: server.transport,
        command: server.command ?? undefined,
        args: server.args ?? [],
        cwd: server.cwd ?? undefined,
        url: server.url ?? undefined,
        env: server.env ?? {},
        headers: server.headers ?? {},
        enabled: enabled === undefined ? server.enabled : enabled,
      };
    }

    /** MCP list page (table). */
    function McpList({ ctx, manager, state, onOpen, onCreate, filter, onFilterChange }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const { search, tool } = filter;
      const [pending, setPending] = React.useState(null);
      const [confirming, setConfirming] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [health, setHealth] = React.useState({});

      const toolNames = {};
      const tools = [];
      for (const target of state.mcpTargets) {
        if (!(target.tool in toolNames)) toolNames[target.tool] = localized(target, locale);
        if (!tools.includes(target.tool)) tools.push(target.tool);
      }
      const targetLabel = (targetId) => {
        const target = state.mcpTargets.find((entry) => entry.id === targetId);
        return target ? localized(target, locale) : targetId;
      };

      const query = search.trim().toLowerCase();
      const servers = state.mcpServers.filter((server) => {
        if (tool !== 'all' && server.tool !== tool) return false;
        if (query.length === 0) return true;
        return (
          server.name.toLowerCase().includes(query) ||
          (server.command ?? '').toLowerCase().includes(query) ||
          (server.url ?? '').toLowerCase().includes(query)
        );
      });

      const reveal = async (server) => {
        try {
          await manager.run('mcp/reveal', { targetId: server.targetId });
        } catch {
          /* non-fatal */
        }
      };

      const check = async (server) => {
        setHealth((current) => ({ ...current, [server.id]: { status: 'checking' } }));
        try {
          const value = await manager.run('mcp/health', {
            targetId: server.targetId,
            name: server.name,
          });
          const result = value?.health ?? { ok: false, error: 'no result' };
          setHealth((current) => ({
            ...current,
            [server.id]: { status: result.ok ? 'ok' : 'error', result },
          }));
        } catch (error) {
          setHealth((current) => ({
            ...current,
            [server.id]: {
              status: 'error',
              result: { ok: false, error: error instanceof Error ? error.message : String(error) },
            },
          }));
        }
      };

      const remove = async (server) => {
        setConfirming(null);
        setPending(server.id);
        try {
          await manager.run('mcp/delete', { targetId: server.targetId, name: server.name });
          setNotice(t('state.deleted'));
          setTimeout(() => setNotice(null), 2200);
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setPending(null);
        }
      };

      const toggle = async (server, next) => {
        setPending(server.id);
        try {
          await manager.run('mcp/save', {
            targetId: server.targetId,
            name: server.name,
            originalName: server.name,
            server: serverPayload(server, next),
          });
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setPending(null);
        }
      };

      return h(
        'div',
        { className: 'msm-page' },
        h(
          'div',
          { className: 'msm-pageInner' },
          h(
            'div',
            { className: 'msm-toolbar' },
            h(SearchInput, {
              value: search,
              onChange: (value) => onFilterChange({ search: value }),
              placeholder: t('search.placeholder'),
            }),
            h(Select, {
              value: tool,
              onChange: (value) => onFilterChange({ tool: value }),
              options: [
                { value: 'all', label: t('filter.all') },
                ...tools.map((entry) => ({ value: entry, label: toolNames[entry] ?? entry })),
              ],
            }),
            h('span', { className: 'msm-count' }, `${servers.length} / ${state.mcpServers.length}`),
            h('span', { className: 'msm-toolbarSpacer' }),
            h(Button, { variant: 'primary', onClick: onCreate }, t('new.mcp')),
          ),
          notice ? h('div', { className: 'msm-toast' }, notice) : null,
          servers.length === 0
            ? h(Empty, {
                title: query.length > 0 ? t('empty.filter') : t('empty.mcpTitle'),
                hint: query.length > 0 ? null : t('mcp.empty'),
                action: query.length > 0 ? null : h(Button, { variant: 'primary', onClick: onCreate }, t('new.mcp')),
              })
            : h(
                'div',
                { className: 'msm-tableWrap' },
                h(
                  'table',
                  { className: 'msm-table' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', null, t('field.name')),
                      h('th', null, t('field.transport')),
                      h('th', { className: 'msm-colEndpoint' }, t('field.command')),
                      h('th', { className: 'msm-colTarget' }, t('field.target')),
                      h('th', null, t('field.enabled')),
                      h('th', { className: 'msm-colChevron' }, ''),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    servers.map((server) =>
                      h(
                        'tr',
                        {
                          key: server.id,
                          role: 'button',
                          onClick: () => onOpen(server.targetId, server.name),
                        },
                        h(
                          'td',
                          null,
                          h(
                            'span',
                            { className: 'msm-cellName' },
                            h('span', { className: 'msm-avatar' }, monogram(server.name)),
                            h(
                              'span',
                              { className: 'msm-cellText' },
                              h('span', { className: 'msm-cellTitle' }, server.name),
                              h('span', { className: 'msm-cellSub' }, targetLabel(server.targetId)),
                            ),
                          ),
                        ),
                        h('td', null, h(Badge, null, server.transport)),
                        h(
                          'td',
                          { className: 'msm-colEndpoint' },
                          h(
                            'div',
                            { className: 'msm-mono' },
                            server.transport === 'stdio'
                              ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
                              : server.url ?? '',
                          ),
                        ),
                        h('td', { className: 'msm-colTarget' }, h('span', { className: 'msm-cellSub' }, targetLabel(server.targetId))),
                        h(
                          'td',
                          null,
                          h(
                            'span',
                            { className: 'msm-status', onClick: (event) => event.stopPropagation() },
                            h(
                              'button',
                              {
                                type: 'button',
                                role: 'switch',
                                'aria-checked': server.enabled,
                                className: 'msm-miniSwitch',
                                disabled: pending === server.id,
                                onClick: (event) => {
                                  event.stopPropagation();
                                  void toggle(server, !server.enabled);
                                },
                              },
                              h('span', { className: 'msm-miniThumb' }),
                            ),
                            h(
                              'span',
                              { className: cx('msm-switchState', server.enabled && 'on') },
                              server.enabled ? t('mcp.enabled') : t('mcp.disabledLabel'),
                            ),
                            health[server.id]?.status === 'checking'
                              ? h(Badge, null, t('action.checking'))
                              : health[server.id]?.result?.ok
                                ? h(
                                    Badge,
                                    { tone: 'ok' },
                                    t('health.ok', {
                                      tools: health[server.id].result.toolCount ?? 0,
                                      ms: Math.round(health[server.id].result.latencyMs ?? 0),
                                    }),
                                  )
                                : health[server.id]?.result
                                  ? h(
                                      Badge,
                                      { tone: 'warn' },
                                      String(health[server.id].result.error ?? 'failed').slice(0, 48),
                                    )
                                  : null,
                            server.error ? h(Badge, { tone: 'warn' }, t('mcp.error')) : null,
                          ),
                        ),
                        h(
                          'td',
                          {
                            className: 'msm-colChevron',
                            onClick: (event) => event.stopPropagation(),
                          },
                          confirming === server.id
                            ? h(
                                'span',
                                { className: 'msm-inline' },
                                h(
                                  Button,
                                  {
                                    variant: 'danger',
                                    disabled: pending === server.id,
                                    onClick: () => void remove(server),
                                  },
                                  t('delete'),
                                ),
                                h(Button, { variant: 'ghost', onClick: () => setConfirming(null) }, t('cancel')),
                              )
                            : h(
                                'span',
                                { className: 'msm-cardActions' },
                                h(
                                  IconButton,
                                  { title: t('action.check'), onClick: () => void check(server) },
                                  h(IconPulse),
                                ),
                                h(
                                  IconButton,
                                  { title: t('reveal'), onClick: () => void reveal(server) },
                                  h(IconReveal),
                                ),
                                h(
                                  IconButton,
                                  { title: t('delete'), tone: 'danger', onClick: () => setConfirming(server.id) },
                                  h(IconTrash),
                                ),
                                h(IconChevron),
                              ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
        ),
      );
    }

    /** MCP detail page (create or edit). */
    function McpDetail({ ctx, manager, state, targetId: initialTargetId, name, onBack, onSaved }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const isNew = initialTargetId === null;
      const found = isNew
        ? null
        : state.mcpServers.find((server) => server.targetId === initialTargetId && server.name === name) ?? null;
      const writableTargets = state.mcpTargets.filter((target) => target.writable);
      const [targetId, setTargetId] = React.useState(
        isNew ? (writableTargets[0] ?? { id: 'cursor:user' }).id : initialTargetId,
      );
      const target = state.mcpTargets.find((entry) => entry.id === targetId) ?? null;
      const [draft, setDraft] = React.useState(() => (found === null ? newServerDraft('stdio') : draftFromServer(found)));
      const [showSecrets, setShowSecrets] = React.useState(false);
      const [saving, setSaving] = React.useState(false);
      const [message, setMessage] = React.useState(null);
      const [confirming, setConfirming] = React.useState(false);
      const [copyTargets, setCopyTargets] = React.useState([]);
      const [health, setHealth] = React.useState(null);

      const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

      const applyMcpTemplate = (template) => {
        const server = template.server;
        setDraft((current) => ({
          ...current,
          name: server.name,
          transport: server.transport,
          command: server.command ?? '',
          args: server.args ?? '',
          url: server.url ?? '',
          env: server.env ?? '',
          headers: server.headers ?? '',
          cwd: server.cwd ?? '',
          enabled: true,
        }));
      };

      const check = async () => {
        setHealth({ status: 'checking' });
        try {
          const value = await manager.run('mcp/health', { targetId, name });
          const result = value?.health ?? { ok: false, error: 'no result' };
          setHealth({ status: result.ok ? 'ok' : 'error', result });
        } catch (error) {
          setHealth({
            status: 'error',
            result: { ok: false, error: error instanceof Error ? error.message : String(error) },
          });
        }
      };
      const transports = transportOptions(target?.format ?? 'json');

      const save = async () => {
        if (!MCP_NAME.test(draft.name)) {
          setMessage({ tone: 'error', text: t('name.required') });
          return;
        }
        setSaving(true);
        setMessage(null);
        try {
          await manager.run('mcp/save', {
            targetId,
            name: draft.name,
            originalName: isNew ? undefined : name,
            server: {
              transport: draft.transport,
              command: draft.command.trim() || undefined,
              args: parseLines(draft.args),
              cwd: draft.cwd.trim() || undefined,
              url: draft.url.trim() || undefined,
              env: parseKeyValues(draft.env),
              headers: parseKeyValues(draft.headers),
              enabled: draft.enabled,
            },
          });
          setMessage({ tone: 'ok', text: t('state.saved') });
          if (onSaved) onSaved({ targetId, name: draft.name });
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const remove = async () => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        setSaving(true);
        try {
          await manager.run('mcp/delete', { targetId, name });
          if (onBack) onBack();
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const copy = async () => {
        if (copyTargets.length === 0) return;
        setSaving(true);
        try {
          const value = await manager.run('mcp/copy', {
            targetId,
            name,
            toTargetIds: copyTargets,
          });
          setMessage({
            tone: 'ok',
            text: t('copy.result', { copied: value.copied.length, skipped: value.skipped.length }),
          });
          setCopyTargets([]);
        } catch (cause) {
          setMessage({ tone: 'error', text: cause.message });
        } finally {
          setSaving(false);
        }
      };

      const reveal = async () => {
        try {
          await manager.run('mcp/reveal', { targetId });
        } catch {
          /* non-fatal */
        }
      };

      const copyCandidates = writableTargets.filter((entry) => entry.id !== targetId);

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'msm-topbar' },
          h(Button, { variant: 'ghost', onClick: onBack }, h(IconChevronLeft), t('tab.mcp')),
          h('span', { className: 'msm-topbarTitle' }, isNew ? t('new.mcp') : draft.name || name || ''),
          h(Badge, null, draft.transport),
          target ? h(Badge, { tone: 'brand' }, localized(target, locale)) : null,
          draft.enabled ? null : h(Badge, { tone: 'warn' }, t('mcp.disabled')),
          h(
            'div',
            { className: 'msm-topbarActions' },
            isNew ? h(Button, { variant: 'ghost', onClick: onBack }, t('cancel')) : h(Button, { variant: 'ghost', onClick: reveal }, t('reveal')),
            isNew ? null : h(Button, { variant: 'ghost', onClick: () => void check() }, t('action.check')),
            isNew
              ? null
              : h(Button, { variant: 'danger', onClick: remove, disabled: saving }, confirming ? t('confirm.delete') : t('delete')),
            h(Button, { variant: 'primary', onClick: save, disabled: saving }, t('save')),
          ),
        ),
        h(
          'div',
          { className: 'msm-detailWrap' },
          h(
            'div',
            { className: 'msm-detailBody' },
            message ? h(Note, { tone: message.tone }, message.text) : null,
            health === null
              ? null
              : h(
                  Note,
                  { tone: health.status === 'ok' ? 'ok' : health.status === 'error' ? 'error' : 'info' },
                  health.status === 'checking'
                    ? t('action.checking')
                    : health.status === 'ok'
                      ? `${t('health.ok', {
                          tools: health.result?.toolCount ?? 0,
                          ms: Math.round(health.result?.latencyMs ?? 0),
                        })}${health.result?.serverInfo?.name ? ` · ${health.result.serverInfo.name}${health.result.serverInfo.version ? ` ${health.result.serverInfo.version}` : ''}` : ''}${health.result?.tools?.length ? ` · ${health.result.tools.slice(0, 8).join(', ')}` : ''}`
                      : t('health.failed', { error: health.result?.error ?? 'failed' }),
                ),
            health?.status === 'ok' && health.result?.tools?.length
              ? h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('section.tools')),
                    h('span', { className: 'msm-sectionHint' }, String(health.result.toolCount ?? health.result.tools.length)),
                  ),
                  h(
                    'div',
                    { className: 'msm-inline' },
                    health.result.tools.map((toolName) =>
                      h('span', { key: toolName, className: 'msm-toolPill' }, toolName),
                    ),
                  ),
                )
              : null,
            isNew
              ? null
              : h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('field.path')),
                  ),
                  h('span', { className: 'msm-code' }, target ? target.path : ''),
                ),
            isNew
              ? h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('section.templates')),
                    h('span', { className: 'msm-sectionHint' }, t('section.templatesHint')),
                  ),
                  h(
                    'div',
                    { className: 'msm-inline' },
                    MCP_TEMPLATES.map((template) =>
                      h(
                        Chip,
                        {
                          key: template.id,
                          on: draft.name === template.server.name,
                          onClick: () => applyMcpTemplate(template),
                        },
                        templateText(template.label, locale),
                      ),
                    ),
                  ),
                )
              : null,
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('section.connection')),
              ),
              isNew
                ? h(Field, { label: t('field.target') }, h(Select, {
                    value: targetId,
                    onChange: setTargetId,
                    options: writableTargets.map((entry) => ({
                      value: entry.id,
                      label: `${localized(entry, locale)} — ${entry.path}`,
                    })),
                  }))
                : null,
              h(
                'div',
                { className: 'msm-gridName' },
                h(Field, { label: t('field.name') }, h(TextInput, {
                  value: draft.name,
                  onChange: (value) => patch({ name: value }),
                  mono: true,
                  placeholder: 'github',
                })),
                h(Field, { label: t('field.transport') }, h(Segmented, {
                  value: draft.transport,
                  onChange: (value) => patch({ transport: value }),
                  options: transports.map((value) => ({ value, label: t(`transport.${value}`) })),
                })),
              ),
              h(
                'div',
                { className: 'msm-inline' },
                h(Toggle, {
                  checked: draft.enabled,
                  onChange: (value) => patch({ enabled: value }),
                  label: t('field.enabled'),
                  stateText: draft.enabled ? t('mcp.enabled') : t('mcp.disabledLabel'),
                }),
              ),
              draft.transport === 'stdio'
                ? h(
                    'div',
                    { className: 'msm-grid2' },
                    h(Field, { label: t('field.command') }, h(TextInput, {
                      value: draft.command,
                      onChange: (value) => patch({ command: value }),
                      mono: true,
                      placeholder: 'npx',
                    })),
                    h(Field, { label: t('field.cwd') }, h(TextInput, {
                      value: draft.cwd,
                      onChange: (value) => patch({ cwd: value }),
                      mono: true,
                      placeholder: '/path/to/working-dir',
                    })),
                  )
                : null,
              draft.transport === 'stdio'
                ? h(Field, { label: t('field.args') }, h(TextArea, {
                    value: draft.args,
                    rows: 3,
                    mono: true,
                    onChange: (value) => patch({ args: value }),
                  }))
                : h(Field, { label: t('field.url') }, h(TextInput, {
                    value: draft.url,
                    onChange: (value) => patch({ url: value }),
                    mono: true,
                    placeholder: 'https://example.com/mcp',
                  })),
            ),
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('section.secrets')),
                h('span', { className: 'msm-sectionHint' }, t('mcp.secrets')),
                h('span', { className: 'msm-spacer' }),
                h(
                  Button,
                  { variant: 'ghost', onClick: () => setShowSecrets((value) => !value) },
                  showSecrets ? t('toggle.hide') : t('toggle.show'),
                ),
              ),
              h(
                'div',
                { className: 'msm-grid2' },
                h(Field, { label: t('field.env') }, h(TextArea, {
                  value: showSecrets ? draft.env : maskLines(draft.env),
                  rows: 4,
                  mono: true,
                  readOnly: !showSecrets,
                  onChange: (value) => patch({ env: value }),
                })),
                h(Field, { label: t('field.headers') }, h(TextArea, {
                  value: showSecrets ? draft.headers : maskLines(draft.headers),
                  rows: 4,
                  mono: true,
                  readOnly: !showSecrets,
                  onChange: (value) => patch({ headers: value }),
                })),
              ),
            ),
            isNew
              ? null
              : h(
                  'div',
                  { className: 'msm-section' },
                  h(
                    'div',
                    { className: 'msm-sectionHead' },
                    h('span', { className: 'msm-sectionTitle' }, t('section.copy')),
                  ),
                  h(
                    'div',
                    { className: 'msm-inline' },
                    copyCandidates.length === 0
                      ? h('span', { className: 'msm-hint' }, t('custom.none'))
                      : copyCandidates.map((entry) =>
                          h(
                            Chip,
                            {
                              key: entry.id,
                              on: copyTargets.includes(entry.id),
                              onClick: () => {
                                setCopyTargets((current) =>
                                  current.includes(entry.id)
                                    ? current.filter((id) => id !== entry.id)
                                    : [...current, entry.id],
                                );
                              },
                            },
                            localized(entry, locale),
                          ),
                        ),
                    h(
                      Button,
                      { onClick: copy, disabled: saving || copyTargets.length === 0 },
                      t('copy'),
                    ),
                  ),
                ),
          ),
        ),
      );
    }

    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------

    /** Skills / MCP market page. */
    function MarketPage({ ctx, manager, state }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const [kind, setKind] = React.useState('skills');
      const [query, setQuery] = React.useState('');
      const [results, setResults] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [warning, setWarning] = React.useState('');
      const [notice, setNotice] = React.useState(null);
      const [installing, setInstalling] = React.useState(null);
      const roots = state.skillRoots.filter((root) => root.writable);
      const targets = state.mcpTargets.filter((target) => target.writable);
      const [targetRoot, setTargetRoot] = React.useState((roots[0] ?? { id: 'agents:user' }).id);
      const [targetId, setTargetId] = React.useState((targets[0] ?? { id: 'cursor:user' }).id);

      React.useEffect(() => {
        setResults(null);
        setError('');
        setWarning('');
      }, [kind]);

      const flash = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(null), 2800);
      };

      const search = async () => {
        const term = query.trim();
        if (term.length < 2) return;
        setLoading(true);
        setError('');
        setWarning('');
        try {
          const value = await manager.run(kind === 'skills' ? 'market/skills' : 'market/mcp', {
            query: term,
            limit: 24,
          });
          setResults(value?.results ?? []);
          if (value?.fallback) setWarning(t('market.fallbackWarning'));
        } catch (cause) {
          setError(t('market.failed', { message: cause.message }));
          setResults([]);
        } finally {
          setLoading(false);
        }
      };

      const installSkill = async (entry) => {
        setInstalling(entry.id);
        try {
          const value = await manager.run('market/install_skill', {
            source: entry.source,
            skillId: entry.skillId,
            targetRootId: targetRoot,
          });
          flash(t('market.installedSkill', { name: value?.imported?.[0]?.name ?? entry.name }));
        } catch (cause) {
          setError(t('market.failed', { message: cause.message }));
        } finally {
          setInstalling(null);
        }
      };

      const installMcp = async (entry) => {
        setInstalling(entry.name);
        try {
          const value = await manager.run('market/install_mcp', { targetId, entry });
          const warning = value?.warnings?.length
            ? ` ${t('market.envHint', { count: value.warnings.length })}`
            : '';
          flash(`${t('market.installedMcp', { name: value?.name ?? entry.title })}${warning}`);
        } catch (cause) {
          setError(t('market.failed', { message: cause.message }));
        } finally {
          setInstalling(null);
        }
      };

      return h(
        'div',
        { className: 'msm-page' },
        h(
          'div',
          { className: 'msm-pageInner' },
          h(
            'div',
            { className: 'msm-toolbar' },
            h(Segmented, {
              value: kind,
              onChange: setKind,
              options: [
                { value: 'skills', label: t('market.skills') },
                { value: 'mcp', label: t('market.mcp') },
              ],
            }),
            h(SearchInput, {
              value: query,
              onChange: setQuery,
              placeholder: kind === 'skills' ? 'react, pdf, testing…' : 'github, filesystem, browser…',
            }),
            h(
              Button,
              { variant: 'primary', onClick: () => void search(), disabled: loading || query.trim().length < 2 },
              loading ? t('market.searching') : t('market.search'),
            ),
            h('span', { className: 'msm-count' }, results === null ? '' : t('market.resultCount', { count: results.length })),
            h('span', { className: 'msm-toolbarSpacer' }),
            h(
              'span',
              { className: 'msm-inline' },
              h('span', { className: 'msm-hint' }, kind === 'skills' ? t('market.targetRoot') : t('market.targetConfig')),
              kind === 'skills'
                ? h(Select, {
                    value: targetRoot,
                    onChange: setTargetRoot,
                    options: roots.map((root) => ({ value: root.id, label: `${localized(root, locale)}` })),
                  })
                : h(Select, {
                    value: targetId,
                    onChange: setTargetId,
                    options: targets.map((target) => ({ value: target.id, label: localized(target, locale) })),
                  }),
            ),
          ),
          error ? h(Note, { tone: 'error' }, error) : null,
          warning ? h(Note, { tone: 'warn' }, warning) : null,
          notice ? h('div', { className: 'msm-toast' }, notice) : null,
          results === null
            ? h(Empty, {
                title: t('market.emptyTitle'),
                hint: t('market.empty', { source: kind === 'skills' ? 'skills.sh' : 'MCP Registry' }),
              })
            : results.length === 0
              ? h(Empty, { title: t('market.noResults') })
              : h(
                  'div',
                  { className: 'msm-grid' },
                  results.map((entry) =>
                    kind === 'skills'
                      ? h(
                          'div',
                          { key: entry.id, className: 'msm-skillCard msm-static' },
                          h(
                            'div',
                            { className: 'msm-skillCardHead' },
                            h('span', { className: 'msm-avatar' }, monogram(entry.name)),
                            h(
                              'span',
                              { className: 'msm-skillCardTitles' },
                              h('span', { className: 'msm-skillName' }, entry.name),
                              h('span', { className: 'msm-cellSub' }, entry.source),
                            ),
                            h(Badge, { tone: 'brand' }, t('market.installs', { count: entry.installs })),
                          ),
                          h('span', { className: 'msm-skillDesc' }, entry.id),
                          h(
                            'div',
                            { className: 'msm-skillFoot' },
                            h('span', { className: 'msm-spacer' }),
                            h(
                              Button,
                              {
                                variant: 'primary',
                                disabled: installing !== null,
                                onClick: () => void installSkill(entry),
                              },
                              installing === entry.id ? t('market.installing') : t('market.install'),
                            ),
                          ),
                        )
                      : h(
                          'div',
                          { key: entry.name, className: 'msm-skillCard msm-static' },
                          h(
                            'div',
                            { className: 'msm-skillCardHead' },
                            h('span', { className: 'msm-avatar' }, monogram(entry.title || entry.name)),
                            h(
                              'span',
                              { className: 'msm-skillCardTitles' },
                              h('span', { className: 'msm-skillName' }, entry.title || entry.name),
                              h('span', { className: 'msm-cellSub' }, entry.name),
                            ),
                            entry.remotes.length > 0
                              ? h(Badge, { tone: 'brand' }, t('market.remote'))
                              : h(Badge, null, t('market.package')),
                          ),
                          h('span', { className: 'msm-skillDesc' }, entry.description || ''),
                          h(
                            'div',
                            { className: 'msm-skillFoot' },
                            h('span', { className: 'msm-cellSub' }, entry.version ? `v${entry.version}` : ''),
                            h('span', { className: 'msm-spacer' }),
                            h(
                              Button,
                              {
                                variant: 'primary',
                                disabled: installing !== null,
                                onClick: () => void installMcp(entry),
                              },
                              installing === entry.name ? t('market.installing') : t('market.install'),
                            ),
                          ),
                        ),
                  ),
                ),
        ),
      );
    }

    /** Backup snapshots page. */
    function BackupsPage({ ctx, manager, state }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const [pending, setPending] = React.useState(null);
      const [confirming, setConfirming] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [roots, setRoots] = React.useState({});
      const writableRoots = state.skillRoots.filter((root) => root.writable);
      const defaultRootId = (writableRoots[0] ?? { id: 'agents:user' }).id;

      const run = async (action, params) => {
        const value = await manager.run(action, params);
        return value;
      };

      const rootFor = (key) => roots[key] ?? defaultRootId;

      const restore = async (snapshot, entry) => {
        const key = `${snapshot.id}:${entry.name}`;
        setPending(key);
        try {
          const value = await run('backup/restore', {
            backupId: snapshot.id,
            name: entry.name,
            targetRootId: rootFor(key),
          });
          setNotice(t('backup.restored', { path: value.restored }));
          setTimeout(() => setNotice(null), 2600);
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setPending(null);
        }
      };

      const remove = async (snapshot) => {
        if (confirming !== snapshot.id) {
          setConfirming(snapshot.id);
          return;
        }
        setConfirming(null);
        try {
          await run('backup/delete', { backupId: snapshot.id });
        } catch {
          /* the page-level error banner reports it */
        }
      };

      const reveal = async (snapshot) => {
        try {
          await run('backup/reveal', { backupId: snapshot.id });
        } catch {
          /* non-fatal */
        }
      };

      return h(
        'div',
        { className: 'msm-page' },
        h(
          'div',
          { className: 'msm-pageInner' },
          h(Note, { tone: 'info' }, t('backup.note')),
          notice ? h('div', { className: 'msm-toast' }, notice) : null,
          state.backups.length === 0
            ? h('div', { className: 'msm-backupEmpty' }, h('strong', null, t('backup.empty')), h('span', null, t('backup.emptyHint')))
            : h(
                'div',
                { className: 'msm-backupList' },
                state.backups.map((snapshot) =>
                  h(
                    'div',
                    { key: snapshot.id, className: 'msm-backupCard' },
                    h(
                      'div',
                      { className: 'msm-backupHead' },
                      h('span', { className: 'msm-backupTime' }, new Date(snapshot.createdAt).toLocaleString()),
                      h(Badge, null, `${snapshot.entries.length}`),
                      h('span', { className: 'msm-spacer' }),
                      h(Button, { variant: 'ghost', onClick: () => void reveal(snapshot) }, t('backup.reveal')),
                      h(
                        Button,
                        {
                          variant: confirming === snapshot.id ? 'danger' : 'ghost',
                          onClick: () => void remove(snapshot),
                        },
                        confirming === snapshot.id ? t('backup.confirmDelete') : t('backup.delete'),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'msm-backupEntries' },
                      snapshot.entries.map((entry) => {
                        const key = `${snapshot.id}:${entry.name}`;
                        return h(
                          'div',
                          { key: entry.name, className: 'msm-backupEntry' },
                          h(Badge, { tone: entry.kind === 'skill' ? 'brand' : undefined }, entry.kind === 'skill' ? t('backup.entry.skill') : t('backup.entry.config')),
                          h(
                            'span',
                            { className: 'msm-rowMain' },
                            h('span', { className: 'msm-rowTitle' }, entry.name),
                            h('span', { className: 'msm-rowDesc' }, entry.target ?? t('backup.unknownTarget')),
                          ),
                          entry.kind === 'skill'
                            ? h(Select, {
                                value: rootFor(key),
                                onChange: (value) => setRoots((current) => ({ ...current, [key]: value })),
                                options: writableRoots.map((root) => ({
                                  value: root.id,
                                  label: `${localized(root, locale)}`,
                                })),
                              })
                            : null,
                          h(
                            Button,
                            {
                              variant: 'primary',
                              disabled: pending === key || (entry.kind === 'config' && entry.target === null),
                              onClick: () => void restore(snapshot, entry),
                            },
                            t('backup.restore'),
                          ),
                        );
                      }),
                    ),
                  ),
                ),
              ),
        ),
      );
    }

    /** Settings page: tracked projects, custom locations, detected paths, issues. */
    function SettingsPage({ ctx, manager, state }) {
      const t = useT(ctx);
      const locale = useLocaleId(ctx);
      const [manualPath, setManualPath] = React.useState('');
      const [customSkillLabel, setCustomSkillLabel] = React.useState('');
      const [customMcp, setCustomMcp] = React.useState({
        path: '',
        format: 'json',
        keyPath: 'mcpServers',
        label: '',
      });
      const [busy, setBusy] = React.useState(false);

      const run = async (action, params) => {
        setBusy(true);
        try {
          await manager.run(action, params);
        } catch {
          /* the page-level error banner reports it */
        } finally {
          setBusy(false);
        }
      };

      const pickDirectory = async () => {
        const workspace = ctx.get('uiWorkspace');
        if (workspace !== undefined && typeof workspace.pickDirectory === 'function') {
          try {
            const picked = await workspace.pickDirectory();
            if (typeof picked === 'string' && picked.length > 0) return picked;
          } catch {
            /* fall back to the manual input */
          }
        }
        return manualPath.trim();
      };

      const addProject = async () => {
        const directory = await pickDirectory();
        if (directory.length === 0) return;
        await run('project/add', { path: directory });
        setManualPath('');
      };

      const addSkillDir = async () => {
        const directory = await pickDirectory();
        if (directory.length === 0) return;
        await run('custom/add_skill_dir', {
          path: directory,
          label: customSkillLabel.trim() || undefined,
        });
        setCustomSkillLabel('');
        setManualPath('');
      };

      const addMcpTarget = async () => {
        const filePath = customMcp.path.trim();
        if (filePath.length === 0) return;
        await run('custom/add_mcp_target', {
          path: filePath,
          format: customMcp.format,
          keyPath: customMcp.keyPath
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
          label: customMcp.label.trim() || undefined,
          style: customMcp.style,
        });
        setCustomMcp({ path: '', format: 'json', keyPath: 'mcpServers', label: '' });
      };

      const detected = [...state.mcpTargets, ...state.skillRoots];

      return h(
        'div',
        { className: 'msm-page' },
        h(
          'div',
          { className: 'msm-pageInner' },
          h(
            'div',
            { className: 'msm-settingsPage' },
            h(Note, { tone: 'info' }, t('settings.note', { backups: state.capabilities.backups })),
            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('project.title')),
                h('span', { className: 'msm-sectionHint' }, t('project.hint')),
                h('span', { className: 'msm-spacer' }),
                h(Button, { variant: 'ghost', onClick: addProject, disabled: busy }, t('project.add')),
              ),
              state.projects.length === 0
                ? h('span', { className: 'msm-hint' }, t('custom.none'))
                : state.projects.map((project) =>
                    h(
                      'div',
                      { key: project.id, className: 'msm-rowItem' },
                      h(
                        'span',
                        { className: 'msm-rowMain' },
                        h('span', { className: 'msm-rowTitle' }, project.path),
                      ),
                      h(Button, { variant: 'ghost', onClick: () => run('project/remove', { projectId: project.id }), disabled: busy }, t('remove')),
                    ),
                  ),
              h(
                'div',
                { className: 'msm-inline' },
                h(TextInput, {
                  value: manualPath,
                  onChange: setManualPath,
                  placeholder: '/path/to/project',
                  mono: true,
                }),
                h(Button, { onClick: addProject, disabled: busy }, t('project.add')),
              ),
            ),

            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('custom.skillTitle')),
              ),
              state.custom.skillDirs.length === 0
                ? h('span', { className: 'msm-hint' }, t('custom.none'))
                : state.custom.skillDirs.map((entry) =>
                    h(
                      'div',
                      { key: entry.id, className: 'msm-rowItem' },
                      h(
                        'span',
                        { className: 'msm-rowMain' },
                        h('span', { className: 'msm-rowTitle' }, entry.label),
                        h('span', { className: 'msm-rowDesc' }, entry.path),
                      ),
                      h(Button, { variant: 'ghost', onClick: () => run('custom/remove_skill_dir', { id: entry.id }), disabled: busy }, t('remove')),
                    ),
                  ),
              h(
                'div',
                { className: 'msm-inline' },
                h(TextInput, { value: customSkillLabel, onChange: setCustomSkillLabel, placeholder: t('field.label') }),
                h(Button, { onClick: addSkillDir, disabled: busy }, t('custom.skillAdd')),
                h(TextInput, {
                  value: manualPath,
                  onChange: setManualPath,
                  placeholder: '/path/to/skills',
                  mono: true,
                }),
              ),
            ),

            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('custom.mcpTitle')),
              ),
              state.custom.mcpTargets.length === 0
                ? h('span', { className: 'msm-hint' }, t('custom.none'))
                : state.custom.mcpTargets.map((entry) =>
                    h(
                      'div',
                      { key: entry.id, className: 'msm-rowItem' },
                      h(
                        'span',
                        { className: 'msm-rowMain' },
                        h('span', { className: 'msm-rowTitle' }, entry.label),
                        h('span', { className: 'msm-rowDesc' }, `${entry.path} (${entry.format})`),
                      ),
                      h(Button, { variant: 'ghost', onClick: () => run('custom/remove_mcp_target', { id: entry.id }), disabled: busy }, t('remove')),
                    ),
                  ),
              h(
                'div',
                { className: 'msm-grid2' },
                h(TextInput, {
                  value: customMcp.path,
                  onChange: (value) => setCustomMcp((current) => ({ ...current, path: value })),
                  placeholder: '/path/to/mcp.json',
                  mono: true,
                }),
                h(Select, {
                  value: customMcp.format,
                  onChange: (value) => setCustomMcp((current) => ({ ...current, format: value })),
                  options: ['json', 'jsonc', 'toml', 'yaml-patch'].map((value) => ({ value, label: value })),
                }),
              ),
              h(
                'div',
                { className: 'msm-grid2' },
                h(TextInput, {
                  value: customMcp.keyPath,
                  onChange: (value) => setCustomMcp((current) => ({ ...current, keyPath: value })),
                  placeholder: 'mcpServers',
                  mono: true,
                }),
                h(TextInput, {
                  value: customMcp.label,
                  onChange: (value) => setCustomMcp((current) => ({ ...current, label: value })),
                  placeholder: t('field.label'),
                }),
              ),
              h(Button, { onClick: addMcpTarget, disabled: busy }, t('custom.mcpAdd')),
            ),

            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('detected.title')),
              ),
              detected.map((entry) =>
                h(
                  'div',
                  { key: `${entry.id}:${entry.path}`, className: 'msm-rowItem' },
                  h(Badge, { tone: entry.detected === false ? 'warn' : undefined }, localized(entry, locale) || entry.tool),
                  h(
                    'span',
                    { className: 'msm-rowMain' },
                    h('span', { className: 'msm-rowDesc' }, entry.path),
                  ),
                  entry.exists === false ? h(Badge, { tone: 'warn' }, 'missing') : null,
                ),
              ),
            ),

            h(
              'div',
              { className: 'msm-section' },
              h(
                'div',
                { className: 'msm-sectionHead' },
                h('span', { className: 'msm-sectionTitle' }, t('doctor.title')),
                h('span', { className: 'msm-sectionHint' }, t('doctor.count', { count: state.warnings.length })),
              ),
              state.warnings.length === 0
                ? h(Note, { tone: 'ok' }, t('doctor.none'))
                : state.warnings.map((issue, index) =>
                    h(
                      'div',
                      { key: `${issue.path}:${index}`, className: 'msm-rowItem' },
                      h(
                        'span',
                        { className: 'msm-rowMain' },
                        h('span', { className: 'msm-rowTitle' }, issue.message),
                        issue.path ? h('span', { className: 'msm-rowDesc' }, issue.path) : null,
                      ),
                      issue.rootId ? h(Badge, null, issue.rootId) : null,
                    ),
                  ),
            ),
          ),
        ),
      );
    }

    // -----------------------------------------------------------------------
    // Page
    // -----------------------------------------------------------------------

    /** The management page. */
    function Page({ ctx }) {
      const t = useT(ctx);
      const manager = useManager();
      const [tab, setTab] = React.useState('skills');
      const [view, setView] = React.useState({ kind: 'list' });
      const [filters, setFilters] = React.useState({
        skills: { search: '', tool: 'all' },
        mcp: { search: '', tool: 'all' },
      });
      const state = manager.state;

      const listFilter = filters[tab] ?? { search: '', tool: 'all' };
      const updateFilter = (patch) =>
        setFilters((current) => ({
          ...current,
          [tab]: { ...(current[tab] ?? { search: '', tool: 'all' }), ...patch },
        }));

      const back = () => setView({ kind: 'list' });
      const openSkill = (key) => setView({ kind: 'skill', key });
      const openMcp = (targetId, name) => setView({ kind: 'mcp', targetId, name });

      const tabs = state
        ? [
            ['skills', t('tab.skills'), state.skills.length],
            ['mcp', t('tab.mcp'), state.mcpServers.length],
            ['market', t('tab.market'), null],
            ['backups', t('tab.backups'), state.backups.length],
            ['settings', t('tab.settings'), state.warnings.length],
          ]
        : [];
      const detail = view.kind !== 'list';

      let body = null;
      if (state === null) {
        body = h('div', { className: 'msm-loading' }, h('span', { className: 'msm-spinner' }), t('loading'));
      } else if (detail && view.kind === 'skill') {
        body = h(SkillDetail, {
          key: view.key,
          ctx,
          manager,
          state,
          skillKey: view.key,
          onBack: back,
          onSaved: (key) => (key ? setView({ kind: 'skill', key }) : back()),
        });
      } else if (detail && view.kind === 'skill-new') {
        body = h(SkillDetail, {
          key: 'new-skill',
          ctx,
          manager,
          state,
          skillKey: null,
          onBack: back,
          onSaved: (key) => (key ? setView({ kind: 'skill', key }) : back()),
        });
      } else if (detail && view.kind === 'mcp') {
        body = h(McpDetail, {
          key: `${view.targetId}:${view.name}`,
          ctx,
          manager,
          state,
          targetId: view.targetId,
          name: view.name,
          onBack: back,
          onSaved: (next) => (next ? setView({ kind: 'mcp', targetId: next.targetId, name: next.name }) : back()),
        });
      } else if (detail && view.kind === 'mcp-new') {
        body = h(McpDetail, {
          key: 'new-mcp',
          ctx,
          manager,
          state,
          targetId: null,
          name: null,
          onBack: back,
          onSaved: (next) => (next ? setView({ kind: 'mcp', targetId: next.targetId, name: next.name }) : back()),
        });
      } else if (tab === 'skills') {
        body = h(SkillsList, {
          ctx,
          manager,
          state,
          onOpen: openSkill,
          onCreate: () => setView({ kind: 'skill-new' }),
          filter: listFilter,
          onFilterChange: updateFilter,
        });
      } else if (tab === 'market') {
        body = h(MarketPage, { ctx, manager, state });
      } else if (tab === 'backups') {
        body = h(BackupsPage, { ctx, manager, state });
      } else if (tab === 'mcp') {
        body = h(McpList, {
          ctx,
          manager,
          state,
          onOpen: openMcp,
          onCreate: () => setView({ kind: 'mcp-new' }),
          filter: listFilter,
          onFilterChange: updateFilter,
        });
      } else {
        body = h(SettingsPage, { ctx, manager, state });
      }

      return h(
        'div',
        { className: 'msm-root' },
        h('style', null, CSS),
        detail
          ? null
          : h(
              'div',
              { className: 'msm-header' },
              h('span', { className: 'msm-mark' }, h(IconPlug, { size: 19 })),
              h(
                'div',
                { className: 'msm-heading' },
                h('div', { className: 'msm-title' }, t('title')),
                h('div', { className: 'msm-sub' }, t('subtitle')),
              ),
              h(
                'div',
                { className: 'msm-headerActions' },
                manager.busy ? h('span', { className: 'msm-hint' }, t('busy')) : null,
                h(
                  Button,
                  {
                    variant: 'ghost',
                    iconOnly: true,
                    title: t('refresh'),
                    onClick: () => void manager.load(),
                    disabled: manager.busy,
                  },
                  h(IconRefresh),
                ),
              ),
            ),
        detail
          ? null
          : h(
              'div',
              { className: 'msm-tabs' },
              tabs.map(([id, label, count]) =>
                h(
                  'button',
                  {
                    key: id,
                    type: 'button',
                    className: cx('msm-tab', tab === id && 'active'),
                    onClick: () => {
                      setTab(id);
                      setView({ kind: 'list' });
                    },
                  },
                  label,
                  count === null
                    ? null
                    : h(
                        'span',
                        { className: cx('msm-tabCount', id === 'settings' && count > 0 && 'warn') },
                        String(count),
                      ),
                ),
              ),
            ),
        manager.error
          ? h(
              'div',
              { className: 'msm-error' },
              h('span', { className: 'msm-spacer' }, t('state.error', { message: manager.error })),
              h(Button, { variant: 'ghost', onClick: () => void manager.load(), disabled: manager.busy }, t('retry')),
            )
          : null,
        body,
      );
    }

    // -----------------------------------------------------------------------
    // Plugin entry
    // -----------------------------------------------------------------------

    /** Services the page reads from the restricted browser context. */
    const inject = ['slots', 'locale'];

    /**
     * Register the sidebar entry and the management page.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'mcp-skill-manager: zh dictionary');
      ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'mcp-skill-manager: en dictionary');
      const t = ctx.locale.bind(NS);
      const BoundPage = (props) => h(Page, { ...props, ctx });
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, BoundPage),
      );
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 25,
            label: () => t('panel'),
            locale: NS,
          },
          PanelIcon,
        ),
      );
    }

    return { inject, apply };
  },
});
