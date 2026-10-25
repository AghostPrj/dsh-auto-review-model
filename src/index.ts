/**
 * Host entry for `@local/dsh-auto-review-model`.
 *
 * The plugin installs one globally prepended `llm/stream` waterfall listener.
 * When the experimental auto-review package asks the LLM service to classify a
 * pending tool call, the listener rewrites only that request from the fixed
 * reviewer route to the provider/model (and optional reasoning effort) chosen
 * in this plugin's settings. Every other request passes through untouched.
 *
 * Rewriting is performed on a fresh object because auto-review freezes its
 * `GenerateOptions` with `deepFreeze`. The rewritten object is then streamed
 * through `ctx.llm.stream`, which re-enters the same waterfall; a `WeakSet`
 * marks that object so the listener forwards it immediately instead of
 * rewriting it again. Each reviewer request is therefore rewritten exactly
 * once, with no recursion.
 *
 * @module @local/dsh-auto-review-model
 */
import z from '@deepseek-ai/schemastery';
import {
  effortCacheKey,
  isAutoReviewRequest,
  normalizeEffort,
  readReviewerSettings,
  shouldOverrideRoute,
} from './policy.js';
import type { ReviewerConfig, ReviewerSettings } from './policy.js';

/** One adapter-owned reasoning effort advertised for an exact route. */
interface LlmEffortInfo {
  id?: string;
}

/** The subset of `LlmModelInfo` this listener consults. */
interface LlmModelInfo {
  reasoning?: {
    efforts?: readonly LlmEffortInfo[];
  };
}

