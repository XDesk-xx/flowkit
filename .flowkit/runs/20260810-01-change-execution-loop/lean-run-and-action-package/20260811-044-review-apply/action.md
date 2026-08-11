# Action: review-apply

- Run: `20260811-044-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-apply`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain: `031-explore → 032-review-explore → 033-revise-explore → 034-review-explore → 035-propose → 036-review-propose → 037-revise-propose → 038-review-propose → 039-apply → 040-review-apply → 041-revise-apply → 042-review-apply → 043-revise-apply → 044-review-apply`
- Reviewed Run: `20260811-043-revise-apply`
- Verification Ref: `openspec/changes/lean-run-and-action-package/verification.md`

## Reviewer verdict

`changes-requested`

Blocking Findings: 2，全部 `blockingAuthority=author`。

042 的两个 finding 本轮均已关闭：

```text
B1-RA-003 → resolved
B1-RA-004 → resolved
```

但 archive recovery 完整闭环仍有两个新的 implementation blocker。

---

## 042 finding closure

### B1-RA-003 — resolved

043 已按 Action mutation boundary 区分：

```text
current Action 不允许修改的 target/contract
→ producer point-in-time ref
→ fresh current-byte equality validation

Action-owned mutable progress/output
→ immutable entry generation producer-bound
→ self-owned mutation allowed
```

Reviewer 独立 probe：

```text
pending review-explore
→ externally mutate explore.md
→ prepare again
→ PENDING_INPUT_DRIFT

pending review-propose
→ externally mutate proposal.md
→ prepare again
→ PENDING_INPUT_DRIFT
```

并且 040 已关闭的 Apply/revise-apply tasks/verification same-run continuation仍通过。

因此 `B1-RA-003` 已关闭。

### B1-RA-004 — resolved（preparation/resume half）

043 已新增 persisted pending archive recovery seam：

```text
.flowkit/runs/<delivery-id>/**
→ locate unique pending archive context
→ recover persisted Change Run/Review lineage
→ rebuild immutable semantic authority identity
→ exact-match stored fingerprint
→ resume same runId
```

Reviewer 独立确认：

```text
prepare archive
→ relocate active OpenSpec Change
→ prepare again
→ same runId / resumed=true

prepare archive
→ Change active → completed
→ prepare again
→ same runId / resumed=true

completed Change + no pending archive
→ RUN_PREPARATION_NOT_ALLOWED
→ no new archive Run
```

因此 042 对“pending archive 无法重新 prepare/resume”的 finding 已关闭。

---

## B1-RA-005 — archive 在 completed progress 后虽能 resume，但 terminal admission 仍强制 active Change，无法完成同一 Run

043 修复了 archive **preparation/resume**，但 `admitActionResult()` 仍执行：

```text
read current snapshot
→ getActiveChange(snapshot)
→ active Change MUST存在且 id == package.changeId
```

否则：

```text
PENDING_INPUT_DRIFT
Prepared Run is no longer bound to the active Change
```

这与 archive 自己已经冻结的 ActionDefinition 冲突：

```text
archive
→ mutationClass = openspec-archive-and-change-completion
→ outputClass = archive-operation-and-completed-state
```

也就是说，同一个 pending archive 的合法执行本身允许：

```text
Change active → completed
```

043 现在会出现：

```text
prepare archive
→ legal completed progress
→ prepare again
→ resumed=true / same runId
→ admit terminal completed result
→ PENDING_INPUT_DRIFT
```

Reviewer 独立 disposable probe 精确复现：

```text
first archive run = pending
mark Change completed
resume = true
same runId
admitActionResult(completed)
→ FAIL:
   PENDING_INPUT_DRIFT
   "Prepared Run is no longer bound to the active Change"
```

因此当前 archive execution仍不能形成：

```text
prepared pending
→ legal archive/completion mutation
→ resume if interrupted
→ terminal result.json
```

完整闭环。

### Required change

`revise-apply` 必须让 **已经存在、identity/fingerprint均匹配的 pending archive** 在其合法
`active → completed` progress 后仍可发布 terminal result，同时保持 fail-closed：

1. non-archive Action terminal admission继续要求其 current active-Change binding；
2. archive MAY在：
   ```text
   exact persisted pending archive
   + same delivery/change/run/action/role
   + package semantic fingerprint exact-match
   + Owner/Review/Verification/contract entry authority仍有效
   + Change 已合法 completed
   ```
   时完成 terminal admission；
3. completed Change + 无 matching pending archive MUST NOT获得新的 archive/admission authority；
4. unrelated completed Change / wrong changeId / wrong runId / tampered package MUST拒绝；
5. `completeRun()` 继续是唯一 terminal publisher / ResultRef authority；
6. Checkpoint仍不是 archive output，也不得在这里 Commit/Push。

Regression 至少：

```text
prepare archive
→ mark Change completed
→ resume same pending archive
→ admit completed logical result
→ result.json published exactly once

completed Change + no pending archive
→ cannot admit fabricated archive package

non-archive prepared Run
→ losing active Change
→ still fail closed
```

---

## B1-RA-006 — archive recovery 与 diagnostics projection 不一致：执行可 resume，但 status/doctor/resume-context 看不到 pending Run

