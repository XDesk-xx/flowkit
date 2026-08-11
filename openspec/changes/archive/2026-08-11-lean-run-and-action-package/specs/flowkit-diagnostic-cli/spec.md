## ADDED Requirements

### Requirement: Diagnostics 必须可恢复 B1 prepared pending Run 且保持 read-only

`status`、`doctor`、`resume-context` MUST能够从 current formal facts/context显示 B1 prepared pending Run的 action/role/runId与可resume/semantic-input-drift诊断，但 MUST NOT生成 Action Package作为新的 authority、创建 Run、修改 semantic fingerprint或自动执行 Action。完整 action execution CLI仍属于 G1。

#### Scenario: resume-context查看 pending B1 Run
- **WHEN**唯一 active Change存在一个合法 B1 prepared pending Run
- **THEN** resume-context MUST稳定指出同一 runId/action与resume boundary
- **AND** command MUST保持 repository byte-identical
