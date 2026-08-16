## Why

当前 Deterministic Core 仍把 `changes-requested` 机械解释为必须进入 Author `revise-*`，同时仍把 Delivery Full Test / Delivery Finalize 建模为 Standard `FormalAction` 与 Delivery-level Run。两条旧 contract 会直接让后续 Change Execution Loop 在 non-author blocker 与 Delivery boundary 上做出错误推进，因此 Q1 必须在不重做 Core、不提前实现 D1/03 的前提下完成最小 canonical alignment。

## What Changes

- **BREAKING**：Standard `FormalAction` / current Run contract 收敛为 10 个 Change Action；`full-test`、`delivery-finalize` 不再是 Standard Formal Action，不再允许创建新的 Delivery-level Standard Run。历史已存在的 Delivery-level Runs 仅保留 bounded legacy read/NNN compatibility，不迁移、不改写，也不重新进入 current Action Catalog。
- **BREAKING**：Reviewer-owned blocking finding 增加机器可消费的 `blockingAuthority: author | owner | verification | external`；blocking finding 必须声明 authority，non-blocking finding 不参与 next-boundary authority 计算。
- `changes-requested` 只表示 reviewed target 不可批准。Policy 必须先聚合当前 matching blocking findings 的 authority：只有全部 blocking findings 均为 `author` 时才允许/推荐对应 `revise-*`；存在任何 non-author authority 时必须停止 Author revision path，并以 deterministic blocked authority boundary 呈现，不制造 no-op revise。
- direct re-review 作为 non-author authority boundary 的合法显式恢复入口保留：只要 matching `changes-requested` 含任一 non-author blocker（pure non-author 或 mixed author+non-author），Policy 对 explicit same-stage `review-S` MUST 确定性允许，且 unchanged candidate target MUST 可进入该 Review。`next()` 仍保持 blocked、不自动循环 review，也不提前执行 Author mutation；每次显式 re-review 创建新的 Reviewer generation，并由 Reviewer 使用执行时最新可用的 authority facts 重新评估完整 target。是否已经出现“值得重新 Review”的新 Owner / Verification / External fact，由显式执行者在调用 Review 前负责确认，不作为 Q1 `canRun(review-S)` 的 machine prerequisite。Q1 不建立 Finding convergence、generic authority-resolution event/ref 或自动 re-review loop。
- `ReviewVerdictFact` 增加最小 derived authority projection，供 Policy 消费当前 matching Review 的 blocking authority；完整 Finding payload 继续由 Reviewer result 拥有，不复制成独立 Finding 数据库。
- Q1→03 过渡期内，no-active-change Delivery 状态继续 deterministic / fail-closed：checkpoint 与 Change activation 逻辑保持；`awaiting-user-decision` 继续返回已有 Owner decision；`authorized` 与 `passed` 不再伪装成 `full-test` / `delivery-finalize` Action，而是在 03 A1 Delivery behavior model 尚未实现前返回明确 blocked diagnosis。Q1 不引入 Delivery behavior discriminated union 或 executor。
- 同步 active canonical specs、AGENTS、current docs、code 与直接 contract tests；只修改 repo-wide scan 确认的 current product contract 冲突，不清理 archived Change artifacts。
- 不实现 D1 的 Finding convergence / stable Finding lifecycle，不实现 A1 Owner provenance ingestion，不实现 03 Delivery Full Test / Finalize behavior executor，不运行 Delivery Full Test，不 Archive/Checkpoint/Commit/Push。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `flowkit-core-model`：把 Revision 的合法性从“只看 changes-requested Verdict”收窄为“matching changes-requested + author-authority blocking findings”，并把 current Standard Run 路径收敛为 Change-only；Delivery Full Test / Finalize 明确不是 Standard Run。
- `flowkit-domain-and-state-schema`：固定 Action Catalog 从 `10 Change + 2 Delivery` 改为仅 10 个 Change Action；current Run 必须携带 Change identity，同时保留历史 Delivery-level Run 的 bounded legacy compatibility。
- `flowkit-formal-fact-reader-and-persistence`：blocking Review Finding 增加 `blockingAuthority`；Reader 从 Reviewer result 派生最小 blocking-authority projection；current schema/persistence 禁止新 Delivery-level Standard Run，但历史读取不迁移不改写。
- `flowkit-policy-engine`：`changes-requested ≠ revise-required` 进入 Policy；author-only blocker 才进入 revise，含任一 non-author blocker（含 mixed）时 `next()` 停在 authority boundary，同时 `canRun(review-S)` 对显式 same-stage re-review 确定性允许；是否值得重审不进入 Policy machine prerequisite。移除 `full-test` / `delivery-finalize` Action precondition/next 输出，并冻结 Q1→03 的 deterministic fail-closed Delivery 过渡。
- `flowkit-bootstrap-and-roadmap`：把 Reviewer `changes-requested → Author Revision` 的旧绝对规则改为先判断 blocking authority，只有 author blocker 才交回 Author revise；保持 Reviewer/Owner mutation authority 边界。
- `flowkit-core-hardening-and-release-candidate`：把 RC qualification 的 `awaiting-user-decision → authorized → full-test` Action 表述改为 Owner-authorized Delivery Full Test behavior，不再依赖 Standard `full-test` Action/Run。
- `flowkit-diagnostic-cli`：保持 CLI 只呈现 PolicyResult，不复制 decision tree；冻结 `non-author-review-blocker` 与 `delivery-behavior-not-implemented` 在 `flowkit next` 的稳定 blocked 呈现，并为 `flowkit doctor` 增加确定性的 warning severity mapping。

## Impact

- Domain / persistence / facts：`src/domain/actions.ts`、`src/domain/types.ts`、`src/persistence/serialization.ts`、`src/persistence/run-persistence.ts`、`src/facts/formal-fact-snapshot.ts`、`src/facts/formal-fact-reader.ts` 及 legacy run discrimination / Run-ID enumeration 的最小兼容 seam。
- Policy / diagnostics：`src/policy/preconditions.ts`、`src/policy/next.ts`、`src/policy/unified-entry.ts`、`src/policy/types.ts`、`src/policy/blocked-diagnosis.ts` 与 diagnostic CLI presentation/severity mapping；CLI 只消费 PolicyResult，不新增第二 decision tree，也不新增 Delivery executor。
- Canonical human-readable contract：`AGENTS.md`、`docs/core-model.md`、`docs/delivery-lifecycle.md`、`docs/verification-model.md`、`docs/integration-boundaries.md`，以及 repo-wide scan 后确认仍含冲突的 current docs；历史 archived Change artifacts 不改写。
- Tests：Action catalog、current Run schema、legacy read compatibility、Review finding validation/projection、mixed authority、author-only revise、non-author/mixed no-op revise rejection、mixed-authority recovery re-review、Q1→03 Delivery transition、CLI blocked presentation/doctor severity contract。
- 无新增外部依赖、Registry、Evidence/Receipt、Finding DB、authority event ledger、Delivery behavior executor 或自动 Author/Reviewer loop。
