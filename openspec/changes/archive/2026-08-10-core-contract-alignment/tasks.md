## 1. Change-only Action 与 Run contract

- [x] 1.1 将 current `FormalAction` 收敛为 10 个 Change Action，移除 active `DeliveryAction` / `DELIVERY_ACTIONS` / `isDeliveryAction` surface，并修正所有 current compile-time consumers。
- [x] 1.2 将 schemaVersion 2 `ContextFile`、`Run`、`RunFact` 与 `createRun` 收敛为必须携带 Change identity 的 Change-only contract，拒绝新的 `full-test` / `delivery-finalize` Standard Run。
- [x] 1.3 实现 bounded legacy Run recognizer：只读识别 schemaVersion 1/unversioned 历史 Delivery-level Run，保持 Delivery-wide NNN enumeration，但不得投影进 current Policy Runs、不得迁移/改写历史 bytes。
- [x] 1.4 增加 Action catalog、current Run new-write rejection、legacy Delivery Run read-only/NNN compatibility 的直接回归测试。

## 2. Reviewer blocker authority 与 Formal Fact projection

- [x] 2.1 新增共享 `BlockingAuthority = author | owner | verification | external` 类型，并扩展新 typed blocking `reviewFindings` validation：blocking 必须声明 authority，author blocker 必须有 `requiredChange`，non-author blocker 不得伪造 `requiredChange`。
- [x] 2.2 扩展 `ReviewVerdictFact`，从 matching Reviewer result 确定性派生、去重并固定排序 `blockingAuthorities`；`approved` 必须为空，`changes-requested` 必须非空，非法/未知 authority 产生 `FactConflict`。
- [x] 2.3 为 immutable pre-Q1 terminal Review 增加 bounded read compatibility：旧 typed blocking finding 缺 authority 但具有合法 `requiredChange` 时仅在 Reader projection 中解释为 `author`，新 terminal writer 继续拒绝该 legacy shape。
- [x] 2.4 增加 Reviewer result validation、authority projection、legacy old-finding compatibility 与 malformed authority fail-closed 测试。

## 3. Policy authority boundary 与 direct re-review

- [x] 3.1 更新 stage lineage / `next`：matching `changes-requested` 仅在 blocking authorities 非空且全部为 `author` 时返回 `revise-S`；任一 non-author 或 mixed authority 必须返回稳定 non-author blocked boundary。
- [x] 3.2 更新 `canRun(revise-S)` 与 unified revise 入口，使其与 `next` 使用同一 author-only contract，并拒绝 non-author/mixed blocker 创建 Revision Run。
- [x] 3.3 为 matching `changes-requested` 中**任一含 non-author authority 的 pure/mixed 集合**冻结 deterministic explicit `review-S` direct re-review admission：`canRun(review-S)` MUST allowed，unchanged target MUST 可进入新的 Reviewer generation；是否存在值得重审的新 authority fact 不作为 Policy machine prerequisite，同时保证 `next()` 不自动返回 review、不提前 Author mutation、不创建 automatic Reviewer loop/generic authority-resolution event/ref。
- [x] 3.4 增加 author-only、owner/verification/external、mixed authority、no-op revise rejection、pure/mixed explicit direct re-review recovery、新 Reviewer generation 重新分类与 lineage reset 回归测试。

## 4. Q1→03 Delivery Policy 过渡

- [x] 4.1 删除 Standard `canRun` 中 `full-test` / `delivery-finalize` Action precondition 与所有 current `next` Action 输出，保留 Owner `authorize-full-test` / `authorize-delivery-finalize` decision facts。
- [x] 4.2 冻结 no-active-change 过渡：`awaiting-user-decision` 继续返回 Owner decision；`authorized` 与 passed+finalize-authorized 返回稳定 `delivery-behavior-not-implemented` blocked diagnosis；failed / checkpoint / activation 等既有 fail-closed 语义保持。
- [x] 4.3 更新 unified-entry、Policy result typing、blocked diagnosis 与 diagnostic CLI presentation；`flowkit next` 必须原样呈现新 blocked reason，`flowkit doctor` 必须将 `non-author-review-blocker` 与 `delivery-behavior-not-implemented` 确定映射为 warning，且 CLI 不复制 Policy decision tree。
- [x] 4.4 增加 awaiting-owner、authorized bridge、failed、passed awaiting-finalize-owner、passed finalize-authorized bridge 以及 checkpoint/activation preservation 的 Policy 测试。

## 5. Canonical contract alignment 与 Change Verification

- [x] 5.1 对 active canonical contract 做 repo-wide conflict scan，并同步 `AGENTS.md`、受影响 current docs 与七个 capability spec（含 `flowkit-diagnostic-cli`）的 `changes-requested ≠ revise-required`、blocking authority、Change-only Run/Action、Q1→03 bridge 与 blocked diagnosis presentation 表达；不得改写 archived Change artifacts。
- [x] 5.2 更新现有测试夹具/类型断言中仍把 `full-test` / `delivery-finalize` 当 Standard Action/Run 或把所有 `changes-requested` 当 Author revision 的 current assumptions。
- [x] 5.3 运行 Q1 focused/affected verification（含相关 unit/integration tests、typecheck/lint/build 中适用部分、OpenSpec strict），修复本 Change 引入的失败并记录 formal `verification.md`；不得把任何 Change-level命令提升为 Delivery Full Test lifecycle fact。
- [x] 5.4 复核 Q1 scope guard：无 Delivery behavior executor、Finding DB/convergence、Owner provenance platform、authority event ledger、自动 Author/Reviewer loop、Archify 或自动 Git boundary 实现。
