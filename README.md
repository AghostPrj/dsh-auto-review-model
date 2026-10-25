# @aghost-prj/dsh-auto-review-model

Pick a dedicated provider / model / reasoning effort for DSH **Auto review** without changing the model used by the main conversation.

> Experimental. This plugin only rewrites the review request emitted by Auto review. It does not change the review policy, risk classification, or approval behavior.

## Purpose

Before each supported tool call, DSH Auto review asks the current session's provider and model to review the pending call and then allow, deny, or escalate it to the user. By default the review uses the same model as the main conversation.

This plugin recognizes Auto-review requests at the LLM request layer and substitutes the provider, model, and reasoning effort configured on the settings page. Typical uses:

- use a faster, cheaper model for routine reviews to cut latency and token cost;
- use a stronger model for reviews while keeping a lightweight model for the main conversation;
- pin reviews to one model so review behavior does not drift when the session model changes.

Regular chat, subagents, title generation, compaction, and other LLM requests are untouched.

## How it works

- **Request interception**: The host-side plugin listens on `llm/stream` and specifically matches Auto-review requests where the `system` prompt starts with `REVIEW_POLICY\n` and contains the fixed reviewer marker sentence (`You are the final authorization reviewer for exactly one pending tool call.`).
- **Route rewriting**: When enabled and configured with a complete provider/model pair, it clones the frozen request object and replaces `provider`, `model`, and `reasoningEffort`. The original review prompt, risk criteria, and instructions remain unchanged.
- **Reasoning capability lookup**: Before forwarding a configured reasoning effort, the plugin queries the route's capabilities via `resolveModelInfo` (forwarding `AbortSignal`). If the target model advertises support for that effort tier, it is applied; otherwise (or if the lookup fails), the effort is omitted so the provider default applies.
- **Cache invalidation**: Capability lookups are cached per route using a generation/epoch counter to prevent in-flight lookup completions or failures from writing back stale data across invalidations. The cache is invalidated whenever `llm/adapters-updated` or `loader/volatile-update` (listened globally with `global: true` to reliably receive local provider configuration updates) fires.
- **Fail-closed security**: If the specified review route is misconfigured, unavailable, or encounters an error during the review, the review fails and the pending tool call is not executed (fail-closed).

## Install

```sh
# Install from npm registry (after published):
dsh plugin --profile web add @aghost-prj/dsh-auto-review-model

# Or install from local path for development:
dsh plugin --profile web add /home/aghost/workspace/dsh-auto-approval-model-fix
```

The command adds the package as a dependency and bundle layer for the `web` profile. The DSH loader reads `cordis.patch.yml` through the package's `dsh.bundle.patch` and inserts the plugin as the `auto-review-model` layer.

After installing or rebuilding the client, reload the Web profile in the usual DSH way and refresh the page for the configuration panel to appear. Saving settings takes effect on the next review without requiring a session restart.

## Configuration

Open **Settings → Plugins → Auto review** (设置 → 插件 → 自动授权审查).

The **Auto review model** (自动审查模型) configuration section renders directly on that bundle's details page, positioned between **Description** and **Included Components**. It is registered into the `plugins.bundle.config` slot under the key `@deepseek-ai/dsh-experimental-auto-review`.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Master switch. When disabled, reviews fall back to the current session model. |
| `provider` | string | empty | Provider ID for review requests. Leaving it empty inherits the current session model. Must be set together with `model` to activate the override. |
| `model` | string | empty | Model ID for review requests. Must be set together with `provider` to activate the override. |
| `reasoningEffort` | string | empty | Reasoning effort for review requests, applied only when the override is active. Leaving it empty uses the provider default. |

### Configuration rules

