## 1. Action definition 与领域 schema

- [x] 1.1 定义十个固定 `ActionDefinition`，逐 Action实现035/037冻结的 `role + goalClass + mutationClass + outputClass + terminalContract`完整 mapping；不新增 Registry/dynamic discovery，Full Test/Finalize不进入 catalog。
- [x] 1.2 定义 provider-neutral logical `ActionPackage` 与 logical result input schema；字段保持最小 refs/view，不复制专业事实全文或历史 corpus。
- [x] 1.3 定义 compact `semanticInputFingerprint` canonical descriptor/hash helper：强制纳入完整 ActionDefinition identity/version、全部 `contractRefs {ref,kind,versionFingerprint}`、handoff/review/verification/Owner authority identity，并实现 package semantic input inclusion/exclusion rule；pending Run本身是 execution instance，不存 provider/chat session identity。

## 2. 唯一 Run preparation / continuation surface

- [x] 2.1 新增薄 B1 execution preparation service并实现 bounded dual-entry：`entry=next`只消费 shared `next()`；`entry=review`只消费 shared `resolveReview()/canRun(review-S)`统一入口。caller不得直接指定 formal Action；blocked next不得自动review；合法Q1 direct re-review可创建new Reviewer generation。
- [x] 2.2 将 `allocateNextRunId()` 接入 new Run path，caller不得选择 NNN；execution clock injectable，Checkpoint不消耗/重置 NNN。
- [x] 2.3 在低层 `createRun()`/serialization做 defense-in-depth：malformed/non-monotonic/duplicate NNN、run-id action suffix mismatch、Action→Role mismatch全部 fail-closed。
- [x] 2.4 实现 pending resume：stored/current semantic fingerprint + action/role完全一致才返回同一 runId；drift时 fail-closed且不得发布第二个 pending Run。
- [x] 2.5 覆盖 failed/cancelled retry、new Reviewer execution、Q1 non-author blocker下 explicit direct re-review、real revise/new Action均创建新 NNN；matching pending review继续同一run；换聊天/工具/普通 Commit不得制造 new Run。

## 3. Logical Action Package

- [x] 3.1 从 FormalFactSnapshot + Policy +完整 ActionDefinition + current Run context生成 logical package：identity、contract/handoff refs、review view、Owner refs、mutation/output boundary、verification view、required result contract；package中的每个semantic authority input必须与fingerprint inclusion rule一致。
- [x] 3.2 保证 package generator只接受十个 Standard Change Actions；Apply/Archive可携带适用 Owner refs，Full Test/Finalize必须拒绝且不创建 Run/package。
- [x] 3.3 保证 pending resume可重新生成相同 semantic package input而不依赖聊天/provider session；不得加载 completed Change历史 Run corpus或全量 logs/Git/OpenSpec copy。

## 4. Logical Action Result admission

- [x] 4.1 新增薄 admission service，验证 pending Run、ActionDefinition、role、semantic fingerprint与 current entry binding后调用现有 `completeRun()`。
- [x] 4.2 caller只可提交 executionStatus/summary与 Action-specific review/failure descriptor；RunRef/ResultRefs/kind/path/fingerprint继续全部 Core-derived。
- [x] 4.3 回归 review/source-review/verification binding与 terminal create-once；recommendation不得推进 lifecycle。

## 5. Windows Manifest CRLF bounded compatibility

- [x] 5.1 在 `DeliveryManifestDocument`/等价最小 seam接受纯 LF/纯 CRLF，内部 normalize；混合/非法 carriage return、tabs、ambiguous YAML shape继续 fail-closed。
- [x] 5.2 成功 mutation统一写 canonical LF、no trailing whitespace、exactly one EOF newline；不引入 Windows-specific Manifest variant或第二 parser。
- [x] 5.3 增加 CRLF regression：`owner record`、`create change`、`activate`均与 LF语义一致并输出 LF；Owner idempotency、dependency/architectureImpact、unknown section preservation不得回退。

## 6. Canonical alignment 与 diagnostics

- [x] 6.1 新增 `flowkit-lean-run-and-action-package` capability，并同步 core-model/domain/persistence/policy/diagnostic/integration/A1/bootstrap八个 affected capability delta。
- [x] 6.2 修正 `openspec/specs/flowkit-integration-boundaries/spec.md` 中 Full Test作为 Action Package示例的旧语义；修正 `docs/core-model.md` 旧 C1 logical Action Package ownership；同步 integration/delivery/bootstrap/roadmap/AGENTS最小 wording。
- [x] 6.3 保持 `status/next/doctor/resume-context` read-only，并让 pending prepared Run可确定性 resume/diagnose；完整 action runner CLI仍留 G1。

## 7. Verification 与 Lean observation

- [x] 7.1 focused tests覆盖非法 Run-ID/duplicate NNN/十Action完整ActionDefinition、normal next与explicit review dual-entry、Q1 blocked-next direct re-review、pending resume/contractRef version drift、retry/reviewer generation、ActionPackage Change-only/minimality、logical result admission/Core refs、CRLF writer。
- [x] 7.2 affected tests覆盖既有 ResultRef/current-review/source-review/verification、A1 write-side、Policy/diagnostics与 Windows launcher；不得改写 archived Q1/A1历史。
- [x] 7.3 记录 Action Package size、prepare/resume wall time、active Change Run count/current Run size等 observation，并证明 package不随 completed Delivery history线性加载整个 corpus。
- [x] 7.4 运行 typecheck、lint、build、quality、OpenSpec active/canonical strict 与 `git diff --check`；Change Verification明确 `Delivery Full Test = not-run`。
- [x] 7.5 复核 scope guard：无 Registry/Router/Evidence/Provider session store、无 OpenSpec reimplementation、无 auto-loop、无 Commit/Push/Checkpoint、无 C1/D1/E1/F1/G1/03 scope creep。
