## Purpose

定义 Change Archive 成功关闭 Change 后的 Owner-authorized Git Change Checkpoint handoff、严格且不可事后追认的 boundary admission、bounded legacy compatibility 与后续 Policy progression，确保 Checkpoint 保持 Git authority 而不是新的 Run 或第二份状态系统。

## ADDED Requirements

### Requirement: Archive success 必须先关闭 Change，Checkpoint 只能作为后续独立 Git boundary

OpenSpec archive structured success 被 Flowkit合法 admission 后，Flowkit MUST 将 target Change记录为 `completed`。Change Checkpoint MUST NOT 成为 active → completed 的前置条件，也 MUST NOT重新打开已经 completed 的 Change。completed 且尚无 matching admitted checkpoint 的 Change MUST进入独立 checkpoint readiness / Owner authorization boundary。

#### Scenario: Archive success 后等待 Checkpoint

- **WHEN** Change 的合法 archive Run terminal completed，OpenSpec archive operation success 已被接纳且 Manifest Change=`completed`
- **AND** Git authority 尚无 matching admitted Change Checkpoint
- **THEN** Flowkit MUST 将该 Change 保持 completed
- **AND** MUST 进入 checkpoint readiness / Owner authorization boundary
- **AND** MUST NOT 创建 Checkpoint Run 或把 Change恢复为 active

### Requirement: Checkpoint handoff 必须绑定 exact Owner authorization 且不执行 Git mutation

在 current Policy 请求 `authorize-checkpoint` 且 Owner 已写入 exact Delivery/Change target 的合法 `authorize-checkpoint` record 后，Flowkit MAY生成 deterministic checkpoint handoff。Handoff MUST包含 canonical checkpoint subject、`Flowkit-Delivery`、`Flowkit-Change`、`Flowkit-Boundary: change-checkpoint` 与 matching `Owner-Authorization` ref，并 MUST要求正式 Git boundary 前执行 `git diff --check`、暂存后执行 `git diff --cached --check`。

Flowkit handoff MUST NOT执行 `git commit`、`git push`、merge/rebase，MUST NOT持久化第二份 checkpoint state，也 MUST NOT创建 Standard Run。Git Commit与push仍由授权后的 Executor/Git workflow机械完成。

#### Scenario: Owner authorization 后生成 handoff

- **WHEN** completed-uncheckpointed Change 是唯一 checkpoint target
- **AND** matching `authorize-checkpoint` Owner fact 已合法存在
- **THEN** Flowkit MAY输出 `chore(flowkit): checkpoint <change-id>` 与 exact formal trailers/preflight requirements
- **AND** 输出 MUST绑定同一 Delivery、Change 与 Owner ref
- **AND** MUST NOT自动形成 Git commit或push

#### Scenario: Handoff target 或 Owner fact 不唯一

- **WHEN** checkpoint target、Owner authorization或其 Delivery/Change binding 缺失、冲突或歧义
- **THEN** handoff MUST fail closed
- **AND** MUST NOT执行任何 Git mutation

### Requirement: Current Change Checkpoint admission 必须使用完整 formal Git identity

Strict current Change Checkpoint MUST同时满足 exact checkpoint subject、current Delivery topology ownership、`Flowkit-Delivery`、`Flowkit-Change`、`Flowkit-Boundary: change-checkpoint` 与 `Owner-Authorization`。缺失、重复、冲突、wrong Delivery、wrong Change、wrong Boundary、subject-only或 malformed provenance 的 commit MUST NOT被投影为 formal `change-checkpoint` fact。

#### Scenario: 完整 formal checkpoint 被接纳

- **WHEN** Git commit位于 current Delivery Start topology
- **AND** subject 与 `Flowkit-Change` 指向同一个 exact Change
- **AND** `Flowkit-Delivery` 等于 current Delivery
- **AND** `Flowkit-Boundary=change-checkpoint`
- **AND** Owner authorization满足本 capability 的 temporal binding requirement
- **THEN** Reader MAY将该 commit投影为 matching `change-checkpoint` fact

#### Scenario: Subject-only checkpoint 被拒绝

- **WHEN** commit subject看似 `chore(flowkit): checkpoint <change-id>`
- **BUT** required formal trailers或Owner provenance缺失/冲突
- **THEN** Reader MUST NOT把该 commit投影为 current formal Change Checkpoint

### Requirement: Owner checkpoint authorization 必须在 Git boundary 形成时已经存在

Strict checkpoint admission MUST证明 matching `authorize-checkpoint` Owner fact 在该 checkpoint boundary形成时已经存在。Reader MUST基于 checkpoint-time/ancestor formal fact验证 exact decision、Delivery、Change、source provenance与 canonical Owner ref，MUST NOT仅凭 later/current Manifest 中后来出现的同 ref 对历史 commit进行事后追认。

#### Scenario: Authorization-before-checkpoint 被接纳

- **WHEN** matching canonical `authorize-checkpoint` Owner record 已存在于 checkpoint boundary形成时可证明的 formal Manifest fact中
- **AND** checkpoint Git identity完整且 target一致
- **THEN** strict admission MAY接纳该 checkpoint

#### Scenario: Checkpoint-first 后补 authorization 不得事后追认

