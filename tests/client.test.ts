/**
 * Client-half tests for `@aghost-prj/dsh-auto-review-model`.
 *
 * The browser bundle is a plain CJS factory registered through
 * `window.__ModuleLoader__.load`. These tests emulate only the loader and the
 * `react` module; no component is ever rendered. The exported `__testing`
 * helpers are exercised directly so the behavior that matters for a correct
 * settings form (normalization, catalog lookup, draft transitions and the
 * settings RPC shape) is covered without a DOM or a browser.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const TARGET_BUNDLE = '@deepseek-ai/dsh-experimental-auto-review';
const SETTINGS_NS = 'auto-review-model';

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
  useCallback<T extends (...args: unknown[]) => unknown>(callback: T, dependencies?: readonly unknown[]): T;
  useRef<T>(initial: T): { current: T };
}

/** Minimal, predictable React surface. Components are never rendered. */
const fakeReact: ReactLike = {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): ReactElementLike {
    const nextProps: Record<string, unknown> = props === null || props === undefined ? {} : { ...props };
    if (children.length === 1) nextProps.children = children[0];
    else if (children.length > 1) nextProps.children = children;
    return { type, props: nextProps };
  },
  useState<T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
    let value = typeof initial === 'function' ? (initial as () => T)() : initial;
    const setValue = (next: T | ((previous: T) => T)): void => {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    };
    return [value, setValue];
  },
  useEffect(): void {},
  useRef<T>(initial: T): { current: T } {
    return { current: initial === undefined ? (null as T) : initial };
  },
  useCallback<T extends (...args: unknown[]) => unknown>(callback: T): T {
    return callback;
  },
};

interface ModuleLoaderEntry {
  id: string;
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>;
}

interface WindowLike {
  __ModuleLoader__: {
    load(entry: ModuleLoaderEntry): void;
  };
  [key: string]: unknown;
}

/** Captures the single bundle registration performed while importing the file. */
let capturedEntry: ModuleLoaderEntry | null = null;

(globalThis as unknown as { window: WindowLike }).window = {
  __ModuleLoader__: {
    load(entry: ModuleLoaderEntry): void {
      capturedEntry = entry;
    },
  },
};

let importError: Error | null = null;
try {
  const clientUrl = import.meta.resolve('@aghost-prj/dsh-auto-review-model/client');
  await import(clientUrl);
} catch (error) {
  importError = error as Error;
}

interface ReviewerSettings {
  enabled: boolean;
  provider: string;
  model: string;
  reasoningEffort: string;
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

interface RemoteResponse<T = unknown> {
  ok?: boolean;
  value?: T;
  error?: unknown;
  revision?: number;
}

interface LoadResultOk {
  ok: true;
  value: ReviewerSettings;
  revision: number | undefined;
  groups: ProviderGroup[];
  catalogError: string;
}

interface LoadResultErr {
  ok: false;
  error: unknown;
}

type LoadResult = LoadResultOk | LoadResultErr;

interface ClientTesting {
  NS: string;
  BUNDLE: string;
  DEFAULT_SETTINGS: ReviewerSettings;
  normalizeSettings(raw?: unknown): ReviewerSettings;
  namespaceSection(value: unknown): unknown;
  providerGroups(catalog: unknown): ProviderGroup[];
  modelsFor(groups: unknown, provider: unknown): ModelInfo[];
  effortsFor(model: unknown): EffortInfo[];
  draftAfterProvider(draft: unknown, provider: unknown): ReviewerSettings;
  draftAfterModel(draft: unknown, modelId: unknown, groups: unknown): ReviewerSettings;
  reconcileDraft(value: unknown, groups?: unknown): ReviewerSettings;
  summaryLine(draft: ReviewerSettings, loading: boolean, t: (key: string) => string): string;
  loadReviewerSettings(remote: unknown, ns: string): Promise<LoadResult>;
  saveReviewerSettings(remote: unknown, ns: string, draft: unknown, revision?: number): Promise<RemoteResponse>;
}

interface ClientExports {
  apply(ctx: unknown): void;
  inject: string[];
  name: string;
  __testing: ClientTesting;
}

/** Factory-instantiated client exports, populated by the suite's `before`. */
let client: ClientExports;

test.before(() => {
  assert.equal(
    importError,
    null,
    `client failed to import: ${importError?.stack ?? ''}`,
  );
  assert.ok(capturedEntry, 'client did not call window.__ModuleLoader__.load');
  const entry = capturedEntry as ModuleLoaderEntry;
  assert.equal(entry.id, '@aghost-prj/dsh-auto-review-model');
  assert.equal(typeof entry.factory, 'function');
  client = entry.factory((specifier: string): unknown => {
    assert.equal(specifier, 'react', 'the bundle may only require react');
    return fakeReact;
  }) as unknown as ClientExports;
});

function testing(): ClientTesting {
  assert.ok(client, 'the client bundle did not expose exports');
  assert.ok(client.__testing, 'the client bundle did not export __testing');
  return client.__testing;
}

const GROUPS: ProviderGroup[] = [
  {
    id: 'provider-a',
    name: 'Provider A',
    models: [
      {
        id: 'model-a1',
        name: 'Model A1',
        reasoning: {
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'high', name: 'High' },
          ],
          defaultEffort: 'low',
        },
      },
      {
        id: 'model-a2',
        name: 'Model A2',
        reasoning: {
          efforts: [{ id: 'low', name: 'Low' }],
          defaultEffort: 'low',
        },
      },
      { id: 'model-a3', name: 'Model A3' },
    ],
  },
  { id: 'provider-b', name: 'Provider B', models: [] },
];

