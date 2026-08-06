# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `B1`
- Change ID: `core-model`
- Action: `revise-apply`
- Role: `author`
- Goal: `fix-review-findings`

## Goal

处理 `20260805-014-review-apply` 的 B-003 Blocking Finding：修正 `docs/verification-model.md:71` 的 Unicode 替换字符，重新扫描全部 B1 正式 Markdown，重新执行适用 Change Verification，并更新 `verification.md` 以准确记录本轮结果。

## Inputs

- Remote base: `515dd185d6eefeb300249af53642bc915e565e00`
- Source Review Run: `20260805-014-review-apply`
- Verdict: `changes-requested`
- Blocking Findings: `B-003`

## Required changes

- 将 `docs/verification-model.md:71` 的 "f+U+FFFD×2+有" 修正为 "所有"
- 重新扫描全部 9 份 B1 正式 Markdown，确认 0 个 U+FFFD
- 重新执行 OpenSpec strict validation 和 `git diff --check`
- 更新 `verification.md`：
  - 更正 013 轮 N-001 和替换字符检查的不准确声明
  - 新增 §10、§11、§12 记录 015 轮 Finding 处理和验证结果
  - 注明 013 Run 的历史记录不修改

## Prohibited work

- 不修改 `013` Run 的历史记录
- 不修改 A1 产品定位
- 不超出 B-003 Finding 范围
- 不定义 C1 的具体 Action Package 字段或 Skill 协议
- 不定义 D1 的具体 Git/交互命令
- 不实现 Runner、CLI 或生产代码
- 不运行 Full Test
- 不创建 `016-review-apply` Run
- 不 Commit 或 Push，直到 owner 确认

## Required output

- `docs/verification-model.md:71` 文本正确
- `verification.md` 准确记录 015 轮结果
- 全部适用 Change Verification 重新执行并通过
- 仅在验证全部 passed/not-applicable 后将本 Run 标记 completed，并使下一 Action 为 `review-apply`
