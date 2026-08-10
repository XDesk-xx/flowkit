## ADDED Requirements

### Requirement: Reader 必须从 Delivery Manifest ownerDecisions 投影 typed Owner facts

FormalFactReader MUST 把 active Delivery Manifest 的有效 `ownerDecisions` 作为 Owner authority source，并投影 Policy 所需的最小 typed authorization fact。Projection MUST 保留 `ref`、decision、deliveryId 与可选 canonical changeId，并对 malformed、unknown decision、Delivery mismatch、unknown Change target 收集 FactConflict。Run `ownerAuthorization` 字符串 MUST NOT 进入该 projection。

#### Scenario: cross-Change authorization 不泄漏
- **WHEN** Manifest 中存在 `authorize-apply` record 且 `changeId=A1-id`
- **AND** current Change 为 `B1-id`
- **THEN** Reader/Policy MUST NOT 把该 record 当作 B1 apply authorization

#### Scenario: historical Run owner string 不投影
- **WHEN** Q1 历史 Run 只有 `ownerAuthorization: explicit`
- **THEN** ownerAuthorizations projection MUST 不因此新增 fact

### Requirement: Manifest persistence 必须支持 bounded structured mutation

A1 persistence MUST 支持：创建 minimal Delivery Manifest、向 existing active Manifest 追加 planned Change、追加 Owner decision record、以及把唯一 target Change state 从 planned 改为 active。Existing Manifest mutation MUST 基于唯一 structured spans/indentation contract，只改 owned bytes并 preserve 其它 section；ambiguous/duplicate/unsupported owned shape MUST fail closed。最终文件 MUST atomic publish。

#### Scenario: existing Manifest round-trip 保留未知 section
- **WHEN** existing Manifest 含 A1 parser 不消费的合法 top-level section
- **AND** 只记录 Owner decision 或激活 Change
- **THEN** unknown section MUST 保持不变

### Requirement: Owner decision ref 必须 deterministic 且 idempotent

Persistence MUST 从 normalized decision tuple 派生 content-hash `ref`。相同 tuple 的重复写入 MUST 不产生第二条 record；同一 ref 若对应不同 decoded content MUST 作为 conflict/failure 处理。A1 MUST NOT 用时间戳或随机数作为 authority identity prerequisite。

#### Scenario: retry 相同 decision
- **WHEN** 同一 delivery/change/decision/sourceRef record 已存在
- **THEN** write MUST 返回同一 ref
- **AND** Manifest record 数量 MUST 不增加

### Requirement: Reader 与 Manifest writer 必须保留 Change architectureImpact，并将 legacy compatibility 限定到 exact identity set

A1 Manifest parser/writer MUST 把 Change `architectureImpact` 作为 supported owned Change field：create Delivery initial Changes 与 createChange MUST 写入 boolean 值，Reader MUST 投影到正式 Change fact/read model；existing Manifest mutation MUST 保留既有值。

为避免 Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 的 pre-A1 manifests 在 A1 Apply 后 self-brick，Reader MAY 对 Proposal 冻结的 exact `(deliveryId, Change.id)` legacy identity set 接纳缺失字段，但 MUST 将其投影为 explicit `unknown / pre-a1-legacy-missing`，不得合成 boolean。Compatibility MUST 由 source-controlled static identity set 判定，不得使用“字段缺失”“日期”“Change state”或 fuzzy manifest shape 自动纳入。任何 set 外的 missing/malformed required `architectureImpact` MUST fail closed。

#### Scenario: activation 不改变 architectureImpact
- **WHEN** planned Change 已持久化 `architectureImpact=false`
- **AND** activation 只执行 owner record + `planned → active`
- **THEN** Manifest 中 architectureImpact MUST 保持 false
- **AND** reload 后 ChangeFact MUST 仍为 false

#### Scenario: legacy Change activation 保留 missing
- **WHEN** exact pre-A1 legacy identity 的 planned Change 没有 `architectureImpact`
- **AND** activation 只更新 Owner provenance 与 state
- **THEN** Manifest writer MUST 保留该字段缺失
- **AND** Reader MUST 继续返回 explicit unknown/legacy-missing
- **AND** MUST NOT opportunistic backfill `true` 或 `false`

#### Scenario: copied legacy shape 不获得 compatibility
- **WHEN** future/new Change 不在 exact legacy identity set
- **AND** 其 item 复制 pre-A1 shape 且缺少 `architectureImpact`
- **THEN** Reader MUST 产生 conflict/failure
- **AND** MUST NOT 因 shape 相似而接纳

### Requirement: Authorization-only record 写入必须先通过 current Policy gate admission

Persistence/service 在写入 authorization-only Owner record 前 MUST 使用 fresh FormalFactSnapshot 调用 shared Policy，并验证 current result 正在请求相同 decision 与 canonical target。Mismatch、stale、early 或 current facts conflict MUST fail closed，且不得先写 record 再验证。该 admission MUST 与 deterministic Owner record idempotency 分离：已存在同一 record 也不能把不再合法的 current gate重新解释为新的 authority write。

#### Scenario: stale authorization 不写 Manifest
- **WHEN** current Policy owner-decision 与请求写入的 decision/target 不匹配
- **THEN** persistence operation MUST fail before atomic publish
- **AND** Manifest MUST 保持不变
