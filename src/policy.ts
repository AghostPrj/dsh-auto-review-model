/**
 * Pure policy helpers for `@aghost-prj/dsh-auto-review-model`.
 *
 * This module deliberately imports nothing: request classification and config
 * reading are synchronous, side-effect-free operations that the host entry can
 * compose with Cordis and schemastery. Keeping them separate also lets the host
 * tests exercise the policy without a live loader or LLM service.
 */

/** Fixed first line of the auto-review reviewer request's system prompt. */
export const REVIEW_POLICY_PREFIX = 'REVIEW_POLICY\n';

/** Sentence that identifies the one pending-call reviewer request. */
export const REVIEW_POLICY_MARKER =
  'You are the final authorization reviewer for exactly one pending tool call.';

/** Separator used in the model-capability cache key (`provider\0model`). */
export const EFFORT_CACHE_SEPARATOR = '\u0000';

/** Value that means "no explicit reasoning effort was configured". */
const EFFORT_INHERIT = '';

/** A Cordis volatile config field: the live value is read through `get()`. */
export interface ConfigRef<T> {
  get(): T;
}

/** A config field can be a live ref (Host) or a plain value (tests/direct callers). */
export type ConfigValue<T> = T | ConfigRef<T> | undefined;

/** The four reviewer settings accepted by the host entry. */
export interface ReviewerConfig {
  enabled?: ConfigValue<boolean>;
  provider?: ConfigValue<string>;
  model?: ConfigValue<string>;
  reasoningEffort?: ConfigValue<string>;
}

/** Normalized reviewer settings read from one live config snapshot. */
export interface ReviewerSettings {
  enabled: boolean;
  provider: string;
  model: string;
  reasoningEffort: string;
}

/**
 * Whether one `llm/stream` request is the experimental auto-review call.
 *
 * Only the reviewer prompt is rewritten. Every other request, including other
 * hand-built one-shot calls that happen to start with the same first line, must
 * reach `next()` untouched.
 *
 * @param {unknown} options - candidate `GenerateOptions` value.
 * @returns {boolean} true when the fixed policy prefix and marker are present.
 */
export function isAutoReviewRequest(options: unknown): boolean {
  if (options === null || typeof options !== 'object') return false;
  const system = (options as { system?: unknown }).system;
  return (
    typeof system === 'string' &&
    system.startsWith(REVIEW_POLICY_PREFIX) &&
    system.includes(REVIEW_POLICY_MARKER)
  );
}

/**
 * Normalize one configured reasoning effort.
 *
 * The settings UI may store an empty value or an inherit/default sentinel when
 * the user does not want an explicit effort. Every other trimmed token is kept
 * verbatim; the caller still has to prove that the target model advertises it,
 * because effort ids are adapter-owned rather than a fixed harness vocabulary.
 *
 * @param {unknown} value - raw configured value.
 * @returns {string} a trimmed effort id, or `''` for "inherit".
 */
export function normalizeEffort(value: unknown): string {
  if (value === undefined || value === null) return EFFORT_INHERIT;
  const effort = String(value).trim();
  if (effort === EFFORT_INHERIT || effort === 'default' || effort === 'inherit') {
    return EFFORT_INHERIT;
  }
  return effort;
}

/**
 * Read one config entry. Loader config entries are volatile refs, but accepting
 * a plain value keeps this helper usable in tests and from direct callers.
 *
 * @param {unknown} entry - a ref-like value or a plain config value.
 * @returns {unknown} the current value.
 */
function readConfigValue<T>(entry: ConfigValue<T>): T | undefined {
  if (entry !== null && typeof entry === 'object' && typeof (entry as ConfigRef<T>).get === 'function') {
    return (entry as ConfigRef<T>).get();
  }
  return entry as T | undefined;
}

/**
 * Read the four live reviewer settings.
 *
 * The host calls this once per intercepted request rather than caching a
 * snapshot, so a `loader/volatile-update` change takes effect on the very next
 * reviewer call without restarting the plugin.
 *
 * @param {object | undefined} config - injected config object of refs or values.
 * @returns {{ enabled: boolean, provider: string, model: string, reasoningEffort: string }}
 */
export function readReviewerSettings(config: ReviewerConfig | undefined): ReviewerSettings {
  const source = config ?? {};
  const provider = readConfigValue(source.provider);
  const model = readConfigValue(source.model);
  return {
    enabled: readConfigValue(source.enabled) !== false,
    provider: provider === undefined || provider === null ? '' : String(provider).trim(),
    model: model === undefined || model === null ? '' : String(model).trim(),
    reasoningEffort: normalizeEffort(readConfigValue(source.reasoningEffort)),
  };
}

/**
 * Whether a complete configured route should replace the reviewer route.
 *
 * An incomplete route is not half-applied: replacing only the provider or only
 * the model would mix two unrelated routes, so both halves must be non-empty.
 *
 * @param {{ enabled: boolean, provider: string, model: string }} settings - live settings.
 * @returns {boolean} true when the route override is active.
 */
export function shouldOverrideRoute(
  settings: Pick<ReviewerSettings, 'enabled' | 'provider' | 'model'>,
): boolean {
  return settings.enabled && settings.provider !== '' && settings.model !== '';
}

/**
 * Build the model-capability cache key for one exact route.
 *
 * @param {string} provider - provider id.
 * @param {string} model - model id.
 * @returns {string} `provider\u0000model`.
 */
export function effortCacheKey(provider: string, model: string): string {
  return `${provider}${EFFORT_CACHE_SEPARATOR}${model}`;
}
