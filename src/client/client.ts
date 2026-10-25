declare module 'undici-types' {
  export class WebSocket {}
  export class CloseEvent {}
  export class MessageEvent {}
  export interface CloseEventInit {}
  export class ErrorEvent {}
  export interface ErrorEventInit {}
  export class EventSource {}
  export interface EventSourceInit {}
  export class FormData {}
  export class Headers {}
  export interface MessageEventInit {}
  export class Request {}
  export interface RequestInit {}
  export class Response {}
  export interface ResponseInit {}
  export interface WebSocketInit {}
}

/**
 * Minimal, dependency-free types for the browser bundle.
 *
 * The real shell supplies React and the module-loader facade; this file only
 * declares the small surface it uses so the bundle can be type-checked without
 * installing React or the client packages. `document` comes from the DOM lib.
 */

interface ReactElementLike {
  type: unknown;
  props: Record<string, unknown>;
}

interface ReactLike {
  createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): ReactElementLike;
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  useCallback<T extends (...args: any[]) => any>(callback: T, dependencies?: readonly unknown[]): T;
  useRef<T>(initial: T): { current: T };
}

interface ModuleLoaderEntry {
  id: string;
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>;
}

interface Window {
  __ModuleLoader__: { load(entry: ModuleLoaderEntry): void };
}

interface BundleModule {
  exports: Record<string, unknown>;
}

