# Action: review-propose

- Run: `20260811-036-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-propose`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain: `031-explore → 032-review-explore → 033-revise-explore → 034-review-explore → 035-propose → 036-review-propose`
- Reviewed Run: `20260811-035-propose`

## Review scope

按 Owner 固定要求，B1 后续 Review 从 `031-explore` 开始回溯。

本轮检查 035 Proposal 是否把 034 approved Explore 冻结成可实施 contract，重点覆盖：

- fixed ActionDefinition；
- unique Run preparation / pending resume / new instance；
- Q1 explicit direct re-review compatibility；
- Delivery-wide Run-ID + low-level defense-in-depth；
- semantic input fingerprint；
- logical Action Package / Action Result admission；
- Full Test / Finalize exclusion；
- Windows Manifest CRLF compatibility；
- C1/D1/E1/F1/G1/03 scope guard。

## Reviewer verdict

`changes-requested`

Blocking Findings: 3，全部 `blockingAuthority=author`。

---

## B1-RP-001 — unique preparation surface 未保留 Q1 explicit direct re-review admission

Q1/current canonical Policy 已冻结一个刻意的双边界：

```text
matching changes-requested
+ any non-author blocker

next()
→ blocked: non-author-review-blocker
→ MUST NOT auto-schedule re-review

canRun(review-S)
→ allowed
→ explicit same-stage direct re-review is legal
→ unchanged target may enter a new Reviewer generation
```

035 Proposal/Design 却把 B1 preparation 表达成：

```text
fresh FormalFactSnapshot
→ Policy next/canRun
→ determine current unique Change Action
→ caller MUST NOT decide Action
→ resume pending OR allocate/create new Run
```

同时只写：

```text
explicit new Reviewer execution
→ new Run instance
```

但没有冻结 **当 `next()` 故意 blocked 时，explicit `review-S` 如何合法进入 RunExecutionService**。

若按当前文字直接实现：

- 只接受 `next().kind=action` → Q1 direct re-review 永远无法创建新 Reviewer generation；
- 让 service 在 blocked 时自己猜 review-S → B1 又复制/扩大 Policy decision tree；
- 允许 caller 任意指定 Action → 又违反 035 自己的“caller 不得决定 next Action”。

这是 production execution surface 的 contract 缺口，不是 G1 CLI 细节。

### Required change

`revise-propose` 必须冻结 bounded entry semantics，至少同时满足：

1. normal progression 继续由 `next()` 确定唯一 Action；
2. explicit direct re-review 继续使用现有 Policy legality（`resolveReview` / `canRun(review-S)` 或等价 shared Policy surface），即使 `next()` 保持 non-author blocked；
3. caller 只能触发这个已经由 Q1 定义的 explicit review recovery，不得任意选择其它 Action；
4. 每次合法 direct re-review 是新的 Reviewer generation / new NNN；
5. B1 不 machine-prove “现在是否值得 re-review”，也不自动触发 re-review；
6. pending matching explicit review 仍按 same-pending semantics resume，不制造第二个 pending Run。

---

## B1-RP-002 — ActionDefinition 只冻结了 Role，未冻结 Explore 要求的完整 per-Action machine table

034 approved Explore 的 P3 明确要求 Proposal 对 **每个 Standard Action** 冻结：

```text
role
goal class
allowed mutation/output class
completion/result expectation
```

035 Design 只冻结了 Role 映射：

```text
Author:
  explore / revise-explore / propose / revise-propose / apply / revise-apply / archive

Reviewer:
  review-explore / review-propose / review-apply
```

其余 `goalClass / mutationBoundary / terminalContract` 只作为字段名出现，没有十个 Action 的 normative mapping。

但 035 同时要求这些字段直接进入：

- `ActionDefinition`；
- logical Action Package；
- mutation boundary；
- required logical result contract；
- Action Result admission allowed fields。

因此若现在进入 Apply，Author 仍必须临时决定：

```text
每个 Action 的 goalClass 是什么？
允许修改/产生哪些 artifact class？
review action 的 mutation/output boundary是什么？
archive 的 terminal expectation是什么？
各 revise action 的 result expectation如何区别？
```

