## MODIFIED Requirements

### Requirement: resume-context 生成最小可恢复视图并覆盖 Delivery-level 状态

`flowkit resume-context` MUST输出当前 Delivery、active Change、current stage、last formal artifact、last relevant Run、latest valid Review、Change Verification与 Policy next。`last formal artifact` MUST根据当前 stage与 active Change canonical OpenSpec paths派生；MUST NOT根据 historical ResultRef replay、`.tmp/**`、聊天记录或 Provider session决定。

G1后，`resume-context` MUST消费与 single-action Agent Adapter/H1 downstream consumer相同的 underlying typed resume projection或其严格子集，并增加当前 Delivery Architecture `current/planned/actual` 的只读存在状态；存在的 durable JSON MUST绑定 logical path与content fingerprint，缺失 MUST明确为 absent/not-applicable。适用 current execution需要 managed external tool context时，renderer MAY呈现 exact managed OpenSpec/Archify readiness/identity，但该 local-environment view MUST来自 closed managed-tool resolver，MUST NOT使用 ambient PATH fallback或改变 Policy。`resume-context` 仍 MUST保持 read-only，MUST NOT写 resume/session registry/cache、生成 Actual Architecture或持久化第二份 tool/architecture truth。

唯一 active Delivery存在但无 active Change时，resume-context MUST输出 `change=none`、`stage=delivery-level`、`last-artifact=none`、`review=none`、`verification=not-applicable`，`last-run` MUST为 Delivery内 admitted Run ID最大者或 `none`，并 MUST直接呈现现有 Delivery-level Policy next；Architecture projection仍按当前 Delivery repository assets只读派生。

#### Scenario: current Change 可恢复
- **WHEN** active Change formal facts可读取
- **THEN** resume-context MUST输出 Delivery、Change、stage、last formal artifact、last relevant Run、Review、Verification与 Policy next
- **AND** MUST与 underlying typed resume projection对相同 authority dimensions保持一致

#### Scenario: last formal artifact 由 stage 与 canonical path 决定
- **WHEN** 当前 stage已产生一个或多个正式 OpenSpec artifacts
- **THEN** resume-context MUST从 active Change当前 canonical artifact projection选择与 stage对应的最后正式 artifact
- **AND** MUST NOT用 historical ResultRef的旧 fingerprint锁定 current path

#### Scenario: Architecture refs/status 只读呈现
- **WHEN**当前 Delivery存在 Current/Planned JSON且 Actual尚不存在
- **THEN** resume-context MUST呈现 Current/Planned present + logical path/content fingerprint与 Actual absent
- **AND** MUST NOT创建或修改任何 Architecture JSON/HTML

#### Scenario: managed tool view 不覆盖 repository/Policy truth
- **WHEN** underlying projection检查适用 managed OpenSpec/Archify readiness
- **THEN** resume-context MAY呈现 exact managed identity或 bounded unavailable/mismatch status
- **AND** MUST NOT使用 ambient executable冒充 managed ready
- **AND** MUST NOT因 local tool status自行改变 `next`

#### Scenario: no-active-Change resume-context 是正常 Delivery-level view
- **WHEN** 唯一 active Delivery存在
- **AND** 当前没有 active Change
- **THEN** resume-context MUST输出 `change: none`
- **AND** MUST输出 `stage: delivery-level`
- **AND** MUST输出 `last-artifact: none`
- **AND** MUST输出 `review: none`
- **AND** MUST输出 `verification: not-applicable`
- **AND** MUST输出现有 Policy的 Delivery-level `next-kind / next-detail`
- **AND** command MUST NOT因无 active Change返回 discovery/loading failure

#### Scenario: scratch 与聊天不可作为恢复输入
- **WHEN** `.tmp/**`、聊天历史或 Provider session包含额外上下文
- **THEN** resume-context MUST NOT依赖这些内容才能生成正式恢复视图
