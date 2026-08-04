## 1. 正式产品定位文档

- [ ] 1.1 创建 `docs/product-positioning.md`
- [ ] 1.2 写入唯一的一句话产品定义
- [ ] 1.3 说明 Delivery、Change、Action 的高层关系
- [ ] 1.4 说明 Flowkit 的最小职责和确定性的含义
- [ ] 1.5 写入 `One fact, one authority` 和高层权威表
- [ ] 1.6 说明外部集成保持轻量
- [ ] 1.7 说明正式角色中立
- [ ] 1.8 明确产品非目标
- [ ] 1.9 说明 A1 与 B1、C1、D1 的边界

## 2. README 一致性

- [ ] 2.1 检查 README 的产品描述是否与正式定位一致
- [ ] 2.2 当前描述一致时保持 README 不变
- [ ] 2.3 发现冲突时只修正产品描述，不在 A1 建立完整索引体系

## 3. OpenSpec 契约

- [ ] 3.1 确认 delta 覆盖产品定义和三层关系
- [ ] 3.2 确认 delta 覆盖确定性与最小流程事实
- [ ] 3.3 确认 delta 覆盖 `One fact, one authority`
- [ ] 3.4 确认 delta 覆盖轻量集成、角色中立和产品非目标
- [ ] 3.5 确认 delta 覆盖正式产品文档要求

## 4. 范围边界检查

- [ ] 4.1 确认没有定义完整状态字段、状态转换或 Runner JSON
- [ ] 4.2 确认没有定义 CLI 和外部工具具体协议
- [ ] 4.3 确认没有引入具体执行工具名称作为正式角色
- [ ] 4.4 确认没有创建 Registry、Plugin、Evidence 或 Receipt 平台
- [ ] 4.5 确认 Run 只作为执行输入与结果摘要，不成为第二事实权威
- [ ] 4.6 确认没有创建 Archify Plan 或其他架构 JSON
- [ ] 4.7 确认没有修改生产代码或 runtime dependency

## 5. Change 验证

- [ ] 5.1 运行 `npx openspec validate product-positioning --strict`
- [ ] 5.2 运行适用的 Markdown 或文档检查；不存在时记录 `not-applicable`
- [ ] 5.3 运行 `git diff --check`
- [ ] 5.4 检查正式文档与 `explore.md` 的一致性
- [ ] 5.5 检查 README、spec 与正式文档的一致性
- [ ] 5.6 在 `verification.md` 填写验证结果
- [ ] 5.7 确认未运行未经 owner 授权的 Full Test

## 6. Apply 完成定义

- [ ] 6.1 `docs/product-positioning.md` 已创建
- [ ] 6.2 所有 requirements 都有对应文档证据
- [ ] 6.3 所有适用检查通过或明确说明不适用
- [ ] 6.4 没有超出 A1 范围的文件变更
- [ ] 6.5 `verification.md` 已完成
- [ ] 6.6 Apply 结果可以提交给 reviewer
