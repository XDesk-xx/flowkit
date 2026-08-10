## ADDED Requirements

### Requirement: Diagnostic projection 必须反映 canonical id dependency 与 typed Owner facts

`status`、`next`、`doctor`、`resume-context` MUST 继续通过共享 FormalFactSnapshot/Policy 读取 A1 owner facts 与 dependency result，CLI 自身 MUST NOT建立第二套 dependency/authorization匹配规则。对真实 persisted `dependsOn=Change.id` 的 completed dependency，diagnostics MUST 不得错误呈现 `dependency-incomplete`。

#### Scenario: next 对真实 Manifest dependency 输出 activate-change
- **WHEN** shared snapshot 中 planned Change 的 canonical id dependencies 全部 completed
- **AND** Policy 返回 `owner-decision: activate-change`
- **THEN** `flowkit next` MUST 稳定呈现该 owner-decision
- **AND** MUST NOT 因 key/id 差异重写为 dependency-incomplete

### Requirement: A1 write CLI 必须与 diagnostic commands 分层

新增 `create delivery`、`create change`、`owner record`、`activate` write command MUST NOT 改变现有四个 diagnostic command 的 read-only contract。Diagnostic command MUST NOT 因观察到 Owner record 就执行 lifecycle mutation。

#### Scenario: doctor 不自动修复 activation
- **WHEN** `doctor` 观察到合法 Owner activation provenance
- **THEN** doctor MAY 呈现相关正式状态
- **AND** MUST NOT 修改 Manifest 或创建 OpenSpec metadata
