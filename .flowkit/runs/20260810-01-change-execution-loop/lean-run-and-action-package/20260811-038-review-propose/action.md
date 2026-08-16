# Action: review-propose

- Run: `20260811-038-review-propose`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-propose`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain: `031-explore → 032-review-explore → 033-revise-explore → 034-review-explore → 035-propose → 036-review-propose → 037-revise-propose → 038-review-propose`
- Reviewed Run: `20260811-037-revise-propose`

## Review scope

按 Owner 固定要求，B1 后续 Review 从 `031-explore` 开始回溯。

本轮复核 `037-revise-propose` 是否完整关闭 036 的三个 Proposal blocker，并重新执行完整 Proposal blocking scan：

- Q1 explicit direct re-review 与 unique preparation surface；
- fixed ten-Action ActionDefinition；
- same-pending semantic fingerprint / contract generation identity；
- Run-ID / Action→Role defense-in-depth；
- logical Action Package / Result admission；
- Full Test / Finalize exclusion；
- Windows Manifest CRLF compatibility；
- C1/D1/E1/F1/G1/03 scope guard。

## Reviewer verdict

`approved`

Blocking Findings: 0。

---

## B1-RP-001 — resolved

037 已把高层 preparation 冻结为两个且仅两个 Policy-owned intent：

```text
entry=next
entry=review
```

Normal `next`：

```text
fresh FormalFactSnapshot
→ shared next(snapshot)
→ only Standard Change Action
→ common pending-resume/new-NNN path
```

Explicit `review`：

```text
fresh FormalFactSnapshot
→ shared resolveReview(snapshot) / canRun(review-S)
→ Policy resolves concrete same-stage review-S
→ common pending-resume/new-NNN path
```

这保持 Q1 已冻结的 direct re-review 双边界：

```text
matching changes-requested + any non-author blocker
→ next() remains blocked
→ explicit unified review remains legal
```

同时：

- B1 不把 blocked next 自动转换为 review；
- caller 不得指定 concrete `review-propose/apply/...`；
- B1 不复制 blockingAuthority/Stage legality；
- no matching pending review → new Reviewer generation/new Delivery-wide NNN；
- matching pending review + same semantic identity → resume same runId。

Exact Base 中 `resolveReview()` 已存在并继续委托 `canRun(review-S)`；现有 Q1 non-author review precondition 允许 explicit same-stage review，因此 037 contract 可直接落到当前 shared Policy surface，不需要第二 decision tree。

---

## B1-RP-002 — resolved

037 已在 Proposal / Design / capability spec 中逐项冻结十个且仅十个 Standard Change Action definitions，并明确：

```text
action
role
goalClass
mutationClass
outputClass
terminalContract
```

十个 Action 均有 normative mapping：

```text
explore
review-explore
revise-explore
propose
review-propose
revise-propose
apply
review-apply
revise-apply
archive
```

并补齐关键安全解释：

- Reviewer 永远 `reviewer-result-only`，不得修改 Author target；
- `apply/revise-apply` 的具体文件集合仍由 approved contract 限定，catalog 不等于任意 repo mutation；
- `archive` terminal output 不包含 Git Checkpoint；
- failed/cancelled terminal 保持现有 minimal failure/cancellation contract；
- catalog 是 compile-time/static，不建立 runtime Registry/Router/dynamic discovery；
- Owner authority 不因此创建 Standard Run。

因此 Apply 不再需要临时发明 goal/mutation/output/result boundary。

---

## B1-RP-003 — resolved

037 已把 semantic identity 扩展为稳定 canonical descriptor，并强制包含：

```text
schema / descriptor version
deliveryId / changeId
resolved action
complete ActionDefinition identity/version

all contractRefs[]
  exact {ref, kind, versionFingerprint}

handoff refs
relevant Review authority identity
relevant Verification authority identity/status
applicable Owner authorization refs
other semantic authority identity required by inclusion rule
```

`contractRefs` 使用 deterministic ordering；任一 add/remove 或
`ref/kind/versionFingerprint` 变化都 MUST 改变 fingerprint。

同时新增通用 inclusion rule：

```text
如果 package input 的变化会改变
- allowed mutation
- required result
- current contract generation
- execution prerequisite/blocker context

且不能完全由已纳入 versioned authority ref确定
→ MUST 纳入 descriptor
```

安全排除：

```text
provider/chat/session identity
human-readable summary/copy
derived duplicate minimal view
package field order
performance timing/size
full OpenSpec/Verification/Git bodies
stdout/log
Git history
completed Run corpus
```

因此：

```text
semantic package input changed
→ fingerprint changed
→ pending-input-drift
→ no silent resume
```

而 fingerprint 仍不是整个 Action Package / authority正文 hash，不会把 Run 做成 artifact ledger。

---

## Full-chain Proposal regression scan

从 031 回扫：

- 032 `B1-RE-001`：resolved，034 approval继续有效；
- 036 `B1-RP-001`：resolved；
- 036 `B1-RP-002`：resolved；
- 036 `B1-RP-003`：resolved；
- Delivery-wide NNN allocator + low-level create defense-in-depth：保持；
- same pending / failed-cancelled retry / Reviewer generation distinction：保持；
- caller-built ResultRef authority继续禁止，terminal path复用 `completeRun()`；
- Action Package继续 Change-only、provider-neutral、Lean；
- Delivery Full Test / Finalize继续无 Standard Run / no B1 Action Package；
- B1 logical package 与后置 adapter/transport ownership保持分离；
- Windows Manifest writer contract仍是 LF/CRLF input → internal normalize → successful mutation canonical LF；
- A1 Owner/idempotency/dependency/architectureImpact semantics不得回退；
- active-Change-only corpus / no heavy replay保持；
- no Registry / Router / Evidence / provider session store / auto loop；
- 未越入 C1/D1/E1/F1/G1/03。

## Independent checks

Reviewer 独立确认：

- `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- 031–036 historical Run artifacts：byte-identical；
- 037 相对 036 只修改 Author-owned Proposal/Design/affected delta specs/Tasks并新增 037 Run；
- 037 `inputRef` → 036 result exact fingerprint：valid；
- 037 produced ResultRefs：12/12 valid；
- package `SHA256SUMS`：36/36 passed；
- text hygiene：passed；
- exact Base + 037 materialization：
  - B1 active；
  - stage = propose；
  - last-run = 037-revise-propose；
  - conflicts = 0；
  - `next = review-propose`；
  - `doctor = ok / findings=0`；
  - `resume-context = review-propose`；
- OpenSpec 1.7:
  - active Change strict → passed；
  - `validate --all --strict` → 12/12 passed；
- project tests：612/612 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard failures=0；
- `git diff --check`：passed。

上述 full project test 仅为 Reviewer regression scan，**不是 Delivery Full Test lifecycle execution**。

## Next boundary

Proposal Review 已 approved。

下一合法 authority boundary：

`owner-decision: authorize-apply`

本 Review 不替 Owner创建 Apply authorization，也不执行 Apply。
