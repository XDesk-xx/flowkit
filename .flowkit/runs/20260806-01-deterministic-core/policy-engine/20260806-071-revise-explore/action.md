# revise-explore: D1 policy-engine

## Goal

修复 070-review-explore 发现的 2 个 P1 blocking findings，更新 explore conclusion，
并对全部交叉引用维度执行全量一致性扫描（consistencyScan），确保 0 contradictions。

## Source review

- Run: 20260806-070-review-explore
- Verdict: changes-requested
- Blocking Findings:
  - D1-EX-001: Lifecycle stage selection cannot progress after a completed review
  - D1-EX-002: Policy gates require formal facts that the declared snapshot does not provide

## D1-EX-001 修复方案

引入 Lineage 模型：通过 `ReviewVerdictFact.reviewedRunId` 追踪 review 与 artifact Run
的审阅关系，替代"无 completed review-* Run"的存在性禁止规则。

核心规则：
- Current Artifact Run = latest completed Run in {explore/revise-explore, propose/revise-propose, apply/revise-apply}
- Current Review = latest completed review-* Run
- Lineage match: Current Review.reviewedRunId == Current Artifact Run.runId
- match + approved → 阶段完成，推进
- match + changes-requested → revise-*
- no match → review-* （新 artifact 未被审阅）

## D1-EX-002 修复方案

- ownerAuthorizations：snapshot 字段存在（C1 契约），D1 使用它；空数组 → owner-decision（fail-closed）
- Change Verification：snapshot 无此字段 → D1 对 verification-gated actions 返回
  blocked: verification-facts-unavailable；不 infer；未来 change 可扩展 snapshot

## 全量扫描维度

1. Lineage 模型一致性：Section 3 / 4 / 4.1 / 8
2. Verification facts 可用性一致性：Section 1.3 / 3 / 5 / 6
3. Owner authorization 一致性：Section 1.3 / 3 / 3.3 / 6
4. 与 delivery-lifecycle.md Section 3.2-3.5 / 5 / 6-7 一致性
5. 与 C1 FormalFactSnapshot 契约一致性
6. 与 B1 Action Catalog / states.ts 一致性

## Allowed

- 读取正式 docs、冻结 specs、源码
- 修改 `.tmp/explore/policy-engine/conclusion.md` 和 `evidence.json`

## Forbidden

- 修改 manifest、tracked files、OpenSpec changes
- 写生产代码、测试代码
- Checkpoint、Full Test
- Git commit
- 修改 069-explore / 070-review-explore 的 result.json（terminal Run 不可变）
