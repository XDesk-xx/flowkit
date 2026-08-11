## ADDED Requirements

### Requirement: Delivery Manifest writer 必须兼容纯 CRLF working-tree input并 canonical write LF

A1 bounded Delivery Manifest mutation contract MUST接受语义相同的纯 LF或纯 CRLF working-tree bytes。CRLF MUST在document parse/mutation seam内部normalize为同一logical lines；successful mutation MUST统一写canonical LF、无trailing whitespace且exactly one EOF newline。混合/非法 carriage return、tabs、duplicate/ambiguous owned keys与unsupported YAML shape MUST继续fail-closed。

该兼容修复 MUST NOT改变 Owner deterministic ref/idempotency、Change.id dependency、architectureImpact legacy boundary、unknown section preservation或activation two-step semantics；`.gitattributes` MAY作为hygiene但MUST NOT替代runtime compatibility。

#### Scenario: CRLF activate 与 LF语义一致
- **WHEN**合法 Delivery Manifest在Windows working tree为纯CRLF
- **AND** `flowkit activate`满足既有A1 preconditions
- **THEN** activation MUST成功产生与LF input相同的semantic mutation
- **AND** written Manifest MUST为canonical LF

#### Scenario: CRLF owner/create change均可写
- **WHEN**合法CRLF Manifest执行 `owner record` 或 `create change`
- **THEN** operation MUST遵守全部既有A1 authority/validation/idempotency contract
- **AND** successful output MUST为canonical LF
