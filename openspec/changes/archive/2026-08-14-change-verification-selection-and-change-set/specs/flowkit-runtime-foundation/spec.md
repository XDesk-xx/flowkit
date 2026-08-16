## ADDED Requirements

### Requirement: Windows timeout cancellation 必须覆盖 process tree

外部 command runner 在 Windows 上启动 PowerShell、`.cmd`、`.bat` 或其 descendants 时，timeout cancellation MUST 尝试终止整个 owned process tree，并区分 confirmed termination 与 unconfirmed outcome。单个 launcher process 的 kill signal MUST NOT 被解释为整个 writer tree 已停止。

#### Scenario: process tree 已确认终止

- **WHEN** timeout handler 已确认 owned launcher 与 descendants 全部 terminal
- **THEN** runner MUST 返回 deterministic timed-out/cancelled transport outcome
- **AND** MUST 保留 stdout、stderr 与 termination diagnostics

#### Scenario: process tree 无法确认终止

- **WHEN** runner 无法证明一个或多个 owned descendants 已停止
- **THEN** outcome MUST 是 fail-closed `outcome-unknown`
- **AND** caller MUST NOT 自动重试 new preparation 或其他 write-side operation

### Requirement: external command outcome 必须保留 transport 与 domain 边界

runner MUST 区分 spawn failure、non-zero terminal exit、confirmed timeout cancellation 与 `outcome-unknown`。adapter 或 caller MUST NOT 把 transport ambiguity 伪装为 domain failure/success。

#### Scenario: caller 在 timeout 后恢复

- **WHEN** write-side external command 返回 `outcome-unknown`
- **THEN** caller MUST 先检查 expected persisted identity 或 authoritative external state
- **AND** MUST NOT 假定操作未发生
