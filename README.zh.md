# @aghost-prj/dsh-auto-review-model

为 DSH 的 **自动授权审查（Auto review）** 单独选择 provider / model / reasoningEffort，而不改变主对话使用的模型。

> 实验功能。本插件只改写 Auto review 发出的审查请求，不改变审查策略、风险分级或审批行为。

## 用途

DSH 的 Auto review 在每次受支持的工具调用执行前，用当前会话的 provider 与 model 审查该调用，再决定放行、拒绝或转人工审批。默认情况下，审查使用与主对话相同的模型。

本插件在 LLM 请求层识别 Auto review 的审查请求，并把其中的 provider、model 与 reasoningEffort 替换为你在设置页配置的值。典型用途：

- 用更快、更便宜的模型做常规审查，降低延迟与 token 成本；
- 用更强的模型做审查，同时让主对话继续使用轻量模型；
- 为审查固定一个模型，避免会话切换模型时审查行为随之波动。

普通对话、subagent、标题生成、上下文压缩等其它 LLM 请求不受影响。

## 工作原理

- **请求识别**：宿主侧插件监听 `llm/stream`，只精准匹配 `system` 提示词以 `REVIEW_POLICY\n` 开头且包含固定 reviewer marker 句子（`You are the final authorization reviewer for exactly one pending tool call.`）的自动审查请求。
- **路由改写**：当开启 `enabled` 且 `provider` 与 `model` 成对非空时，复制冻结的请求对象并改写其 `provider`、`model` 与 `reasoningEffort`；审查提示词、风险分级与判定策略保持原样不变。
- **思考等级能力查询**：在传递配置的 `reasoningEffort` 前，插件通过 `resolveModelInfo` 查询该路由的能力（透传 `AbortSignal`）。只有当目标模型声明支持该等级时才传递；若未声明或能力查询失败，则不显式传递并回退到 provider 默认值。
- **缓存失效**：能力查询结果按路由进行内存缓存，并采用 generation / epoch 计数机制，防止在缓存失效前在途的查询结果（无论成功或失败）以过时数据错误写回。宿主侧监听 `loader/volatile-update` 时使用 `global: true`，以确保能够可靠接收到 provider 的局部配置变更通知；当收到 `llm/adapters-updated` 或 `loader/volatile-update` 事件时，缓存会及时失效。
- **Fail-closed 安全机制**：若配置的模型不存在、网络不可达或审查执行失败，工具调用按审查失败处理，不会执行（fail-closed）。

## 安装

```sh
# 从 npm 官方仓库安装（发布后）：
dsh plugin --profile web add @aghost-prj/dsh-auto-review-model

# 或在本地开发调试阶段从本地路径安装：
dsh plugin --profile web add /home/aghost/workspace/dsh-auto-approval-model-fix
```

该命令把包作为依赖与 bundle 层加入 `web` profile。DSH loader 通过包内的 `dsh.bundle.patch` 读取 `cordis.patch.yml`，把插件插入为 `auto-review-model` 层。

安装插件或重新构建客户端后，需要按 DSH 常规方式重新加载 Web profile 并刷新页面，配置页才会出现。保存设置本身对下一次审查生效，不需要重启会话。

## 配置

配置入口：**设置 → 插件 → 自动授权审查**。

“**自动审查模型**”配置区渲染在该 bundle 详情页的“**描述**”与“**包含的组件**”之间。它由客户端（浏览器侧）代码通过 `plugins.bundle.config` 槽位注册，注册 key 为 `@deepseek-ai/dsh-experimental-auto-review`。

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 插件总开关。关闭后自动审查沿用当前会话的模型与推理等级。 |
| `provider` | string | 空 | 审查请求使用的 provider ID。留空表示继承当前会话模型。必须与 `model` 同时填写才会启用覆盖。 |
| `model` | string | 空 | 审查请求使用的 model ID。必须与 `provider` 同时填写才会启用覆盖。 |
| `reasoningEffort` | string | 空 | 审查请求的思考等级，仅在覆盖生效时应用；留空表示不显式传递，回退到 provider 默认值。 |

### 配置规则

- `provider` 与 `model` 必须成对填写且均非空，同时 `enabled` 为开启状态，才会覆盖审查模型。
- `provider` 留空表示继承当前会话模型。
- 只填写其中一个字段不会半生效，而是整体回退为原生行为（沿用当前会话的 provider 与 model）。特别地，当 `provider` 非空而 `model` 为空时，宿主路由按既有规则整体 fallback 到会话模型，同时客户端 UI 会明确提示未启用覆盖。
- `reasoningEffort` 为可选字段。留空表示不显式传递；只有目标模型声明支持该等级时才会传递，未声明或能力查询失败时回退到 provider 默认值。
- 在配置界面中，若既有配置包含未知或当前模型未声明的 `reasoningEffort`，客户端会如实保留并明确显示，不伪装成默认值，并允许用户显式清除。
- **生效时机：保存设置后立即对下一次审查生效。** 已经在进行中的审查不会被改写；不需要重启会话或重新加载 profile。

### 示例

假设你的 DSH 环境（如 `cordis.patch.yml`）中配置了以下 provider，可以直接在配置下拉框中选择：

- `glm-coding` / `glm-5.3-flashx`：延迟较低的审查模型；
- `codex-proxy` / `gemini-3.8-flash-high`：能力更强的审查模型。