/** The `GenerateOptions` fields the listener reads or rewrites. */
interface GenerateOptions {
  provider: string;
  model: string;
  system?: string;
  reasoningEffort?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

/** The subset of the `llm` service used by this plugin. */
interface LlmService {
  stream(options: GenerateOptions): AsyncIterable<unknown>;
  resolveModelInfo(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmModelInfo | undefined>;
}

/** Cordis listener options used by this plugin's waterfall registration. */
interface ListenerOptions {
  global?: boolean;
  prepend?: boolean;
}

/** The subset of the host context used by this plugin. */
interface HostContext {
  llm: LlmService;
  on(
    event: string,
    listener: (...args: any[]) => any,
    options?: ListenerOptions,
  ): unknown;
}

/** Loader line id used by the host entry. */
export const name = 'auto-review-model';

/** Host services required before the listener may be installed. */
export const inject = ['llm'];

/**
 * Review-model settings. All fields are volatile so the settings UI can update
 * them in place; the listener always reads their current values per request.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  provider: z.string().default('').volatile(),
  model: z.string().default('').volatile(),
  reasoningEffort: z.string().default('').volatile(),
});

/** Reasoning capability cache tracking generations to guard against stale writes. */
interface CapabilityCache {
  generation: number;
  entries: Map<string, Set<string> | null>;
  clear(): void;
}

/** Construct an empty capability cache. */
function createCapabilityCache(): CapabilityCache {
  return {
    generation: 0,
    entries: new Map(),
    clear() {
      this.generation += 1;
      this.entries.clear();
    },
  };
}

/**
 * Ask the live LLM service whether one exact route advertises an effort.
 *
 * Capability lookups are cached per `provider\0model` because
 * `resolveModelInfo` is an async service call and reviewer requests may be
 * frequent. Both positive and failed lookups are cached; the cache is cleared
 * on `loader/volatile-update` or `llm/adapters-updated` so reconfiguring a route
 * or changing adapter topology picks up fresh capabilities. An absent `reasoning`
 * block means the route advertises no efforts, so the configured effort must
 * be dropped rather than sent.
 *
 * If the optional AbortSignal is already aborted before querying, the result
 * must not be written to the capability cache. If the query throws or the route
 * is unavailable, the failure is cached (unless pre-aborted or stale generation)
 * and false is returned to preserve fail-safe behavior: provider/model override
 * is kept and reasoningEffort is omitted without throwing errors to waterfall
 * listeners or reviewers.
 *
 * Lookups track cache generation so older asynchronous queries that settle
 * after cache invalidation do not overwrite newer cached capabilities.
 *
 * @param {HostContext} ctx - plugin context exposing `llm`.
 * @param {CapabilityCache} cache - capability cache with generation tracking.
 * @param {string} provider - target provider id.
 * @param {string} model - target model id.
 * @param {string} effort - normalized configured effort.
 * @param {AbortSignal} [signal] - optional cancellation signal from reviewer request.
 * @returns {Promise<boolean>} true only when the route advertises this effort.
 */
async function isEffortSupported(
  ctx: HostContext,
  cache: CapabilityCache,
  provider: string,
  model: string,
  effort: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const key = effortCacheKey(provider, model);
  if (!cache.entries.has(key)) {
    if (signal?.aborted) {
      return false;
    }
    const startGen = cache.generation;
    let efforts: Set<string> | null = null;
    try {
      const info = await ctx.llm.resolveModelInfo(provider, model, signal);
      const advertised = info?.reasoning?.efforts;
      efforts = new Set(
        Array.isArray(advertised)
          ? advertised
              .map((entry) => entry?.id)
              .filter((id): id is string => id !== undefined)
          : [],
      );
    } catch {
      // A failed lookup cannot prove support. Remember the failure until the
      // next settings or adapter change, but keep the provider/model override intact.
      if (!signal?.aborted && cache.generation === startGen) {
        cache.entries.set(key, null);
      }
      return false;
    }
    if (!signal?.aborted && cache.generation === startGen) {
      cache.entries.set(key, efforts);
    }
    return efforts.has(effort);
  }
  const efforts = cache.entries.get(key);
  return efforts instanceof Set && efforts.has(effort);
}

/**
 * Copy one frozen reviewer request and rewrite its route once.
 *
 * The generator defers the capability lookup until iteration, which keeps the
 * `llm/stream` listener itself synchronous (the waterfall returns listener
 * results without awaiting them) while still allowing an async
 * `resolveModelInfo` call before the downstream stream starts.
 *
 * @param {HostContext} ctx - plugin context exposing `llm`.
 * @param {GenerateOptions} options - frozen original reviewer `GenerateOptions`.
 * @param {ReviewerSettings} settings - live settings.
 * @param {WeakSet<object>} patchedRequests - objects already rewritten.
 * @param {CapabilityCache} effortCache - capability cache.
 * @returns {AsyncGenerator<unknown>} the rewritten request's chunk stream.
 */
async function* rewriteAutoReviewStream(
  ctx: HostContext,
  options: GenerateOptions,
  settings: ReviewerSettings,
  patchedRequests: WeakSet<object>,
  effortCache: CapabilityCache,
): AsyncGenerator<unknown> {
  const patched: GenerateOptions = {
    ...options,
    provider: settings.provider,
    model: settings.model,
  };
  const effort = settings.reasoningEffort;
  if (
    effort !== '' &&
    (await isEffortSupported(ctx, effortCache, settings.provider, settings.model, effort, options.signal))
  ) {
    patched.reasoningEffort = effort;
  } else {
    // No configured effort, an unsupported one, or a failed capability lookup:
    // the provider default applies, so never forward a stale caller effort.
    delete patched.reasoningEffort;
  }
  patchedRequests.add(patched);
  yield* ctx.llm.stream(patched);
}

/**
 * Install the reviewer-model override.
 *
 * @param {HostContext} ctx - Cordis context with `on` and `llm`.
 * @param {ReviewerConfig} config - injected volatile settings.
 */
export function apply(ctx: HostContext, config: ReviewerConfig): void {
  /** Requests already rewritten by this listener, so re-entry is a no-op. */
  const patchedRequests = new WeakSet<object>();

  /** Exact-route reasoning capability cache; cleared on settings or adapter changes. */
  const effortCache = createCapabilityCache();

  ctx.on(
    'loader/volatile-update',
    () => {
      effortCache.clear();
    },
    { global: true },
  );

  ctx.on(
    'llm/adapters-updated',
    () => {
      effortCache.clear();
    },
    { global: true },
  );

  ctx.on(
    'llm/stream',
    (options: GenerateOptions, next: () => AsyncIterable<unknown>): AsyncIterable<unknown> => {
      if (
        options === null ||
        typeof options !== 'object' ||
        patchedRequests.has(options) ||
        !isAutoReviewRequest(options)
      ) {
        return next();
      }
      const settings = readReviewerSettings(config);
      if (!shouldOverrideRoute(settings)) return next();
      return rewriteAutoReviewStream(ctx, options, settings, patchedRequests, effortCache);
    },
    { global: true, prepend: true },
  );
}

/** Stable surface for host tests; not part of the plugin contract. */
export const __testing = {
  isAutoReviewRequest,
  readReviewerSettings,
  normalizeEffort,
  shouldOverrideRoute,
  effortCacheKey,
};
