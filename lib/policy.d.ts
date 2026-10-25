/**
 * Pure policy helpers for `@aghost-prj/dsh-auto-review-model`.
 *
 * This module deliberately imports nothing: request classification and config
 * reading are synchronous, side-effect-free operations that the host entry can
 * compose with Cordis and schemastery. Keeping them separate also lets the host
 * tests exercise the policy without a live loader or LLM service.
 */
/** Fixed first line of the auto-review reviewer request's system prompt. */
export declare const REVIEW_POLICY_PREFIX = "REVIEW_POLICY\n";
/** Sentence that identifies the one pending-call reviewer request. */
export declare const REVIEW_POLICY_MARKER = "You are the final authorization reviewer for exactly one pending tool call.";
/** Separator used in the model-capability cache key (`provider\0model`). */
export declare const EFFORT_CACHE_SEPARATOR = "\0";
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
export declare function isAutoReviewRequest(options: unknown): boolean;
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
export declare function normalizeEffort(value: unknown): string;
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
export declare function readReviewerSettings(config: ReviewerConfig | undefined): ReviewerSettings;
/**
 * Whether a complete configured route should replace the reviewer route.
 *
 * An incomplete route is not half-applied: replacing only the provider or only
 * the model would mix two unrelated routes, so both halves must be non-empty.
 *
 * @param {{ enabled: boolean, provider: string, model: string }} settings - live settings.
 * @returns {boolean} true when the route override is active.
 */
export declare function shouldOverrideRoute(settings: Pick<ReviewerSettings, 'enabled' | 'provider' | 'model'>): boolean;
/**
 * Build the model-capability cache key for one exact route.
 *
 * @param {string} provider - provider id.
 * @param {string} model - model id.
 * @returns {string} `provider\u0000model`.
 */
export declare function effortCacheKey(provider: string, model: string): string;
