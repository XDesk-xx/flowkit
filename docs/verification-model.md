# Flowkit Verification 模型

## 1. 目的

本文定义 Change Verification 与 Delivery Full Test 的边界、状态、事实权威和推进规则。

核心原则：

> Change Verification 属于 Change；Full Test 属于 Delivery。

两者不得互相替代，也不得由 Apply、Fix、Review 或 Archive 自动跨级触发。

## 2. 事实权威

### 2.1 项目验证工具

项目验证工具拥有：

- 完整测试结果；
- lint、typecheck 和静态检查结果；
- 原始输出和日志；
- 具体失败详情。

### 2.2 Flowkit

Flowkit 只拥有推进流程所需的：

- 验证状态；
- 最小摘要；
- 结果引用；
- 当前是否允许继续的流程判断。

Flowkit 不复制项目验证工具的完整内部状态。

## 3. Change Verification

### 3.1 状态

```text
not-run
passed
failed
not-applicable
```

### 3.2 适用范围

根据 Change 类型选择适用检查，例如：

- focused tests；
- affected tests；
- lint；
- typecheck；
- OpenSpec strict validation；
- Markdown 或文档检查；
- `git diff --check`；
- 契约与正式文档一致性；
- 与上游冻结基线的一致性。

没有适用检查时必须明确记录 `not-applicable`，不得用缺失记录代替。

### 3.3 执行时机

Change Verification 必须在以下 Action 后执行：

```text
apply
revise-apply
```

进入 `review-apply` 前，所有适用检查必须为：

```text
passed | not-applicable
```

任一适用检查为 `not-run` 或 `failed` 时，流程必须阻塞。

### 3.4 修复后的验证

`revise-apply` 完成后：

1. 重新执行与修改相关的 focused/affected 检查；
2. 重新执行适用的 lint、typecheck 或文档检查；
3. 更新 Verification 结果；
4. 只有通过后才能再次进入 `review-apply`。

不得因为是 Review 修复就跳过验证。

### 3.5 成本边界与脚本归属

Change Verification 冻结的是 timing 与 ownership，不是具体脚本：

```text
explore / propose
  → 当前契约/文档适用检查

apply / revise-apply
  → focused + affected 范围适用检查
  → typecheck / lint / build / OpenSpec strict 仅在适用时执行

review-apply / archive
  → 消费 Change Verification，不自动跑 Delivery Full Test
```

- 小修改优先 focused checks；只有影响共享契约、公共类型或跨模块行为时才扩大到 affected checks；
- 具体的 `test:focused` / `test:affected` / `test:full` / `verify:change` 脚本属于 F1，不在本文定义；
- Delivery Full Test 只有 Delivery ready + owner explicit authorization 才允许，详见 §4–§5。

## 4. Delivery Full Test

### 4.1 状态

```text
not-ready
awaiting-user-decision
authorized
passed
failed
```

`fullTestStatus` 是 Flowkit 拥有的 Delivery 验证子状态，不是 Delivery 主状态。

### 4.2 状态转换

```text
not-ready
→ awaiting-user-decision
→ authorized
→ passed | failed
```

规则：

- required Changes 尚未全部 completed 时为 `not-ready`；
- required Changes 全部 completed 后进入 `awaiting-user-decision`；
- 只有 owner 明确授权后才能进入 `authorized`；
- 未 authorized 时不得执行 Full Test；
- 项目验证工具的结果决定 `passed` 或 `failed`。

### 4.3 Bootstrap 与自托管权威

Bootstrap 阶段：

- Delivery YAML 是 `fullTestStatus` 的人工维护投影；
- 人工按冻结规则更新；
- 不创建第二套 current/state 文件。

自托管后：

- Flowkit 的 Delivery 状态成为唯一流程权威；
- 具体字段 Schema、序列化路径和 Adapter 由 C1 或后续实现定义。

Delivery 级 Run 可以记录一次授权、执行或结果消费过程，但不是 `fullTestStatus` 的权威。

### 4.4 Delivery 级 Run

Full Test 等 Delivery 级动作使用：

```text
.flowkit/runs/<delivery-id>/_delivery/<run-id>/
```

Run 保存执行上下文和结果摘要；完整 Full Test 结果仍归项目验证工具。

## 5. Full Test 授权边界

以下 Action 不得自动运行 Full Test：

```text
apply
revise-apply
review-apply
archive
```

Reviewer、author、Skill、Adapter 或项目验证工具都不能替代 owner 授权。

Owner 未授权时，正确结果是：

```text
awaiting-user-decision
```

而不是自动执行或默认跳过。

## 6. Full Test 失败

Full Test failed 时：

- 不重新打开已 archived/completed Change；
- 不修改已完成 Change 的历史状态；
- `fullTestStatus` 保持 `failed`；
- Policy 返回 owner 决策边界或 blocked diagnosis，不得自动创建 Change；
- owner 可以明确授权创建 corrective Change，或取消 Delivery；
- 只有 owner 明确授权 corrective Change 后，才在当前 Delivery 中创建该 Change；
- corrective Change 创建后，`fullTestStatus` 返回 `not-ready`；
- corrective Change 按普通 Change 规则进入 `planned`，激活仍满足标准 owner 授权与依赖条件；
- corrective Change 完整执行 Explore、Propose、Apply、Review、Archive 和 Checkpoint；
- 所有 required Changes 再次 completed 后，重新进入 `awaiting-user-decision`；
- 再次等待 owner 授权 Full Test。

Full Test failed 不得自动扩张 Delivery 范围，也不提供失败结果 waiver 或强制 Finalize 机制。

## 7. Verification 记录

每个 Change 的 `verification.md` 至少应包含：

- 验证范围；
- 每项检查的适用性；
- 执行命令或验证方法；
- 状态；
- 摘要；
- 结果引用或环境说明；
- Full Test 是否运行；
- 总体 Change Verification 状态。

Run 的 `result.json` 可以引用该记录，但不能替代它。

从 E1 `diagnostic-cli` 起，新的/current active Change `verification.md` 还必须包含且只包含一个精确的 machine-readable status marker：

```text
<!-- flowkit-change-verification-status: passed -->
```

marker 的允许值与 `VerificationStatus` 一致：

```text
not-run | passed | failed | not-applicable
```

该 marker 只是 Flowkit Reader 对既有 Verification authority file 的确定性投影钩子，不是第二份 Verification 状态。Reader 不得从周围 prose、Run summary、聊天或 historical ResultRef 推断 Change Verification 状态。`verification.md` 存在但 marker 缺失、重复或非法时，Reader 必须 fail-closed 为 `change-verification-status` conflict。历史 archived Change 不要求回填 marker。

## 8. Review 与 Verification

Verification 与 Review 职责不同：

- 验证工具回答检查是否通过；
- reviewer 判断结果是否满足契约、边界和质量要求。

因此：

```text
Verification passed
≠ Review approved
```

同时：

```text
Review approved
≠ 可以忽略 Verification
```

进入 Archive 前，两者都必须满足各自边界。

## 9. 当前 B1 Apply

B1 是文档和契约 Change，本次适用检查包括：

- OpenSpec strict validation；
- Markdown/文档结构检查；
- whitespace/diff 检查；
- 三份正式文档与 Proposal、Design、Spec 的一致性；
- 与 A1 产品定位的一致性；
- 确认未运行 Full Test。

本次没有 owner 的 Full Test 授权，因此 Full Test 保持未运行。
