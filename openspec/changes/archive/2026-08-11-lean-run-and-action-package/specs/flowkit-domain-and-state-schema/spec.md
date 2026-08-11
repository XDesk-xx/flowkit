## ADDED Requirements

### Requirement: B1 execution schema 必须保持受限且 provider-neutral

Domain MUST提供 fixed ActionDefinition与logical ActionPackage/logical result input的受限 schema。ActionDefinition MUST至少机器表达 `action/role/goalClass/mutationClass/outputClass/terminalContract`并只允许Proposal冻结的十个mapping。Current Run context MUST支持compact Core-derived semantic input fingerprint。Schema MUST NOT加入provider session、chat transcript、Registry entry、Evidence receipt或新的lifecycle主状态。

#### Scenario: provider session 不进入 Run identity
- **WHEN**同一 pending Run在不同 provider/chat session中继续
- **THEN** Domain execution identity MUST仍由 runId + semantic input fingerprint表达
- **AND** MUST NOT要求 provider session id

### Requirement: semantic identity descriptor 必须显式表达 versioned contract inputs

Domain semantic identity descriptor MUST能够规范表达排序后的 `contractRefs {ref,kind,versionFingerprint}`、ActionDefinition identity/version、handoff/review/verification/Owner authority identity，并允许对没有versioned ref但会改变执行语义的authority scalar做canonical encoding。它 MUST NOT退化成整个ActionPackage blob hash或provider/session identity。

#### Scenario: contractRefs 可稳定 canonicalize
- **WHEN**相同 contractRefs 以不同输入顺序提供
- **THEN** canonical descriptor MUST产生相同identity
- **AND**任一 ref/kind/versionFingerprint变化 MUST产生不同semantic fingerprint