- `provider` and `model` must be set as a non-empty pair and `enabled` must be true to activate the route override.
- Leaving `provider` empty indicates inheriting the current session model.
- Setting only one field does not partially apply; the plugin falls back completely to native behavior (using the current session's provider and model). Specifically, if `provider` is non-empty while `model` is empty, host routing falls back to the session model under existing host rules, and the UI explicitly alerts that the override is not activated.
- `reasoningEffort` is optional. If left empty, no explicit effort is passed. It is forwarded only when the target model advertises support for that tier; if unsupported or if capability discovery fails, it falls back to the provider default.
- In the configuration UI, if an existing configuration contains an unrecognized or unadvertised `reasoningEffort`, the client preserves and explicitly displays it without disguising it as the provider default, allowing the user to inspect it or explicitly clear it.
- **Takes effect immediately on the next review after saving.** In-flight reviews are not rewritten, and no session restart or profile reload is required.

### Examples

Assuming the following providers are configured in your DSH environment (e.g., in `cordis.patch.yml`), they can be selected on the configuration page:

- `glm-coding` / `glm-5.3-flashx`: a low-latency reviewer;
- `codex-proxy` / `gemini-3.8-flash-high`: a stronger reviewer.

These are machine-specific examples; available options depend on your DSH setup. Valid `reasoningEffort` values are model-specific (e.g. `low`, `medium`, `high`, `xhigh`). If the selected model does not advertise the specified effort, the plugin omits it and uses the provider default instead of passing an unsupported parameter.

## Limitations

- **Only Auto-review requests are rewritten.** Main conversation, subagents, title generation, compaction, and other LLM calls are untouched, and the main session model never changes.
- **The plugin must be enabled.** `enabled` must be `true` and the plugin layer must be loaded by the DSH profile.
- **The Auto review permission mode is required.** Review requests only exist while the session runs under the Auto review permission mode; this plugin cannot replace or bypass Auto review.
- **The provider / model must already exist in DSH configuration.** An invalid ID or unreachable model causes the review request to fail. In accordance with fail-closed behavior, the pending tool call is blocked and will not execute.
- **Reasoning effort is model-owned.** Effort tiers are only forwarded if the target model explicitly declares support; otherwise (or if capability queries fail), it falls back to the provider default.
- **Reload profile and refresh page after client changes.** The configuration interface is provided by `client/client.js`. After installing or modifying client code, reload the Web profile and refresh the browser page. Saving configuration settings applies immediately to the next review.
- **Experimental nature.** Auto review may incorrectly approve unsafe operations or deny benign ones, and consumes extra tokens. Choosing a dedicated reviewer model does not eliminate these inherent risks; Auto review should still be used with care.
- **The review policy is unchanged.** The prompt templates, risk classifications, and allow/deny/escalate decision logic remain governed entirely by DSH Auto review.

## Verification status

As of 2026-10-25, the final automated integration regression suite was executed and passed completely:
- **Automated commands**: All four npm scripts ran serially and exited with code 0: `npm run typecheck`, `npm test`, `npm run check`, and `npm run verify`.
- **Tests and static checks**: 56 unit tests all passed (0 failures; covering host 25, client helper 17, client component 10, packaging 4); static verification passed all 15 checks (15/15).
- **Artifact consistency**: Distribution artifacts (`lib/index.js`, `lib/policy.js`, `lib/index.d.ts`, `lib/policy.d.ts`, `client/client.js`) are 5/5 byte-for-byte identical to independent TypeScript recompilation outputs.
- **Runtime scenarios**: Scenarios on live local Cordis and LlmRuntime instances (testing provider-scoped cache invalidation, deferred settling guards against cache pollution, etc.) all passed.

**Validation boundaries and unverified items**:
- **No live model calls**: All automated tests and Cordis runtime scenarios use in-memory fake adapters; no live LLM APIs or external network calls were executed.
- **This plugin has not been installed in the Web GUI or interactively verified by opening the configuration page in a live browser session.** Visual placement between bundle sections, GUI form submission, and live end-to-end review interception have not been validated in a running Web GUI, so no end-to-end GUI verification is claimed.

## Development

All source files, unit tests, and verification scripts are written in TypeScript:

- `src/`: Host and client TypeScript source files;
- `lib/` and `client/client.js`: `tsc` compilation outputs (do not edit manually);
- `tests/`: TypeScript unit tests (compiled to `.build/tests/`);
- `scripts/verify.ts`: TypeScript verification script (compiled to `.build/scripts/verify.js`).

Node does not execute TypeScript directly on this machine; tests and scripts are compiled via `tsc` and executed with `node --test` or `node`. `node_modules/` and `.npm-cache/` are ignored in `.gitignore`.

### Dependencies and linking

Development dependencies include `typescript` (5.7.3) and `@types/node`. In an offline or harness environment, dependencies such as `@deepseek-ai/schemastery` and `@types/node` can be linked from the host DSH installation (adjust the path to match your environment):

```sh
mkdir -p node_modules/@deepseek-ai node_modules/@types
ln -sfn /path/to/dsh/node_modules/@deepseek-ai/schemastery node_modules/@deepseek-ai/schemastery
ln -sfn /path/to/dsh/node_modules/@types/node node_modules/@types/node
npm install
```

### Commands

```sh
npm run build        # Build host (src/ -> lib/) and client (src/client/ -> client/client.js)
npm run build:tests  # Compile tests and scripts (tests/*.test.ts, scripts/verify.ts -> .build/)
npm run typecheck    # Run TypeScript type check across host, client, and tests
npm run check        # Syntax check compiled JS files with node --check
npm test             # Compile and run unit tests with node --test (.build/tests/*.test.js)
npm run verify       # Compile and run static verification (.build/scripts/verify.js)
```

### Layout

- `src/policy.ts`, `src/index.ts`: Server-side plugin and config schema sources;
- `src/client/client.ts`: Web configuration UI client source;
- `tests/*.test.ts`: Unit tests;
- `scripts/verify.ts`: Static and smoke verification script;
- `lib/`, `client/client.js`: Compiled distribution artifacts (do not edit);
- `.build/`: Compiled artifacts for tests and scripts;
- `cordis.patch.yml`: Bundle layer insert declaration;
- `tsconfig*.json`: TypeScript compiler configurations.
