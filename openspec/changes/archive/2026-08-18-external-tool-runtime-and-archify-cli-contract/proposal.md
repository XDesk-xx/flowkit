## Why

02 的 OpenSpec 集成仍以 ambient executable / Windows shim 为 canonical path；03 首次引入 Archify 后，继续依赖 PATH、`.ps1/.cmd` 与工具各自的临时 launcher 会让 detached/canonical execution identity 不可复现。C1 需要建立一个**只支持 OpenSpec + Archify 的最薄 managed external-tool runtime**，把 exact offline distribution、direct Node invocation、fail-closed identity validation 与 physical Verification closure 固定下来，同时不提前进入 D1/E1 的正式 Architecture authoring。

## Owner Contract Reset — managed-vs-injected execution identity correction

035 Apply 的 formal Change Verification 暴露出一个 execution identity 错误：`OpenSpecCliAdapter` 把 `runner` callback 的存在隐式解释为 injected executable authority。该推断违反 C1 已冻结的 authority precedence，并使 observational runner 无法继续消费 canonical managed `FLOWKIT_HOME` identity。

当前 generation 冻结以下纠正，不改变 033 已批准的总体 runtime 设计：

- `runner` 只属于 process transport / observation seam，本身不拥有 executable authority；
- controlled fake/injected execution 必须通过显式 `executable` 或 `invocation` seam 表达 authority；
- observational runner 未提供显式 executable/invocation 时，必须按 production resolver 消费 `explicit/injected → managed FLOWKIT_HOME → legacy FLOWKIT_OPENSPEC_BIN → ambient compatibility`；
- valid managed home 存在时，observational runner 必须收到 `process.execPath + exact openspec.js entrypoint + operation args`；
- 保持 OpenSpec real-process、archive、public `verify --retry`、G1 与 Delivery Full Test technical environment regressions；
- 新 Apply candidate 必须重新形成 formal Change Verification physical closure，035 failed publication 只保留为 historical point-in-time authority。

## What Changes

- 建立 `FLOWKIT_HOME` 的最小 runtime contract：默认 `<user-home>/.flowkit`，允许 absolute `FLOWKIT_HOME` override；C1 只正式使用 `FLOWKIT_HOME/tools/**`。
- 新增 closed two-tool managed layout 与 static identity descriptors：
  - OpenSpec `@fission-ai/openspec@1.7.0`，canonical npm package tarball SHA256=`3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd`，entrypoint=`node_modules/@fission-ai/openspec/bin/openspec.js`；
  - Archify `2.14.0`，official `archify.zip` SHA256=`1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175`，entrypoint=`archify/bin/archify.mjs`。
