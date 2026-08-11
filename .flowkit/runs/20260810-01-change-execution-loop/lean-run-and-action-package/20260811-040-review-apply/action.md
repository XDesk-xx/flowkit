# Action: review-apply

- Run: `20260811-040-review-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-apply`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain: `031-explore → 032-review-explore → 033-revise-explore → 034-review-explore → 035-propose → 036-review-propose → 037-revise-propose → 038-review-propose → 039-apply → 040-review-apply`
- Reviewed Run: `20260811-039-apply`
- Verification Ref: `openspec/changes/lean-run-and-action-package/verification.md`

## Review scope

按 Owner 固定要求，B1 Review 链从 `031-explore` 开始回溯。

本轮复核 039 Apply 是否严格实现 037/038 approved Proposal，重点覆盖：

- fixed ActionDefinition；
- bounded `next` / explicit `review` preparation；
- Delivery-wide NNN / low-level defense-in-depth；
- same-pending semantic input identity；
- logical Action Package semantic binding；
- logical Action Result admission / Core-derived ResultRefs；
- Q1 direct re-review；
- Windows Manifest CRLF compatibility；
- Change-only / Full Test exclusion；
- scope guard 与 verification。

## Reviewer verdict

`changes-requested`

Blocking Findings: 2，全部 `blockingAuthority=author`。

---

## B1-RA-001 — logical result admission 只信 caller 带回的 fingerprint 字符串，没有证明 ActionPackage semantic content 对应该 fingerprint

037/038 已冻结：

```text
semanticInputFingerprint
→ 当前 logical Action Package semantic authority identity

contractRefs / handoffRefs / Review / Verification / Owner refs
→ 适用字段必须参与 canonical descriptor

admission
→ 必须验证 pending Run + Action/Role/semantic input/entry binding
```

039 `admitActionResult()` 当前只验证：

```text
fixed ActionDefinition
run delivery/change/run/action/role identity
persisted context.semanticInputFingerprint
==
pkg.run.semanticInputFingerprint
```

然后直接调用 `completeRun()`。

它没有证明 caller 传回来的 package 中：

```text
contractRefs
handoffRefs
reviewView
ownerAuthorizationRefs
verificationView
requiredResultContract
```

仍然对应这个 fingerprint。

Reviewer 独立攻击式 probe：

```text
1. prepare 合法 Explore package；
2. 保留合法 runId/action/role 与原 semanticInputFingerprint；
3. 将 package.contractRefs 替换成 forged ref/fingerprint；
4. 将 handoffRefs 替换成 forged ref；
5. 提交 logical completed result。
```

实际：

```text
accepted = true
result.json published
```

因此当前 fingerprint 只是一个可复制的 caller 字符串，不是 admission 对 package semantic content 的 proof。

### Required change

`revise-apply` 必须让 admission 对 **prepared package semantic identity** fail closed。

可选实现由 Author 决定，但必须满足：

- 不信任 caller 单独携带的 `semanticInputFingerprint` 值；
- package 中所有 037 定义为 semantic descriptor input 的字段必须被验证为与 persisted fingerprint一致；
- tampered `contractRefs / handoffRefs / relevant Review/Verification/Owner authority identity / ActionDefinition identity` 必须拒绝；
- `requiredResultContract` 等 fixed/derived boundary 不能与 catalog/package generation脱节；
- 不要求重新 hash 已经被当前 Action合法修改的 post-execution output bytes；
- terminal ResultRefs 继续完全由 Core / `completeRun()` 派生。

Acceptance regression 至少覆盖：

```text
prepared package
→ tamper contractRef but keep old fingerprint
→ admission rejected
→ no result.json

prepared package
→ tamper other fingerprint-included authority identity
→ admission rejected
```

---

## B1-RA-002 — Apply/revise-apply 的 fingerprint 从当前 mutable working-tree authority 重算，合法 Action progress 会让 same pending Run 自我失效

037/038 同时冻结：

```text
same pending execution + same semantic input
→ resume same runId

contractRefs exact version identity
→ real contract drift fail closed
```

039 对 `apply/revise-apply` 的 `collectContractRefs()` 从当前 working tree重新 hash：

```text
proposal.md
design.md
tasks.md
delta specs
```

且 `buildVerificationView()` 对 Apply family 又读取当前：

```text
changeVerificationStatus
verification.md resultRef（存在时）
```

但 Apply/revise-apply 本身合法拥有：

```text
tasks.md progress mutation
verification.md / verification status mutation
implementation/test mutation
```