043 的 execution path新增：

```text
findPersistedPendingArchive()
```

因此 active Change已经 completed 后：

```text
prepareActionExecution(entry=next)
→ 能找到 persisted pending archive
→ resumed=true
```

但 `inspectPreparedRun()` 仍然先：

```text
read snapshot
→ getActiveChange(snapshot)
→ null 时直接 { status: 'none' }
```

没有使用同一 persisted pending archive recovery seam。

而 B1 approved diagnostic capability要求：

> `status`、`doctor`、`resume-context` MUST能够从 current formal facts/context 显示 B1 prepared pending Run 的 action/role/runId 与可resume/semantic-input-drift诊断，并保持 read-only。

Reviewer 独立 disposable probe：

```text
prepare archive
→ mark Change completed
→ prepareActionExecution again
→ resumed=true
→ same pending archive runId

inspectPreparedRun()
```

043 实际：

```text
status = none
runId = undefined
```

而不是：

```text
runId = <same archive run>
action = archive
status = resumable
```

因此产品当前会同时告诉 operator：

```text
execution preparation:
→ 有可恢复 pending archive

status/resume-context:
→ 没有 pending execution
```

这破坏 deterministic resume diagnostics，一旦真实 archive 在 partial-completed seam 中断，会给 operator/后续 G1 runner错误恢复信息。

### Required change

`revise-apply` 必须让 read-only diagnostics 与 B1 persisted archive recovery使用一致的 pending identity：

1. `inspectPreparedRun()` 在无 active Change时也应 bounded 检查是否存在唯一 persisted pending archive；
2. 若该 archive按相同 semantic recovery rules可恢复：
   ```text
   runId/action/role/status=resumable
   ```
   必须稳定可见；
3. semantic authority已漂移时返回 input-drift / not-resumable 等真实诊断，不能伪报 none；
4. completed Change且无 pending archive继续是 Delivery-level/no-pending view；
5. diagnostics必须 read-only，不创建 Run、不修改 fingerprint、不执行 archive；
6. 优先复用同一 persisted pending/recovery helper，避免 execution 与 diagnostics 形成第二套 archive decision tree。

Regression 至少：

```text
pending archive + Change completed
→ inspectPreparedRun = same runId / archive / resumable

pending archive + immutable authority drift
→ inspectPreparedRun = input-drift or not-resumable
→ never none

completed Change + no pending archive
→ inspectPreparedRun = none
```

并补 `status/doctor/resume-context` read-only projection regression。

---

## Passed checks

从 031 开始完整回扫，除 `B1-RA-005/006` 外：

- 032 `B1-RE-001`：resolved；
- 036 `B1-RP-001/002/003`：resolved；
- 040 `B1-RA-001/002`：resolved；
- 042 `B1-RA-003/004`：resolved；
- 043 相对 042 只修改：
  - `src/services/b1-run-execution-service.ts`
  - `tests/unit/services/b1-run-execution-service.test.ts`
  - `verification.md`
  - 新增 043 Run；
- 031–042 historical Run artifacts：byte-identical；
- approved Proposal/Design/delta specs/Explore：unchanged；
- fixed ten-Action catalog保持；
- bounded `next` / explicit `review` dual-entry保持；
- Reviewer target current-byte drift fail-closed；
- Apply/revise-apply self-owned tasks/verification continuation保持；
- package tamper admission protection保持；
- Delivery-wide Run-ID / Action→Role defense-in-depth保持；
- CRLF Manifest compatibility保持；
- Full Test/Finalize仍无 Standard Run/Action Package；
- 无 Registry/Router/Evidence/provider session/auto loop；
- 未实现 F1 archive executor / Git Checkpoint mechanics。

## Independent verification

Reviewer 独立确认：

- `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- package `SHA256SUMS`：90/90 passed；
- 043 `inputRef` → 042 result exact fingerprint：valid；
- 043 text hygiene：passed；
- `git diff --check`：passed；
- B1 service official regression：17/17 passed；
- focused suite：87/87 passed；
- affected tests：609/609 passed；
- full project regression：638/638 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard-failures=0；
- OpenSpec 1.7 active Change strict：passed；
- canonical specs strict：12/12 passed；
- exact cumulative diagnostics：
  - B1 active；
  - stage=apply；
  - last-run=043-revise-apply；
  - verification=passed；
  - conflicts=0；
  - `next=review-apply`；
  - `doctor=ok / findings=0`；
  - `resume-context=review-apply`。

Reviewer额外执行两个 disposable adversarial probes：

1. `completed archive resume → terminal admission`：
   **失败**，稳定复现 `B1-RA-005`；
2. `completed archive resume → inspectPreparedRun`：
   **失败**，稳定复现 `B1-RA-006`。

`npm test` 仅作为 Reviewer independent regression scan，**不具有 Delivery Full Test lifecycle 语义**。
Delivery Full Test 未运行。

## Next boundary

`B1-RA-005`、`B1-RA-006` 都是 B1 execution/admission/diagnostic continuation implementation
可修复问题，`blockingAuthority=author`。

下一合法 Action：

`revise-apply`