- managed tool resolver MUST 验证 exact tool/version、distribution fingerprint、package name/version 与 entrypoint existence，并输出 `process.execPath + exact JS/MJS entrypoint` invocation；missing/mismatch MUST fail closed。C1 不实现 Tool Registry、dynamic discovery、online installer 或 marketplace。
- OpenSpec canonical route 迁移为 managed `FLOWKIT_HOME` identity。保留 explicit/injected executable 作为 test/controlled seam；保留 `FLOWKIT_OPENSPEC_BIN` 与历史 POSIX/Windows shim route 作为 bounded compatibility fallback，但它们不再是 managed environment 中的 canonical authority。
- `runner` callback 只负责 transport/observation，MUST NOT 因 presence 自动制造 explicit/injected executable authority。fake/injected tests 必须显式提供 `executable`/`invocation`；observational runner 必须继续使用 normal resolver identity，managed home 有效时仍走 canonical managed route。
- nested Verification、archive-sync、`verify --retry`、real-process tests 与 Delivery Full Test technical child environment MUST 传播同一 managed `FLOWKIT_HOME` identity；compatibility route 才继续传播 exact `FLOWKIT_OPENSPEC_BIN`。
- 新增 thin Archify external adapter，仅冻结已物理验证的：`doctor`、`validate`、`deliver`、`compare architecture` 及 architecture/workflow/lifecycle renderer structured result contract。Archify invocation MUST 直接使用 managed exact entrypoint，不新增 `FLOWKIT_ARCHIFY_BIN` ambient override。
- 冻结 JSON/HTML/receipt authority 边界：JSON 是 Archify operation 输入；HTML/receipt 是 exact renderer/comparator 的 generated output/review evidence，可删除重建、不得成为 Flowkit lifecycle truth；failed generation MUST NOT 被 Flowkit当作成功或覆盖 last-good artifact。
- C1 只证明 synthetic `JSON + HTML + receipt → review ZIP` 的物理可行性；ZIP 是普通 transport，不是 Archify/Architecture authority。**C1 不创建正式 Current / Planned / Actual Architecture，不创建 repository `architecture/**` 正式资产，不冻结 Flowkit 当前系统架构内容。**
- 扩展 Change Verification closed mapping，使 external-tool/Archify production mutations 必须选择并真实执行 managed OpenSpec/Archify physical tests；counterfactual sentinel 必须能让 formal selected check 失败。
- Verification ownership 冻结为 non-overlapping exact layout：新的 Archify/shared-runtime unit tests 只能位于 `tests/unit/external-tools/**` 并由 `external-tools` 唯一拥有；现有 `tests/unit/integrations/**` 继续只属于 `openspec-runtime`；`tests/unit/cli/change-action.test.ts` 继续只属于 `cli-diagnostics`。共享 external-tool production mutation 通过 module dependency closure 同时触达 `tests-external-tools` 与现有 OpenSpec physical regressions。
- Reset correction 需要同步迁移既有 fake-runner consumer `tests/unit/services/b1-openspec-action-context.test.ts` 到显式 executable seam；该路径保持现有 `execution` 唯一 ownership，并通过 `tests-execution` 进入 formal physical selection，不修改 module-map ownership semantics。
- `verify --retry` 的 canonical managed regression MUST 在 `FLOWKIT_HOME` 有效、`FLOWKIT_OPENSPEC_BIN` 缺失时通过 public CLI route；另保留的 `FLOWKIT_OPENSPEC_BIN` case 只能作为明确的 legacy compatibility coverage。managed `test:full` 不得为了满足旧测试假设而合成 legacy executable env。

## Capabilities

### New Capabilities

- `flowkit-external-tool-runtime`: 定义 `FLOWKIT_HOME/tools`、closed OpenSpec/Archify exact identity、managed direct-Node invocation、Archify thin CLI/renderer/receipt behavior 与 fail-closed external-tool contract。

### Modified Capabilities

- `flowkit-openspec-1-7-thin-integration`: 将 OpenSpec canonical executable authority 从 ambient/shim model 迁移为 managed `FLOWKIT_HOME` invocation，并冻结 bounded compatibility + nested identity propagation。
- `flowkit-integration-boundaries`: 冻结 Archify external authority、generated HTML/receipt/review ZIP transport 与 Flowkit lifecycle truth 的边界，禁止 C1 抢占 D1/E1 Architecture authority。
- `flowkit-change-verification-selection`: 为新的 external-tool/Archify mutation family 增加 closed module/capability/check/physical-target closure，不允许手工 proof 代替 formal Verification。

## Impact

- 主要影响 `src/integrations/**`、OpenSpec executable/adapter consumers、`scripts/verification.ts`、`src/verification/change-selection/**` 与相关 unit/integration tests；Reset correction 额外允许 `tests/unit/services/b1-openspec-action-context.test.ts` 仅做 fake-runner authority seam 迁移。C1 不需要修改 `src/shared/external-command.ts`，而是复用既有 command runner contract。
- C1 会新增 Archify/shared external-tool integration production code与 physical fixtures/tests，但不会引入 runtime npm dependency，也不会 vendor OpenSpec/Archify source进 repository。
- 现有 `FLOWKIT_OPENSPEC_BIN`、Windows `.ps1/.cmd` regressions 和 historical execution semantics 保留 bounded compatibility；managed tool home provision 后 canonical execution不依赖 ambient PATH。
- 不修改 Delivery Full Test / Finalize lifecycle authority，不新增 Standard Action/Run/NNN，不创建正式 Architecture JSON/HTML，不进入 D1/E1/F1/G1/H1 scope。
