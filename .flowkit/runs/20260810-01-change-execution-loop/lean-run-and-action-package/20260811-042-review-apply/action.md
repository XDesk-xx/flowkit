# Action: review-apply

- Run: `20260811-042-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-apply`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain: `031-explore → 032-review-explore → 033-revise-explore → 034-review-explore → 035-propose → 036-review-propose → 037-revise-propose → 038-review-propose → 039-apply → 040-review-apply → 041-revise-apply → 042-review-apply`
- Reviewed Run: `20260811-041-revise-apply`
- Verification Ref: `openspec/changes/lean-run-and-action-package/verification.md`

## Reviewer verdict

`changes-requested`

Blocking Findings: 2，全部 `blockingAuthority=author`。

040 的两个 finding 本轮均已关闭：

```text
B1-RA-001 → resolved
B1-RA-002 → resolved
```

但完整 Apply regression scan 发现两个新的 continuation blocker。

---

## 040 finding closure

### B1-RA-001 — resolved

041 的 `admitActionResult()` 已不再只信 caller 自带的 fingerprint 字符串。

当前 admission：

```text
caller ActionPackage semantic fields
→ build canonical semantic descriptor
→ recompute SHA-256
→ exact-match persisted context.semanticInputFingerprint
```

并且 `requiredResultContract` 会与 fixed `ActionDefinition.terminalContract` exact-match。

Reviewer 独立攻击式 probe 已确认：

```text
tamper contractRefs + preserve old fingerprint
→ PENDING_INPUT_DRIFT
→ no result.json

tamper Owner authority identity + preserve old fingerprint
→ PENDING_INPUT_DRIFT
→ no result.json
```

因此 040 `B1-RA-001` 已关闭。

### B1-RA-002 — resolved

041 已把 Apply/revise-apply 的 immutable proposal generation 改为从 stage producer Run 的 Core-derived
`producedResultRefs` 恢复，并把 Action-owned tasks/verification progress 与 immutable entry contract 区分。

Reviewer 独立 probe 已确认：

```text
prepare Apply
→ mutate tasks.md + verification.md
→ prepare same pending Apply
→ same runId / resumed=true

prepare revise-apply
→ mutate tasks.md + verification.md
→ prepare same pending revise-apply
→ same runId / resumed=true

pending Apply
→ externally drift approved proposal.md
→ PENDING_INPUT_DRIFT
```

因此 040 `B1-RA-002` 已关闭。

---

## B1-RA-003 — producer generation 被过宽应用，Reviewer/immutable-target Action 不再发现 current target drift

041 为解决 Apply 自身 progress self-drift，将 `collectContractRefs()` 广泛改成：

```text
computeLineage(...)
→ producer Run
→ producer actionResult.producedResultRefs
→ package contractRefs
```

对于 Action-owned mutable output，这个方向正确；但它同时被用于 `review-explore` / `review-propose`
等 **不拥有被审 target mutation** 的 Action，并且这些 Action 没有 current-byte equality guard。

结果是：pending Review 建立以后，即使当前 reviewed target 被外部改写，fresh preparation 仍重新取得同一
producer point-in-time ref，fingerprint 不变，从而错误 resume。

Reviewer 独立 probe：

```text
Explore completed
→ prepare review-explore
→ pending review Run established

externally mutate:
openspec/changes/<change>/explore.md

prepare review-explore again
```

041 实际结果：

```text
resumed = true
same runId
same producer contractRef fingerprint
```

而 037/038 approved capability contract 明确冻结：

```text
pending 后 logical package contract generation / semantic authority input drift
→ freshly derived fingerprint MUST改变
→ PENDING_INPUT_DRIFT
→ old pending Run MUST NOT silently consume new target generation
```

Reviewer ActionDefinition 又明确：

```text
review-explore / review-propose / review-apply
→ mutationClass = reviewer-result-only
```

所以 Reviewer target 当前版本不是 Reviewer-owned progress，不应被 producer-history ref 掩盖。

### Required change

`revise-apply` 必须把 semantic entry generation 按 **Action mutation boundary** 分类，而不是全局一刀切。

至少满足：

1. 对当前 Action **不允许修改**的 target/contract authority：
   ```text
   producer point-in-time ref
   + fresh current-byte/current-authority equality validation
   ```
   current target 漂移必须 `PENDING_INPUT_DRIFT`。

2. 对当前 Action **合法拥有 progress/output mutation** 的 artifact：
   ```text
   immutable entry generation stays producer-bound
   current self-owned progress MAY change
   ```
   不得自我 drift。

3. `review-explore` / `review-propose` 至少补 regression：
   ```text
   prepare pending review
   → externally mutate reviewed target
   → prepare again
   → PENDING_INPUT_DRIFT
   → no second pending Run
   ```

4. 040 已关闭的 Apply/revise-apply continuation 必须继续通过。

实现不得重新把整个 current working tree / package正文 / Git history hash进 Run。

---

## B1-RA-004 — pending archive 在合法 archive/completed progress 后失去 active boundary，无法 same-Run resume

