## 1. 核心模型文档

- [ ] 1.1 创建 `docs/core-model.md`
- [ ] 1.2 定义 Delivery、Change、Action 和 Run
- [ ] 1.3 定义 Delivery 主状态、Change 状态和验证子状态
- [ ] 1.4 说明 Review、Revision/Fix、Verification、Checkpoint 不形成额外 Phase
- [ ] 1.5 说明 Action 与 Git Commit 不一一对应
- [ ] 1.6 说明 Run 不是流程或专业事实权威
- [ ] 1.7 说明 Change 级与 Delivery 级 Run 路径及编号

## 2. 生命周期文档

- [ ] 2.1 创建 `docs/delivery-lifecycle.md`
- [ ] 2.2 写入唯一 active Delivery 和 active Change
- [ ] 2.3 写入 Change 激活和完成条件
- [ ] 2.4 写入完整 Explore、Propose、Apply、Archive 生命周期
- [ ] 2.5 写入 Review 必经、Revision/Fix 条件出现和多轮闭环
- [ ] 2.6 写入 owner 可承担 reviewer 角色但不得绕过 Verdict
- [ ] 2.7 显式记录 `revise-apply → fix-review-findings` 命名替换
- [ ] 2.8 写入 Change/Delivery cancelled 的最小规则
- [ ] 2.9 写入 Policy 唯一下一 Action
- [ ] 2.10 写入统一 `review` 入口
- [ ] 2.11 写入同一 Action 与新 Run 的边界
- [ ] 2.12 写入 reviewer Run 实际执行时创建
- [ ] 2.13 写入 checkout 恢复流程

## 3. Verification 文档

- [ ] 3.1 创建 `docs/verification-model.md`
- [ ] 3.2 写入 Change Verification 状态和权威
- [ ] 3.3 写入 Delivery `fullTestStatus`
- [ ] 3.4 明确 Bootstrap Delivery YAML 与自托管状态权威
- [ ] 3.5 明确 Delivery Run 不是 Full Test 状态权威
- [ ] 3.6 写入 Full Test owner 授权
- [ ] 3.7 写入 Full Test failed 后的 corrective Change
- [ ] 3.8 确认 Apply/Fix/Review/Archive 不自动运行 Full Test

## 4. OpenSpec 契约

- [ ] 4.1 覆盖三层核心模型
- [ ] 4.2 覆盖最小状态和取消规则
- [ ] 4.3 覆盖 Action Catalog 与命名替换
- [ ] 4.4 覆盖 Review/Revision 多轮闭环
- [ ] 4.5 覆盖 owner/reviewer 角色边界
- [ ] 4.6 覆盖 Policy 与统一 `review`
- [ ] 4.7 覆盖 Run 路径、编号和创建时机
- [ ] 4.8 覆盖 Change Verification 与 Full Test
- [ ] 4.9 覆盖抽象 Skill 方法边界
- [ ] 4.10 覆盖 checkout 恢复

## 5. Reviewer Findings 收敛

- [ ] 5.1 NB-001：明确 `fullTestStatus` 的流程权威
- [ ] 5.2 NB-002：补充 Delivery/Change cancelled 规则
- [ ] 5.3 NB-003：正式契约不绑定具体 Skill 名称
- [ ] 5.4 确认三个 Finding 均有文档和 spec 对应项

## 6. 范围边界检查

- [ ] 6.1 不修改 A1 产品定位
- [ ] 6.2 不定义 C1 的 Action Package、Adapter、Schema 或 Skill 协议
- [ ] 6.3 不定义 D1 的具体展示、授权、Commit、Push、Handoff 操作
- [ ] 6.4 不实现 Runner、CLI 或生产代码
- [ ] 6.5 不创建额外 Phase、current pointer 或重复状态源
- [ ] 6.6 不引入 Registry、Plugin、Evidence 或 Receipt
- [ ] 6.7 不运行 Full Test

## 7. Change 验证

- [ ] 7.1 运行 `npx openspec validate core-model --strict`
- [ ] 7.2 运行适用的 Markdown/文档检查，或记录 not-applicable
- [ ] 7.3 运行 `git diff --check`
- [ ] 7.4 检查三份正式文档与 Explore、Proposal、Design、Spec 一致
- [ ] 7.5 检查 B1 与 A1 产品定位一致
- [ ] 7.6 填写 `openspec/changes/core-model/verification.md`
- [ ] 7.7 确认未运行 Full Test

## 8. Apply 完成定义

- [ ] 8.1 三份正式文档已创建
- [ ] 8.2 capability requirements 均有文档证据
- [ ] 8.3 Reviewer Findings 已在正式契约中处理
- [ ] 8.4 适用检查通过或明确 not-applicable
- [ ] 8.5 没有超出 B1 范围
- [ ] 8.6 `verification.md` 已完成
- [ ] 8.7 Apply 结果可提交 `review-apply`
