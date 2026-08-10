# Action: review-explore

- Run: `20260810-002-review-explore`
- Delivery: `20260810-01-change-execution-loop`
- Change: `Q1 core-contract-alignment`
- Action: `review-explore`
- Role: `reviewer`
- Execution Context: `detached`
- Owner authorization: not required
- GitHub Base: `95bb875b12dc682882ded6b89b829b8b6c407d74`
- Reviewed Run: `20260810-001-explore`

## 目标

独立审查 `001-explore` 是否完整、准确地识别 Q1 的真实 canonical drift，并确认其边界足以安全进入 Proposal，而不提前实现 D1 或 03。

## 审查输入

- `openspec/changes/core-contract-alignment/explore.md`
- `.flowkit/runs/20260810-01-change-execution-loop/core-contract-alignment/20260810-001-explore/result.json`
- `openspec/delivery-groups/20260810-01-change-execution-loop.yaml`
- 当前 exact Base 的 canonical docs / OpenSpec specs / source / tests
- `02-change-execution-loop-delivery-implementation-reference-v3.md`
- `flowkit-operating-model-v8.md`

## Reviewer 边界

允许：

- 读取完整 reviewed target 与 applicable contract；
- 对 exact Base 做只读代码/规范扫描；
- 验证 package hash、review target fingerprint、OpenSpec status 与 whitespace；
- 只写本 Reviewer Run。

禁止：

- 修改 Author-owned Explore、Manifest、OpenSpec Change artifact、production code 或 tests；
- 替 Author 修复 Finding；
- 创建 Proposal / Design / Tasks / delta specs；
- 运行 Delivery Full Test；
- Archive / Checkpoint / Commit / Push。
