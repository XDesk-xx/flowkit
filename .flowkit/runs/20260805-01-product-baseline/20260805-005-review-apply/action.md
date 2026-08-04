# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `A1`
- Change ID: `product-positioning`
- Action: `review-apply`
- Role: `reviewer`

## Goal

以干净上下文独立审查 A1 Apply 结果，判断实现、任务和验证是否忠实满足已批准的 Explore、Proposal、Design 与 capability spec，并给出是否允许进入 Archive 的 Verdict。

## Review range

- Base ref: `741c2bca194642b10785f654cd5a1ae5fdaee1af`
- Head ref: `91a0492cc5ffaa16ea7a3c113c259757a2db0427`

Base 是 owner 批准后的修订 Propose 边界；Head 是 author 完成 A1 Apply、适用验证和 Apply Run 的原子提交边界。

## Required reading

- `openspec/delivery-groups/20260805-01-product-baseline.yaml`
- `openspec/changes/product-positioning/explore.md`
- `openspec/changes/product-positioning/proposal.md`
- `openspec/changes/product-positioning/design.md`
- `openspec/changes/product-positioning/specs/flowkit-product-positioning/spec.md`
- `openspec/changes/product-positioning/tasks.md`
- `openspec/changes/product-positioning/verification.md`
- `docs/product-positioning.md`
- `README.md`
- `.flowkit/runs/20260805-01-product-baseline/20260805-004-apply/action.md`
- `.flowkit/runs/20260805-01-product-baseline/20260805-004-apply/context.json`
- `.flowkit/runs/20260805-01-product-baseline/20260805-004-apply/result.json`

## Required verification

1. 查看固定范围：
   `git diff --name-status 741c2bca194642b10785f654cd5a1ae5fdaee1af 91a0492cc5ffaa16ea7a3c113c259757a2db0427`
2. 运行：
   `git diff --check 741c2bca194642b10785f654cd5a1ae5fdaee1af 91a0492cc5ffaa16ea7a3c113c259757a2db0427`
3. 在具备 OpenSpec CLI 的环境运行：
   `npx openspec validate product-positioning --strict`
4. 检查 `tasks.md` 是否全部完成且每项有实际证据。
5. 检查 `verification.md` 是否准确记录已运行、未运行和不适用检查，没有伪造结果。
6. 检查 `docs/product-positioning.md` 是否覆盖所有 capability requirements，并与 README、Explore、Proposal、Design 一致。
7. 检查正式文档是否越过 A1，提前定义 B1、C1 或 D1 的详细规则。
8. 检查正式角色是否保持 `owner`、`author`、`reviewer` 中立表达。
9. 检查 Run 是否只记录一次执行的任务、上下文和结果摘要，没有成为第二事实权威。
10. 确认未运行 Full Test，未实现 Runner、CLI、状态机、Adapter 或范围外平台机制。

## Allowed work

- 只读审查固定范围和正式文件
- 运行适用的只读检查
- 只更新本 Run 的 `result.json`
- 在 Finding 中提供精确文件和章节定位

## Prohibited work

- 不修改产品文档、OpenSpec artifacts、任务或验证文件
- 不修复 Finding
- 不执行 Archive
- 不修改 Delivery 或 Change 状态
- 不运行 Full Test
- 不自行推进流程
- 不修改其他 Run

## Required output

更新本 Run 的 `result.json`，包含：

- Blocking Findings
- Non-blocking Findings
- Verification Reviewed
- Verdict：`approved` 或 `changes-requested`
- 唯一下一步：`archive` 或 `fix-review-findings`

完成后只提交本 Run 的 `result.json` 并 Push，交回 author 和 owner 处理。
