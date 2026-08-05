## 1. 核心模型文档

- [x] 1.1 创建 `docs/core-model.md`
- [x] 1.2 定义 Delivery、Change、Action 和 Run
- [x] 1.3 定义 Delivery 主状态、Change 状态和验证子状态
- [x] 1.4 说明 Review、Revision/Fix、Verification、Checkpoint 不形成额外 Phase
- [x] 1.5 说明 Action 与 Git Commit 不一一对应
- [x] 1.6 说明 Run 不是流程或专业事实权威
- [x] 1.7 说明 Change 级与 Delivery 级 Run 路径及编号

## 2. 生命周期文档

- [x] 2.1 创建 `docs/delivery-lifecycle.md`
- [x] 2.2 写入唯一 active Delivery 和 active Change
- [x] 2.3 写入 Change 激活和完成条件
- [x] 2.4 写入完整 Explore、Propose、Apply、Archive 生命周期
- [x] 2.5 写入 Review 必经、Revision/Fix 条件出现和多轮闭环
- [x] 2.6 写入 owner 可承担 reviewer 角色但不得绕过 Verdict
- [x] 2.7 显式记录 `revise-apply → fix-review-findings` 命名替换
- [x] 2.8 写入 Change/Delivery cancelled 的最小规则
- [x] 2.9 写入 Policy 唯一下一 Action
- [x] 2.10 写入统一 `review` 入口
- [x] 2.11 写入同一 Action 与新 Run 的边界
- [x] 2.12 写入 reviewer Run 实际执行时创建
- [x] 2.13 写入 checkout 恢复流程

## 3. Verification 文档

- [x] 3.1 创建 `docs/verification-model.md`
- [x] 3.2 写入 Change Verification 状态和权威
- [x] 3.3 写入 Delivery `fullTestStatus`
- [x] 3.4 明确 Bootstrap Delivery YAML 与自托管状态权威
- [x] 3.5 明确 Delivery Run 不是 Full Test 状态权威
- [x] 3.6 写入 Full Test owner 授权
- [x] 3.7 写入 Full Test failed 后的 corrective Change
- [x] 3.8 确认 Apply/Fix/Review/Archive 不自动运行 Full Test

## 4. OpenSpec 契约

- [x] 4.1 覆盖三层核心模型
- [x] 4.2 覆盖最小状态和取消规则
- [x] 4.3 覆盖 Action Catalog 与命名替换
- [x] 4.4 覆盖 Review/Revision 多轮闭环
- [x] 4.5 覆盖 owner/reviewer 角色边界
- [x] 4.6 覆盖 Policy 与统一 `review`
- [x] 4.7 覆盖 Run 路径、编号和创建时机
- [x] 4.8 覆盖 Change Verification 与 Full Test
- [x] 4.9 覆盖抽象 Skill 方法边界
- [x] 4.10 覆盖 checkout 恢复

## 5. Reviewer Findings 收敛

- [x] 5.1 NB-001：明确 `fullTestStatus` 的流程权威
- [x] 5.2 NB-002：补充 Delivery/Change cancelled 规则
- [x] 5.3 NB-003：正式契约不绑定具体 Skill 名称
- [x] 5.4 确认三个 Finding 均有文档和 spec 对应项

## 6. 范围边界检查

- [x] 6.1 不修改 A1 产品定位
- [x] 6.2 不定义 C1 的 Action Package、Adapter、Schema 或 Skill 协议
- [x] 6.3 不定义 D1 的具体展示、授权、Commit、Push、Handoff 操作
- [x] 6.4 不实现 Runner、CLI 或生产代码
- [x] 6.5 不创建额外 Phase、current pointer 或重复状态源
- [x] 6.6 不引入 Registry、Plugin、Evidence 或 Receipt
- [x] 6.7 不运行 Full Test

## 7. Change 验证

- [x] 7.1 消费 `review-propose` 已通过的 `npx openspec validate core-model --strict` 结果；本次未修改 proposal/spec 契约结构
- [x] 7.2 运行适用的 Markdown/文档结构检查
- [x] 7.3 运行 whitespace/diff 检查
- [x] 7.4 检查三份正式文档与 Explore、Proposal、Design、Spec 一致
- [x] 7.5 检查 B1 与 A1 产品定位一致
- [x] 7.6 填写 `openspec/changes/core-model/verification.md`
- [x] 7.7 确认未运行 Full Test

## 8. Apply 完成定义

- [x] 8.1 三份正式文档已创建
- [x] 8.2 capability requirements 均有文档证据
- [x] 8.3 Reviewer Findings 已在正式契约中处理
- [x] 8.4 适用检查通过或明确 not-applicable
- [x] 8.5 没有超出 B1 范围
- [x] 8.6 `verification.md` 已完成
- [x] 8.7 Apply 结果可提交 `review-apply`

## 9. Review-Propose Non-blocking Findings

- [x] 9.1 Apply 开始时优先建立完整验证计划和 `verification.md`
- [x] 9.2 在 Design 实施计划前明确 `review-propose approved + owner Apply authorization` 前置门
