# Action: review-apply

- Run: `20260810-012-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 / core-contract-alignment`
- Action: `review-apply`
- Role: `reviewer`
- Execution Context: `detached`
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Review Chain: `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012`
- Reviewed Run: `20260810-011-apply`
- Verification Ref: `openspec/changes/core-contract-alignment/verification.md`

## Review scope

从 `001` 开始回溯完整 cumulative chain，独立复核 `011-apply`：

- 010 approved Proposal / Owner Apply authorization handoff；
- production / tests / docs / canonical specs 的实际实现；
- Change Verification；
- current Reader / Policy 在真实 `001→011` cumulative corpus 上的自一致性；
- pre-Q1 immutable compatibility 是否真正 bounded；
- Q1 scope guard 与 Q1→03 boundary；
- package SHA、lineage、ResultRef 与 whitespace hygiene。

## Reviewer verdict

`changes-requested`

Blocking Findings: 2，均为 `blockingAuthority=author`。

### Q1-RA-001 — 新 Reader 无法读取 Q1 自己的真实 pre-Q1 revise history

将 exact Base 与 011 cumulative candidate materialize 后直接执行
`readFormalFactSnapshot()`，Reader 对以下 immutable pre-Q1 Runs 产生
`context-schema` conflicts：

- `20260810-003-revise-explore`
- `20260810-007-revise-propose`
- `20260810-009-revise-propose`

三条 context 都是 schemaVersion 2，但形成于当前严格 revise-source tuple contract
进入本 Q1 canonical candidate 之前，均没有 `sourceReviewRun/sourceReviewVerdict`。
当前 `validateContextFile()` 对所有 `revise-*` 无条件要求该 tuple，而 Reader 没有
针对这条真实 immutable seam 的 bounded read compatibility。

实际结果：

`next(snapshot)` → `blocked / formal-fact-conflict`

因此 011 的“001–010 immutable history 保持可读 / Q1 self-consistent”验收没有成立。
不得通过修改 003/007/009 bytes 关闭；应在 Reader/admission 边界增加足够窄的
历史兼容，且新 writer/current malformed revise context 仍必须严格 fail-closed。

### Q1-RA-002 — pre-Q1 Finding compatibility 未真正 bounded

`src/persistence/serialization.ts` 的 `admitC1RunResultForReader()` 只根据 result shape
判断兼容：completed `review-*` + `changes-requested` + blocking finding 缺
`blockingAuthority` 但有非空 `requiredChange`，就补成 `author`。

它没有任何 provenance / generation / persisted-history 条件证明该 result
确实 predates Q1。直接复现：

- `admitC1RunResult(...)` → `SCHEMA_VALIDATION_FAILED`
- 对同一个新 malformed result 调 `admitC1RunResultForReader(...)`
  → 接受并投影 `blockingAuthority=author`

因此未来新写入或外部落盘的 malformed schemaVersion 2 Review 可以绕过
current strict authority contract，不再 fail-closed。Compatibility 必须只覆盖
可证明的 immutable pre-Q1 seam；新/current malformed Review 必须产生 conflict。

## Independent verification

Reviewer 独立复跑：

- Q1 focused tests: 250/250 pass
- affected tests: 557/557 pass
- typecheck: passed
- lint: passed
- build: passed
- quality: passed（0 hard failures）
- OpenSpec 1.7 strict Change validation: passed
- canonical specs strict: 10/10 passed
- `git diff --check`: passed
- package SHA / 010→011 input fingerprint: passed

这些通过项不关闭上述两个 Reader/self-consistency blocker。

## Next boundary

两个 blocker 都由 Author 修改 011 candidate 即可关闭，因此：

`revise-apply`
