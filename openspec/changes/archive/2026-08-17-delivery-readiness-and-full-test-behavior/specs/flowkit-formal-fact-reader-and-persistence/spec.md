## MODIFIED Requirements

### Requirement: FormalFactSnapshot 只读视图

C1 MUST 提供只读 `FormalFactSnapshot`，用于 Policy 消费 active Delivery/Change、dependencies、OpenSpec artifacts、current Change Runs、Reviewer Verdict 与最小 blocking-authority projection、Change Verification、Tasks completion、Delivery raw/effective `fullTestStatus`、Full Test executable binding/minimal terminal result projection、owner authorization、Archive/Checkpoint/Git boundary 和 conflicts。Snapshot MUST NOT 把完整 Reviewer Finding corpus、Full Test raw logs 或 Verification evidence corpus复制为第二数据库；Policy 所需 blocking authority MUST 从 current matching Reviewer result 派生，Full Test technical result MUST 由 Verification-owned structured result projection提供。

#### Scenario: Reviewer authority 只投影 Policy 所需最小集合

- **WHEN** Reader 读取 completed `review-*` result
- **THEN** `ReviewVerdictFact` MUST 包含 `reviewRunId`、`verdict`、`reviewedRunId`
- **AND** MUST 包含从 blocking `reviewFindings` 派生的去重 `blockingAuthorities`
- **AND** 完整 Finding 正文仍 MUST 由 Reviewer result.json 拥有

#### Scenario: Full Test authority 只投影最小 Delivery facts

- **WHEN** Reader 读取 current Delivery Manifest 的 Full Test facts
- **THEN** Snapshot MUST 区分 persisted raw Full Test status 与 current effective lifecycle status
- **AND** MUST 投影 executable binding、terminal summary/resultRef/timing（若存在）
- **AND** MUST NOT 把 stdout/stderr、generated `dist/**` 或历史 process success 当作 formal Full Test result

#### Scenario: conflicts 保持 fail-closed

- **WHEN** Reader 发现当前 Policy relevant formal fact 自相矛盾或不可解析
- **THEN** MUST 收集 `FactConflict`
- **AND** Policy MUST NOT 猜测 authority 或下一 Action

### Requirement: Delivery Manifest 嵌套 delivery 状态读取 + fail-closed

Reader MUST 从 Delivery Manifest 的嵌套 `delivery:` mapping 读取 `state` 与 persisted raw `fullTestStatus`，并从 `verification.fullTest` 读取 coverage intent、唯一 executable binding、optional current executionBlock 与 optional terminal result projection。MUST NOT 从顶层 `state`/`fullTestStatus` 读取。

`verification.fullTest.execution` MUST 是唯一 typed per-Delivery execution contract，并包含：非空 `id`、`kind=command`、非空 logical `command`、`launcherMode=direct|npm-shim`、string `args[]`、非空 `scope`、正整数 `timeoutMs`、`resultProtocol=flowkit-full-test-result-v1`、`resultAuthority=verification`、以及精确 `expectedTerminalStatuses=[passed, failed]`。`npm-shim` MUST 只接受 logical `command=npm`；non-win32 MUST 解析为 `npm`，win32 MUST 确定性解析为 `npm.cmd` 并进入既有 ComSpec `.cmd/.bat` launcher；该 normalization 属同一 execution contract，不是第二 execution authority。Reader MUST 校验 schema/uniqueness，但 MUST NOT 要求所有 future Delivery 的 command/args/timeout 等于当前 03 instance。`verification.fullTest.plan` MUST 只解释为 Delivery coverage intent，MUST NOT 被 Reader/Policy 编译为第二套 executable step list。

当 persisted raw `fullTestStatus=not-ready` 且 all required Changes completed、matching checkpoints present、formal conflicts=0、current Delivery execution contract valid 时，Reader/Policy shared pure projection MUST 将 current effective Full Test status解释为 `awaiting-user-decision`；该 projection MUST NOT写回 Manifest。`authorized|passed|failed` MUST 来自 persisted raw status，不得仅凭 technical command结果推导。若 raw `authorized` 同时存在合法 executionBlock，effective status仍为 `authorized`，但 Policy MUST 投影 execution/recovery blocked boundary，不得返回 executable Full Test behavior。

`verification.fullTest.executionBlock` MAY 只在 raw `fullTestStatus=authorized` 且最后一个 owned execution outcome 为 process-tree `outcome-unknown` 时存在，并 MUST 精确使用 `{schemaVersion:1, reason:outcome-unknown, summary:<non-empty bounded string>}`。它 MUST NOT 包含 `resultRef`、check result、raw logs 或 attempt history；存在时 current Full Test MUST fail closed 且不得开始新 attempt。

Terminal `verification.fullTest.result` 只允许在 persisted `fullTestStatus=passed|failed` 时存在，并 MUST 使用唯一闭合 schema：`schemaVersion=1`、matching `status`、non-empty `summary`、non-negative integer `totalDurationMs`、按 physical execution order 排列的 `checks[]`（每项精确包含 non-empty unique `id`、`status=passed|failed`、non-negative integer `durationMs`）与 `resultRef`。

`resultRef` MUST 为 `verification:full-test:<sha256>`。Reader/Writer MUST 重建固定字段顺序 canonical object `{schemaVersion,status,summary,totalDurationMs,checks}`，每个 check 重建固定字段顺序 `{id,status,durationMs}`，保持 `checks` array order，对该 object 的无空白、无 trailing newline UTF-8 `JSON.stringify` bytes 计算 lowercase SHA-256；hash domain MUST 排除 `resultRef` 自身且 MUST NOT 依赖 Manifest/YAML key ordering。Status/result 缺失、不匹配、duplicate check id、unsupported schemaVersion、malformed timing 或 recomputed resultRef mismatch MUST 收集 `FactConflict` 并 fail closed。

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

- **WHEN** `verification.fullTest.execution` 缺失、duplicate、字段不完整、`kind/launcherMode/resultProtocol/resultAuthority/expectedTerminalStatuses` 不合法、`npm-shim` 与非 npm command 组合、timeout 非正整数或 command/id/scope 为空
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
- **AND** closed result schema/check order/check status/timing MUST structural valid
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

### Requirement: Manifest persistence 必须支持 bounded structured mutation

A1 persistence MUST 支持：创建 minimal Delivery Manifest（包含 caller-supplied typed `verification.fullTest.execution`）、向 existing active Manifest 追加 planned Change、追加 Owner decision record、把唯一 target Change state 从 planned 改为 active，以及 A1 Delivery Full Test lifecycle 所需的 bounded `delivery.fullTestStatus` / `verification.fullTest.execution` / optional `verification.fullTest.executionBlock` / `verification.fullTest.result` mutation。Existing Manifest mutation MUST 基于唯一 structured spans/indentation contract，只改 owned bytes并 preserve 其它 section；ambiguous/duplicate/unsupported owned shape MUST fail closed。最终文件 MUST atomic publish。

#### Scenario: existing Manifest round-trip 保留未知 section
- **WHEN** existing Manifest 含 A1 parser 不消费的合法 top-level section
- **AND** 只记录 Owner decision、激活 Change 或发布 Full Test lifecycle/result
- **THEN** unknown section MUST 保持不变

#### Scenario: Full Test terminal publication 原子更新 status 与 result
- **WHEN** authorized Full Test execution terminal 返回 passed 或 failed
- **THEN** Manifest writer MUST 在一次 atomic replace 中同时更新 `delivery.fullTestStatus` 与 matching `verification.fullTest.result`
- **AND** partial status-only 或 result-only durable publication MUST NOT 出现