这正是 Proposal 应冻结、Apply 不应自行发明的安全边界。

### Required change

`revise-propose` 必须提供明确、可测试的十 Action normative mapping（具体数据结构可由 Author选择），使每个 Action 的：

```text
role
goalClass
mutation/output boundary
terminal/result expectation
```

在进入 Apply 前唯一确定。

不得把该表推迟到 implementation code 中临时定义，也不得引入 runtime Registry。

---

## B1-RP-003 — semanticInputFingerprint 未覆盖 ActionPackage 的 contractRefs，允许 changed contract 被错误 resume

035 logical Action Package 明确要求包含：

```text
contractRefs[]
handoffRefs[]
reviewView?
ownerAuthorizationRefs[]
verificationView?
...
```

但 035 Decision 3 / capability spec 对 semantic fingerprint descriptor 只冻结：

```text
deliveryId / changeId
action / ActionDefinition identity
current handoff refs
current Review/Verification refs
current Owner authorization refs
```

没有包含 `contractRefs[]`。

同时它声称该 fingerprint 用来证明：

```text
semantic input unchanged
→ resume same pending Run
```

这会产生一个不安全状态：

```text
pending Run 已存在
contract ref / contract fingerprint 发生变化
handoff/review/verification/owner refs 未变化
→ stored fingerprint == freshly derived fingerprint
→ service 允许 resume
→ 但重新生成的 Action Package contract input 已不同
```

即“同一个 Run”消费了两个不同的 contract input generation。

### Required change

`revise-propose` 必须冻结 semantic identity 的完整 inclusion rule：

- 所有会改变当前 Action 执行语义的 logical package input authority identity 都必须进入 canonical descriptor；
- 至少明确处理 `contractRefs`，以及 ref 自身用于版本绑定的 fingerprint/identity；
- 若某个 package field 被排除，Proposal 必须说明它为何是 immutable/derived/non-semantic，不会导致 stale resume；
- 仍然不得 hash/copy 整个 Action Package、OpenSpec正文、Git history或 provider transcript。

目标是：

```text
semantic package input changed
→ fingerprint changed
→ pending-input-drift
→ no silent resume
```

---

## Passed checks

从 031 开始完整回扫，除上述三项外：

- 032 `B1-RE-001` 已由 033 完整关闭，034 approval继续有效；
- Full Test / Finalize 已明确排除出 B1 Standard Run / Action Package；
- B1 logical package vs 后置 physical adapter/transport ownership清楚；
- CRLF Manifest writer contract完整：
  - pure LF / pure CRLF accepted；
  - illegal/mixed `\r` fail-closed；
  - successful mutation canonical LF；
  - Owner/idempotency/dependency/architectureImpact semantics保持；
- Delivery-wide Run-ID allocator + low-level defense-in-depth方向成立；
- caller-built ResultRef / runRef authority被禁止，terminal persistence继续复用 `completeRun()`；
- active-Change-only / Lean history boundary保持；
- failed/cancelled retry与same-pending distinction保持；
- no Registry/Router/Evidence/session store/auto-loop；
- 未越入 C1/D1/E1/F1/G1/03。

## Independent verification

Reviewer 独立确认：

- `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- 031–034 historical artifacts：byte-identical；
- 035 `inputRef` → 034 result exact fingerprint：valid；
- 035 全部 12 个 produced ResultRefs：valid；
- package `SHA256SUMS`：30/30 passed；
- text hygiene：passed；
- exact Base + 035 materialization：
  - B1 active；
  - stage = propose；
  - last-run = 035-propose；
  - conflicts = 0；
  - `next = review-propose`；
  - `doctor = ok / findings=0`；
  - `resume-context = review-propose`；
- OpenSpec 1.7:
  - `validate lean-run-and-action-package --strict` → passed；
- project tests：612/612 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard failures=0；
- `git diff --check`：passed。

上述 `npm test` 仅作为 Reviewer independent regression scan，
**没有**取得 Delivery Full Test lifecycle 语义；Delivery Full Test 未运行。

## Next boundary

三个 blocker 都属于 Proposal contract framing，`blockingAuthority=author`。

下一合法 Action：

`revise-propose`