test('exports the plugin surface expected by the client loader', () => {
  assert.equal(typeof client.apply, 'function');
  assert.ok(Array.isArray(client.inject));
  for (const service of ['slots', 'locale', 'remote', 'remote.settings', 'remote.session']) {
    assert.ok(client.inject.includes(service), `inject is missing ${service}`);
  }
  assert.equal(client.inject.length, 5, 'inject must not declare services the client does not use');
  assert.equal(typeof client.name, 'string');
  assert.ok(client.name.length > 0);
  assert.equal(typeof client.__testing, 'object');
  for (const helper of [
    'normalizeSettings',
    'namespaceSection',
    'modelsFor',
    'effortsFor',
    'draftAfterProvider',
    'draftAfterModel',
    'reconcileDraft',
    'summaryLine',
    'loadReviewerSettings',
    'saveReviewerSettings',
  ] as const) {
    assert.equal(typeof client.__testing[helper], 'function', `__testing.${helper} is missing`);
  }
});

interface Registration {
  meta: {
    name: string;
    key: string;
    locale: string;
    inject: () => { t: unknown; remote: unknown };
  };
  render: unknown;
}

/**
 * Fake Cordis context plus slots/locale/remote services. `slots.inject` is
 * invoked synchronously, matching how the settings page installs keyed
 * contributions.
 */
function createApplyHarness() {
  const registrations: Registration[] = [];
  const injectedKeys: string[] = [];
  const localeRegistrations: { ns: string; dictionaries: unknown }[] = [];
  const localeBinds: string[] = [];
  const effects: (string | undefined)[] = [];
  const t = (key: string) => `t:${key}`;
  const remote = {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [] } }),
      replace: async () => ({ ok: true }),
    },
    session: {
      modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
    },
  };
  const slots = {
    inject(key: string, callback: () => unknown) {
      injectedKeys.push(key);
      assert.equal(typeof callback, 'function');
      return callback();
    },
    register(meta: Registration['meta'], render: unknown) {
      registrations.push({ meta, render });
      return meta;
    },
  };
  const locale = {
    register(ns: string, dictionaries: unknown) {
      localeRegistrations.push({ ns, dictionaries });
      return () => {};
    },
    bind(ns: string) {
      localeBinds.push(ns);
      return t;
    },
  };
  const services: Record<string, unknown> = {
    slots,
    locale,
    remote,
    'remote.settings': remote.settings,
    'remote.session': remote.session,
  };
  const ctx = {
    get(service: string) {
      return services[service];
    },
    effect(callback: () => (() => void) | void, label?: string) {
      effects.push(label);
      const result = callback();
      return typeof result === 'function' ? result : () => {};
    },
  };
  return {
    ctx,
    remote,
    t,
    registrations,
    injectedKeys,
    localeRegistrations,
    localeBinds,
    effects,
  };
}

