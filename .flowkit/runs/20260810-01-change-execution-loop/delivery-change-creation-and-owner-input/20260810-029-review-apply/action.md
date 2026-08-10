# Action: review-apply

- Run: `20260810-029-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `review-apply`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Review Chain: `016-explore → 017-review-explore → 018-revise-explore → 019-review-explore → 020-propose → 021-review-propose → 022-revise-propose → 023-review-propose → 024-revise-propose → 025-review-propose → 026-apply → 027-review-apply → 028-revise-apply → 029-review-apply`
- Reviewed Run: `20260810-028-revise-apply`
- Verification Ref: `openspec/changes/delivery-change-creation-and-owner-input/verification.md`

## Review scope

保持完整 A1 Review 链，复核 `028-revise-apply` 是否关闭 `027-review-apply` 的唯一 blocker
`A1-RA-001`，并重新执行 Apply 级完整 blocking scan。

## Reviewer verdict

`approved`

Blocking Findings: 0。

### A1-RA-001 — resolved

028 将 exact-existing retry 与 new authorization write admission 正确分离：

```text
build canonical Owner tuple/ref
→ probe current Manifest for exact existing record
   ├─ exact same tuple exists
   │  → return same ref
   │  → idempotent=true
   │  → no Manifest mutation
   │  → 不要求 Policy 仍停留在第一次写入前的旧 gate
   └─ record absent
      → fresh-read FormalFactSnapshot
      → current shared Policy MUST request same decision + same canonical target
      → only then persist one new record
```

Reviewer 独立执行新增 regression，确认：

- first `authorize-apply` exact tuple → success / `idempotent=false`；
- first write 后 Policy → `action: apply`；
- second exact same tuple → success / same ref / `idempotent=true`；
- Manifest bytes unchanged；
- record count remains 1。

该顺序没有放宽新 authority admission：

- stale / early different tuple 仍经过 current Policy gate fail closed；
- target mismatch 仍 fail closed；
- same ref / different decoded content 仍由 Manifest collision validation fail closed；
- exact retry 只是既有 authority record 的 read-only idempotent observation，不产生第二条 authority fact。

### Full-chain regression scan

从 `016` 回扫：

- `017 A1-RE-001` dependency identity drift：resolved；
- `021 A1-RP-001` authorization timing/gate contract：resolved；
- `021/023 A1-RP-002` architectureImpact persistence/bootstrap compatibility：resolved；
- `027 A1-RA-001` exact retry implementation bug：resolved；
- `dependsOn = Change.id` 无回退；
- 21 exact pre-A1 legacy `architectureImpact` identities 仍 bounded；
- legacy missing 仍投影 explicit unknown，不 backfill boolean；
- future/new missing/malformed `architectureImpact` 仍 fail closed；
- createDelivery/createChange 仍 strict persist/read boolean；
- cross-Change/cross-Delivery Owner applicability 无回退；
- activation two-step publish / exact metadata retry 无回退；
- write CLI / read-only diagnostics / A1 scope boundary 无回退；
- 未修改 Proposal / Design / delta specs。

## Independent verification

Reviewer 在 cumulative candidate 上独立复核：

- 016–027 historical Run files：byte-identical；
- 028 `inputRef` → 027 result exact fingerprint：valid；
- package `SHA256SUMS`：95/95 passed；
- 028 相对 027 只修改：
  - `src/services/a1-write-service.ts`
  - `tests/unit/services/a1-write-service.test.ts`
  - `verification.md`
  - 新增 028 Run；
- focused A1 write-service tests：15/15 passed；
- affected tests：583/583 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard failures = 0；
- `verify:change -- domain persistence facts policy cli`：passed；
- OpenSpec active Change strict：passed；
- canonical specs strict：11/11 passed；
- `git diff --check`：passed；
- cumulative CLI self-read：
  - `conflicts = 0`
  - `next = review-apply`
  - `doctor = ok / findings=0`
- 未运行 Delivery Full Test。

Reviewer 还用等价 `029 approved review-apply` 前推 Policy：

```text
review-apply approved
+ Change Verification passed
+ tasks complete
→ owner-decision: authorize-archive
```

## Next boundary

A1 Apply Review 已 approved。

下一合法边界：

`owner-decision: authorize-archive`

本 Review 不替 Owner 创建 archive authorization，也不执行 Archive / Checkpoint / Commit / Push。