interface ReviewerSettings {
  enabled: boolean;
  provider: string;
  model: string;
  reasoningEffort: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface StatusLine {
  kind: 'ok' | 'error';
  text: string;
}

interface EffortInfo {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface ModelInfo {
  id: string;
  name: string;
  reasoning?: {
    efforts?: readonly (EffortInfo | string)[];
    defaultEffort?: string;
  };
  [key: string]: unknown;
}

interface ProviderGroup {
  id: string;
  name: string;
  models: ModelInfo[];
  [key: string]: unknown;
}

interface RemoteResponse<T> {
  ok?: boolean;
  value?: T;
  error?: unknown;
  revision?: number;
}

interface SettingsNamespace {
  ns?: string;
  value?: unknown;
  revision?: number;
}

interface RemoteFacade {
  settings: {
    describe(): Promise<RemoteResponse<{ namespaces?: SettingsNamespace[] }>>;
    replace(
      ns: string,
      section: ReviewerSettings,
      revision?: number,
    ): Promise<RemoteResponse<unknown>>;
  };
  session: {
    modelCatalog(): Promise<RemoteResponse<{ groups?: unknown }>>;
  };
}

interface ClientContext {
  get(service: string): any;
  effect(effect: () => (() => void) | void, label?: string): void;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  options: SelectOption[];
  disabled?: boolean;
}

interface ConfigProps {
  view: 'summary' | 'page';
  remote: RemoteFacade;
  t: (key: string) => string;
}

type LoadResult =
  | {
      ok: true;
      value: ReviewerSettings;
      revision: number | undefined;
      groups: ProviderGroup[];
      catalogError: string;
    }
  | { ok: false; error: unknown };

window.__ModuleLoader__.load({ id: '@local/dsh-auto-review-model', factory: (require: (specifier: string) => unknown): Record<string, unknown> => {
  const module: BundleModule = { exports: {} };
  const exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

  const React = require('react') as ReactLike;

  /* ============================================================
   * auto-review model — client half
   *
   * Contributes the configuration body of
   * `@deepseek-ai/dsh-experimental-auto-review` to the Plugins page.
   * The form reads and writes the `auto-review-model` settings
   * namespace through the official Remote API:
   *   remote.settings.describe()  -> namespaces, each with value/revision
   *   remote.settings.replace()   -> replace the user section with a revision
   *   remote.session.modelCatalog() -> provider groups, models, efforts
   *
   * Only `react` is required; every node is built with
   * React.createElement, and every style is injected once as plain CSS.
   * ============================================================ */

  const NS = 'auto-review-model';
  const BUNDLE = '@deepseek-ai/dsh-experimental-auto-review';
  const STYLE_ID = 'dsh_arm_styles';
  const FIELDS: readonly (keyof ReviewerSettings)[] = [
    'enabled',
    'provider',
    'model',
    'reasoningEffort',
  ];

  /** Values shown before the first successful read; never mutated. */
  const DEFAULT_SETTINGS: ReviewerSettings = Object.freeze({
    enabled: true,
    provider: '',
    model: '',
    reasoningEffort: '',
  });

  const zh = {
    title: '自动审查模型',
    subtitle: '为自动审查指定提供商、模型与推理等级。提供商留空时继承当前会话模型。',
    enabled: '启用自动审查模型配置',
    enabledDesc: '关闭后自动审查沿用当前会话的模型与推理等级。',
    provider: '提供商',
    providerEmpty: '继承当前会话模型',
    model: '模型',
    modelPlaceholder: '选择模型',
    inheritModel: '继承当前会话模型',
    effort: '推理等级',
    effortDefault: '默认（不指定）',
    save: '保存',
    discard: '放弃更改',
    reload: '重新读取',
    saving: '保存中…',
    saved: '已保存',
    unsaved: '有未保存的更改',
    loading: '正在读取设置…',
    loadFailed: '设置加载失败',
    saveFailed: '保存失败',
    reloadFailed: '已保存，但重新读取设置失败',
    catalogFailed: '模型目录加载失败，但可继续编辑已保存设置',
    conflict: '设置已被其他窗口修改，请点击“重新读取”或刷新页面后重新编辑',
    incompleteRouteHint: '模型未选择，覆盖未生效，继续使用会话模型',
    summaryLabel: '自动审查模型',
    summaryLoading: '正在读取…',
    summaryOff: '已关闭',
    summaryInherit: '继承当前会话模型',
    summaryError: '读取失败',
    unavailable: '（不可用）',
    unverified: '（未验证）',
    notAdvertised: '（未声明）',
  };

  const en = {
    title: 'Auto-review model',
    subtitle: 'Choose the provider, model and reasoning effort used for auto review. An empty provider inherits the current session model.',
    enabled: 'Enable auto-review model configuration',
    enabledDesc: 'When off, auto review keeps the current session model and reasoning effort.',
    provider: 'Provider',
    providerEmpty: 'Inherit current session model',
    model: 'Model',
    modelPlaceholder: 'Select a model',
    inheritModel: 'Inherit current session model',
    effort: 'Reasoning effort',
    effortDefault: 'Default (unset)',
    save: 'Save',
    discard: 'Discard changes',
    reload: 'Reload',
    saving: 'Saving…',
    saved: 'Saved',
    unsaved: 'You have unsaved changes',
    loading: 'Loading settings…',
    loadFailed: 'Failed to load settings',
    saveFailed: 'Failed to save',
    reloadFailed: 'Saved, but reloading the settings failed',
    catalogFailed: 'Failed to load model catalog; existing settings remain editable',
    conflict: 'These settings changed elsewhere. Click "Reload" or refresh the page and try again.',
    incompleteRouteHint: 'Model not selected; override is inactive, continuing with session model',
    summaryLabel: 'Auto-review model',
    summaryLoading: 'Loading…',
    summaryOff: 'Off',
    summaryInherit: 'Inherits the current session model',
    summaryError: 'Failed to load',
    unavailable: '(unavailable)',
    unverified: '(unverified)',
    notAdvertised: '(not advertised)',
  };

  const cssText = `
.dsh_arm_section{display:flex;flex-direction:column;gap:12px;min-width:0;color:var(--dsw-alias-label-primary)}
.dsh_arm_title{margin:0;color:var(--dsw-alias-label-primary);font-size:18px;line-height:26px;font-weight:600}
.dsh_arm_subtitle{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dsh_arm_toggle{display:flex;align-items:flex-start;gap:12px;min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.dsh_arm_checkbox{flex:none;width:18px;height:18px;margin:2px 0 0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh_arm_checkbox:disabled{cursor:default}
.dsh_arm_toggleText{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh_arm_toggleTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dsh_arm_toggleDesc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dsh_arm_fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;min-width:0}
.dsh_arm_field{display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh_arm_label{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-weight:600}
.dsh_arm_select{position:relative;min-width:0}
.dsh_arm_trigger{box-sizing:border-box;width:100%;height:32px;padding:0 28px 0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsh_arm_trigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}
.dsh_arm_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh_arm_triggerOpen{border-color:var(--dsw-alias-brand-primary)}
.dsh_arm_chevron{position:absolute;top:0;right:8px;height:32px;display:flex;align-items:center;pointer-events:none;color:var(--dsw-alias-label-caption);font-size:10px}
.dsh_arm_menu{box-sizing:border-box;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:20;max-height:220px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3);padding:4px}
.dsh_arm_option{box-sizing:border-box;width:100%;border:none;border-radius:6px;background:none;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;padding:6px 8px;cursor:pointer;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsh_arm_option:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh_arm_optionActive{background:var(--dsw-alias-interactive-bg-hover)}
.dsh_arm_actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;min-width:0}
.dsh_arm_unsaved{margin-right:auto;color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:18px}
.dsh_arm_button{box-sizing:border-box;height:32px;font:inherit;cursor:pointer;border-radius:16px;justify-content:center;align-items:center;gap:4px;padding:0 16px;font-size:13px;line-height:20px;display:inline-flex}
.dsh_arm_button:disabled{opacity:.55;cursor:default}
.dsh_arm_buttonPrimary{border:none;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh_arm_buttonPrimary:hover:not(:disabled){filter:brightness(1.06)}
.dsh_arm_buttonSecondary{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.dsh_arm_buttonSecondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh_arm_buttonDirty{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}
.dsh_arm_status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dsh_arm_statusOk{color:var(--dsw-alias-label-secondary)}
.dsh_arm_statusError{color:var(--dsw-alias-state-error-primary)}
.dsh_arm_summary{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dsh_arm_hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
`;

  /** Inject the component stylesheet once; a no-op without a document. */
  function adoptStyles(): void {
    if (typeof document === 'undefined' || document === null) return;
    const existing = typeof document.getElementById === 'function'
      ? document.getElementById(STYLE_ID)
      : null;
    if (existing !== null && existing !== undefined) return;
    const head = document.head;
    if (head === undefined || head === null) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = cssText;
    head.appendChild(style);
  }

  function trimString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  /**
   * Extract the namespace section value from a response or raw object.
   * If value has a namespace view shape ({ ns, value, revision }), extracts its inner value;
   * otherwise returns the input as-is.
   * @param {unknown} value - namespace view or direct section object.
   * @returns {unknown}
   */
  function namespaceSection(value: unknown): unknown {
    if (value !== null && typeof value === 'object' && 'ns' in value && 'value' in value) {
      return (value as { value: unknown }).value;
    }
    return value;
  }

  /**
   * Coerce whatever the settings namespace holds into the four form fields.
   * Dirty values degrade to safe defaults, and strings are trimmed.
   * @param {unknown} raw - the namespace value, possibly absent or malformed.
   * @returns {{ enabled: boolean, provider: string, model: string, reasoningEffort: string }}
   */
  function normalizeSettings(raw: unknown): ReviewerSettings {
    const source = raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {};
    return {
      enabled: source.enabled !== false,
      provider: trimString(source.provider),
      model: trimString(source.model),
      reasoningEffort: trimString(source.reasoningEffort),
    };
  }

  /**
   * Read the provider groups out of a model catalog (or a raw groups array).
   * Groups without a usable id are dropped; a missing display name falls back
   * to the id so a custom dropdown always has a label.
   * @param {unknown} catalog - ModelCatalog, a RemoteResult wrapping one, or a groups array.
   * @returns {Array<{ id: string, name: string, models: Array<{ id: string, name: string, reasoning?: object }> }>}
   */
  function providerGroups(catalog: unknown): ProviderGroup[] {
    let groups: unknown[] = [];
    if (Array.isArray(catalog)) {
      groups = catalog;
    } else if (catalog !== null && typeof catalog === 'object') {
      const record = catalog as Record<string, unknown>;
      if (Array.isArray(record.groups)) groups = record.groups;
      else if (
        record.value !== null
        && typeof record.value === 'object'
        && Array.isArray((record.value as Record<string, unknown>).groups)
      ) {
        groups = (record.value as { groups: unknown[] }).groups;
      }
    }
    const result: ProviderGroup[] = [];
    for (const group of groups) {
      if (group === null || typeof group !== 'object') continue;
      const record = group as Record<string, unknown>;
      const id = trimString(record.id);
      if (id === '') continue;
      const models = Array.isArray(record.models)
        ? record.models.filter(
            (model): model is ModelInfo =>
              model !== null
              && typeof model === 'object'
              && trimString((model as Record<string, unknown>).id) !== '',
          )
        : [];
      result.push({
        ...record,
        id,
        name: trimString(record.name) || id,
        models,
      });
    }
    return result;
  }

  /**
   * Models of one provider; an empty or unknown provider yields no models.
   * @param {unknown} groups - provider groups from the model catalog.
   * @param {unknown} provider - provider id.
   * @returns {Array<object>} the provider's models.
   */
  function modelsFor(groups: unknown, provider: unknown): ModelInfo[] {
    const id = trimString(provider);
    if (id === '') return [];
    const group = providerGroups(groups).find((item) => item.id === id);
    return group === undefined ? [] : group.models;
  }

  /**
   * Reasoning efforts a model supports, normalized to `{ id, name }` even when
   * the catalog carries ids only. A model without reasoning metadata yields [].
   * @param {unknown} model - one model catalog entry.
   * @returns {Array<{ id: string, name: string }>}
   */
  function effortsFor(model: unknown): EffortInfo[] {
    if (model === null || typeof model !== 'object') return [];
    const record = model as Record<string, unknown>;
    const reasoning = record.reasoning;
    if (
      reasoning === null
      || typeof reasoning !== 'object'
      || !Array.isArray((reasoning as Record<string, unknown>).efforts)
    ) {
      return [];
    }
    const efforts: EffortInfo[] = [];
    for (const effort of (reasoning as { efforts: unknown[] }).efforts) {
      if (typeof effort === 'string') {
        const id = effort.trim();
        if (id !== '') efforts.push({ id, name: id });
        continue;
      }
      if (effort === null || typeof effort !== 'object') continue;
      const item = effort as Record<string, unknown>;
      const id = trimString(item.id);
      if (id === '') continue;
      efforts.push({ ...item, id, name: trimString(item.name) || id });
    }
    return efforts;
  }

  /**
   * Selecting a provider drops the model and effort if the provider actually
   * changed. Re-selecting the same provider is a no-op that preserves existing
   * model/effort and avoids unnecessary dirty state.
   */
  function draftAfterProvider(draft: unknown, provider: unknown): ReviewerSettings {
    const base = normalizeSettings(draft);
    const nextProvider = trimString(provider);
    if (nextProvider === base.provider) {
      return base;
    }
    return {
      ...base,
      provider: nextProvider,
      model: '',
      reasoningEffort: '',
    };
  }

  /**
   * Selecting a model keeps the current reasoning effort only when that model
   * supports it; a stale effort is cleared rather than silently persisted.
   * Re-selecting the same model is a no-op that preserves existing reasoningEffort
   * (including unadvertised/unverified values) and avoids unnecessary dirty state.
   */
  function draftAfterModel(draft: unknown, modelId: unknown, groups: unknown): ReviewerSettings {
    const base = normalizeSettings(draft);
    const model = trimString(modelId);
    if (model === base.model) {
      return base;
    }
    const supported = effortsFor(
      modelsFor(groups, base.provider).find((item) => item.id === model),
    ).map((effort) => effort.id);
    const reasoningEffort = base.reasoningEffort !== '' && !supported.includes(base.reasoningEffort)
      ? ''
      : base.reasoningEffort;
    return {
      ...base,
      model,
      reasoningEffort,
    };
  }

  /**
   * Reconcile a loaded value: normalizes the fields without clearing any
   * persisted settings even if catalog/groups is empty or missing.
   */
  function reconcileDraft(value: unknown, _groups?: unknown): ReviewerSettings {
    return normalizeSettings(value);
  }

  function errorText(error: unknown): string {
    if (error === null || error === undefined) return '';
    if (typeof error === 'string') return error.trim();
    if (typeof error !== 'object') return '';
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim() !== '') {
      return record.message.trim();
    }
    if (typeof record.code === 'string') return record.code;
    return '';
  }

  function withDetail(base: string, error: unknown): string {
    const detail = errorText(error);
    return detail === '' ? base : base + ': ' + detail;
  }

  /**
   * Read the settings namespace and the model catalog in parallel.
   * If settings succeeds but modelCatalog fails, settings are still returned
   * with catalogError and empty groups so the form remains interactive.
   * @param {object} remote - the client Remote facade.
   * @param {string} ns - settings namespace, `auto-review-model`.
   * @returns {Promise<{ ok: true, value: ReviewerSettings, revision: number|undefined, groups: ProviderGroup[], catalogError: string }
   *   | { ok: false, error: unknown }>}
   */
  async function loadReviewerSettings(remote: RemoteFacade, ns: string): Promise<LoadResult> {
    try {
      const [describedResult, catalogResult] = await Promise.allSettled([
        remote.settings.describe(),
        remote.session.modelCatalog(),
      ]);

      if (describedResult.status === 'rejected') {
        return { ok: false, error: describedResult.reason };
      }
      const described = describedResult.value;
      if (described === null || described === undefined || described.ok !== true) {
        return {
          ok: false,
          error: described !== null && described !== undefined && described.error !== undefined
            ? described.error
            : new Error('settings/describe failed'),
        };
      }

      let groups: ProviderGroup[] = [];
      let catalogError = '';
      if (catalogResult.status === 'rejected') {
        catalogError = errorText(catalogResult.reason) || 'model catalog request failed';
      } else {
        const catalog = catalogResult.value;
        if (catalog === null || catalog === undefined || catalog.ok !== true) {
          const err = catalog !== null && catalog !== undefined ? catalog.error : undefined;
          catalogError = errorText(err) || 'model catalog unavailable';
        } else {
          groups = providerGroups(catalog.value);
        }
      }

      const namespaces = described.value !== null && described.value !== undefined && Array.isArray(described.value.namespaces)
        ? described.value.namespaces
        : [];
      const entry = namespaces.find((item) => item !== null && typeof item === 'object' && item.ns === ns);
      const rawSection = entry === undefined ? undefined : namespaceSection(entry.value);

      return {
        ok: true,
        value: normalizeSettings(rawSection),
        revision: entry !== undefined && typeof entry.revision === 'number' ? entry.revision : undefined,
        groups,
        catalogError,
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  /**
   * Replace the namespace's user section with the form's four fields, asking
   * the Host to refuse the write if the revision moved since it was read.
   * Resolves to the `remote.settings.replace` response unchanged.
   */
  function saveReviewerSettings(
    remote: RemoteFacade,
    ns: string,
    draft: unknown,
    revision: number | undefined,
  ): Promise<RemoteResponse<unknown>> {
    const expectedRevision = typeof revision === 'number' && Number.isFinite(revision) ? revision : undefined;
    return remote.settings.replace(ns, normalizeSettings(draft), expectedRevision);
  }

  function saveFailureText(response: RemoteResponse<unknown>, t: (key: string) => string): string {
    const error = response !== null && response !== undefined ? response.error : undefined;
    const code = error !== null && error !== undefined && typeof error === 'object'
      && typeof (error as Record<string, unknown>).code === 'string'
      ? (error as { code: string }).code
      : '';
    if (code === 'settings/conflict' || /conflict/i.test(errorText(error))) {
      return t('conflict');
    }
    return withDetail(t('saveFailed'), error);
  }

  /**
   * Fully controlled dropdown: a trigger button plus an absolutely positioned
   * list. A document-level capture listener closes it on outside mousedown,
   * and Escape closes it as well; no native <select> is used.
   */
  function ARMSelect(props: SelectProps): ReactElementLike {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      if (!open) return undefined;
      if (typeof document === 'undefined' || document === null) return undefined;
      const onMouseDown = (event: MouseEvent): void => {
        const root = rootRef.current;
        if (root !== null && !root.contains(event.target as Node)) setOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onMouseDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      return () => {
        document.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
      };
    }, [open]);

    React.useEffect(() => {
      if (props.disabled && open) setOpen(false);
    }, [props.disabled, open]);

    const options = props.options;
    const selected = options.find((option) => option.value === props.value);
    const label = selected === undefined ? props.placeholder : selected.label;

    return React.createElement('div', { className: 'dsh_arm_select', ref: rootRef },
      React.createElement('button', {
        type: 'button',
        className: 'dsh_arm_trigger' + (open ? ' dsh_arm_triggerOpen' : ''),
        disabled: props.disabled === true,
        'aria-label': props.label,
        'aria-haspopup': 'listbox',
        'aria-expanded': open,
        title: label,
        onClick: () => setOpen((prev) => !prev),
      }, label),
      React.createElement('span', { className: 'dsh_arm_chevron', 'aria-hidden': 'true' }, open ? '▲' : '▼'),
      open
        ? React.createElement('div', { className: 'dsh_arm_menu', role: 'listbox' },
          options.map((option, index) => React.createElement('button', {
            key: String(index) + ':' + option.value,
            type: 'button',
            role: 'option',
            'aria-selected': option.value === props.value,
            className: 'dsh_arm_option' + (option.value === props.value ? ' dsh_arm_optionActive' : ''),
            onMouseDown: (event: { stopPropagation(): void }) => {
              // Keep the document-level capture listener from closing the menu
              // before this option's click is delivered.
              event.stopPropagation();
            },
            onClick: () => {
              props.onChange(option.value);
              setOpen(false);
            },
          }, option.label)),
        )
        : null,
    );
  }

  function armField(label: string, select: unknown): ReactElementLike {
    return React.createElement('div', { className: 'dsh_arm_field' },
      React.createElement('span', { className: 'dsh_arm_label' }, label),
      select,
    );
  }

  function summaryLine(
    draft: ReviewerSettings,
    loading: boolean,
    t: (key: string) => string,
  ): string {
    if (loading) return t('summaryLabel') + ': ' + t('summaryLoading');
    if (!draft.enabled) return t('summaryLabel') + ': ' + t('summaryOff');
    if (draft.provider === '' || draft.model === '') return t('summaryLabel') + ': ' + t('summaryInherit');
    let line = t('summaryLabel') + ': ' + draft.provider + ' / ' + draft.model;
    if (draft.reasoningEffort !== '') line += ' · ' + draft.reasoningEffort;
    return line;
  }

  function ReviewerModelConfig(props: ConfigProps): ReactElementLike {
    const view = props.view;
    const remote = props.remote;
    const t = props.t;

    // `saved` is the last accepted Host value; `draft` is the edited form.
    // Nothing is written until Save, and Save re-reads the namespace so the
    // next write carries the revision produced by this one.
    const [saved, setSaved] = React.useState<ReviewerSettings>(DEFAULT_SETTINGS);
    const [draft, setDraft] = React.useState<ReviewerSettings>(DEFAULT_SETTINGS);
    const [groups, setGroups] = React.useState<ProviderGroup[]>([]);
    const [revision, setRevision] = React.useState<number | undefined>(undefined);
    const [catalogError, setCatalogError] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    const [loaded, setLoaded] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState<StatusLine | null>(null);

    const reloadSettings = React.useCallback(async () => {
      setLoading(true);
      try {
        const result = await loadReviewerSettings(remote, NS);
        if (!result.ok) {
          setStatus({ kind: 'error', text: withDetail(t('loadFailed'), result.error) });
          setLoading(false);
          return;
        }
        const next = reconcileDraft(result.value, result.groups);
        setSaved(next);
        setDraft(next);
        setGroups(result.groups);
        setRevision(result.revision);
        setCatalogError(result.catalogError);
        setLoaded(true);
        setLoading(false);
        if (result.catalogError !== '') {
          setStatus({
            kind: 'error',
            text: withDetail(t('catalogFailed'), result.catalogError),
          });
        } else {
          setStatus(null);
        }
      } catch (error) {
        setStatus({ kind: 'error', text: withDetail(t('loadFailed'), error) });
        setLoading(false);
      }
    }, [remote, t]);

    React.useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setLoaded(false);
      loadReviewerSettings(remote, NS).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setStatus({ kind: 'error', text: withDetail(t('loadFailed'), result.error) });
          setLoading(false);
          return;
        }
        const next = reconcileDraft(result.value, result.groups);
        setSaved(next);
        setDraft(next);
        setGroups(result.groups);
        setRevision(result.revision);
        setCatalogError(result.catalogError);
        setLoaded(true);
        setLoading(false);
        if (result.catalogError !== '') {
          setStatus({
            kind: 'error',
            text: withDetail(t('catalogFailed'), result.catalogError),
          });
        } else {
          setStatus(null);
        }
      }).catch((error) => {
        if (cancelled) return;
        setStatus({ kind: 'error', text: withDetail(t('loadFailed'), error) });
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [remote, t]);

    const dirty = FIELDS.some((key) => draft[key] !== saved[key]);

    const availableModels = modelsFor(groups, draft.provider);
    const selectedModel = availableModels.find((model) => model.id === draft.model);
    const availableEfforts = effortsFor(selectedModel);

    const providerOptions = [{ value: '', label: t('providerEmpty') }];
    if (draft.provider !== '' && !groups.some((group) => group.id === draft.provider)) {
      providerOptions.push({ value: draft.provider, label: draft.provider + ' ' + t('unavailable') });
    }
    for (const group of groups) providerOptions.push({ value: group.id, label: group.name || group.id });

    const modelOptions = availableModels.map((model) => ({ value: model.id, label: model.name || model.id }));
    if (draft.model !== '' && selectedModel === undefined) {
      modelOptions.unshift({ value: draft.model, label: draft.model + ' ' + t('unavailable') });
    }

    const effortOptions = [{ value: '', label: t('effortDefault') }];
    for (const effort of availableEfforts) {
      effortOptions.push({ value: effort.id, label: effort.name || effort.id });
    }
    if (draft.reasoningEffort !== '' && !availableEfforts.some((e) => e.id === draft.reasoningEffort)) {
      const effortSuffix = catalogError !== ''
        ? t('unverified')
        : (selectedModel !== undefined ? t('notAdvertised') : t('unverified'));
      effortOptions.push({
        value: draft.reasoningEffort,
        label: draft.reasoningEffort + ' ' + effortSuffix,
      });
    }

    const formBusy = busy || loading;
    const controlsDisabled = formBusy || !loaded;

    const clearOk = () => {
      setStatus((prev) => (prev !== null && prev.kind === 'ok' ? null : prev));
    };

    const edit = (patch: Partial<ReviewerSettings>): void => {
      setDraft((prev) => ({ ...prev, ...patch }));
      clearOk();
    };

    const applyNext = (makeNext: (previous: ReviewerSettings) => ReviewerSettings): void => {
      setDraft((prev) => makeNext(prev));
      clearOk();
    };

    const discard = () => {
      setDraft(saved);
      setStatus(null);
    };

    const handleSave = async () => {
      if (busy || loading || !loaded || !dirty) return;
      setBusy(true);
      setStatus(null);
      try {
        const response = await saveReviewerSettings(remote, NS, draft, revision);
        if (response === null || response === undefined || response.ok !== true) {
          setStatus({ kind: 'error', text: saveFailureText(response, t) });
          return;
        }
        // The write response may carry a new revision, but the form reloads
        // the namespace explicitly so `value`, `revision` and `groups` all
        // come from the same post-write snapshot.
        const refreshed = await loadReviewerSettings(remote, NS);
        if (refreshed.ok) {
          const next = reconcileDraft(refreshed.value, refreshed.groups);
          setSaved(next);
          setDraft(next);
          setGroups(refreshed.groups);
          setRevision(refreshed.revision);
          setCatalogError(refreshed.catalogError);
          if (refreshed.catalogError !== '') {
            setStatus({ kind: 'error', text: withDetail(t('catalogFailed'), refreshed.catalogError) });
          } else {
            setStatus({ kind: 'ok', text: t('saved') });
          }
          return;
        }
        // The save itself succeeded; keep the response's own snapshot so the
        // form does not immediately look unsaved, but say the re-read failed.
        // Keep existing catalogError intact as re-read failure brings no new catalog information.
        const view = response.value;
        const rawSection = namespaceSection(view);
        const fallback = reconcileDraft(normalizeSettings(rawSection), groups);
        setSaved(fallback);
        setDraft(fallback);
        let fallbackRevision: number | undefined = undefined;
        if (
          view !== null
          && view !== undefined
          && typeof view === 'object'
          && typeof (view as { revision?: unknown }).revision === 'number'
        ) {
          fallbackRevision = (view as { revision: number }).revision;
        } else if (typeof response.revision === 'number') {
          fallbackRevision = response.revision;
        }
        if (fallbackRevision !== undefined) {
          setRevision(fallbackRevision);
        }
        setStatus({ kind: 'error', text: withDetail(t('reloadFailed'), refreshed.error) });
      } catch (error) {
        setStatus({ kind: 'error', text: withDetail(t('saveFailed'), error) });
      } finally {
        setBusy(false);
      }
    };

    if (view === 'summary') {
      const line = status !== null && status.kind === 'error' && !loaded
        ? t('summaryLabel') + ': ' + t('summaryError')
        : summaryLine(draft, loading, t);
      return React.createElement('span', { className: 'dsh_arm_summary' }, line);
    }

    const statusClass = 'dsh_arm_status'
      + (status !== null && status.kind === 'error' ? ' dsh_arm_statusError' : '')
      + (status !== null && status.kind === 'ok' ? ' dsh_arm_statusOk' : '');

    return React.createElement('section', {
      className: 'dsh_arm_section',
      'aria-busy': formBusy,
      'data-auto-review-model': 'true',
    },
      React.createElement('h2', { className: 'dsh_arm_title' }, t('title')),
      React.createElement('p', { className: 'dsh_arm_subtitle' }, t('subtitle')),

      React.createElement('label', { className: 'dsh_arm_toggle' },
        React.createElement('input', {
          type: 'checkbox',
          className: 'dsh_arm_checkbox',
          checked: draft.enabled,
          disabled: controlsDisabled,
          onChange: (event: { target: { checked: boolean } }) => edit({ enabled: event.target.checked }),
        }),
        React.createElement('span', { className: 'dsh_arm_toggleText' },
          React.createElement('span', { className: 'dsh_arm_toggleTitle' }, t('enabled')),
          React.createElement('span', { className: 'dsh_arm_toggleDesc' }, t('enabledDesc')),
        ),
      ),

      React.createElement('div', { className: 'dsh_arm_fields' },
        armField(t('provider'), React.createElement(ARMSelect, {
          value: draft.provider,
          onChange: (value: string) => applyNext((prev) => draftAfterProvider(prev, value)),
          placeholder: t('providerEmpty'),
          label: t('provider'),
          options: providerOptions,
          disabled: controlsDisabled || !draft.enabled,
        })),
        armField(t('model'), React.createElement(ARMSelect, {
          value: draft.model,
          onChange: (value: string) => applyNext((prev) => draftAfterModel(prev, value, groups)),
          placeholder: draft.provider === '' ? t('inheritModel') : t('modelPlaceholder'),
          label: t('model'),
          options: modelOptions,
          disabled: controlsDisabled || !draft.enabled || draft.provider === '' || availableModels.length === 0,
        })),
        armField(t('effort'), React.createElement(ARMSelect, {
          value: draft.reasoningEffort,
          onChange: (value: string) => edit({ reasoningEffort: value }),
          placeholder: t('effortDefault'),
          label: t('effort'),
          options: effortOptions,
          disabled: controlsDisabled || !draft.enabled || (draft.reasoningEffort === '' && (draft.model === '' || availableEfforts.length === 0)),
        })),
      ),

      draft.enabled && draft.provider !== '' && draft.model === ''
        ? React.createElement('p', { className: 'dsh_arm_hint' }, t('incompleteRouteHint'))
        : null,

      React.createElement('div', { className: 'dsh_arm_actions' },
        dirty && !loading
          ? React.createElement('span', { className: 'dsh_arm_unsaved' }, t('unsaved'))
          : null,
        React.createElement('button', {
          type: 'button',
          className: 'dsh_arm_button dsh_arm_buttonSecondary',
          disabled: formBusy,
          onClick: () => {
            void reloadSettings();
          },
        }, t('reload')),
        React.createElement('button', {
          type: 'button',
          className: 'dsh_arm_button dsh_arm_buttonSecondary',
          disabled: formBusy || !dirty,
          onClick: discard,
        }, t('discard')),
        React.createElement('button', {
          type: 'button',
          className: 'dsh_arm_button dsh_arm_buttonPrimary' + (dirty ? ' dsh_arm_buttonDirty' : ''),
          disabled: formBusy || !loaded || !dirty,
          onClick: () => {
            void handleSave();
          },
        }, busy ? t('saving') : t('save')),
      ),

      loading
        ? React.createElement('p', { className: 'dsh_arm_status', role: 'status' }, t('loading'))
        : null,
      status !== null
        ? React.createElement('p', { className: statusClass, role: 'status' }, status.text)
        : null,
    );
  }

  function apply(ctx: ClientContext): void {
    adoptStyles();
    const slots = ctx.get('slots');
    const locale = ctx.get('locale');
    const remote = ctx.get('remote');
    if (!slots || !locale || !remote) return;

    ctx.effect(() => locale.register(NS, { zh, en }), 'auto-review-model: dictionaries');
    const t = locale.bind(NS);

    slots.inject('plugins.bundle.config', () => slots.register({
      name: 'plugins.bundle.config',
      key: BUNDLE,
      locale: NS,
      inject: () => ({ t, remote }),
    }, ReviewerModelConfig));
  }

  const inject = ['slots', 'locale', 'remote', 'remote.settings', 'remote.session'];
  const name = 'dsh-auto-review-model';

  const __testing = {
    NS,
    BUNDLE,
    DEFAULT_SETTINGS,
    normalizeSettings,
    namespaceSection,
    providerGroups,
    modelsFor,
    effortsFor,
    draftAfterProvider,
    draftAfterModel,
    reconcileDraft,
    summaryLine,
    loadReviewerSettings,
    saveReviewerSettings,
  };

  exports.apply = apply;
  exports.inject = inject;
  exports.name = name;
  exports.__testing = __testing;
  return module.exports;
} });
