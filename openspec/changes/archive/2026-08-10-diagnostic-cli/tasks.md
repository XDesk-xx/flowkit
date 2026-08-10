## 1. 正式事实投影

- [x] 1.1 扩展 `OpenSpecArtifactFact.kind`，增加 `change-explore` 与 `change-verification`，并在 `FormalFactSnapshot` 增加可选 active-Change `changeVerificationStatus`；不得加入 Verification logs 或历史状态。
- [x] 1.2 扩展 `readOpenSpecArtifacts()`，把 current canonical `explore.md` 与 `verification.md` 投影为 existence facts；不得做 historical ResultRef replay。
- [x] 1.3 实现 active Change `verification.md` 中 `<!-- flowkit-change-verification-status: <status> -->` 的精确解析：文件不存在 → unavailable；唯一合法 marker → status；既有 record 中 marker 缺失/重复/非法 → `change-verification-status` FactConflict。
- [x] 1.4 增加 focused Reader tests，覆盖 explore/verification artifact facts、四个 `VerificationStatus`、Verification record 缺失、marker 缺失/重复/非法，以及拒绝从 prose 或 historical Run refs 推断 status。
- [x] 1.5 更新 `docs/verification-model.md` §7：新的/current Change Verification record 携带精确 machine-readable status marker，同时 Markdown record 继续作为 Verification authority；不回填 archived Changes。

## 2. Policy Verification gate 接线

- [x] 2.1 把既有 Verification gate snapshot reader 改为读取 `snapshot.changeVerificationStatus`，保持现有 status mapping / `canRun` / `next` decision tree 不变。
- [x] 2.2 增加/调整 Policy unit tests：undefined → `verification-facts-unavailable`；passed/not-applicable → satisfied；failed → `verification-failed`；not-run → `verification-not-run`，且必须通过真实 `FormalFactSnapshot` field 生效。
- [x] 2.3 增加 affected Reader→Policy integration fixture，证明 active Change `verification.md` marker 能控制既有 `review-apply` gate，且不从 Run/chat 推断。

## 3. 共享 CLI 上下文发现

- [x] 3.1 增加 nearest-ancestor repository-root discovery，要求同时存在 `openspec/delivery-groups/` 与 `.flowkit/runs/`；找不到 root 时 deterministic failure。
- [x] 3.2 通过既有 minimal YAML parser 枚举 `openspec/delivery-groups/*.yaml`，只接受恰好一个 `delivery.state=active`；0 个、多个或相关 malformed YAML 均 fail-closed。
- [x] 3.3 增加共享 context loader：构造固定 Reader input paths，并为四个 diagnostic commands 返回同一个 `FormalFactSnapshot`；不得增加 workspace registry、`--delivery` override 或 GitHub/detached checkpoint fallback。
- [x] 3.4 增加 focused discovery/loader tests，覆盖 root execution、nested-directory execution、no root、0 active Delivery、multiple active Deliveries、malformed active-state YAML。

## 4. 诊断视图

- [x] 4.1 实现 pure `status` projection，固定 active-Change 字段顺序：Delivery、Change、stage、last relevant Run、latest valid Review、Change Verification、Delivery Full Test、conflict count；不得 dump full Run metadata。
- [x] 4.2 实现 no-active-Change Delivery-level `status` projection：`change/change-state=none`、`stage=delivery-level`、`review=none`、`verification=not-applicable`，`last-run` 使用 Delivery 内最新 admitted Run 或 `none`。
- [x] 4.3 实现 pure `next` projection，只调用既有 `next(snapshot)`；按 Design Decision 8 完整格式化三个 union branch，不复制 decision tree。
- [x] 4.4 为 `owner-decision` formatter 固定并测试 `context-change / context-eligible-changes / context-full-test / context-detail`；所有缺失 context 字段输出 `none`。
- [x] 4.5 为 `blocked` formatter 固定并测试 `reason / unmet / conflicts / conflict[i] / owner-actions`；conflicts 按 `(dimension, authority, message)` 排序并保留三项信息。
- [x] 4.6 实现 doctor aggregation：Reader conflicts、Policy blocked diagnosis 与 Design Decision 9 规定的 bounded recovery checks；不得把 legal pending Run 或 historical mutable ResultRef drift 当 generic error。
- [x] 4.7 冻结并实现 doctor severity：Reader conflict / ambiguous pending / missing formal artifact = `error`；orphan pending = `warning`；Policy blocked reason 按 Decision 9 映射，`formal-fact-conflict` 不重复生成 Policy finding。
- [x] 4.8 实现 pure `resume-context` projection：Delivery、Change、stage、last formal artifact、last relevant Run、latest valid Review、Verification、Policy next；排除 `.tmp`、chat/provider sessions 与 historical fingerprint replay。
- [x] 4.9 实现 no-active-Change Delivery-level `resume-context`：`change=none`、`stage=delivery-level`、`last-artifact=none`、`review=none`、`verification=not-applicable`，并直接呈现 Delivery-level Policy next。
- [x] 4.10 增加 unit tests，至少覆盖：no Review、unavailable Verification、Reader conflicts、带 context 的 owner-decision、带 conflicts 的 blocked next、resumable pending Run、ambiguous pending Runs、orphan pending Run、missing formal artifact、stage-based last artifact、no-active-Change Delivery-level boundary。

