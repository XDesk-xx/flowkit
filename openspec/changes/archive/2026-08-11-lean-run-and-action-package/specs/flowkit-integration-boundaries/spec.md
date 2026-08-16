## MODIFIED Requirements

### Requirement: Action Package 必须是 Standard Change Action 的逻辑执行输入视图

Action Package MUST是B1生成的 provider-neutral logical execution view，只服务十个 Standard Change Actions。Package MAY对 Apply/Archive等 Change Action引用适用 Owner authorization；Delivery Full Test与Delivery Finalize是Delivery behavior，MUST NOT被表达为B1 Standard Change Action Package或Standard Run。Package中的 OpenSpec、Git、Reviewer、Verification、Owner内容只能是当前执行所需refs/最小view，不得复制成第二 authority。

#### Scenario: Action Package 包含适用 Change Owner 授权状态
- **WHEN** current Standard Change Action为 Apply或Archive且该 Action适用 Owner authorization
- **THEN** Action Package MAY包含对应 Owner authorization ref/minimal view
- **AND** MUST NOT把 Delivery Full Test作为 Standard Change Action Package示例或目标

#### Scenario: 后置 adapter只做 physical mapping
- **WHEN** C1/03 integration或provider adapter消费B1 logical Action Package
- **THEN** adapter MUST只做structured context/physical serialization/execution mapping
- **AND** MUST NOT决定 next Action、重定义 package authority或引入 Delivery behavior Run
