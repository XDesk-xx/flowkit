# Action: review-explore

- Run: `20260811-032-review-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `review-explore`
- Role: reviewer
- Execution Context: detached
- Owner authorization: not required
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- B1 Review Chain Start: `031-explore → 032-review-explore`
- Reviewed Run: `20260811-031-explore`

## Review scope

按 Owner 指定，从 `031-explore` 建立 B1 独立审查链。复核：

- Lean Run / Run-ID / same-Run continuation；
- ActionDefinition / Action→Role；
- logical Action Package；
- Action Result admission / ResultRef；
- failed/cancelled retry；
- Owner 明确并入 B1 的 Windows Manifest writer CRLF compatibility；
- B1 与 C1/D1/E1/F1/G1/03 scope boundary。

Owner 在本 Review 会话中再次明确确认：此前已经明确要求“启动 B1 Explore”。
因此 031 的 B1 activation / Explore Owner authority 本轮视为已确认，不构成 finding。

## Reviewer verdict

`changes-requested`

Blocking Findings: 1，`blockingAuthority=author`。

### B1-RE-001 — Explore 漏掉当前 canonical Action Package contract 的直接冲突

031 已正确识别 production Action Package generator 尚缺，并把
`docs/integration-boundaries.md`、`docs/core-model.md`、
`openspec/specs/flowkit-integration-boundaries/spec.md` 列为 Proposal repo-wide affected surface，
但没有把其中已经存在的互相冲突正式语义识别成 confirmed gap。

Exact Base `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1` 当前同时存在：

1. `docs/integration-boundaries.md`：
   - Standard Change Action Package 的 Owner authorization 示例只包含 Apply / Archive；
   - 明确写明 Delivery Full Test / Finalize 属 Delivery behavior boundary，
     **不是 Standard Change Action Package**。

2. `openspec/specs/flowkit-integration-boundaries/spec.md`：
   - `Scenario: Action Package 包含 owner 授权状态` 仍写
     “当前 Action 需要 owner 授权（如 Apply、Archive、Full Test）”；
   - 这会把 Full Test 继续表达成 Action Package 可服务的 Action，
     与 Q1/v8 的 “Full Test no Standard Run / no Change Action Package” 直接冲突。

3. `docs/core-model.md` 仍保留历史阶段 ownership：
   - “具体 Action Package、Skill 字段、标识、加载和 Adapter 协议属于 C1”；
   - 当前 02 Delivery 已冻结 B1 负责 Lean Run / logical Action Package，
     当前 C1 已是 `openspec-1-7-thin-integration`。
   - 该旧文案如果不在 Proposal 中重新区分 logical package generation 与后置 physical
     adapter/transport ownership，会给 B1 implementation 造成第二套 scope interpretation。

B1 正要实现 production Action Package preparation。如果 Explore 不先显式冻结这个 canonical drift，
Proposal/Apply 可能在两个正式 contract 之间任选其一，甚至把 Delivery Full Test 重新塞回 Change
Action Package，违反已完成 Q1 和当前 Operating Model。

#### Required outcome

`revise-explore` 必须把该 drift 加入 confirmed gaps，并要求 Proposal repo-wide 冻结：

```text
B1 Action Package
→ 只服务 Standard Change Actions
→ Apply / Archive 等 Change Owner authorization 可进入 package view

Delivery Full Test / Finalize
→ Delivery behavior
→ 不属于 B1 Standard Change Action Package
→ 不创建 Standard Run
```

同时明确：

```text
B1
→ logical Action Package preparation/generation

后置 integration / provider transport / stable adapter
→ 不由 B1 扩成第二编排器
```

并把上述 canonical docs/spec ownership wording 纳入 Proposal 的明确修订/对齐范围，而不是只作为
“可能 affected surface”留待实现阶段临时解释。

## Passed checks

除上述 blocker 外，本轮完整 scan 结果：

- package `baseHead` = `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`；
- `SHA256SUMS`：6/6 passed；
- 031 `explore.md` ResultRef fingerprint：valid；
- 031 只新增 Explore/OpenSpec metadata/Run，并将 B1 `planned → active` + Owner activation provenance；
- 未修改 production code/tests/canonical specs；
- Owner 已在当前会话明确确认启动 B1 Explore authority；
- `createRun()` 未组合 `allocateNextRunId()/validateCandidateRunId()`：confirmed；
- current schema 只校验 role enum、没有 Action→Role binding：confirmed；
- `DeliveryManifestDocument` 仍拒绝 CRLF：confirmed；
- 031 对 existing Core primitives 与 B1 composition gaps 的主体判断成立；
- Reviewer 独立运行相邻 targeted suite：141/141 passed；
- 精确 materialize 031 后：
  - `status`: B1 active / stage explore / conflicts=0；
  - `next`: `review-explore`；
  - `doctor`: `ok / findings=0`；
  - `resume-context`: next=`review-explore`；
- CRLF gap 被 bounded 为 runtime writer compatibility，没有重开 A1；
- 未发现 C1/D1/E1/F1/G1/03 的其它 scope blocker。

031 文档记录 targeted `133/133`，Reviewer 当前相邻 8-file selection 实际得到 `141/141`；
该差异只属于测试选集/统计口径，不影响 Explore contract，不作为 finding。

## Next boundary

当前唯一 blocker 属 Author Explore 调查/contract framing 可修复问题，因此：

`revise-explore`
