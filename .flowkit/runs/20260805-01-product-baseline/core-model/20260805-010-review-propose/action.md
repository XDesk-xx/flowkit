# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `review-propose`
- Role: `reviewer`

## Goal

以干净上下文独立审查 B1 的完整 Propose 产物，判断其是否忠实消费已批准 Explore，是否在 B1 边界内冻结核心模型契约，是否正确处理 review-explore 的 Non-blocking Findings，并给出是否允许进入 Apply 的 Verdict。

## Review range

- Base ref: `62f4fc1642af64751b0cc4ecdf70d6fdbb21bc2e`
- Head ref: `6a664b0a88e338c7ff41fda9d4e84ea86883aff2`

Base 是 review-explore approved 后的记录提交边界（009-propose 的 `inputRef`）；Head 是 author 完成 Propose artifacts 与 009-propose Run 的原子提交边界。

## Required reading

- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- `openspec/changes/core-model/.openspec.yaml`
- `openspec/changes/core-model/explore.md`
- `openspec/changes/core-model/proposal.md`
- `openspec/changes/core-model/design.md`
- `openspec/changes/core-model/specs/flowkit-core-model/spec.md`
- `openspec/changes/core-model/tasks.md`
- `openspec/specs/flowkit-product-positioning/spec.md`
- `docs/product-positioning.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-008-review-explore/result.json`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-009-propose/action.md`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-009-propose/context.json`
- `.flowkit/runs/20260805-01-product-baseline/core-model/20260805-009-propose/result.json`

## Review questions

1. Proposal 是否忠实消费已批准 Explore 的 19 项冻结结论，而没有重新打开冻结决策？
2. Proposal、Design、Spec、Tasks 是否相互一致？
3. review-explore 的 NB-001（Full Test 状态存储）、NB-002（cancelled 转换）、NB-003（Skill 名称）是否在正式契约中妥善处理？
4. 是否越过 B1，提前定义 C1 的 Action Package、Schema、Adapter 或 Skill 协议？
5. 是否越过 B1，提前定义 D1 的 Git 命令、Commit 时机或协作步骤？
6. capability spec 的 Requirements 和 Scenarios 是否完整覆盖 Design 的全部 Decision？
7. owner 可承担 reviewer 角色但不得绕过 Verdict 的规则是否清晰且不引入 waiver/override？
8. `fix-review-findings` 替代 `revise-apply` 的命名是否在 Proposal、Design 和 Spec 中一致？
9. Run 模型是否保持"不是第二事实权威"的边界？
10. 是否存在具体执行工具名称进入正式产品角色？
11. 是否具备进入 Apply 的完整、可验证任务边界？

## Required verification

1. 查看固定范围：
   `git diff --name-status 62f4fc1642af64751b0cc4ecdf70d6fdbb21bc2e 6a664b0a88e338c7ff41fda9d4e84ea86883aff2`
2. 运行：
   `git diff --check 62f4fc1642af64751b0cc4ecdf70d6fdbb21bc2e 6a664b0a88e338c7ff41fda9d4e84ea86883aff2`
3. 在具备 OpenSpec CLI 的环境运行：
   `npx openspec validate core-model --strict`
4. 逐项核对 Explore 的 19 项冻结结论是否在 spec 中有对应 Requirement。
5. 核对 NB-001、NB-002、NB-003 是否在 Design 和 Spec 中有明确处理。
6. 检查 Design 的 13 个 Decision 是否每个都有对应 Spec Requirement 和 Scenario。
7. 检查 Proposal、Design、Spec、Tasks 之间是否存在状态、Action 名称或路径不一致。
8. 检查 B1 是否越过 C1 或 D1 边界。
9. 检查正式角色是否保持 `owner`、`author`、`reviewer` 中立表达。
10. 确认未运行 Full Test，未实现 Runner、CLI、状态机、Adapter 或范围外平台机制。

## Allowed work

- 只读审查指定范围
- 运行适用的只读检查
- 只更新本 Run 的 `result.json`
- 必要时在 `result.json` 中给出具体文件和章节定位

## Prohibited work

- 不修改 Proposal、Design、Spec、Tasks 或 Verification
- 不执行 Apply
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
- 唯一下一步：`apply` 或 `revise-propose`

完成后只提交本 Run 的 `result.json` 并 Push，交回 author 和 owner 处理。