B1 fixed catalog 已明确：

```text
archive
→ author
→ mutationClass = openspec-archive-and-change-completion
→ outputClass = archive-operation-and-completed-state
```

也就是说 pending `archive` 的合法执行本身就会：

```text
move/close active OpenSpec Change
+
Change active → completed
```

但 041 `prepareActionExecution()` 的入口顺序仍要求：

```text
fresh snapshot
→ getActiveChange(snapshot) MUST存在
→ shared next()/resolveReview() MUST重新解析出 Standard Action
→ 才检查 matching pending Run
```

同时 `collectContractRefs()` 仍把 current active `.openspec.yaml` 加进 package。

因此 archive 一旦已经执行合法的 OpenSpec move / completion progress，在 terminal result尚未发布之前发生会话/进程中断，
same pending archive 无法恢复。

Reviewer 独立 archive fixture：

```text
Explore → Review → Propose → Review → Owner Apply
→ Apply + Verification passed
→ review-apply approved
→ Owner authorize-archive

prepare archive
→ pending Run = ...-archive

simulate archive-owned progress:
openspec/changes/<change>/
→ openspec/changes/archive/<date>-<change>/

prepare entry=next again
```

041 实际：

```text
RUN_PREPARATION_NOT_ALLOWED
Policy entry next did not resolve a Standard Change Action
```

不是：

```text
same archive runId
resumed=true
```

这会让 F1 后续真实 archive executor 消费 B1 Run surface 时，在最需要 recovery 的 archive half-complete seam 卡死。
该问题属于 B1 的 same-pending Run/preparation contract，而不是要求 B1 实现 F1 archive executor。

### Required change

`revise-apply` 必须让 **已存在且唯一合法的 pending archive execution** 能在其 Action-owned
archive/completion progress 后恢复，同时保持 Policy authority：

- `next()` 仍只负责 **创建新的** formal Action boundary；
- 不得因为 completed Change 就创建新的 archive Run；
- 但已经存在的 exact pending archive MAY/MUST从 persisted execution identity恢复，不应要求 archive 自己的 output
  mutation完成后 `next()` 仍重新返回 `archive`；
- archive-owned `.openspec.yaml` relocation / active→completed progress 不得作为 self-drift；
- unrelated Owner/Review/immutable entry authority drift仍必须 fail closed；
- Checkpoint继续不是 archive Action output，也不能被 B1自动执行。

Regression 至少：

```text
prepare archive
→ simulate active OpenSpec Change relocation
→ same pending preparation/resume
→ same runId / resumed=true

prepare archive
→ simulate Change state completed progress
→ same pending preparation/resume
→ same runId / resumed=true

completed Change + no pending archive
→ MUST NOT create new archive Run
```

不得增加第二套 archive state machine；只修 pending execution continuation seam。

---

## Passed checks

从 031 开始回扫，除 `B1-RA-003/004` 外：

- 032 `B1-RE-001`：resolved；
- 036 `B1-RP-001/002/003`：resolved；
- 040 `B1-RA-001/002`：resolved；
- 041 未修改 approved Proposal/Design/delta specs/Explore；
- 031–040 historical Run artifacts：byte-identical；
- fixed ten-Action ActionDefinition catalog保持；
- bounded `next` / explicit `review` dual-entry保持；
- Q1 blocked-next + explicit same-stage direct re-review保持；
- low-level Run-ID/Action→Role defense-in-depth保持；
- Action Result authority继续由 `completeRun()`/Core-derived ResultRefs拥有；
- CRLF Manifest compatibility保持；
- Full Test/Finalize仍无 Standard Run/Action Package；
- 无 Registry/Router/Evidence/provider session/auto loop；
- 未越入 F1 archive executor / Git Checkpoint mechanics。

## Independent verification

Reviewer 独立确认：

- `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- package `SHA256SUMS`：84/84 passed；
- 041 `inputRef` → 040 result exact fingerprint：valid；
- text hygiene：passed；
- `git diff --check`：passed；
- B1 service regression：12/12 passed；
- focused B1/A1/Run/diagnostic suite：82/82 passed；
- affected tests：604/604 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard-failures=0；
- OpenSpec 1.7 active Change strict：passed；
- canonical specs strict：12/12 passed；
- exact cumulative diagnostics：
  - B1 active；
  - stage=apply；
  - last-run=041-revise-apply；
  - verification=passed；
  - conflicts=0；
  - `next=review-apply`；
  - `doctor=ok / findings=0`；
  - `resume-context=review-apply`。

Reviewer 尝试完整 `npm test` 时，本 sandbox runner未在可用执行窗口内正常收尾；
因此本轮不把未完成的 full project run声明为 passed/failed，也不把它解释为 Delivery Full Test。
本轮已有 focused/affected + typecheck/lint/build/quality/OpenSpec strict 的独立结果。

## Next boundary

`B1-RA-003`、`B1-RA-004` 都是 B1 production preparation/continuation implementation 可修复问题，
`blockingAuthority=author`。

下一合法 Action：

`revise-apply`
