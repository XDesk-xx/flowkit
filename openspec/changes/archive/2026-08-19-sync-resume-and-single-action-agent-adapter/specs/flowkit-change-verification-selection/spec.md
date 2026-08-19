## ADDED Requirements

### Requirement: G1 resume/Agent Adapter mutation family 必须形成 closed Verification ownership 与 physical target closure

G1 对 typed resume projection、historical terminal replay、single-action Agent Adapter、diagnostic projection、Verification resolver/ownership mapping 与对应 regressions的 expected actualChangeSet MUST由 closed module ownership/capability relation覆盖。正式 Change Verification MUST选中能物理执行 G1 targeted integration target的 logical check；仅运行已有 unrelated CLI/unit tests、full repository suite或静态 logical selection不得替代 G1 physical closure。

G1 integration target MUST至少验证：fresh-process/fresh-checkout exact pending resume、different future Delivery-shaped IDs、historical F1 retry+archive terminal replay、corrupt/missing/ambiguous archive/reverification lineage fail closed、historical E1 sidecar no-current-Catalog reinterpretation、Architecture/tool derived resume view、provider收到 bounded OpenSpec structured context、exactly one provider invocation、existing result admission与no-auto-next/no-second-Run invariant。

#### Scenario: expected G1 change set 选择完整 logical checks
- **WHEN** expected G1 production/test paths覆盖 `src/services` resume/adapter、`src/diagnostics` resume projection与 `src/verification/change-selection` ownership/resolver更新
- **THEN** production `buildVerificationSelection()` MUST得到 matched capability relation
- **AND** selected checks MUST包含这些 module dependency closure要求的 `tests-execution`、`tests-cli`、`tests-verification`与 `typecheck`（以及由真实 paths/relations确定的其他现有 checks）

#### Scenario: G1 targeted integration target 被正式 resolver 物理执行
- **WHEN** selected G1 logical Node test check执行
- **THEN** physical resolver MUST包含 G1 `sync-resume-and-single-action-agent-adapter` integration target
- **AND**该 target MUST有唯一 verification module owner

#### Scenario: G1 sentinel failure 不能被 unrelated PASS 掩盖
- **WHEN** disposable copy让新的 G1 integration target deterministic fail
- **THEN**对应 formally selected logical check MUST fail
- **AND** unrelated unit/full-suite PASS MUST NOT被视为 physical closure
