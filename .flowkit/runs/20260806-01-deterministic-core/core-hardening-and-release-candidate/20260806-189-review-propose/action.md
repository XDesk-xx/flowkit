# Action: review-propose

- Run: `20260806-189-review-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: reviewer
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- F1 Review Chain Root: `20260806-182-explore`
- Reviewed Run: `20260806-188-revise-propose`
- Source Review: `20260806-187-review-propose`（`changes-requested`）
- Previous approved Review: `20260806-185-review-explore`

## 目标

沿 182 建立的 F1 审查链独立复审 188 revise-propose cumulative candidate，确认 187 的三个 `author-actionable` Blocking Findings 是否完整关闭，并检查修订是否重新扩大 Manifest scope、破坏 focused/affected/full layering、模糊 maintainability contract 或重新引入 Core RC / Delivery Full Test lifecycle 自阻塞。

## 审查结论

- `F1-RP-001` 已关闭：`shared` 冻结为 broad affected set，但明确不等于 `test:full`，并排除 installed CLI process slow surface；所有合法 affected scope 均不得解析为完整 full suite。
- `F1-RP-002` 已关闭：新增 closed `verification` scope，确定覆盖 `scripts/verification.ts`、`scripts/quality.ts` 及直接 helper 的测试路径；这类 test-bearing tooling 不得选择 `none`。
- `F1-RP-003` 已关闭：maintainability metrics 在 Proposal / Design / Spec / Tasks 中统一为 required warning-only Soft Guard，且 TypeScript token/AST metric definition 与 fixtures acceptance 已冻结。
- 184/185 的 authority 与 lifecycle 边界保持不变：Manifest goal/outputs 未修改；任何实质 scope expansion 仍需 Owner decision；Core RC candidate 仍必须在 F1 completion/checkpoint 前形成，Delivery Full Test 仅在 checkpoint 后 qualification。
- Blocking Findings：0。
- Verdict：`approved`。

## Verification Reviewed

- 188 package `baseHead` 与当前 detached Base identity `efc045b31d55bed65b3ba4ae5793d884fdd127e7` 一致；
- 188 `SHA256SUMS` 全部通过；
- 182–186 inherited Author/Reviewer files 未被 188 改写，187 Reviewer-owned files与原 187 Reviewer package逐字节一致；
- 188 `inputRef` / `sourceReviewRun` 精确绑定 187 `changes-requested` result；四个 Proposal artifact producedResultRefs 与实际 bytes 指纹一致；
- OpenSpec 1.7.0 `validate core-hardening-and-release-candidate --strict` 通过；
- OpenSpec 1.7.0 `validate --all --strict`：10 passed / 0 failed；
- `npm run typecheck`、`npm run lint`、`npm run build` 在 uploaded repository snapshot + 188 cumulative candidate 上通过；
- materialized Core 在 188 上得到 `conflicts=0`、`next=review-propose`、`doctor=ok`；
- 未运行 Delivery Full Test。

## 审查边界

- 182 继续作为 F1 review lineage root；本轮 target 仅为 188 revise-propose generation。
- 只读审查 Author candidate；除本 Reviewer-owned 189 Run 外不修改 Proposal/Design/Specs/Tasks、production code、tests、Manifest、AGENTS 或既有 terminal Run。
- 本轮不授权 Apply、Archive、Checkpoint、Delivery Full Test 或 Delivery Finalize。
- `approved` 只表示当前 Proposal contract 可以接受；下一 lifecycle boundary 由 materialized formal facts + Policy 决定。
