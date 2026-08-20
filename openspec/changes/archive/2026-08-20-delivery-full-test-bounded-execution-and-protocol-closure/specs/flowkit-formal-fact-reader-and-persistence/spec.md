## MODIFIED Requirements

### Requirement: Delivery Manifest 嵌套 delivery 状态读取 + fail-closed

Reader MUST 从 Delivery Manifest 的嵌套 `delivery:` mapping 读取 `state` 与 persisted raw `fullTestStatus`，并从 `verification.fullTest` 读取 coverage intent、唯一 executable binding、optional current executionBlock 与 optional terminal result projection。MUST NOT 从顶层 `state`/`fullTestStatus` 读取。

`verification.fullTest.execution` MUST 是唯一 typed per-Delivery execution contract，并使用 closed `kind=command|bounded-command-plan` 判别联合。两种 kind MUST共享非空 `id`、`scope=delivery`、`resultProtocol=flowkit-full-test-result-v1`、`resultAuthority=verification` 与精确 `expectedTerminalStatuses=[passed, failed]`。`command` MUST继续要求 non-empty logical `command`、`launcherMode=direct|npm-shim`、string `args[]` 与 positive `timeoutMs`；`npm-shim` 只接受 logical `command=npm`，并保留 non-win32 `npm` / win32 `npm.cmd` + ComSpec normalization。`bounded-command-plan` MUST包含 ordered non-empty `logicalChecks[]`，每项精确包含 non-empty unique logical `id`、closed source-controlled `resolverId` 与 positive `perTargetTimeoutMs`；unknown resolver、duplicate id/field或 unsupported shape MUST fail closed。Reader MUST NOT要求所有 future Delivery 使用 current 03 resolver set/timeout；`command` MUST继续是合法 future shape。`verification.fullTest.plan` MUST只解释为 Delivery coverage intent，MUST NOT被 Reader/Policy编译为 executable step list。

当 persisted raw `fullTestStatus=not-ready` 且 all required Changes completed、matching checkpoints present、formal conflicts=0、current Delivery execution contract valid 时，Reader/Policy shared pure projection MUST 将 current effective Full Test status解释为 `awaiting-user-decision`；该 projection MUST NOT写回 Manifest。`authorized|passed|failed` MUST 来自 persisted raw status，不得仅凭 technical command结果推导。若 raw `authorized` 同时存在合法 executionBlock，effective status仍为 `authorized`，但 Policy MUST 投影 execution/recovery blocked boundary，不得返回 executable Full Test behavior。

`verification.fullTest.executionBlock` MAY 只在 raw `fullTestStatus=authorized` 且最后一个 owned execution outcome 为 process-tree `outcome-unknown` 时存在，并 MUST 精确使用 `{schemaVersion:1, reason:outcome-unknown, summary:<non-empty bounded string>}`。它 MUST NOT 包含 `resultRef`、check result、raw logs 或 attempt history；存在时 current Full Test MUST fail closed 且不得开始新 attempt。

Terminal `verification.fullTest.result` 只允许在 persisted `fullTestStatus=passed|failed` 时存在，并 MUST 使用唯一闭合 schema：`schemaVersion=1`、matching `status`、non-empty `summary`、non-negative integer `totalDurationMs`、`checks[]`（每项精确包含 non-empty unique `id`、`status=passed|failed`、non-negative integer `durationMs`）与 `resultRef`。对 `kind=bounded-command-plan`，`checks[]` MUST 按 frozen logical check order：`passed` result必须精确等于完整 logical plan且全部 passed；`failed` result必须是 non-empty exact logical prefix、前项全部 passed且最后一项 failed。对 legacy `kind=command`，Reader继续只做既有 structural result validation/hash/coherence，不得倒推 bounded logical plan。Physical target order/detail MUST NOT进入 terminal `checks[]` authority。

`resultRef` MUST 为 `verification:full-test:<sha256>`。Reader/Writer MUST 重建固定字段顺序 canonical object `{schemaVersion,status,summary,totalDurationMs,checks}`，每个 check 重建固定字段顺序 `{id,status,durationMs}`，保持 `checks` array order，对该 object 的无空白、无 trailing newline UTF-8 `JSON.stringify` bytes 计算 lowercase SHA-256；hash domain MUST 排除 `resultRef` 自身且 MUST NOT 依赖 Manifest/YAML key ordering。Status/result 缺失、不匹配、duplicate check id、unsupported schemaVersion、malformed timing 或 recomputed resultRef mismatch MUST 收集 `FactConflict` 并 fail closed。

The Delivery Manifest `architecture` mapping MAY additionally contain E1 `currentCycle` and `acceptedSystemSource`. Pre-E1 manifests without those optional fields MUST remain readable; present E1 fields MUST use the closed schema and coherent internal bindings. `currentCycle` MUST include both `fullTestAuthorizationRef` and `fullTestResultRef`, and its cycleRef MUST be recomputable from the authorization occurrence plus result/Actual/compare refs.

#### Scenario: 读取嵌套 delivery.state 和 delivery.fullTestStatus

- **WHEN** Reader 读取 Delivery Manifest
- **AND** Manifest 存在且包含 `delivery:` mapping
- **THEN** MUST 从 `delivery.state` 读取 DeliveryState
- **AND** MUST 从 `delivery.fullTestStatus` 读取 persisted raw FullTestStatus
- **AND** 两者 MUST 通过 B1 `DeliveryState`/`FullTestStatus` 枚举校验
- **AND** MUST NOT 从顶层 `state`/`fullTestStatus` 读取

