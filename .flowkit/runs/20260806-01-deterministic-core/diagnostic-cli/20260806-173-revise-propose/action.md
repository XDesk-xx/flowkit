# Action: revise-propose

- Run: `20260806-173-revise-propose`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- GitHub Base: `5fe8a0b096564052e41418e726962b5a35b9d423`
- Source Review: `20260806-172-review-propose`（changes-requested）

## 目标

修复 172 Reviewer 的三个 `author-actionable` Blocking Findings，并同步修正 Proposal 阶段的人类可读语言：

1. `E1-RP-001`：冻结 `flowkit next` 对三个 `PolicyResult` branch 的完整 deterministic 文本投影，保留 owner-decision context 与 blocked conflicts；
2. `E1-RP-002`：冻结 `doctor` 每类 finding / Policy blocked reason 的唯一 severity、`overall` 与 exit code；
3. `E1-RP-003`：冻结 active Delivery 但无 active Change 时四个命令的正常 Delivery-level projection；
4. Proposal/Design/Tasks/Run 的人类可读正文默认简体中文，仅保留 OpenSpec parser keywords、Action/schema/CLI/code/path/error/enum 等正式英文术语。

## 约束

- 只修改当前 E1 Proposal bundle 与本 Author Run；
- 不修改已 approved 的 `explore.md`；
- 不修改 Reviewer-owned 170/172 artifacts；
- 不修改 production code、tests、Manifest、canonical specs 或 docs；
- 不重写 Policy decision tree，不新增第二 validator/state authority；
- 不实现 Tasks completion projection；
- 不运行 Delivery Full Test；
- 不执行 Apply、Archive、Checkpoint、Commit 或 Push。

## 验证

- `openspec validate diagnostic-cli --strict` 必须通过；
- `openspec validate --all --strict` 必须通过；
- `npm run typecheck` 必须通过；
- 172 package / Reviewer-owned files 必须保持逐字节不变；
- 修订后合法下一 Action 为独立 Reviewer 的 `review-propose`。