## 5. CLI 进程表面

- [x] 5.1 增加最小 CLI dispatcher，支持 `status`、`next`、`doctor`、`resume-context`，保留 `--version` / `-v`，unknown command deterministic reject；不得增加 generic command registry/framework。
- [x] 5.2 实现 UTF-8/LF line-oriented output：遵守 Design Decision 8/10 的精确 branch/field order，不含 timestamps/random values，默认无 ANSI；scalar 中 CR/LF 使用字面量 `\r` / `\n`。
- [x] 5.3 实现 exit codes：normal diagnostic result（包括 blocked/owner-decision 与 doctor warning）= 0；doctor `overall=error` = 1；usage/repository/discovery/loading failure = 2。
- [x] 5.4 增加 process-level CLI tests，覆盖四命令、nested working directory、byte-stable output、stderr/exit codes、read-only repository behavior。
- [x] 5.5 增加 `next` process fixtures：至少一个 `activate-change` owner-decision 能恢复 context，一个 `formal-fact-conflict` blocked 能恢复 conflict diagnosis。
- [x] 5.6 增加 doctor process fixtures：ambiguous pending→exit 1、orphan pending→exit 0 warning、missing formal artifact→exit 1、Reader conflict→exit 1、非 conflict 的 Policy blocked warning→exit 0。
- [x] 5.7 增加 no-active-Change Delivery-level process fixture，至少覆盖 checkpoint/activate-change/full-test/finalize 中一个正常 boundary，并证明四命令不会返回 discovery/loading error。

## 6. Change Verification 与契约验证

- [x] 6.1 Apply/revise-apply 后创建/更新 E1 `verification.md`，包含精确 Change Verification status marker、focused/affected check results、environment/result references 与显式 Delivery Full Test status。
- [x] 6.2 运行 Reader、Verification gate、discovery、diagnostics 的 focused tests；因 shared snapshot contract 改变，扩展到 affected CLI/Policy/Reader tests。
- [x] 6.3 运行适用的 `npm run typecheck`、`npm run lint`、`npm run build`、OpenSpec change strict validation 与 canonical spec strict validation；不得自动把 repository `npm test` 当作 Delivery Full Test。
- [x] 6.4 验证未引入 production `.mjs`、CLI/diagnostic registry、第二 Verification state file、historical Run replay、automatic repair/mutation 或 detached Git checkpoint workaround。
- [x] 6.5 引用 170 Non-blocking timing clarification 时，在 E1 verification/review evidence 中明确：无 `.git` blocked 输出属于 pre-169 activation detached input；当前 169+ candidate 使用 materialized current facts。
- [x] 6.6 验证 Proposal/Design/Tasks/Run 的人类可读正文默认简体中文；OpenSpec parser keywords、Action/schema/CLI/code/path/error/enum 保持英文。

## 7. Owner contract reconciliation：最小 Tasks completion projection

- [x] 7.1 撤销 E1 原“Tasks completion 后置”决定，并在 Proposal / Design / delta specs 中冻结 current canonical `tasks.md` 为 required Tasks completion authority；禁止 Task Registry、数据库或 execution engine。
- [x] 7.2 在 `FormalFactSnapshot` 增加最小 `changeTasksComplete?: boolean`，Reader 只从 active Change `tasks.md` 的 required Markdown checkboxes 投影 unavailable / incomplete / complete。
- [x] 7.3 接通既有 Archive Tasks gate：undefined → `tasks-facts-unavailable`；false → `tasks-incomplete`；true → 继续评估 archive owner authorization；不从其他 authority 推断。
- [x] 7.4 增加 Reader / Policy focused tests，覆盖 tasks.md absent、all complete、unchecked required task、archive owner-decision 与 archive authorized branch。
- [x] 7.5 更新 doctor 对 `tasks-incomplete` 的固定 warning 映射，并运行 E1 focused + affected Change Verification；不得执行 Delivery Full Test、Archive 或 Checkpoint。
