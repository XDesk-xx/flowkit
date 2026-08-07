# Action

- Delivery: `20260806-01-deterministic-core`
- Change key: `D1`
- Change ID: `policy-engine`
- Action: `apply`
- Role: `author`
- Owner authorization: required（owner 显式授权 "apply"）

## Goal

实现 D1 change 的全部 tasks（11 组 110 tasks），产出 `src/policy/` 生产源码 + `tests/unit/policy/` 单元测试，通过 typecheck + build + lint + test + openspec validate --strict。

D1 交付三个纯函数 `canRun`、`next`、`diagnose`，从 `FormalFactSnapshot` 计算唯一合法下一 Action / owner-decision / blocked diagnosis。包含 lineage 模型、阶段识别、12 个 Action 前置条件矩阵、统一 review/revise 入口解析。

## Source review

- Review Run: `20260806-086-review-propose`
- Verdict: `approved`
- Review Result SHA-256: `f3502cf75848e753905a719e6c05fe7566589d9c499f8116e3e35b84e5902a98`

## Allowed work

- 编写 `src/policy/` 下的生产源码（types/lineage/stage-detector/preconditions/can-run/next/diagnose/owner-decision/blocked-diagnosis + 统一入口解析）
- 编写 `tests/unit/policy/` 下的单元测试和表驱动测试
- 修改 `tasks.md` 标记 task 完成（`- [ ]` → `- [x]`）
- 执行 `openspec validate --strict`、`npm run typecheck`、`npm run build`、`npm run lint`、`npm test`
- 创建本 apply Run

## Prohibited work

- 不修改冻结 specs（B1/C1 archived specs）
- 不修改 B1 结构转换表（`src/domain/states.ts`）
- 不修改 069-086 terminal Runs
- 不执行 Change Checkpoint 或 Full Test（Full Test 需 owner 另行授权）
- 不提交或推送（AGENTS.md rule #6）
- 不扩张 Change 范围
- 不从 Run 历史 / OpenSpec 产物 / 聊天推断正式事实
- 不实现诊断 CLI、完整 Change 执行循环、自动 Commit/Push/Merge
- 不引入外部运行时依赖、不新增手写 `.mjs` 源码

## Required output

- 全部生产源码（`src/policy/`）
- 全部单元测试和表驱动测试（`tests/unit/policy/`）
- `tasks.md` 全部 task 标记完成
- `openspec validate policy-engine --strict` 通过
- `npm run typecheck` 通过（生产 + 测试）
- `npm run build` 通过
- `npm run lint` 通过
- `npm test` 通过
- 本 Run 的 `result.json`
- 下一 Action 为 `review-apply`