以上仅为环境示例，实际可选列表取决于你的 DSH 配置。`reasoningEffort` 的合法值由目标模型决定（例如 `low`、`medium`、`high`、`xhigh`）；如果所选模型未声明该等级，插件会忽略它并使用 provider 默认值，而不是把不受支持的值发给模型。

## 限制

- **只重写 Auto review 的审查请求。** 不改写主对话、subagent、标题生成、上下文压缩等其它请求，也不改变主会话模型。
- **需要启用本插件。** `enabled` 必须为开启状态，且插件层已被 DSH profile 正确加载。
- **需要 Auto review 权限模式。** 只有会话处于自动授权审查模式时才会产生审查请求；本插件不能替代 Auto review 本身。
- **provider / model 必须已在 DSH 配置中存在。** 填错或模型不可用时，审查请求会失败；工具调用按审查失败处理，不会执行（fail-closed）。
- **思考等级由目标模型决定。** 只有在目标模型明确声明了该等级时才会传递；未声明或能力查询失败时会被忽略并回退到 provider 默认值。
- **客户端代码变化后需要刷新页面。** 配置界面由 `client/client.js` 提供；安装插件或修改客户端代码后必须重新加载 Web profile 并刷新 Web 页面，保存设置本身则直接对下一次审查生效。
- **实验功能。** 自动审查可能误放行不安全操作或误拒绝正常操作，也会消耗额外 token。选择审查模型不能消除 Auto review 本身的安全风险，请仍然谨慎使用。
- **不改变审查策略。** 固定的审查提示词、风险分级和放行/拒绝/转人工的判定逻辑仍完全由 DSH Auto review 决定。

## 验证状态

截至 2026-10-25，最终全量自动化集成回归验证已执行完毕并通过：
- **自动化命令**：四条 npm 脚本串行执行且退出码均为 0：`npm run typecheck`、`npm test`、`npm run check` 与 `npm run verify`。
- **测试与静态检查计数**：56 项测试全部通过（0 失败；涵盖 host 25 项、client helper 17 项、client-component 10 项、packaging 4 项）；静态校验 15 项全部通过（15/15）。
- **产物一致性**：交付分发产物（`lib/index.js`、`lib/policy.js`、`lib/index.d.ts`、`lib/policy.d.ts`、`client/client.js`）与独立 TypeScript 重新编译输出 5/5 逐字节一致。
- **Runtime 场景**：在真实本机 Cordis 与 LlmRuntime 场景脚本中（针对 provider 局部失效、延迟写入防污染等），场景全部通过。

**验证边界与未验证事项**：
- **未调用真实模型**：所有自动化测试与 Cordis runtime 场景均采用内存 fake adapter，未调用任何真实 LLM API 或进行外部网络请求。
- **未在 Web GUI 中实际安装并在真实浏览器中打开配置页进行端到端验证。** 详情页描述与组件之间的渲染位置、界面表单交互提交以及审查请求链路拦截，尚未在真实运行的 Web GUI 界面中实测，因此本文档不声称 GUI 端到端已通过验证。

## 开发

本项目源码、单元测试与校验脚本全部采用 TypeScript：

- `src/`：宿主与客户端 TypeScript 源码；
- `lib/` 与 `client/client.js`：`tsc` 构建产物（禁止手动修改）；
- `tests/`：TypeScript 单元测试（编译至 `.build/tests/`）；
- `scripts/verify.ts`：TypeScript 静态校验脚本（编译至 `.build/scripts/verify.js`）。

本机 Node 环境不直接运行 TypeScript 文件，测试与校验均由 `tsc` 编译后通过 `node --test` 或 `node` 执行。`node_modules/` 与 `.npm-cache/` 已加入 `.gitignore`。

### 依赖与符号链接

开发依赖包含 `typescript`（5.7.3）与 `@types/node`。在离线或本地测试环境下，依赖项（如 `@deepseek-ai/schemastery` 和 `@types/node`）可通过软链接关联至宿主 DSH 安装路径（请根据实际机器环境调整路径）：

```sh
mkdir -p node_modules/@deepseek-ai node_modules/@types
ln -sfn /path/to/dsh/node_modules/@deepseek-ai/schemastery node_modules/@deepseek-ai/schemastery
ln -sfn /path/to/dsh/node_modules/@types/node node_modules/@types/node
npm install
```

### 常用命令

```sh
npm run build        # 构建宿主 (src/ -> lib/) 与客户端 (src/client/ -> client/client.js)
npm run build:tests  # 编译测试与脚本 (tests/*.test.ts, scripts/verify.ts -> .build/)
npm run typecheck    # 对源码、客户端及测试执行全量 TypeScript 类型检查
npm run check        # 对构建出的 JS 产物执行 node --check 语法校验
npm test             # 编译并运行单元测试 (node --test .build/tests/*.test.js)
npm run verify       # 编译并运行静态校验脚本 (node .build/scripts/verify.js)
```

### 目录结构

- `src/policy.ts`、`src/index.ts`：服务端插件与配置 schema 源码；
- `src/client/client.ts`：Web 配置面板客户端源码；
- `tests/*.test.ts`：单元测试源码；
- `scripts/verify.ts`：静态与冒烟校验脚本源码；
- `lib/`、`client/client.js`：编译分发产物（请勿手改）；
- `.build/`：测试与校验脚本的编译输出目录；
- `cordis.patch.yml`：bundle 层插入声明；
- `tsconfig*.json`：TypeScript 编译配置文件。