- **WHEN** checkpoint commit形成时其 point-in-time formal facts中不存在 matching `authorize-checkpoint` Owner record
- **AND** later commit才把相同 `Owner-Authorization` ref 对应 record写入 current Manifest
- **THEN** Reader MUST NOT retroactively admit 该历史 checkpoint
- **AND** current Policy MUST继续把 target视为 completed-uncheckpointed，直到出现合法新 boundary

### Requirement: Historical checkpoint compatibility 必须 bounded，fresh repository 默认 strict

Flowkit MAY为当前仓库真实存在的 pre-strict migration checkpoints提供 bounded read compatibility，但该 compatibility MUST由明确 migration cutover/ancestor scope限制，MUST NOT演化成对所有 subject-only checkpoint的永久 fallback。Strict anchor及其后续 boundaries MUST使用完整 formal + temporal admission。

Git history中不存在该 Flowkit pre-strict migration lineage 的 fresh/downstream repository MUST从 current implementation开始直接使用 strict checkpoint admission，MUST NOT要求伪造历史 migration anchor，也 MUST NOT获得 legacy subject-only exemption。

#### Scenario: Pre-cutover legacy checkpoint 保持可读

- **WHEN** historical checkpoint已位于明确 strict migration anchor之前且属于同一 bounded legacy lineage
- **THEN** latest Reader MAY按冻结的 legacy topology规则继续识别
- **AND** MUST NOT回写或重写历史 Git commit

#### Scenario: Fresh repository 不继承 legacy fallback

- **WHEN** repository不存在 Flowkit pre-strict migration lineage
- **THEN** current checkpoint recognition MUST从第一份 checkpoint开始使用 strict formal + temporal admission
- **AND** subject-only commit MUST NOT因缺少migration anchor而被接纳


### Requirement: Migration writer activation 必须与 legacy admission 共享同一个 strict-admitted E2 cutover

对于包含 Flowkit 02 pre-E2 migration lineage 的 repository，post-E2 three-file writer activation 与 bounded legacy checkpoint compatibility MUST共同绑定到 original strict-admitted E2 checkpoint。该 anchor MUST满足完整 formal Git identity 与 checkpoint-time matching `authorize-checkpoint` Owner authority；仅 subject/trailer shape、syntactically valid但未在 boundary 时获授权的 Owner ref、或后续 duplicate E2 checkpoint MUST NOT单独成为 writer activation authority或移动 legacy cutover。

Git-only boundary reader MUST NOT为了 writer activation而取得 Owner-fact authority。Fresh/downstream repository不存在 Flowkit internal pre-E2 migration lineage时，current implementation MUST继续默认使用 three-file writer，不要求伪造 E2 anchor。

#### Scenario: Full-trailer 但 boundary-time Owner 未授权的 E2 candidate 不激活 writer

- **WHEN** migration-lineage repository存在一个 E2 checkpoint candidate，subject、Flowkit trailers与 `Owner-Authorization` 语法均完整
- **BUT** 该 commit boundary形成时的 formal Manifest中不存在 matching canonical `authorize-checkpoint` Owner fact
- **THEN** 该 candidate MUST NOT作为 original strict E2 anchor
- **AND** MUST NOT激活 post-E2 three-file writer

#### Scenario: Original strict E2 anchor 激活 writer且 duplicate 不移动 cutover

- **WHEN** real E2 checkpoint满足完整 formal + checkpoint-time Owner temporal admission并且是 strict-admitted E2 candidates的唯一 original ancestor
- **THEN** 该 checkpoint MAY激活其 descendant HEAD上的 post-E2 three-file writer
- **AND** later duplicate E2 checkpoint MUST NOT替换 original anchor或移动 legacy cutover

#### Scenario: Fresh repository 继续默认 three-file writer

- **WHEN** repository不存在 Flowkit 02 pre-E2 migration lineage
- **THEN** current implementation MUST默认启用 three-file writer
- **AND** MUST NOT要求创建内部 E2 checkpoint才能使用 current writer

### Requirement: Policy 只能消费 admitted checkpoint，invalid boundary 不得绕过 Owner gate

`FormalFactSnapshot.gitBoundaries` 中用于 Change lifecycle的 `change-checkpoint` MUST只包含 strict-admitted current checkpoint或bounded legacy checkpoint。Policy MUST NOT重新解析 raw Git subject，也 MUST NOT把 malformed/unbound candidate当作 checkpoint truth。

#### Scenario: Invalid checkpoint 保持 authorize-checkpoint

- **WHEN** Change已 completed且archive terminal合法
- **AND** Git history只有 subject-only、wrong-target、missing/mismatched Owner provenance或retroactively unauthorized candidate
- **THEN** Policy MUST仍将该 Change视为 completed-uncheckpointed
- **AND** MUST继续返回 `authorize-checkpoint` Owner boundary

#### Scenario: Admitted checkpoint 允许 successor progression

- **WHEN** completed Change已有 matching admitted Change Checkpoint
- **THEN** Policy MUST不再为该 Change返回 `authorize-checkpoint`
- **AND** MAY根据既有 dependency/Delivery rules推进到下一 planned Change或Delivery-level boundary
