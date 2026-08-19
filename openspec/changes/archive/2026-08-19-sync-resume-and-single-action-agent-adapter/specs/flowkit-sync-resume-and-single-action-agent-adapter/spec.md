## Purpose

定义 Flowkit 在 fresh process / fresh checkout 中仅依赖 repository 与 local managed-tool facts 恢复当前执行视图，并通过 provider-neutral adapter 严格执行一个已由 Policy 决定的 Change Action 后立即归还控制权。

## ADDED Requirements

### Requirement: G1 必须提供 repository-only typed resume projection

Flowkit MUST提供一个非持久化、typed、derived resume projection，统一消费现有 FormalFactSnapshot/Policy 与 bounded repository/local-environment readers。该 projection MUST至少表达当前 Delivery、active Change、stage、exact pending Run identity/action/role/resumability、latest Review、current Change Verification、Policy next，以及当前 Delivery Architecture `current/planned/actual` 的存在状态与存在时的 versioned path/content fingerprint。Projection MUST NOT从聊天、provider session、`.tmp/**`、ambient PATH 或新建 resume registry/cache恢复 authority。

当当前 boundary 需要 external tool execution context 时，projection MAY派生 exact managed OpenSpec/Archify readiness/identity；ready identity MUST来自现有 closed managed-tool resolver，unavailable/mismatch MUST保持 bounded derived status，MUST NOT fallback 到 ambient executable并声称 managed success。Architecture/tool fields MUST保持 read-only view，不得创建 Actual Architecture、architecture acceptance、tool registry或第二份 durable refs/readiness truth。

#### Scenario: fresh checkout 恢复相同 pending Action
- **WHEN** 一个合法 pending Run 已持久化并在 fresh checkout/fresh process 中读取
- **THEN** typed resume projection MUST恢复同一 deliveryId/changeId/runId/action/role 与 resumability
- **AND** MUST NOT要求聊天或 provider session
- **AND** MUST NOT创建新的 Run/NNN

#### Scenario: Architecture 状态只从当前 Delivery repository assets 派生
- **WHEN** Current/Planned Architecture JSON存在而 Actual尚未形成
- **THEN** projection MUST将 Current/Planned 标记为 present并绑定各自 logical path/content fingerprint
- **AND** MUST将 Actual 标记为 absent
- **AND** MUST NOT为了填充 projection生成 `actual.architecture.json`

#### Scenario: managed tool readiness 不成为 lifecycle authority
- **WHEN** current execution需要读取 managed OpenSpec/Archify identity
- **THEN** projection MUST只报告 closed managed-tool resolver派生的 readiness/identity
- **AND** Policy next MUST仍由 FormalFactSnapshot/Policy决定
- **AND** adapter/diagnostics MUST NOT因为 local tool view自行改变 lifecycle boundary

### Requirement: human resume-context 与 Agent Adapter 必须消费同一 underlying resume projection

G1 MUST让现有人类 `resume-context` 与 single-action Agent Adapter/H1 downstream consumer复用同一个 typed resume projection或其严格子集，而不是各自重新实现 repository/fact interpretation。Human renderer MAY保持 line-oriented view；provider view MAY保持 structured form，但相同 authority dimension在相同 repository/local managed-tool facts下 MUST表达相同 logical identity/status。

#### Scenario: human 与 provider view 不分叉解释 current facts
- **WHEN** 同一 fresh process对相同 repository形成 human resume-context 与 provider execution view
- **THEN**两者对 Delivery/Change/pending Run/Review/Verification/Policy next 与适用 Architecture refs/status MUST一致
- **AND** MUST NOT各自扫描历史 corpus重建第二套 current truth

### Requirement: single-action Agent Adapter 必须只执行一个已决定的 Change Action

G1 MUST提供 provider-neutral single-action Agent Adapter。每次 adapter invocation MUST通过既有 `prepareNewExecution` 或 exact pending `resumeRun` 获取唯一 current ActionPackage，并形成 bounded provider execution view；该 view MUST包含 exact ActionPackage 与当前 Action适用的 OpenSpec structured execution context（`OpenSpecPreparedActionContextView` 或等价 typed projection）。Adapter MUST NOT由 provider输入选择 Delivery、Change、Action、Role、Owner decision或Reviewer verdict。

Adapter MUST最多调用 caller-supplied provider/executor一次。Provider只可返回当前 Run 的 logical Action Result；Adapter MUST通过既有 `admitActionResult` admission完成该一个 Run，并在 admission/replay 后立即 return control。Adapter MAY返回 post-admission Policy projection供 caller观察，但 MUST NOT自动 prepare/execute下一 Action。

#### Scenario: exactly one provider invocation
- **WHEN** Policy/current pending facts解析出一个合法 Standard Change Action
- **AND** single-action Adapter被调用
- **THEN** provider/executor MUST最多被调用一次
- **AND**该 invocation MUST只收到该 Action 的 exact ActionPackage + bounded OpenSpec execution context
- **AND**结果 MUST通过既有 admission落盘

#### Scenario: admission 后只观察 next 不自动继续
- **WHEN** provider返回有效 result并完成当前 Run admission
- **THEN** Adapter MAY读取 Policy并返回例如 `review-explore` 的 next projection
- **BUT** MUST NOT prepare第二个 Run、分配第二个 NNN、切换 Role或再次调用 provider

#### Scenario: pending Run 必须 exact resume
- **WHEN** repository已存在一个 resumable pending Run
- **THEN** Adapter MUST exact-resume该 persisted Run identity
- **AND** MUST NOT通过重新调用 Policy创建replacement generation

### Requirement: G1 resume 与 Adapter 必须跨 Change/Delivery identity 泛化并保持 checkpoint activation boundary

Prospective G1 semantics MUST NOT hardcode 03 Delivery、G1 Change、current Run IDs或current Base SHA。它们 MUST在不同 deliveryId/changeId、durable checkout与fresh process中保持同样的 exact-resume/single-action行为。当前 detached G1 generation MUST继续由entry时implementation执行；prospective semantics只有在G1 approved/archive后由 canonical Executor exact materialize并形成 G1 Change Checkpoint后，才能成为H1及后续 fresh Delivery consumer的repository implementation。

#### Scenario: future Delivery-shaped consumer 不依赖 current IDs
- **WHEN** 一个不同 deliveryId/changeId 的 future Delivery-shaped repository持久化合法 pending Action并被fresh clone
- **THEN** G1 resume/Adapter MUST恢复同一 pending Run并重建对应 future Change的OpenSpec execution context
- **AND** MUST保持 exactly-one provider invocation + existing admission + return-control
- **AND** MUST NOT需要任何 03/G1/current Base常量

#### Scenario: detached G1 不 self-upgrade
- **WHEN** G1自身仍处于detached未checkpoint generation
- **THEN**当前 execution MUST NOT因为candidate中出现prospective implementation而静默切换runner semantics
- **AND**正式 activation MUST等待 canonical G1 Change Checkpoint