test('apply registers the auto-review bundle configuration page', () => {
  const harness = createApplyHarness();
  client.apply(harness.ctx);

  assert.ok(
    harness.injectedKeys.includes('plugins.bundle.config'),
    'apply must inject into plugins.bundle.config',
  );
  const registration = harness.registrations.find(
    ({ meta }) => meta.name === 'plugins.bundle.config',
  );
  assert.ok(registration, 'no plugins.bundle.config entry was registered');
  assert.equal(registration.meta.key, TARGET_BUNDLE);
  assert.equal(registration.meta.locale, SETTINGS_NS);
  assert.equal(typeof registration.meta.inject, 'function');

  const injected = registration.meta.inject();
  assert.equal(injected.t, harness.t);
  assert.equal(injected.remote, harness.remote);

  assert.ok(
    harness.localeRegistrations.some(({ ns }) => ns === SETTINGS_NS),
    'apply must register the auto-review-model locale dictionaries',
  );
  assert.ok(
    harness.localeBinds.includes(SETTINGS_NS),
    'apply must bind the auto-review-model translator',
  );

  // Verify registered zh and en dictionaries align exactly in keys
  const reg = harness.localeRegistrations.find(({ ns }) => ns === SETTINGS_NS);
  assert.ok(reg);
  const dicts = reg.dictionaries as { zh: Record<string, string>; en: Record<string, string> };
  assert.ok(dicts.zh && dicts.en);
  const zhKeys = Object.keys(dicts.zh).sort();
  const enKeys = Object.keys(dicts.en).sort();
  assert.deepEqual(zhKeys, enKeys, 'zh and en dictionary keys must be identical');
  assert.equal(zhKeys.includes('summaryModelFallback'), false, 'dead key summaryModelFallback must be removed');
  assert.ok(zhKeys.includes('unverified'), 'unverified key must exist');
  assert.ok(zhKeys.includes('notAdvertised'), 'notAdvertised key must exist');
});

test('normalizeSettings supplies the four defaults for missing input', () => {
  const expected: ReviewerSettings = {
    enabled: true,
    provider: '',
    model: '',
    reasoningEffort: '',
  };
  assert.deepEqual(testing().normalizeSettings(), expected);
  assert.deepEqual(testing().normalizeSettings(undefined), expected);
  assert.deepEqual(testing().normalizeSettings(null), expected);
});

test('normalizeSettings trims strings and honors an explicit disabled flag', () => {
  assert.deepEqual(
    testing().normalizeSettings({
      enabled: false,
      provider: '  provider-a  ',
      model: '  model-a1  ',
      reasoningEffort: '  high  ',
    }),
    {
      enabled: false,
      provider: 'provider-a',
      model: 'model-a1',
      reasoningEffort: 'high',
    },
  );
});

test('normalizeSettings tolerates dirty field values without throwing', () => {
  const normalized = testing().normalizeSettings({
    enabled: 'not-a-boolean',
    provider: 42,
    model: { unexpected: true },
    reasoningEffort: false,
  });
  assert.deepEqual(Object.keys(normalized).sort(), [
    'enabled',
    'model',
    'provider',
    'reasoningEffort',
  ]);
  assert.equal(typeof normalized.enabled, 'boolean');
  assert.equal(typeof normalized.provider, 'string');
  assert.equal(typeof normalized.model, 'string');
  assert.equal(typeof normalized.reasoningEffort, 'string');
});

test('namespaceSection unwraps namespace view and leaves regular sections intact', () => {
  const { namespaceSection } = testing();

  // Namespace view object { ns, value, revision } -> extracts value
  const view = {
    ns: 'auto-review-model',
    value: {
      enabled: false,
      provider: 'prov-1',
      model: 'mod-1',
      reasoningEffort: 'low',
    },
    revision: 5,
  };
  assert.deepEqual(namespaceSection(view), view.value);

  // View with primitive value
  assert.equal(namespaceSection({ ns: 'test', value: 'hello', revision: 1 }), 'hello');

  // Plain section object without ns -> returns as-is
  const plain = { enabled: true, provider: 'prov-2' };
  assert.equal(namespaceSection(plain), plain);

  // Primitive inputs -> returns as-is
  assert.equal(namespaceSection(null), null);
  assert.equal(namespaceSection(undefined), undefined);
  assert.equal(namespaceSection('string-val'), 'string-val');
  assert.equal(namespaceSection(123), 123);
  assert.equal(namespaceSection(false), false);
});

