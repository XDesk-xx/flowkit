# Proposal: Q1 — execution-model-correction

## Why

Delivery `20260806-01-deterministic-core` 的 A1–D1 已完成并形成 Checkpoint。D1 的实际开发证明了当前 Core 的
terminal create-once、原子持久化和 Policy 确定性方向有效，但也暴露出执行模型成本过高：Run 被 Agent
手工扩张为审计包，ResultRef fingerprint 依赖手工填写，Review 结果缺少精确内容绑定，且小修改经常重复执行
昂贵验证。

Q1 不重新打开 A1–D1，而是在其后以 corrective Change 收敛执行模型：Run 只保存流程推进、精确交接和恢复所需的
最小正式信息；所有生产 ResultRef 由 Core 从真实目标派生；terminal publish 前执行统一 preflight；正式 Change
artifact 与 `.tmp` 边界被明确冻结；Verification 只冻结 focused / affected / Full Test 的成本边界，具体脚本继续由
F1 负责。

`20260806-115-review-explore` 已对修订后的 Explore 给出 `approved`，Q1-RE-001～Q1-RE-004 全部 resolved。
`20260806-117-review-propose` 的 Q1-RP-001 / Q1-RP-002 已在 118 关闭，119 的 Q1-RP-003 已在 120 收敛为
**generation-aware mutable artifact lifecycle**。121 的 Q1-RP-004 / Q1-RP-005 已在 122 关闭。随后
`20260806-123-review-propose` 指出 Q1-RP-006：完整 `specs/**` namespace 校验不能只覆盖 initial propose；
任意 current `revise-propose` effective set 也必须与当前 canonical `specs/**` namespace 精确一致，否则 successor
可在未声明 `specs` tag 时新增未绑定 spec 并进入 Review。

## What Changes

Q1 将实施以下改动：

1. **Lean Run closed schema**
   - `RunResultFile` / `ActionResultWithoutRunRef` 改为 closed Core-validated schema；
   - 未知字段拒绝，不再透传 `blockingFindings`、`verification[]`、`consistencyScan`、`policyRoute`、`commitPolicy` 等自由 payload；
   - review-* Run 仅额外保存 typed `reviewVerdict` + `reviewFindings`，非 review Run 通过 ResultRef 引用 reviewer 结果。

2. **所有 ResultRef 由 Core 派生**
   - caller 只提供 typed target descriptor，不提供 `versionFingerprint`、kind 或任意文件 path；
   - Run result 使用现有 `buildRunResultRef`；
   - non-Run artifact 新增 `buildArtifactResultRef`；
   - Core 拥有 field → kind → logical-ref → physical-target resolver。

3. **精确 Review 内容绑定**
   - review-* Run 的 `context.inputRef` 改为 REQUIRED；
   - Core 从 `reviewedRunId` 的实际 `result.json` 派生 inputRef；
   - create / completion preflight / Reader 均校验 `reviewedRunId ↔ inputRef.ref ↔ versionFingerprint` 一致；
   - review-* Run 不携带指向自身的 `reviewVerdictRef`，避免 self-hash；
   - 创建 review-explore / review-propose 前，当前 effective artifact generation 必须通过内容验证，保证 reviewer 审查的 canonical 内容与被审查 Run 声明一致。

4. **Run completion preflight**
   - terminal `result.json` 发布前重新读取并验证所有适用 Core-created ResultRef；
   - 缺失目标返回 `RESULT_REF_TARGET_MISSING`，非法替换返回 `RESULT_REF_MISMATCH`；
   - preflight 失败不发布 result.json，同一个 Run 保持 pending，可在修正输入后重试；
   - 现有 `assertMutable + fs.link` create-once 协议保持不变。

5. **Mutable Change artifact 的 generation-aware validation**
   - `propose / revise-propose`（以及同构的 `explore / revise-explore`）继续写同一组 OpenSpec canonical paths；Q1 **不创建第二套 artifact snapshot/history store**；
   - **初始 generation 的 produced set 由 Core 固定且完整派生**：initial `explore` 必须绑定 `explore.md`；initial `propose` 必须绑定 `proposal.md`、`design.md`、`tasks.md` 和当时实际存在的完整 `specs/**` namespace，caller 不能通过省略 tag 形成空/部分初始 generation；
   - initial propose 的 `specs/**` expected set 由 Core 枚举实际 namespace，review entry 必须同时拒绝“Run 缺 ref”和“canonical namespace 多出未绑定文件”；
   - **该 namespace completeness invariant 适用于每一个 current propose effective generation，而不只 initial propose**：`revise-propose` overlay 完成后，terminal preflight 与 review entry 都必须把 effective specs logical-ref set 与当前 canonical `specs/**` namespace 做精确集合比对；
   - 若 successor 未声明 `specs` tag 但 canonical specs namespace 出现新增/删除，则 namespace set mismatch，successor MUST 保持 pending（或 review binding 被拒绝）；若声明 `specs` tag，则 Core 重新枚举完整 namespace 并整体替换 predecessor specs refs；
   - `producedResultRefs` 的 fingerprint 表达“该 terminal generation 完成时的内容断言”，Reader 不再把所有历史 generation 永久重新绑定到当前 canonical bytes；
   - Reader 通过合法 review/revise lineage 确定 **current effective artifact generation**，只对当前 effective set 做严格 content-hash replacement validation；
   - 合法 successor revision 出现后，前一 generation 变为 superseded；其 terminal Run、review exact binding 和 lineage 继续严格验证，但其已被 successor 合法覆盖的 mutable artifact ref 不再对当前 bytes 产生 `FactConflict`；
   - revise 只改部分 Proposal artifacts 时，effective set 使用 overlay：successor 明确生产的 tag 替换前代对应 logical ref；未生产的 tag 继承前代 ref 并继续验证。`specs` tag 替换整个 `specs/**` namespace；无论 `specs` tag 是否声明，overlay 后都必须再次执行 current canonical specs namespace exact-set comparison，因此新增/删除 spec 不能靠遗漏 tag 绕过绑定；
   - 若 canonical 内容改变却不存在合法 matching `changes-requested → revise-*` lineage / revision window，仍按非法 replacement fail-closed；
   - 同样的 generation boundary 应用于可在 `revise-apply → Change Verification → review-apply` 期间更新的 `verificationSummaryRef`，避免历史 review-apply 因正常重验证覆盖 `verification.md` 被误判损坏。

