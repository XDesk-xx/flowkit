## Why

Flowkit 已确认定位为：

> 以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

当前仓库尚未形成正式、可引用、可验证的产品定位文档。如果不先建立正式产品定位，后续 `core-model`、`integration-boundaries` 和代码实现可能再次弱化 Delivery、复制外部事实权威，或扩张为通用工作流平台。

A1 将已确认的 Explore 结论转化为正式产品文档和可验证的 OpenSpec 契约，为后续 Change 提供稳定输入。

## What Changes

- 新建 `docs/product-positioning.md`，作为 Flowkit 产品定位的正式说明文档
- 固定 Flowkit 的一句话产品定义
- 固定 Delivery、Change、Action 的高层关系
- 固定“确定性”主要约束流程合法性判断，而不是替代专业判断
- 固定 `One fact, one authority` 原则
- 固定 Flowkit 拥有的最小职责：流程状态、Delivery/Change 边界、Action 合法性和下一步判断
- 固定 OpenSpec、Git、Archify、CodeGraph、Reviewer 和项目验证工具的高层事实权威
- 固定正式角色使用 `owner`、`author`、`reviewer` 等中立名称
- 固定 Flowkit 的产品非目标
- 新增 `flowkit-product-positioning` capability spec
- 检查 README 与正式定位的一致性；一致时不作无意义修改

## Capabilities

### New Capabilities

- `flowkit-product-positioning`：定义 Flowkit 的产品定位、职责范围、事实权威原则、角色中立要求和产品非目标

### Modified Capabilities

无。

## Impact

- 新建 `docs/product-positioning.md`
- 新建 `openspec/changes/product-positioning/specs/flowkit-product-positioning/spec.md`
- README 只做一致性检查
- 不修改 Runner、CLI 或生产代码
- 不定义状态字段、状态转换或外部工具具体协议
- 不创建 Archify Plan 或其他架构 JSON
- 不引入 Registry、Plugin、Evidence、Receipt 或通用扩展机制
