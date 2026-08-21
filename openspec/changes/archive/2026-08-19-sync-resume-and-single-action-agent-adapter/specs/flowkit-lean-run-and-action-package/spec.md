## MODIFIED Requirements

### Requirement: terminal replay 必须 exact 且幂等

terminal admission MUST绑定 exact persisted Run、matching current/historical ActionPackage shape 与 canonical logical descriptor。E2 checkpoint 前，E2自身 Apply/revise-apply MUST保持 pre-E2 runner 的 entry/resume protocol，并按 `fresh post-action observation → deterministic generic selection/check execution → deterministic verification.md publication → existing migration-sidecar binding → terminal result CAS-last` 完成；该 migration path MUST NOT新增 sidecar/schema/renderer/Catalog generation。recognized E2 checkpoint后，或 fresh/downstream repository不存在 Flowkit pre-E2 migration lineage时，prospective Apply/revise-apply MUST按同一 logical flow把 compact point-in-time binding写入 `result.json` → CAS-last，并且不得生成 per-Run verification sidecar。相同 Run 上 canonical logical descriptor相同的重复提交 MUST按 persisted state exact recovery或返回既有 terminal；descriptor、Role、Action、binding、structural shape或identity不同 MUST fail closed。

对 completed Apply/revise-apply 的 historical terminal replay，producing Run 中的 `currentVerification` binding MUST继续表示该 Run 完成时的 immutable point-in-time Verification identity，而不是 future current publication。Replay MUST接受且只接受以下两种 current authority关系：

```text
1. current verification publication exact-match producing terminal binding
or
2. current verification publication is a valid bounded re-verification successor chain
   anchored at the producing terminal binding
   with the same origin Run / exact candidate / selection identity
```

OpenSpec archive只能改变 current Verification authority bytes 的 physical storage location；historical terminal binding的logical ref MUST保持 immutable。Replay MUST能够从 active Change root或 unique matching archived Change root解析 current Verification及其 `verification-history/**`；missing/ambiguous archive root、missing predecessor、fingerprint mismatch、cycle、origin/candidate/selection drift或任何无法证明的supersession MUST fail closed。Current successor status MAY与 producing binding status不同；合法 retry PASS不得要求改写historical terminal result。Historical E1 sidecar generation继续按其persisted selection/evidence point-in-time bytes验证，MUST NOT因current/future Catalog变化被重新解释。

#### Scenario: concurrent callers 提交相同 terminal descriptor
- **WHEN** 多个 caller 对同一 pending Run 提交 canonical-equivalent terminal descriptor
- **THEN** 至多一个 writer MUST 发布 terminal result
- **AND** 其余 caller MUST 读取并返回同一 persisted terminal state

#### Scenario: record present 而 Run 仍 pending
- **WHEN** pre-E2 runner 已存在 immutable selection/evidence binding 与 matching Markdown，但 producing Run仍 pending
- **AND** exact replay package/descriptor canonical-equivalent
- **THEN** admission MUST校验既有 persisted binding后按既有 terminal CAS-last语义继续
- **AND** unknown/ambiguous/mixed persisted shape MUST fail closed
- **AND** MUST NOT把 sidecar contract要求给 post-E2 writer

#### Scenario: completed terminal 缺失 post-action binding
- **WHEN** Apply/revise-apply Run 已存在 completed terminal result，但该 persisted shape所需的 verification binding缺失或不匹配
- **THEN** Reader/admission MUST fail closed为 conflict
- **AND** MUST NOT通过 terminal-time backfill、future Catalog重算或 Markdown重渲染修复历史 terminal authority

#### Scenario: post-E2 Markdown present 而 Run 仍 pending
- **WHEN** deterministic `verification.md` 已发布但 post-E2 producing Run仍 pending
- **AND** exact replay package/descriptor canonical-equivalent
- **THEN** admission MUST从 persisted compact entry identity + current candidate重算 selection/checks/publication
- **AND** matching时 MAY覆盖同一 deterministic Markdown并继续 terminal CAS
- **AND** MUST NOT创建 verification-selection/evidence sidecar 或 replacement Run

#### Scenario: exact current Verification 仍可直接 replay historical terminal
- **WHEN** completed Apply/revise-apply 的 current Verification publication logical identity/content fingerprint/status/selection exact-match producing terminal binding
- **THEN** terminal replay MUST返回既有 terminal
- **AND** MUST NOT创建新 Run或重写 result

#### Scenario: legal re-verification successor 可 supersede historical producing binding
- **WHEN** current Verification publication通过 bounded history chain exact锚定 producing terminal binding
- **AND** chain保持同 origin Run、exact candidate与selection identity
- **THEN** historical terminal replay MUST接受该 current authority并返回 immutable existing terminal
- **AND** current status MAY与 producing binding status不同
- **AND** historical terminal binding MUST NOT被改写为 successor fingerprint/status

#### Scenario: archived physical relocation 不改变 logical authority identity
- **WHEN** producing Change 已由 OpenSpec archive从 active root迁移到 unique matching archived Change root
- **THEN** terminal replay MUST在该 archived root解析 current `verification.md` 与 history bytes
- **AND** producing terminal中的 active logical ref MUST保持 unchanged point-in-time identity

#### Scenario: ambiguous或corrupt archive/retry lineage fail closed
- **WHEN**存在多个 matching archive roots、缺失 predecessor、history fingerprint mismatch、chain cycle或 origin/candidate/selection drift
- **THEN** terminal replay MUST fail closed为 bounded conflict
- **AND** MUST NOT选择任意 archive、重算 historical selection或修补 historical result