#### Scenario: Ready raw not-ready 投影 awaiting-user-decision

- **WHEN** persisted raw `delivery.fullTestStatus=not-ready`
- **AND** all required Changes completed/checkpointed
- **AND** formal conflicts=0
- **AND** executable binding valid
- **THEN** current effective Full Test status MUST 为 `awaiting-user-decision`
- **AND** Manifest bytes MUST 保持不变

#### Scenario: Full Test executable contract 不合法 fail-closed

- **WHEN** `verification.fullTest.execution` 缺失、duplicate、字段不完整、discriminated kind/base fields不合法、command launcher/timeout不合法，或 bounded logical check id/resolver/timeout不合法
- **THEN** Reader MUST 收集 Full Test plan/binding `FactConflict`
- **AND** Delivery MUST NOT 进入 Owner Full Test authorization 或 executable behavior boundary

#### Scenario: outcome-unknown executionBlock 只阻塞执行而不伪造 Verification result

- **WHEN** raw `fullTestStatus=authorized` 且持久化合法 `executionBlock.reason=outcome-unknown`
- **THEN** Reader MUST 投影该 current execution safety blocker
- **AND** MUST NOT 投影 terminal `verification.fullTest.result` 或 `resultRef`
- **AND** Policy/Operator MUST NOT 开始新的 Full Test attempt

#### Scenario: executionBlock 与 terminal result 冲突 fail-closed

- **WHEN** executionBlock 与 `passed|failed` terminal result 同时存在，或 block schema/reason 非法
- **THEN** Reader MUST 收集 `FactConflict`
- **AND** Delivery MUST fail closed

#### Scenario: Future Delivery binding 按自身 contract 读取

- **WHEN** future Delivery 持久化了与当前 03 不同的合法 command/args/timeout
- **THEN** Reader MUST 按 typed schema 接受并投影该 Delivery 自己的 execution contract
- **AND** MUST NOT 因其不等于 `npm run verify:full` 或 `120000` 而产生冲突

#### Scenario: terminal status 与 result projection 必须一致

- **WHEN** persisted raw `fullTestStatus=passed|failed`
- **THEN** matching `verification.fullTest.result` MUST 存在且 status 一致
- **AND** closed result schema/check status/timing MUST structural valid
- **AND** bounded kind MUST additionally satisfy complete-PASS / exact-prefix-FAILED logical-plan semantics
- **AND** Reader MUST 按固定 canonical JSON hash domain 重算 `resultRef`
- **AND** 不一致、缺失或 hash mismatch MUST fail closed

#### Scenario: Manifest 缺失 delivery mapping fail-closed

- **WHEN** Manifest 存在但缺少 `delivery:` mapping
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-manifest-shape`）
- **AND** `deliveryState` 和 Full Test status projection MUST 为 `undefined`
- **AND** MUST NOT 静默返回 undefined 而不收集冲突

#### Scenario: delivery.state 缺失或无效 fail-closed

- **WHEN** `delivery.state` 缺失或值不在 `active|completed|cancelled` 枚举内
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-state`）
- **AND** `deliveryState` MUST 为 `undefined`
- **AND** MUST NOT 静默返回 undefined

#### Scenario: delivery.fullTestStatus 缺失或无效 fail-closed

- **WHEN** `delivery.fullTestStatus` 缺失或值不在 `not-ready|awaiting-user-decision|authorized|passed|failed` 枚举内
- **THEN** MUST 收集 `FactConflict`（dimension=`delivery-full-test-status`）
- **AND** Full Test status projection MUST 为 `undefined`

#### Scenario: Manifest 完全不存在返回 undefined

- **WHEN** Delivery Manifest 文件不存在
- **THEN** `deliveryState` 和 Full Test status projection MUST 为 `undefined`
- **AND** MUST NOT 收集 `FactConflict`（bootstrap-only Delivery 由 Policy 决定）

#### Scenario: pre-E1 architecture mapping remains compatible
- **WHEN** `architecture` contains only `impact` and `archifyPlan`
- **THEN** Reader MUST accept the Manifest and project no current cycle/accepted source

#### Scenario: accepted source must match accepted current cycle and Owner fact
- **WHEN** acceptedSystemSource is present
- **THEN** it MUST bind an accepted Actual/compare source and a valid `accept-architecture` Owner record for the same cycle
- **AND** that cycle MUST retain coherent Full Test authorization occurrence provenance
- **AND** mismatched source/cycle/Owner refs MUST fail closed


#### Scenario: bounded execution contract round-trip
- **WHEN** Manifest持久化合法 `kind=bounded-command-plan` 与 ordered logical checks
- **THEN** Reader MUST恢复相同 logical id/resolverId/perTargetTimeoutMs order
- **AND** Writer round-trip MUST NOT materialize resolved machine paths/test file snapshot

#### Scenario: incomplete bounded PASS fail-closed
- **WHEN** bounded logical plan有多个 checks但 terminal status=`passed` 的 `checks[]`只包含前缀
- **THEN** Reader MUST collect a Full Test result semantic conflict
- **AND** MUST NOT expose a qualifying passed Full Test result

#### Scenario: bounded FAILED exact prefix accepted
- **WHEN** bounded terminal status=`failed`
- **AND** checks是 frozen logical plan的非空 exact prefix、前项 passed、最后一项 failed
- **THEN** Reader MAY accept the terminal result after existing hash/schema validation
- **AND** unexecuted suffix MUST NOT require synthetic `not-run` entries
