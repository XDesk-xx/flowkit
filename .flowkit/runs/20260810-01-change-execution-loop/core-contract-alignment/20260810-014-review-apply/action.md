# Action: review-apply

- Run: `20260810-014-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 / core-contract-alignment`
- Action: `review-apply`
- Role: `reviewer`
- Execution Context: `detached`
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Review Chain: `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014`
- Reviewed Run: `20260810-013-revise-apply`
- Verification Ref: `openspec/changes/core-contract-alignment/verification.md`

## Review scope

从 `001` 开始回溯完整 cumulative chain，复核 `013-revise-apply` 是否逐项关闭
`012-review-apply` 的 `Q1-RA-001` / `Q1-RA-002`，并重新执行 Apply 级完整 blocking scan。

## Reviewer verdict

`approved`

Blocking Findings: 0。

### Q1-RA-001 — resolved

013 未改写 003/007/009 immutable bytes，而是在 Formal Fact Reader 边界增加 exact persisted
identity + raw SHA-256 的 reader-only compatibility。只有固定 Delivery / Change / Run identity
和原始 context bytes 同时匹配时，才在内存中补足该 pre-Q1 revision context 的 source-review tuple。

独立 materialize exact Base + 013 cumulative candidate 后：

- `readFormalFactSnapshot()` → `conflicts=[]`
- Reader 完整读取 `001→013`
- `next(snapshot)` → `review-apply`
- 不再出现 `formal-fact-conflict`

普通 strict `validateContextFile()` / `discriminateRun()` / current writer 未继承该兼容 seam；
任意 byte mutation、identity mismatch 或新的 malformed schemaVersion 2 revise context 仍 fail closed。

### Q1-RA-002 — resolved

旧 Finding `requiredChange → author` 兼容已从 shape-based fallback 收窄为
002/006/008 固定 persisted identity + exact result.json SHA-256：

- strict `admitC1RunResult()` 继续拒绝旧 shape；
- Reader helper 未提供 provenance 时继续 strict；
- exact historical identity + exact bytes 才可 reader-only projection；
- byte mutation、wrong run identity、新/current malformed Review 均继续
  `SCHEMA_VALIDATION_FAILED` / FactConflict。

013 还把 operational run-persistence path 改回 strict `admitC1RunResult()`，
因此新 Run entry / source-review admission 不能借 Reader compatibility 绕过 current schema。

## Independent verification

Reviewer 独立 materialize `Base + 013` 后复核：

- exact cumulative Reader self-read: passed，`conflicts=[]`
- Reader/persistence focused tests: passed
- affected tests: 560/560 passed
- typecheck: passed
- lint: passed
- build: passed
- quality: passed，hard failures = 0
- OpenSpec 1.7 `validate core-contract-alignment --strict`: passed
- OpenSpec canonical specs strict: 10/10 passed
- package SHA256SUMS: passed
- 012 → 013 input fingerprint: passed
- prior Reviewer-owned Run artifacts 001–012: byte-identical
- Proposal / Design / Tasks: unchanged from approved Proposal generation
- text / whitespace hygiene: passed

未发现新的 Apply 级 contract violation、Reader dead-end、compatibility widening、
Q1 scope 越界或 03 scope 偷跑。

## Next boundary

当前 `review-apply` 已 approved，Change Verification 已 passed。

下一合法边界：

`owner-decision: authorize-archive`

Archive 仍必须等待 Owner 独立明确授权；本 Review 不创建 archive Run、
不执行 OpenSpec archive、Checkpoint、Delivery Full Test、Commit 或 Push。
