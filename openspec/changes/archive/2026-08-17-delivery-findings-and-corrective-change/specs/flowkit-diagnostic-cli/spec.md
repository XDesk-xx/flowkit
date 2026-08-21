## ADDED Requirements

### Requirement: Diagnostics 必须只读呈现 current Full Test Finding occurrence handoff

当 current Delivery 处于 genuine `full-test-failed` boundary 时，diagnostic CLI MUST 从同一 FormalFactSnapshot/Policy result只读呈现 current derived Full-Test Finding occurrence 的 `findingId`、`authorizationRef` 与 `sourceResultRef`，使 Owner/Executor 在 fresh process 中无需聊天状态即可形成 exact corrective create input。Diagnostics MUST NOT从 historical `fullTestFindings[]` 选择一个旧 Finding冒充 current blocker，也 MUST NOT写回 Manifest。

#### Scenario: next 呈现 failed Finding exact occurrence binding
- **WHEN** Policy 返回 `blocked: full-test-failed` 且有 current derived Finding
- **THEN** `flowkit next` MUST 稳定呈现 reason、owner actions、current findingId、authorizationRef 与 sourceResultRef
- **AND** 输出 MUST来自 Policy/Snapshot，不得重新实现 finding derivation

#### Scenario: status/resume-context fresh process 可恢复 corrective handoff
- **WHEN** fresh process读取 current failed Delivery
- **THEN** `status` 与 `resume-context` MUST 至少呈现 current Finding occurrence exact binding所需的稳定 machine-readable lines
- **AND** MUST NOT要求 chat/session state

#### Scenario: 相同 failure 内容的新 cycle diagnostics 仍可区分
- **WHEN** historical resolved Finding与 current unresolved Finding拥有相同 `sourceResultRef`
- **BUT** current occurrence拥有新的 `authorizationRef/findingId`
- **THEN** diagnostics MUST 只呈现新的 current occurrence
- **AND** MUST NOT因 sourceResultRef相同显示旧 resolution

#### Scenario: correction consumed 后历史 Finding 不再显示为 current
- **WHEN**合法 corrective admission 已完成且 raw `fullTestStatus=not-ready`
- **THEN** diagnostics MUST NOT把 persisted historical `fullTestFindings[]` item显示为 current blocking finding
- **AND** next MUST 按 ordinary corrective Change/Delivery readiness formal facts呈现
