## ADDED Requirements

### Requirement: Bootstrap 与后续 Runner 必须共享 B1 Standard Run preparation semantics

Bootstrap手工执行与后续 Runner/adapter在创建 current Standard Run时 MUST遵守同一 B1 ActionDefinition、Delivery-wide Run-ID、pending continuation、logical Action Package与logical result admission contract。Bootstrap MAY由人/AI触发单个 Action，但 MUST NOT通过手工选择任意 NNN、错误 Role、provider session identity或自动 while-next loop绕过B1 execution boundary。

#### Scenario: Bootstrap续接 pending Run
- **WHEN**Bootstrap会话变化但current pending Run与semantic input仍相同
- **THEN**必须继续同一 Run
- **AND** MUST NOT仅因新会话创建新 NNN
