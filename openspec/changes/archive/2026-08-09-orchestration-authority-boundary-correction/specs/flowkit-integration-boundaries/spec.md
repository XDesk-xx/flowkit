## MODIFIED Requirements

### Requirement: ResultRef 必须满足最低引用语义

ResultRef MUST 能唯一识别被引用结果，并让接收方读取或定位结果；MUST NOT 绑定唯一 Provider。ResultRef 的失效语义 MUST 区分**当前 handoff exact binding**与**已结束历史 mutable point-in-time reference**，MUST NOT 把所有 ResultRef 统一解释为 future/current path 永久 immutability。

C1 MUST NOT 把 Git Commit SHA 固定为所有结果引用的唯一形式。具体环境 MAY 把 ResultRef 映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的正式版本引用。

#### Scenario: ResultRef 不绑定单一 Provider

- **WHEN** 不同环境需要引用同一正式结果
- **THEN** ResultRef MAY 映射为不同具体形式
- **AND** 但 MUST 保持唯一识别和其适用 handoff/point-in-time 语义

#### Scenario: 被引用结果失效

- **WHEN** ResultRef 正被当前 Action 用作 immutable input、review binding 或其他明确的 current handoff binding
- **AND** 该 handoff 所要求保持不变的目标在消费完成前被替换或修改
- **THEN** ResultRef MUST 能判断当前 handoff 已失效
- **AND** 当前 Review/续接/下一 Action MUST fail closed 或重新处理

#### Scenario: 历史 mutable ResultRef 是 point-in-time

- **WHEN** completed historical Run 中的 `produced-artifact` 或 terminal `verification-summary` ResultRef 已不再被当前 Action 作为 handoff 消费
- **AND** 同一 logical current path 在后续合法 lifecycle 中发生修改、替换或 OpenSpec relocation
- **THEN** 该 historical ResultRef MUST 继续表示建立引用时的版本
- **AND** MUST NOT 仅因 future/current path bytes 变化把历史 Review/Run 反向判为失效
- **AND** Flowkit MUST NOT 为此恢复 global generation replay 或 archive-path replay

### Requirement: 外部工具必须遵守权威边界

OpenSpec MUST 拥有 Change 契约以及其自身 apply/archive 操作的内部 artifact lifecycle，MUST NOT 决定 Delivery、当前 Action 或 owner 授权。Flowkit MUST NOT 复制 OpenSpec 全部内部状态，也 MUST NOT 在 OpenSpec operation 已返回成功后重新实现 relocation/spec sync 或通过历史 Run fingerprint 二次证明其内部结果。

Git MUST 拥有受版本管理文件、Diff 和历史。Git Commit MUST NOT 等同于续接切点或信息交换媒介。Change Checkpoint 和 Delivery Final MUST 仍是正式 Git 边界。

Verification 工具 MUST 拥有原始检查结果。Flowkit MUST 只消费标准状态、摘要和结果引用。Full Test 授权边界 MUST 继续沿用 B1，MUST NOT 由 Adapter、Agent、Skill 或验证工具自行突破。

Archify MUST 只接收 Delivery 架构上下文并返回架构结果引用。CodeGraph MUST 只接收变化范围或查询上下文并返回依赖、影响范围和相关测试上下文。两者 MUST NOT 决定 Flowkit 下一 Action 或产生最终 Review Verdict。

#### Scenario: Git 边界不等于续接切点

- **WHEN** Flowkit 判断是否形成续接切点
- **THEN** MUST NOT 把 Git Commit 作为唯一判断条件
- **AND** Git 边界 MUST NOT 等同于续接切点
- **AND** MUST NOT 等同于信息交换媒介

#### Scenario: Change Checkpoint 必须限定到所属 Delivery

- **WHEN** Reader 为当前 Delivery 读取 Change Checkpoint Git boundaries
- **THEN** MUST 依据 Git Delivery Start 拓扑只接纳属于当前 Delivery 的 boundary
- **AND** MUST NOT 因其他 Delivery 存在同名 `<change-id>` checkpoint 而把它作为当前 Delivery 的 checkpoint fact
- **AND** legacy 无 `changeId` checkpoint 与 structured `changeId` checkpoint 混合存在时 MUST 保持有界兼容，MUST NOT 因新增 structured boundary 让既有 legacy checkpointed Change 重新变成 pending

#### Scenario: Archify 不决定下一 Action

- **WHEN** Archify 返回架构结果
- **THEN** Archify MUST NOT 决定 Flowkit 下一 Action
- **AND** MUST NOT 产生最终 Review Verdict

#### Scenario: Verification 工具不突破 Full Test 授权

- **WHEN** Verification 工具返回测试结果
- **THEN** Full Test 授权 MUST 继续由 owner 控制
- **AND** Verification 工具 MUST NOT 自行触发 Full Test

#### Scenario: OpenSpec archive success 由 OpenSpec operation 定义

- **WHEN** 未来 Change Execution Loop 在 Flowkit 已确认 archive Action 合法后调用 OpenSpec archive
- **THEN** OpenSpec MUST 自己负责 Change artifact relocation、spec sync 与 operation success/failure
- **AND** Flowkit MAY 记录该外部 operation 的 success/failure 作为本次 Action execution result
- **AND** Flowkit MUST NOT 在 operation success 后通过扫描 archive path、重放 historical ResultRef 或复制 spec merge 状态再次证明 OpenSpec archive
- **AND** 本 Deterministic Core Delivery MUST NOT 因此新增完整 OpenSpec archive Adapter
