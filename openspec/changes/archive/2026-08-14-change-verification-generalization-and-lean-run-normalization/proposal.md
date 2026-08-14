## Why

136 Explore 已证明 generic Change Verification、compact entry identity、three-file Run、historical E1 compatibility 与 F1/G1 next-consumer 均可行；但上一 Proposal generation 把 migration compatibility 扩张成 Context、ActionPackage、selection/evidence、renderer、Catalog 各自独立的版本体系。Owner Contract Reset `owner:1f4b0ee08f7de45ac707d0dea97d84fe95dd6940254b61106bc3d0be70c805fe` 明确废弃该设计，E2 必须改为“当前实现 + 最小持久化格式判别 + bounded legacy read compatibility”，同时保留 136 已证明的 required outcomes。

## What Changes

- 将 Change Verification 泛化为 source-controlled、closed、deterministic Catalog：current source 定义 current Catalog，selection 只保存 stable logical check ids；需要 point-in-time identity 时使用 Catalog content fingerprint，不建立 `catalogGeneration`。
- 将 current Change OpenSpec strict validation 从 E1 literal/path/physical command 解耦，由 formal `changeId` 与 OpenSpec structured projection 驱动；command/launcher 仍属于 executor/adapter。
- Historical E1 persisted Run/sidecar bytes 保持 immutable。Latest reader 只保留 small bounded legacy recognition，并验证 persisted shape、content fingerprint、terminal/result/publication binding；不得因为 future current Catalog 或 current renderer 改变而把历史事实判 stale，也不得通过重新生成过去 Markdown 来证明历史 authority。
- E2 自身继续由 pre-E2/current runner 完成。为完成 E2 自己的 generic Verification，可以继续使用该 runner 已存在的 sidecar 物理协议，但 E2 不新增 selection/evidence schema generation、renderer generation、Context generation 或 ActionPackage generation；其 point-in-time truth 由 persisted content fingerprint 与 terminal binding 固定。
- E2 checkpoint 是唯一 writer transition boundary。checkpoint 后 current implementation 成为 prospective writer；新的 Standard Run 只写 `action.md`、`context.json`、`result.json`，Apply/revise-apply 的 compact entry identity 内嵌 `context.json`，terminal selection/publication binding 内嵌 `result.json`，不再创建 entry/selection/evidence per-Run sidecars。F1 是第一份正式 next-consumer / dogfood。
- E2 不授权新的内部 `formatVersion`。Latest reader 必须优先通过 closed structural discrimination 识别 post-E2 current shape 与已存在 historical shapes；只有未来真实 breaking persisted format 无法可靠结构识别时，才允许独立 Change 决定最小 serialization `formatVersion`，该字段也不得升级为组件产品版本体系。
- 将仍编码 pre-E2 sidecar / component-version 架构的 canonical Requirement identity 重命名为非版本化 current semantics；historical `v1/v2/v5` 等名称只保留在 bounded legacy scenarios，不再作为 post-E2 current Requirement 名称。
- compatible affected scopes 在执行前先 union/dedupe test files，Reviewer 默认复用 exact-bound formal Change Verification，只为具体 blocker targeted rerun。
- 保持正式依赖链 `E1 → E2 → F1 → G1`；不重新打开 E1 exact-resume / Contract Reset / archive recovery，也不进入 F1/G1/03 scope。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `flowkit-change-verification-selection`: 泛化 current-Change selection/Catalog，并将 historical/current verification authority 收敛为 persisted content identity，而不是内部 generation/version family。
- `flowkit-formal-fact-reader-and-persistence`: 让 latest reader 使用 bounded historical recognition + prospective three-file current persistence，不新增 Context/selection/renderer 版本生命周期。
- `flowkit-lean-run-and-action-package`: 将 post-E2 new writer 收敛为 three-file Run，并以 structural current shape + bounded legacy reader 替代 ActionPackage/Context generation family。

## Impact

- 主要影响 `src/verification/change-selection/**`、`src/services/b1-run-execution-service.ts`、`src/facts/formal-fact-reader.ts`、`src/persistence/**`、`scripts/affected-scopes.ts` / `scripts/verification.ts` 及对应 unit/integration fixtures；其中 Delivery Change 数量回归需覆盖 `tests/unit/services/a1-write-service.test.ts`；historical E1 integration fixture 需覆盖 `tests/integration/e1-change-verification-selection.test.ts`，显式建模 pre-E2 migration lineage而不是依赖“无 migration history = legacy”。
- Historical E1 Runs 不迁移、不回写；E2 自身仍由当前 runner 完成，writer transition 只在 recognized E2 checkpoint 后发生。
- 不新增 Registry、migration framework、schema platform、Evidence ledger、CodeGraph mandatory integration 或 Delivery-level behavior。