6. **Archive-safe logical identity**
   - 对**当前 effective generation** 的 non-Run artifact，persisted logical ref 使用 active canonical namespace；
   - archive 前解析 active path，archive 后解析唯一 `openspec/changes/archive/<date>-<changeId>/...` target；
   - archive relocation 必须保持最终 effective artifact bytes 不变；active/archive 歧义、多 archive 匹配或 final bytes 改变仍 fail-closed；
   - terminal Runs 不因 revision 或 archive 被重写。

7. **正式 artifact 与 scratch 边界**
   - active Change 的 `explore.md / proposal.md / design.md / specs/** / tasks.md / verification.md` 位于 `openspec/changes/<changeId>/`；
   - revision 合法覆盖这些 canonical current-state artifacts；archive 后最终 current-state artifacts relocation 到唯一 `openspec/changes/archive/<date>-<changeId>/`；
   - `.tmp/**` 仅作可删除 scratch，resume / review / archive 不得依赖其作为唯一事实来源。

8. **Verification 成本边界**
   - Q1 只冻结 timing / ownership：开发和修订使用 focused / affected 检查，Delivery Full Test 仅在 owner 授权后运行；
   - 不在 Q1 创建 `test:focused` / `test:affected` / `test:full` / `verify:change` 等具体脚本，这些属于 F1。

9. **Bootstrap legacy 有界兼容**
   - 不建立通用 completed Run editor；
   - 只定义 schemaVersion 1 Bootstrap 历史的 owner-authorized metadata-only 兼容例外；
   - 该例外不修改 terminal `result.json`、Action、Role、Verdict、Findings 或业务产物，也不成为长期运行时 API。

## Capabilities

### Modified

- `flowkit-formal-fact-reader-and-persistence`
  - 收紧 Run physical schema；
  - 所有 ResultRef Core-derived；
  - review exact-content binding；
  - completion preflight；
  - Reader generation-aware mutable artifact validation；
  - current effective generation 的 archive-aware resolution。

- `flowkit-bootstrap-and-roadmap`
  - 收敛 Bootstrap Run 最小记录；
  - 冻结 canonical Change artifact 的 revision / archive lifecycle 与 `.tmp` 边界；
  - 冻结 Verification 分层成本边界；
  - 定义 legacy metadata correction 的有界 Bootstrap 例外。

### Unchanged

- `flowkit-domain-and-state-schema`：不新增 Run 主状态，不改变 terminal 语义和固定 Action Catalog。
- `flowkit-policy-engine`：不修改 `canRun / next / diagnose` 的业务决策语义；generation classification 是 Reader 对
  mutable artifact reference 的一致性判断，不新增 Policy 状态。

## Impact

- **主要代码影响**：
  - `src/persistence/run-persistence.ts`
  - `src/persistence/result-ref-adapter.ts`
  - `src/persistence/serialization.ts`
  - `src/facts/formal-fact-reader.ts`
  - 必要的 generation/lineage 辅助函数与持久化/Reader 测试。

- **正式文档影响**：
  - `docs/core-model.md`
  - `docs/delivery-lifecycle.md`
  - `docs/verification-model.md`
  - `docs/bootstrap-reference.md`
  - `AGENTS.md` 仅在仍存在与 Lean Run 相冲突的仓库级手工 bookkeeping 要求时做最小对齐。

- **兼容性**：
  - schemaVersion 2 新 Run 使用收紧后的 Q1 contract；
  - schemaVersion 1 Bootstrap Run 继续走 legacy recognizer；
  - 不迁移、不重写既有 A1–D1 terminal Runs；
  - 不要求为每个 revision 保存 OpenSpec artifact 快照或建立 artifact registry。

- **风险控制**：
  - terminal create-once、reviewed Run result exact binding、原子 `fs.link` 发布和 D1 Policy 语义不变；
  - historical mutable artifact ref 只有在**可证明的合法 successor lineage** 下才停止对当前 canonical bytes 做 replacement validation；
  - 没有合法 successor 时，任何 canonical overwrite 仍 fail-closed；
  - current effective artifact set 在 review 前、revision terminal preflight、普通 Reader 与 post-archive Reader 中始终严格验证；
  - Q1 不实现完整 Change Runner、不实现自动 Author/Reviewer 循环、不实现 Full Test 调度器；
  - Full Test 未经 owner 授权不得运行。
