# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required（revise-apply 由 author 自行修订）

## Goal

修复 065-review-apply 的 2 个 P1 findings：
- C1-AP-005: result.json 读取错误被当作 absent（非 ENOENT 错误如 EACCES/EISDIR 被静默视为 result.json 不存在 → pending → 可覆盖已有 result.json）
- C1-AP-006: review verdict 完整性检测太晚（在 Reader 时才发现 review-* Run 缺 reviewVerdict，但 result.json 已 terminal 发布，无法阻止）

## Source review

- Review Run: `20260806-065-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `6c7c7562370e1bd80fdc32866822483de934ecf9f994d55df0c306cbb44f7d0f`

## Allowed work

- 修改 `src/persistence/run-persistence.ts`（reconstructCurrentRun 只 catch ENOENT + writeRunResult 发布前校验 review verdict integrity）
- 修改 `src/persistence/serialization.ts`（新增 validateReviewVerdictIntegrity 函数）
- 更新 `design.md`、`spec.md`、`tasks.md`、`verification.md` 反映 2 个修复
- 更新/新增单元测试覆盖 2 个修复
- 执行 `openspec validate --strict`、`npm run typecheck`、`npm run lint`、`npm test`
- 创建本 revise-apply Run

## Prohibited work

- 不修改冻结 specs（已 archived 的 spec）
- 不修改 036-065 terminal Runs
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围

## Required output

- 2 个 P1 findings 全部修复
- 全部验证通过（typecheck + build + test + lint + openspec validate --strict）
- 本 Run 的 `result.json`（含 consistencyScan）
- 下一 Action 为 `review-apply`
