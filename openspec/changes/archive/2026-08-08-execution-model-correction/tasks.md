# Tasks: Q1 — execution-model-correction

## 1. 契约与正式文档

- [x] 1.1 更新 `docs/core-model.md`：Run = execution envelope；明确 One fact, one authority 与 closed Run boundary。
- [x] 1.2 更新 `docs/delivery-lifecycle.md`：正式 Change artifact 是 mutable current-state canonical path；冻结 revision → archive lifecycle、`.tmp` scratch 边界、pending completion retry。
- [x] 1.3 更新 `docs/verification-model.md`：focused / affected / Delivery Full Test timing 与 owner authorization 边界；不定义 F1 scripts。
- [x] 1.4 更新 `docs/bootstrap-reference.md`：Lean Run 手工执行、canonical artifact revision 语义、legacy metadata-only 有界例外。
- [x] 1.5 检查 `AGENTS.md`，仅删除/修正仍要求 Agent 手工维护重型 Run bookkeeping 的规则；不复制实现细节。
- [x] 1.6 确认 `flowkit-domain-and-state-schema` 与 `flowkit-policy-engine` 无需 delta；generation-aware validation 属 Reader consistency，不新增 Policy 状态。

## 2. closed Run schema

- [x] 2.1 为 schemaVersion 2 `RunResultFile` / `ActionResultWithoutRunRef` 实现 unknown-field rejection。
- [x] 2.2 定义 typed `reviewFindings` 最小 schema（id/severity/title/problem/location?/requiredChange?）。
- [x] 2.3 实现 review verdict × blocking findings 一致性校验。
- [x] 2.4 拒绝非 review Run 的 `reviewVerdict` / `reviewFindings`。
- [x] 2.5 保持 `actionResult.runRef` 物理省略与 read-time derivation 不变。
- [x] 2.6 添加 closed allowlist 单元测试，覆盖重型 legacy-style fields 被拒绝。

## 3. Core-owned ResultRef

- [x] 3.1 保留并测试 `buildRunResultRef` 只用于 `run-result`。
- [x] 3.2 新增 non-Run artifact ResultRef constructor，使用 Core 内部 kind enum。
- [x] 3.3 实现 ResultRef kind enum 与 field-specific kind binding validation。
- [x] 3.4 实现 repository-relative logical ref normalization、traversal rejection、absolute-path rejection、non-Run `result.json` rejection。
- [x] 3.5 实现 Run-ID → result.json resolver。
- [x] 3.6 实现 producedArtifactTag 的 Action-permitted set 与 tag → canonical logical ref resolver；initial explore/propose 的 expected tag set 由 Core 固定，caller 不得省略。
- [x] 3.7 实现 non-Run artifact archive-aware physical resolver：active path 与唯一 `archive/<date>-<changeId>/` path 二选一；歧义 fail-closed。
- [x] 3.8 所有 current propose effective generation 都必须精确覆盖当前 `specs/**` namespace：initial propose Core 枚举完整 namespace；revise-propose overlay 后无条件 exact-compare effective specs refs 与 canonical namespace；namespace 新增/删除而未声明 `specs` 必须保持 pending；声明 `specs` 时整体重新枚举/替换。
- [x] 3.9 拒绝 caller-supplied path、kind、versionFingerprint。
- [x] 3.10 保证 createRun / writeRunResult preflight / review entry / Reader 复用同一 logical-ref / physical-target validation 语义。

## 4. Review 精确绑定

