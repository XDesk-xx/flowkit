## MODIFIED Requirements

### Requirement: next 计算唯一合法下一 Action

`next(snapshot)` MUST 返回 `PolicyResult` 互斥联合类型：`action`（唯一合法 Action）、`owner-decision`（需 owner 授权）、`blocked`（无法推进）。`snapshot.conflicts` 非空时 MUST 返回 `blocked`。无 active Delivery 时 MUST 返回 `blocked`。有 active Change 时按 Change 生命周期决策树计算；**无 active Change 时 MUST 先判断是否存在已 completed 但尚未形成 Change Checkpoint 的 Change。只有该 Change 的 matching archive Run 已合法 terminal completed 时，才可进入 `owner-decision: authorize-checkpoint`；若 archive Run仍 pending/non-terminal，则 MUST保持 archive recovery/blocked boundary。Checkpoint 完成后才继续下一 Change 激活或 Delivery-level 流程。** 多解或歧义时 MUST 返回 `blocked`。

当 active Change存在current Contract Reset时，Policy MUST把该reset解释为新的proposal contract generation boundary：最近合法approved Explore可继续作为handoff；旧 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` Runs若不匹配current reset identity，MUST不参与current stage/currentArtifactRun/current review/lineage。若尚无current propose producer，`next(snapshot)` MUST返回`action: propose`。stage detection、`next`与`canRun` MUST使用同一reset-aware projection，MUST NOT通过all-historical stage fallback重新激活旧approval。

#### Scenario: PolicyResult 为互斥联合类型

- **WHEN** 调用 `next(snapshot)`
- **THEN** 返回值 MUST 恰好为以下之一：`{ kind: 'action', action }`、`{ kind: 'owner-decision', decision, context }`、`{ kind: 'blocked', diagnosis }`
- **AND** MUST NOT 同时返回多种 kind

#### Scenario: conflicts 非空时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** `snapshot.conflicts` 非空
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** 冲突优先于一切其他决策

#### Scenario: 无 active Delivery 时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** 无 active Delivery
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** diagnosis.reason MUST 标识 `no-active-delivery`

#### Scenario: 多解或歧义时 blocked

- **WHEN** 调用 `next(snapshot)`
- **AND** 正式事实无法确定唯一合法下一 Action
- **THEN** MUST 返回 `{ kind: 'blocked', diagnosis }`
- **AND** diagnosis.reason MUST 标识 `ambiguous-state`

#### Scenario: Archive 后无 active Change 时进入 Checkpoint 边界

- **WHEN** Manifest 显示某 required Change 已 `completed`
- **AND** 当前无 active Change
- **AND**该 Change matching archive Run 已合法terminal completed
- **AND** Git authority 尚无该 Change 的 `change-checkpoint` boundary
- **THEN** `next(snapshot)` MUST 返回 `owner-decision: authorize-checkpoint`
- **AND** context MUST 标识该 completed Change
- **AND** MUST NOT 通过重新投影无关历史 Runs 获得此结论

#### Scenario: Change completed 但 archive Run non-terminal 不得提前 Checkpoint

- **WHEN** Manifest 显示某 Change 已 `completed`
- **AND** 当前无 active Change且Git尚无该 Change checkpoint
- **BUT** matching archive Run仍pending或其它non-terminal状态
- **THEN** `next(snapshot)` MUST NOT返回 `authorize-checkpoint`
- **AND** MUST返回bounded blocked/recovery diagnosis，使同一archive continuation先合法terminalize

#### Scenario: Checkpoint 完成后才继续下一流程

- **WHEN** completed Change 已存在对应 `change-checkpoint` Git boundary
- **AND** 当前无 active Change
- **THEN** Policy MUST 不再返回该 Change 的 `authorize-checkpoint`
- **AND** MUST 根据剩余 planned Change / Delivery Full Test 条件计算唯一下一边界

#### Scenario: legacy 与 structured Checkpoint 混合时不得回退

- **WHEN** 当前 Delivery 的 completed Changes 中既有 legacy 无 `changeId` checkpoint，又有后续 structured `changeId` checkpoint
- **THEN** Policy MUST 同时承认两类 Git boundary
- **AND** MUST NOT 因 structured boundary 出现而把 legacy 已 checkpoint 的 Change 重新返回为 `authorize-checkpoint`

#### Scenario: 其他 Delivery 的同名 Checkpoint 不属于当前 Delivery

- **WHEN** Git history 中存在其他 Delivery 的同名 `<change-id>` checkpoint
- **THEN** 当前 Delivery 的 checkpoint recovery MUST 忽略该 boundary
- **AND** MUST 只消费 Git reader 已限定为当前 Delivery ownership 的 checkpoint facts

#### Scenario: archive Run completed 但 Change 仍 active 为不一致状态

- **WHEN** active Change 的 current stage 已存在 completed `archive` Run
- **BUT** Manifest 仍声明该 Change 为 `active`
- **THEN** `next(snapshot)` MUST fail closed 为 `blocked: ambiguous-state`
- **AND** MUST NOT 直接把 active Change 当作 checkpoint-pending 状态

#### Scenario: Contract Reset 后回到 fresh Proposal generation

- **WHEN** active Change历史上已有旧proposal/apply/review/archive Runs
- **AND** Owner记录新的Contract Reset并声明旧generation abandoned
- **AND**当前reset identity尚无completed propose producer
- **THEN** `next(snapshot)` MUST返回`action: propose`
- **AND** MUST NOT返回`apply`、`review-apply`或`archive`
- **AND**旧revise-propose/review-propose/revise-apply/review-apply artifact或approval MUST NOT跨reset generation继续生效

#### Scenario: reset-aware stage 与 lineage 使用同一 current Run projection

- **WHEN** current Contract Reset identity存在
- **THEN** active stage、Current Artifact、Current Review、`next`与`canRun` MUST基于同一current reset-aware Run/Review projection
- **AND** Proposal之前的合法 Explore handoff MAY继续使用
- **AND** Proposal及之后 MUST NOT因全历史Run fallback重新选择旧generation

#### Scenario: revise producer 与 base producer 使用同一 Reset currentness
- **WHEN** proposal stage历史中存在090-revise-propose且apply stage历史中存在094-revise-apply
- **AND** 两个Run均不匹配current完整Contract Reset identity
- **THEN** stage detection与Current Artifact MUST NOT选择090或094
- **AND** `next`/`canRun` MUST与reset-aware review lineage保持一致
- **AND** fresh generation不得因旧revise producer存在而跳过新的producer/review边界
