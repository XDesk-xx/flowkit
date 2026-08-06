# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `review-explore`
- Role: `reviewer`

## Goal

以干净上下文独立审查 B1 的完整 Explore 产物，判断其是否忠实消费 A1 已冻结的产品定位，是否在 B1 边界内冻结 Delivery、Change、Action 核心模型、生命周期、Verification 边界和 Run 模型，并给出是否允许进入 `propose` 的 Verdict。

## Review range

- Base ref: `596e549c353659f83de2a46e3044156588ec6f77`
- Head ref: `199eb3e0ab11ca5bf8af79957a226a8837c27f10`

Base 是 B1 启动边界（author Run 的 `inputRef`），包含 `core-model/.openspec.yaml` 创建和 Delivery manifest 中 B1 激活；Head 是 author 完成 Explore 初稿、owner 讨论收敛和最终待审结果的原子提交边界。

## Required reading

- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- `openspec/changes/core-model/.openspec.yaml`
- `openspec/changes/core-model/explore.md`
- `openspec/specs/flowkit-product-positioning/spec.md`
- `docs/product-positioning.md`
- `openspec/changes/archive/2026-08-05-product-positioning/explore.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-007-explore/action.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-007-explore/context.json`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-007-explore/result.json`

## Review questions

1. 是否隐含额外 Phase 或重复状态？
2. Policy 推导下一 Action 是否足以确定性恢复？
3. `review-apply + fix-review-findings` 命名是否合理？
4. 是否需要 `paused`？
5. `_delivery` 是否适合作为 Delivery 级 Run 目录？
6. Full Test 状态是否仍可收缩？
7. B1 是否越过 C1 或 D1？
8. 统一 `review` 入口是否保持确定性？
9. reviewer 执行时才创建 Review Run 是否正确？
10. 同一 Action 与新 Run 的边界是否清晰？
11. 阶段 Skill 是否保持轻量并避免第二流程权威？
12. 是否忠实消费 A1 已冻结的产品定位，未重新打开冻结决策？
13. Run 是否只记录一次执行的任务、上下文和结果摘要，未成为第二事实权威？
14. 是否存在具体执行工具名称进入正式产品角色？

## Required verification

1. 查看固定范围：
   `git diff --name-status 596e549c353659f83de2a46e3044156588ec6f77 199eb3e0ab11ca5bf8af79957a226a8837c27f10`
2. 运行：
   `git diff --check 596e549c353659f83de2a46e3044156588ec6f77 199eb3e0ab11ca5bf8af79957a226a8837c27f10`
3. 在具备 OpenSpec CLI 的环境运行：
   `npx openspec validate core-model --strict`
   （若 Explore 阶段无 Proposal/Specs/Tasks 则记录为 not-applicable）
4. 核对 B1 Explore 是否忠实消费 A1 `docs/product-positioning.md` 和 `openspec/specs/flowkit-product-positioning/spec.md`。
5. 检查 Delivery/Change/Action 状态是否最小，未隐含额外 Phase 或重复状态。
6. 检查 checkout 恢复是否只依赖正式状态、OpenSpec、Git 和 committed Run。
7. 检查 Run 是否只记录单次执行摘要，未成为第二事实权威。
8. 检查 B1 是否提前定义 C1 的 Action Package 字段、Skill 协议或 Adapter，或 D1 的 Git 命令和协作步骤。
9. 检查正式角色是否保持 `owner`、`author`、`reviewer` 中立表达。
10. 确认未运行 Full Test，未实现 Runner、CLI、状态机、Adapter 或范围外平台机制。

## Allowed work

- 只读审查固定范围和正式文件
- 运行适用的只读检查
- 只更新本 Run 的 `result.json`
- 在 Finding 中提供精确文件和章节定位

## Prohibited work

- 不修改 Explore、Proposal、Design、Specs 或 Tasks
- 不执行 Propose
- 不修复 Finding
- 不自行推进 Change
- 不修改 Delivery 或 Change 状态
- 不运行 Full Test
- 不修改其他 Run

## Required output

更新本 Run 的 `result.json`，包含：

- Blocking Findings
- Non-blocking Findings
- Verification Reviewed
- Verdict：`approved` 或 `changes-requested`
- 唯一下一步：`propose` 或 `revise-explore`

完成后只提交本 Run 的 `result.json` 并 Push，交回 author 和 owner 处理。