- [x] 4.1 调整 `CreateRunInput`：生产调用方使用 typed target descriptor，不直接传 ResultRef authority。
- [x] 4.2 普通 Run 有 consumedRunId 时由 Core 派生 `context.inputRef`；无 source target 时允许 absent。
- [x] 4.3 review-* Run 强制 `reviewedRunId` + Core-derived `context.inputRef`。
- [x] 4.4 createRun 在 staging publish 前拒绝 missing/unreadable reviewed result。
- [x] 4.5 Reader 校验 review-* `reviewedRunId ↔ inputRef.ref ↔ fingerprint` exact binding。
- [x] 4.6 Reader 对 absent/wrong-target/missing/mismatch 收集 `FactConflict`，不得构造有效 ReviewVerdictFact。
- [x] 4.7 创建 review-explore / review-propose 前先验证被审查 generation 的 current effective artifact set；review-propose 对 initial 与 revise successor 都必须再次 exact-compare effective specs refs 与当前 canonical `specs/**` namespace，empty/partial/drifted namespace 均不得进入 review。
- [x] 4.8 测试 review binding 的 valid / missing / wrong ID / replacement 场景。

## 5. generation-aware mutable artifact lifecycle

- [x] 5.1 Reader 先读取 schemaVersion 2 Run contexts/results 与 review verdicts，再构建 review/revise lineage；禁止在 lineage 未建立前逐 Run 对 historical mutable refs 直接报 conflict。
- [x] 5.2 对 `S ∈ {explore, propose}` 实现合法 successor 判定：matching `review-S changes-requested` + `revise-S.sourceReviewRun/sourceReviewVerdict`。
- [x] 5.3 实现 generation 分类：current / pending revision window / superseded；不得按 Run 编号或 mtime 猜测。
- [x] 5.4 initial generation 先建立完整 Action-owned expected set（explore；或 proposal+design+tasks+完整 specs namespace）；revise successor 使用 `effectiveArtifactSet` overlay：changed tag 覆盖 predecessor、未声明 tag 继承、`specs` 为整个 namespace replacement；对每个 current propose generation，overlay 后必须无条件 exact-compare effective specs identities 与当前 canonical namespace。
- [x] 5.5 pending revise window 中只豁免该 stage-owned predecessor mutable refs；immutable Run-result refs、review binding、source-review lineage继续严格验证。
- [x] 5.6 completed revise terminal 前验证 successor refs + inherited refs；revise-propose 还必须验证 effective specs namespace 与当前 canonical namespace 精确相等。未声明 singleton 内容变化因 inherited mismatch 保持 pending；未声明 specs namespace 新增/删除因 set mismatch 保持 pending。
- [x] 5.7 completed successor 后，predecessor 被合法覆盖的 mutable refs 不再对当前 canonical bytes 做 replacement validation；terminal Run 不改写。
- [x] 5.8 没有合法 successor/window 时 canonical overwrite 必须继续产生 `FactConflict`。
- [x] 5.9 添加真实 E2E fixture：`propose P0 → review-propose CR → revise-propose P1(只改 proposal+design)`；archive 前同时读取 P0/P1 无假 conflict，P1 effective set 全部严格验证。
- [x] 5.10 添加 negative fixture：无 matching revision lineage 覆盖 proposal.md → Reader `FactConflict`。
- [x] 5.11 添加 subset omission fixture：P1 只声明 proposal，但 design 也变化 → terminal preflight mismatch，P1 保持 pending。
- [x] 5.12 添加 initial coverage fixtures：empty initial explore、empty/partial initial propose、initial propose 后新增未绑定 spec 均拒绝；完整 initial propose 正例通过并可进入 review。
- [x] 5.13 添加 successor specs namespace fixtures：`P0({A}) → review CR → P1(proposal only + 新增 specs/B)` 必须无法 terminal/进入 review；`P1` 同时声明 `specs` 后 Core 枚举 `{A,B}` 的正例通过；namespace 未变化时 proposal-only subset overlay 继续通过。

## 6. writeRunResult derivation 与 completion preflight