test('reconcileDraft retains provider, model, and reasoningEffort when catalog is empty or missing', () => {
  const { reconcileDraft } = testing();
  const savedSettings: ReviewerSettings = {
    enabled: true,
    provider: 'provider-custom',
    model: 'model-custom',
    reasoningEffort: 'high',
  };

  // With empty catalog groups
  assert.deepEqual(reconcileDraft(savedSettings, []), savedSettings);

  // With undefined / null groups
  assert.deepEqual(reconcileDraft(savedSettings, undefined), savedSettings);
  assert.deepEqual(reconcileDraft(savedSettings, null), savedSettings);

  // Normalizes whitespace in fields without dropping any field
  assert.deepEqual(
    reconcileDraft({
      enabled: false,
      provider: '  prov  ',
      model: '  mod  ',
      reasoningEffort: '  med  ',
    }, []),
    {
      enabled: false,
      provider: 'prov',
      model: 'mod',
      reasoningEffort: 'med',
    },
  );
});

test('providerGroups parses various catalog shapes and filters invalid entries', () => {
  const { providerGroups } = testing();
  assert.deepEqual(providerGroups(GROUPS), GROUPS);
  assert.deepEqual(providerGroups({ groups: GROUPS }), GROUPS);
  assert.deepEqual(providerGroups({ value: { groups: GROUPS } }), GROUPS);
  assert.deepEqual(providerGroups(null), []);
  assert.deepEqual(providerGroups(undefined), []);
  assert.deepEqual(providerGroups({ groups: [{ id: '', name: 'Empty' }] }), []);
  assert.deepEqual(providerGroups([{ id: 'p1' }]), [{ id: 'p1', name: 'p1', models: [] }]);
});

test('modelsFor selects the models of one provider group', () => {
  assert.deepEqual(testing().modelsFor(GROUPS, 'provider-a'), GROUPS[0].models);
  assert.deepEqual(testing().modelsFor(GROUPS, 'provider-b'), []);
  assert.deepEqual(testing().modelsFor(GROUPS, 'missing'), []);
  assert.deepEqual(testing().modelsFor(undefined, 'provider-a'), []);
  assert.deepEqual(testing().modelsFor(GROUPS, ''), []);
});

test('effortsFor normalizes advertised reasoning efforts to id/name entries', () => {
  assert.deepEqual(testing().effortsFor(GROUPS[0].models[0]), [
    { id: 'low', name: 'Low' },
    { id: 'high', name: 'High' },
  ]);
  assert.deepEqual(testing().effortsFor({ reasoning: { efforts: [' low ', 'high'] } }), [
    { id: 'low', name: 'low' },
    { id: 'high', name: 'high' },
  ]);
  assert.deepEqual(testing().effortsFor(GROUPS[0].models[2]), []);
  assert.deepEqual(testing().effortsFor(undefined), []);
  assert.deepEqual(testing().effortsFor({ reasoning: { efforts: [] } }), []);
});

test('draftAfterProvider clears model and effort on switch, but is a no-op when selecting current provider', () => {
  const draft: ReviewerSettings = {
    enabled: false,
    provider: 'provider-a',
    model: 'model-a1',
    reasoningEffort: 'high',
  };
  // Switching provider clears model and effort
  assert.deepEqual(testing().draftAfterProvider(draft, 'provider-b'), {
    enabled: false,
    provider: 'provider-b',
    model: '',
    reasoningEffort: '',
  });
  assert.deepEqual(testing().draftAfterProvider(draft, ''), {
    enabled: false,
    provider: '',
    model: '',
    reasoningEffort: '',
  });
  // Re-selecting the same provider is a no-op and preserves model and effort
  assert.deepEqual(testing().draftAfterProvider(draft, 'provider-a'), draft);
  assert.deepEqual(testing().draftAfterProvider(draft, '  provider-a  '), draft);

  // Original draft remains intact
  assert.deepEqual(draft, {
    enabled: false,
    provider: 'provider-a',
    model: 'model-a1',
    reasoningEffort: 'high',
  });
});

