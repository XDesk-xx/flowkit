## MODIFIED Requirements

### Requirement: post-action record 必须独立持久化

`verification.md` MUST 继续由 Change 拥有且作为唯一 current formal Verification authority。E2 checkpoint 前，Core MAY 按 pre-E2 current runner 已存在的 per-Run record/sidecar protocol 保存 E2 自己的 generic post-action selection/evidence，但 MUST NOT 引入新的 sidecar format generation；point-in-time authority MUST 由 persisted bytes/content fingerprints、producing Run identity、terminal/result binding 与 `verification.md` publication fingerprint 固定。recognized E2 checkpoint 后，或 fresh/downstream repository 不存在 Flowkit pre-E2 migration lineage时，Core MUST 将 Apply/revise-apply 首次 post-action selection/publication authority 直接绑定在 terminal `result.json`，不得修改 entry `context.json` 或创建新的 per-Run post-action sidecar。Historical records MUST immutable、bounded-readable，future current Catalog/renderer/Markdown MUST NOT 反向重验 historical terminal。

当且仅当 current completed Apply/revise-apply 的 formal Verification 为 `failed` 且 explicit exact-candidate re-verification 合法执行时，current `verification.md` MAY 被新的 point-in-time Verification publication supersede，而 producing Apply terminal result MUST保持 immutable。Supersede 前，前一份 `verification.md` exact bytes MUST保存到 validated Verification authority 目录下 fingerprint-addressed immutable `verification-history/<sha256>.md`。Current publication MUST携带 bounded predecessor/origin metadata；Reader MUST验证一条 finite、acyclic、same-origin/same-candidate/same-selection chain，最终回溯到 producing Apply `terminalBinding.currentVerification.versionFingerprint`。只有 chain 完整成立时，current `verification.md` 才作为当前 status authority；否则 fail closed 为 FactConflict。

`verification-history` 只保存 superseded formal Markdown exact bytes；它不是 Run sidecar、raw-log store 或 generic Evidence platform。Reader/path resolver MUST从已经 validated 的 current Verification authority logical path/dir 派生 history refs，不得建立第二套 Change-root authority。

#### Scenario: terminal 后尝试修改 context

- **WHEN** post-action facts 已产生
- **THEN** post-E2 writer MUST 将 minimal binding 放入 terminal `result.json`
- **AND** MUST NOT terminal-time 注入或回填 `context.json`
- **AND** pre-E2 historical/current migration sidecar不得因此被改写

#### Scenario: record absent 而 Markdown present

- **WHEN** crash 后 Run pending、terminal binding absent 且 `verification.md` present
- **THEN** exact recovery MUST 从 persisted entry/package + current candidate 重算 deterministic selection/checks/Markdown
- **AND** bytes 完全一致才可继续 terminal publication，否则 MUST fail closed

#### Scenario: terminal result 不得早于 commit marker

- **WHEN** Apply/revise-apply terminal result 首次发布
- **THEN** 当时 canonical `verification.md` MUST 已完整存在且 point-in-time fingerprint 与即将写入/绑定的 persisted authority 一致
- **AND** missing/mismatch MUST 阻止 terminal CAS

#### Scenario: Reader 只验证 current applicable selection lineage

- **WHEN** Formal Reader 投影 current Change Verification
- **THEN** MUST 按现有 Policy/Review producer lineage选择唯一 current completed `apply` / `revise-apply` producer
- **AND** 若 current `verification.md` fingerprint 等于该 producer terminal binding，MUST按既有 direct exact-check 路径验证
- **AND** 若 current publication 是 explicit re-verification supersede，MUST验证 current publication + immutable predecessor chain 最终 exact-bind该 producer original terminal verification fingerprint，并保持 same origin Apply、post-action candidate fingerprint 与 selection fingerprint
- **AND** producer/result/binding mismatch、多个 current candidates、history missing/corrupt/cyclic、candidate/selection drift 或 current publication 无法回溯 original binding MUST fail closed

#### Scenario: pending post-action publication 不替换 current authority

- **WHEN** pending Apply/revise-apply 已发布 Markdown 或 migration sidecar 但尚无 terminal result
- **THEN** Reader MUST 将 verification projection 标记为 unavailable/in-flight
- **AND** MAY 为 exact recovery 校验/重算 pending publication
- **AND** MUST NOT 将 pending publication 投影为 satisfied authority，或将 previous terminal binding 对照新 Markdown bytes

#### Scenario: historical terminal binding 是 point-in-time fact

- **WHEN** 后续合法 revise-apply 或 explicit exact-candidate re-verification 发布新的 point-in-time authority
- **THEN** earlier Apply/revise-apply result、historical record/sidecars、fingerprint-addressed Verification history 与 ResultRefs MUST 保持有效
- **AND** Reader MUST NOT 将 future current-path bytes、future Catalog 或 future renderer 与 historical fingerprint 比较产生 FactConflict

#### Scenario: old terminal exact replay 不读取 future Markdown

- **WHEN** `resumeRun(expectedRunId)` 或 equivalent replay 指向 non-current historical terminal
- **THEN** Core MUST 直接返回 persisted terminal，并只校验该 historical record/result 自身 closed binding
- **AND** MUST NOT 读取 current canonical `verification.md`、current selection lineage、future Catalog 或 future renderer作为 historical authority

#### Scenario: failed origin publication remains immutable after re-verification
- **WHEN** completed Apply terminal binding exact-binds failed publication fingerprint `F0`
- **AND** later explicit re-verification publishes current fingerprint `F1`
- **THEN** exact bytes whose SHA-256 is `F0` MUST exist at the deterministic immutable Verification history ref
- **AND** Apply `result.json` MUST remain byte-identical
- **AND** current authority MAY project `F1` only after Reader validates the chain back to `F0`

#### Scenario: broken re-verification chain is a formal fact conflict
- **WHEN** current publication declares re-verification lineage but any predecessor ref is missing, fingerprint-mismatched, cyclic, points outside the validated Verification history namespace, changes origin Apply/candidate/selection identity, or cannot terminate at the original Apply terminal fingerprint
- **THEN** Reader MUST collect a Change Verification selection/publication FactConflict
- **AND** MUST NOT project the new current marker as satisfied authority