- [x] 6.1 `writeRunResult` 从 consumedRunId descriptors 派生 `consumedInputRefs`。
- [x] 6.2 `writeRunResult` 从 producedArtifactTag descriptors 派生当前 successor `producedResultRefs`。
- [x] 6.3 非 review Run 从 reviewRunId descriptor 派生 `reviewVerdictRef`；review-* Run 明确拒绝该字段。
- [x] 6.4 initial artifact Run terminal 前由 Core 自动构造并严格验证完整 expected produced set；initial explore 不允许缺 explore，initial propose 不允许缺 proposal/design/tasks/任一实际 spec。
- [x] 6.5 revise artifact Run terminal 前构建 predecessor effective set + successor overlay 并严格验证 successor/inherited refs；`revise-propose` 额外无条件执行 effective specs namespace exact-set comparison，namespace drift 未声明 `specs` 时不得 terminal。
- [x] 6.6 target missing/unreadable 返回 `RESULT_REF_TARGET_MISSING` 且保持 pending。
- [x] 6.7 fingerprint replacement 返回 `RESULT_REF_MISMATCH` 且保持 pending。
- [x] 6.8 修正输入后允许同一 pending Run 再次尝试完成。
- [x] 6.9 保持 `assertMutable + fs.link` terminal create-once 与并发 first-writer-wins 不变。

## 7. verificationSummaryRef generation lifecycle

- [x] 7.1 `review-apply` 使用 `context.changeId` 派生 logical ref `openspec/changes/<changeId>/verification.md`。
- [x] 7.2 review-apply 缺失/不可读/歧义 verification target 时保持 pending。
- [x] 7.3 apply / revise-apply / archive 不新建 `verificationSummaryRef`。
- [x] 7.4 对 `review-apply changes-requested → revise-apply → Change Verification → review-apply` 建立 verification generation boundary。
- [x] 7.5 合法 revise-apply window 后旧 review-apply summary ref 可 superseded，不因 verification.md 正常更新产生历史假 conflict；旧 terminal review binding/verdict继续严格验证。
- [x] 7.6 下一 review-apply 从当前 verification bytes 构造新 current summary ref并严格验证。
- [x] 7.7 无合法 revise-apply lineage 时 verification.md replacement 仍 fail-closed。

## 8. archive lifecycle

- [x] 8.1 generation-aware classification 先确定 final current effective artifact/verification set。
- [x] 8.2 模拟正常 archive relocation：移动 final canonical Change directory但保持 final effective bytes。
- [x] 8.3 post-archive Reader 用同一 logical ref 解析唯一 archive target并验证 final effective fingerprints。
- [x] 8.4 active+archive ambiguity、multiple archives、missing、final relocation hash mismatch 均 fail-closed。
- [x] 8.5 superseded historical refs archive 后继续保持 historical scope，不与 final archived bytes 重新比较。
- [x] 8.6 证明 archive 不修改任何既有 terminal Run。

## 9. Bootstrap legacy compatibility

- [x] 9.1 保持 schemaVersion 1 legacy recognizer best-effort 行为，不将 malformed schemaVersion 2 降级为 legacy。
- [x] 9.2 保持 `createRun` / `writeRunResult` 不自动迁移或重写 legacy Run。
- [x] 9.3 将 owner-authorized metadata-only correction 定义为 Bootstrap 文档流程，不新增通用 editor API/CLI。
- [x] 9.4 不建立 `.flowkit/artifacts/**`、`openspec/.history/**` 或其他 per-Run OpenSpec artifact snapshot store。

## 10. Verification 与收口

- [x] 10.1 对 serialization / ResultRef / persistence / Reader 修改运行 focused 与 affected unit tests。
- [x] 10.2 对共享类型/Reader 影响运行适用 typecheck、lint、build。
- [x] 10.3 运行 `openspec validate execution-model-correction --strict`。
- [x] 10.4 创建并维护 `openspec/changes/execution-model-correction/verification.md`，记录适用检查和结果引用。
- [x] 10.5 确认未运行 owner 未授权的 Delivery Full Test。
- [x] 10.6 确认未新增具体 focused/affected/full npm scripts、Gate Registry、自动 review/revise loop、completed Run editor 或 artifact history registry。