test('draftAfterModel drops effort when switching model, but is a no-op when selecting current model', () => {
  const draft: ReviewerSettings = {
    enabled: true,
    provider: 'provider-a',
    model: 'model-a1',
    reasoningEffort: 'high',
  };
  // Switching to model without high drops reasoningEffort
  assert.deepEqual(testing().draftAfterModel(draft, 'model-a2', GROUPS), {
    enabled: true,
    provider: 'provider-a',
    model: 'model-a2',
    reasoningEffort: '',
  });
  assert.deepEqual(testing().draftAfterModel(draft, 'model-a3', GROUPS), {
    enabled: true,
    provider: 'provider-a',
    model: 'model-a3',
    reasoningEffort: '',
  });
  // Re-selecting the same model preserves existing draft even if not in catalog
  assert.deepEqual(testing().draftAfterModel(draft, 'model-a1', GROUPS), draft);
  assert.deepEqual(testing().draftAfterModel(draft, '  model-a1  ', GROUPS), draft);

  const unknownDraft: ReviewerSettings = {
    enabled: true,
    provider: 'provider-a',
    model: 'model-unknown-not-in-catalog',
    reasoningEffort: 'high',
  };
  assert.deepEqual(
    testing().draftAfterModel(unknownDraft, 'model-unknown-not-in-catalog', GROUPS),
    unknownDraft,
    're-selecting current unknown model must not clear reasoningEffort',
  );

  assert.deepEqual(
    testing().draftAfterModel({ ...draft, reasoningEffort: '' }, 'model-a2', GROUPS),
    { ...draft, model: 'model-a2', reasoningEffort: '' },
  );
});

test('loadReviewerSettings reads settings and the model catalog', async () => {
  let describeCalls = 0;
  let catalogCalls = 0;
  let describeArgs: unknown[] | null = null;
  let catalogArgs: unknown[] | null = null;
  const remote = {
    settings: {
      describe: async (...args: unknown[]) => {
        describeCalls += 1;
        describeArgs = args;
        return {
          ok: true,
          value: {
            namespaces: [
              { ns: 'other-plugin', value: {}, revision: 1 },
              {
                ns: SETTINGS_NS,
                value: {
                  enabled: false,
                  provider: 'provider-a',
                  model: 'model-a1',
                  reasoningEffort: 'high',
                },
                revision: 11,
              },
            ],
          },
        };
      },
      replace: async () => {
        throw new Error('loadReviewerSettings must not write settings');
      },
    },
    session: {
      modelCatalog: async (...args: unknown[]) => {
        catalogCalls += 1;
        catalogArgs = args;
        return { ok: true, value: { groups: GROUPS } };
      },
    },
  };

  const loaded = await testing().loadReviewerSettings(remote, SETTINGS_NS);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value, {
    enabled: false,
    provider: 'provider-a',
    model: 'model-a1',
    reasoningEffort: 'high',
  });
  assert.equal(loaded.revision, 11);
  assert.deepEqual(loaded.groups, GROUPS);
  assert.equal(loaded.catalogError, '');
  assert.equal(describeCalls, 1);
  assert.equal(catalogCalls, 1);
  assert.deepEqual(describeArgs, [], 'settings.describe takes no arguments');
  assert.deepEqual(catalogArgs, [], 'session.modelCatalog takes no arguments');
});

test('loadReviewerSettings returns ok:true with empty groups and catalogError when modelCatalog fails or throws', async () => {
  const expectedSettings: ReviewerSettings = {
    enabled: true,
    provider: 'provider-saved',
    model: 'model-saved',
    reasoningEffort: 'low',
  };

  // Case 1: session.modelCatalog returns ok: false
  const remoteCatalogFailed = {
    settings: {
      describe: async () => ({
        ok: true,
        value: {
          namespaces: [
            {
              ns: SETTINGS_NS,
              value: expectedSettings,
              revision: 20,
            },
          ],
        },
      }),
      replace: async () => ({ ok: true }),
    },
    session: {
      modelCatalog: async () => ({
        ok: false,
        error: { message: 'catalog service timeout' },
      }),
    },
  };

  const res1 = await testing().loadReviewerSettings(remoteCatalogFailed, SETTINGS_NS);
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.deepEqual(res1.value, expectedSettings);
    assert.equal(res1.revision, 20);
    assert.deepEqual(res1.groups, []);
    assert.match(res1.catalogError, /catalog service timeout/);
  }

  // Case 2: session.modelCatalog throws an exception
  const remoteCatalogThrows = {
    settings: {
      describe: async () => ({
        ok: true,
        value: {
          namespaces: [
            {
              ns: SETTINGS_NS,
              value: expectedSettings,
              revision: 21,
            },
          ],
        },
      }),
      replace: async () => ({ ok: true }),
    },
    session: {
      modelCatalog: async () => {
        throw new Error('network disconnected');
      },
    },
  };

  const res2 = await testing().loadReviewerSettings(remoteCatalogThrows, SETTINGS_NS);
  assert.equal(res2.ok, true);
  if (res2.ok) {
    assert.deepEqual(res2.value, expectedSettings);
    assert.equal(res2.revision, 21);
    assert.deepEqual(res2.groups, []);
    assert.match(res2.catalogError, /network disconnected/);
  }
});

