# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `revise-apply`
- Role: `author`
- Owner authorization: not-required（revise-apply 由 author 自行修订）

## Goal

修复 063-review-apply 的 4 个 P1 findings：
- C1-AP-001: 缺失 verification.md
- C1-AP-002: writeRunResult 的 assertMutable 看不到持久化 terminal 状态
- C1-AP-003: Reader 读不到真实 Delivery Manifest 嵌套状态
- C1-AP-004: Reader 无法重建 review verdict 事实（C1 + Bootstrap 连接）

## Source review

- Review Run: `20260806-063-review-apply`
- Verdict: `changes-requested`
- Review Result SHA-256: `cd04cdba5efb16eaf81f72ef58b09142e027b33cb1371c6d715e746bc64536b4`

## Allowed work

- 创建 `openspec/changes/formal-fact-reader-and-persistence/verification.md`
- 修改 `src/persistence/run-persistence.ts`（writeRunResult 读 result.json + assertMutable）
- 修改 `src/facts/formal-fact-reader.ts`（manifest 嵌套读取 + review verdict 抽取）
- 修改 `src/persistence/serialization.ts`（ContextFile.reviewedRunId + RunResultFile.reviewVerdict）
- 修改 `src/persistence/legacy-recognizer.ts`（Bootstrap review 连接抽取）
- 更新 `design.md`、`spec.md`、`tasks.md` 反映 4 个修复
- 更新/新增单元测试覆盖 4 个修复
- 执行 `openspec validate --strict`、`npm run typecheck`、`npm run lint`、`npm test`
- 创建本 revise-apply Run

## Prohibited work

- 不修改冻结 specs（已 archived 的 spec）
- 不修改 036-063 terminal Runs
- 不执行 Change Checkpoint 或 Full Test
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围

## Required output

- 4 个 P1 findings 全部修复
- verification.md 创建
- 全部验证通过（typecheck + build + test + lint + openspec validate --strict）
- 本 Run 的 `result.json`（含 consistencyScan）
- 下一 Action 为 `review-apply`
