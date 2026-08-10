# Action: review-apply

- Run: `20260810-027-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `A1 delivery-change-creation-and-owner-input`
- Action: `review-apply`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `448fa042de86d07e893bcc51da528f93eb7ced3a`
- Review Chain: `016-explore → 017-review-explore → 018-revise-explore → 019-review-explore → 020-propose → 021-review-propose → 022-revise-propose → 023-review-propose → 024-revise-propose → 025-review-propose → 026-apply → 027-review-apply`
- Reviewed Run: `20260810-026-apply`

## Reviewer verdict

`changes-requested`

Blocking Findings: 1，`blockingAuthority=author`。

### A1-RA-001 — exact Owner record retry 违反已批准的 idempotency contract

024/025 已冻结两条同时成立的规则：

1. authorization-only Owner record **新写入**前必须 fresh-read current Policy，只有 current Policy
   正在请求 exact same decision/target 时才允许 persistence；
2. 完全相同 canonical decision tuple 已存在时，retry MUST idempotent success，返回同一 ref，
   且 MUST NOT 增加第二条 record。

026 的 `recordOwnerDecision()` 当前顺序是：

```text
read snapshot
→ next(snapshot)
→ 必须仍是 owner-decision exact gate
→ 然后才 parse Manifest / appendOwnerDecision()
```

因此第一次 `authorize-apply` 成功后，Owner authorization fact 立即让 `next()` 进入 `action: apply`；
同一 tuple 的第二次 retry 会在到达 `appendOwnerDecision()` 的 idempotent detection 前就被
`OWNER_DECISION_GATE_MISMATCH` 拒绝。

Reviewer 用 `Base + 025 approved Proposal state + 026 production code` 实测：

```text
before:
next = owner-decision: authorize-apply

first exact record:
success
ownerDecisionRef = owner:1a26...
idempotent = false
record count = 1

after first:
next = action: apply

second exact same record:
exit = 2
current Policy is not requesting authorize-apply
record count remains 1
```

Manifest 未重复写入是好的，但“retry MUST idempotent success / 返回同一 ref”没有满足。

这不是要求放宽 stale/early gate。Required outcome 是把**已存在 exact same canonical record 的
no-mutation retry**与**新的 authority write admission**分开：

- exact tuple 已存在且 decoded content 完全一致：
  可直接返回同一 ref / `idempotent=true`，不产生 mutation，不创造新 authority；
- record 不存在：
  继续必须 fresh-read current facts/Policy，exact decision + target match 后才可写；
- same ref 不同 decoded content、stale/early different tuple、target mismatch：
  继续 fail closed；
- 增加 `authorize-apply`（最好再覆盖 archive/finalize 类会关闭 gate 的 decision）真实 retry regression。

Reviewer 不规定 helper/函数拆分方式。

## Full-chain review result

从 016 起重新核对：

- `A1-RE-001` dependency identity drift：resolved；
- `A1-RP-001` current Policy exact Owner gate：Proposal 已 resolved，026 新写入路径实现正确；
- `A1-RP-002` architectureImpact persistence + bounded pre-A1 seam：实现正确；
- `dependsOn = Change.id`：实现并通过真实 Manifest-shape tests；
- 21 exact pre-A1 architectureImpact legacy identities：bounded，missing 只投影
  `pre-a1-legacy-missing`，future/new missing/malformed fail closed；
- createDelivery/createChange：strict architectureImpact persist/recover；
- activation：Change.id dependency、Policy eligible、metadata-first + atomic Manifest publish、retry seam成立；
- cross-Change/cross-Delivery Owner applicability：未发现 leakage；
- existing Bootstrap Run `ownerAuthorization` 未被升级/迁移为 Owner fact；
- A1 Apply 的独立 Owner authorization provenance 合法，本 Review 不把 Run string 当 authority；
- 未越入 B1/C1/D1/E1/F1/G1/03 scope。

## Independent verification

Reviewer materialize exact Base snapshot + 026 cumulative candidate：

```text
CLI self-read:
status → A1 active / apply / verification passed / conflicts 0
next → review-apply
doctor → ok / findings 0
resume-context → next action review-apply

focused:
109 tests / 21 suites
109 pass / 0 fail

affected:
582 tests / 132 suites
582 pass / 0 fail

typecheck: passed
lint: passed
build: passed
quality: passed / hard-failures 0
OpenSpec active Change strict: passed
canonical specs strict: 11/11 passed
verify:change domain persistence facts policy cli: passed
git diff --check equivalent preflight: passed
SHA256SUMS: passed
026 inputRef → 025 result fingerprint: passed
016–025 historical file bytes: unchanged
package add/replace/delete classification: valid
payload text hygiene: passed
```

未运行 Delivery Full Test。

## Next boundary

唯一 blocker 为 Author-owned implementation/test defect，因此：

`revise-apply`
