## ADDED Requirements

### Requirement: OpenSpec structured execution view 与 semantic identity projection 必须分离

OpenSpec thin integration MUST继续为 Standard Change Action提供完整 raw structured execution view，但 B1 pending semantic identity MUST使用 action-sensitive bounded projection。Flowkit MUST NOT通过删除 raw OpenSpec context来修复 self-mutation drift，也 MUST NOT把 Action-owned output/progress重新解释为 external authority input。

#### Scenario: raw context 仍提供给 Propose
- **WHEN** Propose Action被准备
- **THEN** Author/executor MUST仍可获得 OpenSpec artifact paths/instructions的完整 structured view
- **AND** semantic fingerprint MAY只消费其中 bounded external semantic projection

### Requirement: Propose semantic projection 必须排除 self-owned artifact existence

对 `propose/revise-propose`，OpenSpec semantic projection MUST排除由该 Action合法创建 planning artifacts导致的 current artifact existence、current output set与 `existingOutputLogicalPaths`变化；MUST保留 version/change identity、instruction/template semantic content、schema、resolved output identity、dependencies/unlocks等 execution contract。

#### Scenario: output path 从 absent 变 existing 不漂移
- **WHEN** pending Propose创建其 approved planning artifact output
- **AND** OpenSpec随后报告 corresponding existing output path
- **THEN** semantic identity MUST不因该 self-owned existence变化而漂移

### Requirement: Apply semantic projection 必须排除 self-owned progress/state

对 `apply/revise-apply`，OpenSpec semantic projection MUST排除由合法 task writes产生的 progress counters与 derived state；MUST保留 exact apply `contextFiles` identity与其它 external prerequisites。Planning artifact bytes/contract generation仍 MUST由 Flowkit versioned contractRefs或等价 authoritative refs绑定。

#### Scenario: task completion 更新不漂移
- **WHEN** pending Apply将一个 task从 incomplete更新为 complete
- **AND** OpenSpec progress/state因此变化
- **THEN** same pending semantic identity MUST保持稳定

#### Scenario: contextFiles 改变必须漂移
- **WHEN** pending Apply之后 OpenSpec structured apply contextFiles identity发生变化
- **THEN** fresh semantic fingerprint MUST变化
- **AND** old pending Run MUST fail closed

### Requirement: Windows OpenSpec default shim resolution 必须 ps1-first

当未显式提供 OpenSpec executable且 platform=`win32`时，adapter MUST优先解析 PATH 中 exact `openspec.ps1`。只有 `.ps1` shim不存在时才 MAY fallback到 `openspec.cmd`；两者都不存在 MUST fail closed。

若 `.ps1` shim存在并被选中，但 PowerShell launcher缺失、spawn失败、timeout或script exit failure，adapter MUST fail closed且 MUST NOT静默改走 `.cmd`。Explicit executable MUST保持 caller authority，并按其 `.ps1` / `.cmd|.bat` / other executable type使用对应 process mechanics。Non-Windows default MUST保持 direct `openspec` execution。

#### Scenario: ps1 shim 优先
- **WHEN** Windows PATH同时存在 `openspec.ps1` 与 `openspec.cmd`
- **THEN** default OpenSpec adapter MUST选择 `.ps1`
- **AND** MUST NOT优先执行 `.cmd`

#### Scenario: ps1 不存在时 cmd fallback
- **WHEN** Windows PATH不存在 `openspec.ps1`但存在 `openspec.cmd`
- **THEN** adapter MAY选择 `.cmd`
- **AND** shared launcher MUST使用既有 ComSpec mechanics

#### Scenario: selected ps1 失败不静默降级
- **WHEN** `.ps1` shim存在但 bounded PowerShell execution失败
- **THEN** adapter MUST返回 fail-closed OpenSpec process failure
- **AND** MUST NOT自动 retry `.cmd`
