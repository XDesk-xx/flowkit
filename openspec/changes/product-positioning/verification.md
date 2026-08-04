<!-- flowkit-verification-status: pending -->

# 验证计划

## Change 信息

- Delivery：`20260805-01-product-baseline`
- Change Key：`A1`
- Change ID：`product-positioning`
- Change 类型：文档与产品契约
- 当前状态：Propose
- Full Test：未经 owner 授权不得运行

## 验证范围

本 Change 只验证正式产品定位、OpenSpec capability delta、README 一致性、A1 范围边界和正式角色中立。

本 Change 不验证 Runner、CLI、状态机代码、外部适配器或 Full Test。

## 计划检查

| 检查 | 命令或方式 | 预期结果 | 当前结果 |
|---|---|---|---|
| OpenSpec strict validation | `npx openspec validate product-positioning --strict` | valid | pending |
| Git whitespace check | `git diff --check` | 无错误 | pending |
| Markdown 检查 | 使用项目已有命令；没有时标记不适用 | passed / not-applicable | pending |
| Explore 一致性 | 人工对照 `explore.md` | 无决策偏离 | pending |
| README 一致性 | 人工对照 README 与正式定义 | 一致 | pending |
| Spec—文档一致性 | requirement-to-evidence 人工映射 | 完整 | pending |
| 范围检查 | 检查变更文件和内容 | 无生产代码或范围外机制 | pending |
| 角色中立检查 | 搜索正式产物中的具体执行工具名称 | 不存在具体工具角色 | pending |
| Full Test 边界 | 检查执行记录 | 未运行 | pending |

## 需求与证据计划

| Requirement | 计划证据 |
|---|---|
| 确定性交付编排器 | `docs/product-positioning.md` 产品定义 |
| Delivery、Change、Action 高层关系 | 正式文档模型章节 |
| 确定性约束流程合法性 | 确定性章节 |
| 最小流程事实 | 最小职责章节 |
| One fact, one authority | 权威原则和权威表 |
| 轻量外部集成 | 外部工具边界章节 |
| 正式角色中立 | 角色中立章节 |
| 产品非目标 | “Flowkit 不是什么”章节 |
| README 一致 | README 人工检查记录 |

## Apply 后需要填写

### 验证环境

- 日期：
- 操作系统：
- OpenSpec：
- Git：
- 其他适用工具：

### 实际检查结果

Apply 完成后填写命令、退出码和结论。

### 需求与证据映射

Apply 完成后将计划证据更新为实际文件章节或具体引用。

### 剩余风险

Apply 完成后记录非阻塞问题、推迟到 B1/C1/D1 的问题和不适用验证理由。

### 签收结论

当前状态：`pending`