test('loadReviewerSettings reports settings RPC failures as { ok: false, error }', async () => {
  const failed = await testing().loadReviewerSettings(
    {
      settings: {
        describe: async () => ({ ok: false, error: { message: 'settings unavailable' } }),
        replace: async () => ({ ok: true }),
      },
      session: {
        modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
      },
    },
    SETTINGS_NS,
  );
  assert.equal(failed.ok, false);
  assert.ok((failed as LoadResultErr).error, 'a failed load must carry an error');

  const thrown = await testing().loadReviewerSettings(
    {
      settings: {
        describe: async () => {
          throw new Error('boom');
        },
        replace: async () => ({ ok: true }),
      },
      session: {
        modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
      },
    },
    SETTINGS_NS,
  );
  assert.equal(thrown.ok, false);
  assert.ok((thrown as LoadResultErr).error, 'a thrown load must carry an error');
});

test('summaryLine correctly reflects enabled, loading, and incomplete routes', () => {
  const { summaryLine } = testing();
  const t = (key: string) => `[${key}]`;

  // Loading
  assert.equal(
    summaryLine({ enabled: true, provider: 'p1', model: 'm1', reasoningEffort: '' }, true, t),
    '[summaryLabel]: [summaryLoading]',
  );

  // Disabled
  assert.equal(
    summaryLine({ enabled: false, provider: 'p1', model: 'm1', reasoningEffort: 'high' }, false, t),
    '[summaryLabel]: [summaryOff]',
  );

  // Inherit session model when provider is empty
  assert.equal(
    summaryLine({ enabled: true, provider: '', model: '', reasoningEffort: '' }, false, t),
    '[summaryLabel]: [summaryInherit]',
  );

  // Incomplete route: provider set but model empty -> must inherit session model
  assert.equal(
    summaryLine({ enabled: true, provider: 'p1', model: '', reasoningEffort: '' }, false, t),
    '[summaryLabel]: [summaryInherit]',
  );

  // Complete route without reasoning effort
  assert.equal(
    summaryLine({ enabled: true, provider: 'p1', model: 'm1', reasoningEffort: '' }, false, t),
    '[summaryLabel]: p1 / m1',
  );

  // Complete route with reasoning effort
  assert.equal(
    summaryLine({ enabled: true, provider: 'p1', model: 'm1', reasoningEffort: 'high' }, false, t),
    '[summaryLabel]: p1 / m1 · high',
  );
});

test('saveReviewerSettings writes exactly the four fields with the revision', async () => {
  let replaceCalls = 0;
  let replaceArgs: unknown[] | null = null;
  const response: RemoteResponse = { ok: true, revision: 12 };
  const remote = {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [] } }),
      replace: async (...args: unknown[]) => {
        replaceCalls += 1;
        replaceArgs = args;
        return response;
      },
    },
    session: {
      modelCatalog: async () => ({ ok: true, value: { groups: [] } }),
    },
  };
  const draft: ReviewerSettings = {
    enabled: false,
    provider: 'provider-a',
    model: 'model-a1',
    reasoningEffort: 'high',
  };

  const saved = await testing().saveReviewerSettings(remote, SETTINGS_NS, draft, 11);
  assert.equal(saved, response);
  assert.equal(replaceCalls, 1);
  assert.deepEqual(replaceArgs, [
    SETTINGS_NS,
    {
      enabled: false,
      provider: 'provider-a',
      model: 'model-a1',
      reasoningEffort: 'high',
    },
    11,
  ]);
});