所以当前实现把 **Action 自己允许修改的 progress/output authority** 又当成每次 resume 时必须不变的 input identity。

Reviewer 独立 probe：

```text
prepare Apply
→ pending Run = 20990201-005-apply
→ tasks.md contractRef 已进入 fingerprint

合法执行进度：
tasks.md
- [ ] A
→
- [x] A

再次 prepare same pending Apply
→ PENDING_INPUT_DRIFT
→ resume=false
```

这会让真实跨聊天/跨工具 continuation 卡死：

```text
pending Run 仍存在
+ 不能 resume
+ 又不能创建第二个 pending Run
```

而现实 Apply 正会更新 tasks/verification；039 自己也完成了 25 个 task 并写 verification.md。

### Required change

`revise-apply` 必须区分：

```text
immutable entry contract / authority generation
vs
current Action-owned mutable progress/output facts
```

并同时保持两个 invariant：

1. **真实外部 contract/authority drift**：
   ```text
   approved proposal generation / required handoff / applicable external authority changed
   → PENDING_INPUT_DRIFT
   ```
2. **同一个 pending Apply 的合法自身进度**：
   ```text
   tasks progress / verification output / implementation output合法变化
   → 不得仅因这些 Action-owned mutations 让自身无法 resume
   ```

实现可以从 approved Review/producer ResultRef 等 immutable entry authority 重建原始 contract generation，
或采用其它等价 deterministic 方法；不得简单取消所有 contractRef version binding，也不得把 mutable
working-tree current bytes误当成 immutable entry contract。

必须补 regression：

```text
prepare Apply
→ 合法更新 tasks.md
→ same pending prepare
→ same runId / resumed=true

prepare Apply
→ 合法产生/更新 verification output
→ same pending prepare
→ 不因自身 output progress自我 drift

真实 approved contract generation 改变
→ still PENDING_INPUT_DRIFT
```

---

## Passed checks

从 031 回扫，除上述两个 blocker 外：

- 032 `B1-RE-001`：resolved；
- 036 `B1-RP-001/002/003`：Proposal closure保持；
- fixed ten-Action catalog：实现与 037 normative mapping一致；
- `entry=next | review` bounded dual-entry：保持；
- Q1 blocked-next + explicit same-stage direct re-review：通过；
- low-level `createRun()`：
  - malformed/duplicate/non-monotonic NNN defense；
  - Action suffix；
  - Action→Role；
  - retired Delivery behavior拒绝；
- logical result caller-built ResultRefs不获得 authority；
- Core terminal persistence / create-once保持；
- CRLF Manifest：
  - pure LF / pure CRLF accepted；
  - successful mutation canonical LF；
  - mixed/bare CR fail closed；
- A1 owner idempotency / dependency / architectureImpact regression保持；
- Full Test / Finalize未进入 Standard Action catalog/package；
- 未引入 Registry/Router/Evidence/provider session/auto loop；
- 未越入 C1/D1/E1/F1/G1/03 executor scope。

## Independent verification

Reviewer 独立确认：

- `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- 031–038 historical Run artifacts：byte-identical；
- 039 `inputRef` → 038 result exact fingerprint：valid；
- package `SHA256SUMS`：78/78 passed；
- 039 相对 038 未修改 Proposal/Design/Explore/Reviewer-owned artifacts；
- tasks：25/25 checked；
- text hygiene：passed；
- `git diff --check`：passed；
- focused B1/A1/Run/diagnostic suite：77/77 passed；
- affected Change verification：599/599 passed；
- project regression `npm test`：628/628 passed；
- typecheck：passed；
- lint：passed；
- build：passed；
- quality：passed，hard failures=0；
- OpenSpec 1.7:
  - active Change strict：passed；
  - canonical specs strict：12/12 passed；
- exact cumulative diagnostics：
  - B1 active；
  - stage=apply；
  - last-run=039-apply；
  - verification=passed；
  - conflicts=0；
  - `next=review-apply`；
  - `doctor=ok / findings=0`；
  - `resume-context=review-apply`。

`npm test` 在本 Review 中仅作为 independent regression scan，**不具有 Delivery Full Test lifecycle 语义**。
Delivery Full Test 未被执行。

039 Manifest 中存在结构有效、Reader 无 conflict 的 `authorize-apply:B1` OwnerDecisionRecord；
本 Review 不以 Author prose 单独创造 Owner authority。

## Next boundary

两个 blocker 均为 production implementation / regression 可修复问题，`blockingAuthority=author`。

下一合法 Action：

`revise-apply`
