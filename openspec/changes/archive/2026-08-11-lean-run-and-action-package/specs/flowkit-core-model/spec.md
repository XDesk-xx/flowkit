## ADDED Requirements

### Requirement: Standard Run execution instance 必须遵守 ActionDefinition 与 same-pending 语义

每个 current Standard Run MUST匹配 fixed Standard Change ActionDefinition及其唯一执行 Role。Pending Run本身 MUST代表一个 execution instance；同一 pending Action在semantic input未变化时 MUST继续同一 Run，MUST NOT因聊天/provider session变化创建新 Run。Failed/cancelled retry、new Reviewer execution、real revise或new Action MUST使用 new Run instance与新的 Delivery-wide NNN。

#### Scenario: pending continuation不消耗 NNN
- **WHEN** current pending Run仍匹配current Action与semantic input
- **THEN** continuation MUST复用该 runId
- **AND** Checkpoint或session变化 MUST NOT消耗/重置 NNN

### Requirement: logical Action Package ownership 属 B1 且只覆盖 Standard Change Actions

B1 MUST拥有 Standard Change Action的logical Action Package preparation contract。Delivery Full Test与Delivery Finalize MUST继续作为 Delivery behavior，MUST NOT拥有 Standard Run或B1 Action Package。后置 adapter/transport MUST只物理映射/执行已冻结 package，不得成为 lifecycle authority。

#### Scenario: Full Test 不借 Action Package 回到 Run catalog
- **WHEN** Delivery进入 Full Test behavior boundary
- **THEN** MUST NOT创建 Standard Run或B1 Action Package

### Requirement: B1 Run preparation 必须保留 explicit direct re-review execution generation

当Q1 Policy使`next()`因non-author blocker保持blocked时，B1 MUST NOT把该blocked结果解释为“所有Run入口都禁止”。显式统一`review`入口 MUST继续由shared Policy解析；合法same-stage direct re-review在没有matching pending review时 MUST创建新的Reviewer execution generation/NNN，在matching pending review时 MUST按semantic identity resume。该例外 MUST NOT扩展为caller任意指定其它Action。

#### Scenario: blocked next 与合法 review entry 可同时成立
- **WHEN** current matching changes-requested包含non-author blocker
- **THEN** `next()` MAY保持blocked authority boundary
- **AND** explicit unified review MUST仍可由Policy合法解析same-stage review
