## ADDED Requirements

### Requirement: pending archive continuation 必须绑定 current execution scope

B1 preparation MUST在 Delivery-wide historical pending archive lookup 之前确定 current active Change relevance。存在 active Change时，normal `next` / explicit `review` preparation MUST只处理该 active Change 的 Standard Action与pending Run；另一个已经 completed/checkpointed Change 的 historical pending archive MUST NOT抢占、改写或阻塞该 active Change的正常 preparation。

当不存在 active Change时，B1 MAY查找唯一 lifecycle-relevant pending archive continuation；若找到，MUST复用同一 Run identity并按 archive-specific recovery/admission contract处理。该 lookup MUST只用于 continuation identity，不得成为 archive success authority或 generic pending-Run router。

#### Scenario: historical 085 不抢占 D2 Explore/Propose
- **WHEN** D1 已 completed/checkpointed但历史 085 archive仍是pending terminal-observation
- **AND** D2 是当前唯一 active Change且 shared Policy返回 D2 Standard Action
- **THEN** B1 preparation MUST绑定 D2 current Action
- **AND** MUST NOT先进入 D1/085 archive resume
- **AND** Delivery-wide allocator仍 MUST基于完整Run corpus分配下一NNN

#### Scenario: 无 active Change 时同一 pending archive 继续恢复
- **WHEN** 当前无 active Change
- **AND**唯一 lifecycle-relevant pending Run为某 completed-uncheckpointed Change 的 archive continuation
- **THEN** normal preparation MAY恢复该同一 archive Run
- **AND** MUST NOT创建新 archive Run或消耗新NNN
- **AND** recovery safety MUST继续由 durable archive guard/terminalObservation与semantic identity决定

#### Scenario: historical pending archive lookup 不成为 generic router
- **WHEN**存在多个历史 pending Run、非archive pending或已checkpoint历史 archive
- **THEN** B1 MUST NOT通过 Delivery-wide lookup自动选择任意旧 Run代替 current active Change execution
- **AND** generic Run completion/cancellation MUST NOT由该机制产生

### Requirement: Contract Reset 后 Action preparation 必须绑定 fresh Proposal generation

当 active Change出现新的 Contract Reset identity且尚无与该identity匹配的proposal producer时，normal preparation MUST解析为 `propose`，并绑定最近合法approved Explore handoff与当前Owner fact refs。Proposal stage 的 `propose/revise-propose/review-propose` 与 Apply stage 的 `apply/revise-apply/review-apply` MUST全部按同一完整 reset identity过滤；它 MUST NOT消费旧`revise-propose`、旧`review-propose`、旧Apply、旧`revise-apply`或旧Review-Apply作为current input。

新proposal-stage producer完成后，`review-propose` MUST绑定该 generation 的 current producer（包括合法的 current `revise-propose`）；只有该新review approved后，后续Apply才能消费对应current review。Apply stage 如出现合法 `revise-apply`，后续 `review-apply` MUST只绑定同一 reset identity 的 current `revise-apply`，不得回退旧 094。`prepareActionExecution`、`inspectPreparedRun`、unified entry与immutable contract producer selection MUST与Policy使用同一reset-currentness，不能一处路由到新generation而另一处回退旧lineage。

#### Scenario: reset 后 first producer 是 propose
- **WHEN** 旧generation已走到Apply/Review/Archive历史
- **AND**新的Contract Reset使该proposal generation abandoned
- **AND**当前尚无匹配新reset identity的propose producer
- **THEN** normal preparation MUST创建/恢复`propose` Author Run
- **AND**其`inputRef/reviewView` MUST绑定合法approved Explore review
- **AND** MUST NOT绑定旧review-propose approval

#### Scenario: Policy 与 preparation 不得再出现 currentness 分裂
- **WHEN** `next`判断当前Action为某reset-aware lifecycle Action
- **THEN** formal preparation对同一snapshot MUST能构造该Action的同一current generation binding
- **AND** MUST NOT因选择了不同历史generation而产生`status/next`可推进但preparation因immutable generation drift失败的矛盾

#### Scenario: 历史 revise-propose / revise-apply 不得成为新 generation producer
- **WHEN** 历史中存在不匹配current reset identity的090-revise-propose与094-revise-apply
- **AND** fresh generation已开始新的propose producer
- **THEN** `currentArtifactRun`、review binding与Action Package producer selection MUST NOT选择090或094
- **AND** fresh `review-propose` / `apply` / `review-apply` MUST只消费current reset identity下的producer/review lineage
