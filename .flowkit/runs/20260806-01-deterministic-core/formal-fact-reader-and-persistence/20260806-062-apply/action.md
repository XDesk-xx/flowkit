# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `C1`
- Change ID: `formal-fact-reader-and-persistence`
- Action: `apply`
- Role: `author`
- Owner authorization: required（owner 显式授权 "apply"）

## Goal

实现 C1 change 的全部 tasks（13 组 172 tasks），产出生产源码 + 单元测试 + fixture，通过 typecheck + lint + test + openspec validate --strict。

## Source review

- Review Run: `20260806-061-review-propose`
- Verdict: `approved`
- Review Result SHA-256: `f60e4b326d59031cb95ac8792a89555fffbd294f6c2b542b8e446d453e9ee662`

## Allowed work

- 编写 `src/facts/` 和 `src/persistence/` 下的生产源码
- 编写 `tests/unit/` 下的单元测试和 fixture
- 修改 `tasks.md` 标记 task 完成（`- [ ]` → `- [x]`）
- 执行 `openspec validate --strict`、`npm run typecheck`、`npm run lint`、`npm test`
- 创建本 apply Run

## Prohibited work

- 不修改冻结 specs
- 不修改 036-061 terminal Runs
- 不执行 Change Checkpoint 或 Full Test（Full Test 需 owner 另行授权）
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围

## Required output

- 全部生产源码（`src/facts/` + `src/persistence/`）
- 全部单元测试和 fixture（`tests/unit/`）
- `tasks.md` 全部 task 标记完成
- `openspec validate --strict` 通过
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm test` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-apply`
