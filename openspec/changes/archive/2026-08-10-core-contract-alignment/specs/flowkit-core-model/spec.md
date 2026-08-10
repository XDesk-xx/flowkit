## MODIFIED Requirements

### Requirement: Action Catalog 必须固定

主 Action MUST 为 `explore | propose | apply | archive`。

辅助 Action MUST 为：

```text
review-explore
revise-explore
review-propose
revise-propose
review-apply
revise-apply
```

Review 与 Revision Action MUST 使用 `review-<stage> ↔ revise-<stage>` 对称形式。`fix-review-findings` MUST NOT 是正式 Action；它 MAY 作为 `revise-apply` 的 goal 或方法类别。Delivery Full Test、Delivery Finalize 与 Change Checkpoint MUST NOT 是 Standard Formal Change Action。

#### Scenario: Apply Review 的 author blocker 请求修改

- **WHEN** `review-apply` Verdict 为 `changes-requested`
- **AND** 当前 matching Review 的全部 blocking findings 的 `blockingAuthority` 均为 `author`
- **THEN** 唯一合法 Revision Action MUST 为 `revise-apply`
- **AND** `revise-apply` MUST 只处理当前 author-actionable Findings，MUST NOT 扩张 Change 范围
- **AND** 修订后 MUST 重新运行适用的 Change Verification
- **AND** 验证通过后 MUST 再次进入 `review-apply`
- **AND** MUST NOT 自动运行 Delivery Full Test

#### Scenario: non-author blocker 不产生 Revision Action

- **WHEN** matching `changes-requested` Review 存在任一 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** MUST NOT 推导 `revise-<stage>`
- **AND** MUST 停在对应 authority boundary

### Requirement: Revision/Fix 必须由 changes-requested 触发

`changes-requested` MUST 只表示当前 reviewed target 不可批准，不得单独等价为 `revise-required`。`revise-explore`、`revise-propose` 和 `revise-apply` MUST 仅在对应 Review lineage match、Verdict=`changes-requested`、存在 blocking finding，且当前 matching Review 的全部 blocking findings 均声明 `blockingAuthority=author` 时合法。

Review `approved` 时，Revision/Fix MUST 被视为不适用。存在任一 non-author blocking authority 时，Author Revision MUST 不适用，MUST NOT 创建 no-op/placeholder Revision Run。

#### Scenario: author-only blocking Review 进入 Revision

- **WHEN** Review 返回 `changes-requested`
- **AND** matching Review 至少存在一个 blocking finding
- **AND** 全部 blocking findings 的 `blockingAuthority=author`
- **THEN** Flowkit MUST 推导对应 Revision/Fix
- **AND** Revision/Fix 完成后 MUST 再次进入对应 Review
- **AND** 该循环 MAY 重复，直到 approved、出现 non-author blocker 或 Change 被取消

#### Scenario: mixed authority fail-closed

- **WHEN** matching `changes-requested` Review 同时包含 `author` blocker 与任一 non-author blocker
- **THEN** Flowkit MUST NOT 选择 `revise-*`
- **AND** MUST 停在 non-author authority boundary
- **AND** MUST NOT 通过只处理 author blocker 来制造并行或多解路径

#### Scenario: non-author blocker 禁止 no-op revise

- **WHEN** matching `changes-requested` Review 的 blocking findings 不包含可独立推进的 author-only集合
- **THEN** Author `revise` MUST 被拒绝
- **AND** MUST NOT 创建空 Revision Run、仅改文案的 authority 伪造或 placeholder mutation

### Requirement: Owner 不得绕过正式 Verdict

当 Review Verdict 为 `changes-requested` 时，Owner MUST NOT 直接推进下一主 Action。Flowkit MUST 先消费 Reviewer-owned blocking authority：author-only blocker 进入 Author Revision；owner / verification / external blocker 使 `next()` 停在对应 non-author authority boundary。只要当前 matching Review 含任一 non-author blocker（包括 mixed author+non-author），explicit same-stage re-review MUST 在 Policy 层保持合法，unchanged candidate target MUST 可进入新的 Reviewer generation，而不是制造 Author Revision。Policy 不负责机器证明 non-author authority fact 是否已经到位；是否值得现在重新 Review 由显式执行者确认。新的 Reviewer generation MUST 使用执行时最新可用 authority facts 重新评估完整 target；只有新的 matching Review 把剩余 blockers 重新分类为 author-only 后，Author Revision 才重新适用。

#### Scenario: 请求绕过 changes-requested

- **WHEN** reviewer 返回 `changes-requested`
- **AND** owner 请求直接推进下一主 Action
- **THEN** Flowkit MUST 阻塞
- **AND** MUST NOT 把 Owner 请求解释为 Reviewer approval

#### Scenario: Owner blocker 不交给 Author 伪修复

- **WHEN** matching blocking finding 的 `blockingAuthority=owner`
- **THEN** Flowkit MUST NOT 创建 Author Revision
- **AND** explicit same-stage Review MUST 保持合法
- **AND** unchanged target MUST 可进入新的 Reviewer generation
- **AND** Policy MUST NOT 把“新 Owner 独立事实是否已到位”作为该 Review 的 machine admission prerequisite

#### Scenario: mixed blocker 始终允许显式 direct re-review

- **WHEN** matching `changes-requested` Review 同时包含 `author` 与 non-author blocker
- **AND** 显式执行 same-stage Review
- **AND** candidate target bytes 未变化
- **THEN** Flowkit MUST 允许创建新的同阶段 Review execution
- **AND** MUST NOT 先创建 Author Revision
- **AND** 新 Reviewer generation MUST 使用执行时最新可用 authority facts 重新评估完整 target
- **AND** 只有新的 matching Review 为 author-only 时 Revision 才 MUST 按 author-only 规则合法

### Requirement: `revise` 必须只是统一入口

`revise` MUST 是 Author 的统一入口，MUST NOT 成为正式 Action。执行 `revise` 时，Flowkit MUST 从当前 stage 的 matching `changes-requested` Review 与 blocking authority 唯一解析 `revise-explore | revise-propose | revise-apply`。只有 author-only blocking Review 才可解析 Revision。

#### Scenario: 当前 Verdict 对应 Apply Review 且全部 blocker 属于 Author

- **WHEN** 当前 matching Verdict 来自 `review-apply` 且为 `changes-requested`
- **AND** 至少一个 blocking finding 存在
- **AND** 全部 blocking findings 的 `blockingAuthority=author`
- **AND** Author 执行 `revise`
- **THEN** Flowkit MUST 创建并执行 `revise-apply` Run
- **AND** MUST NOT 创建名为 `fix-review-findings` 的正式 Action Run

#### Scenario: non-author 或 mixed blocker 时 revise blocked

- **WHEN** 当前 matching Verdict 为 `changes-requested`
- **AND** 任一 blocking finding 的 `blockingAuthority ∈ {owner, verification, external}`
- **THEN** `revise` MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 Revision Run

#### Scenario: 没有唯一可修订 Review

- **WHEN** 不存在有效 matching `changes-requested` Review、blocking finding 缺失、或事实存在冲突/多解
- **THEN** Flowkit MUST 返回 blocked diagnosis
- **AND** MUST NOT 创建 Revision Run

### Requirement: Run 必须表示一次 Action 执行

每个 current Standard Run MUST 绑定一个 Delivery、一个 Change、一个正式 Change Action 和一个角色。Delivery Full Test / Delivery Finalize MUST NOT 创建 Standard Run。

同一角色、同一 Action、同一目标内的多轮讨论、内容完善和普通 Commit MUST 保持在同一个 Run。

#### Scenario: 同一 Propose 内有多个 Commit

- **WHEN** author 在同一次 Propose 中产生多个普通 Commit
- **AND** Action、角色、目标未改变
- **THEN** Flowkit MUST 继续使用同一个 Propose Run

#### Scenario: Full Test 与 Finalize 不创建 Standard Run

- **WHEN** Delivery 进入 Full Test 或 Finalize behavior boundary
- **THEN** MUST NOT 创建 `full-test` 或 `delivery-finalize` Standard Run
- **AND** MUST NOT 使用缺失 Change identity 的 current Standard Run 表达 Delivery behavior

### Requirement: Run 路径和编号必须固定

Current Standard Run MUST 使用 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`。Run ID MUST 使用 `YYYYMMDD-NNN-action`，且 `NNN` MUST 在 Delivery 内唯一并单调递增。历史已存在的 Delivery-level Run path MAY 被 bounded legacy reader/NNN enumeration 识别，但 MUST NOT 成为 current Run path、Action Catalog 或新 Run 创建能力。

#### Scenario: current Run 路径必须含 Change identity

- **WHEN** 创建新的 Standard Run
- **THEN** path MUST 为 `.flowkit/runs/<delivery-id>/<change-id>/<run-id>/`
- **AND** context MUST 同时携带 matching Delivery / Change identity
- **AND** 缺失或冲突 MUST fail closed

#### Scenario: 历史 Delivery-level Run 只读兼容

- **WHEN** repository history 中存在旧 Delivery-level Run
- **THEN** Flowkit MAY 为历史读取或 Delivery-wide NNN 唯一性识别该 path
- **AND** MUST NOT 迁移、改写或复制该 terminal Run
- **AND** MUST NOT 允许创建新的同类 Run

### Requirement: Full Test 必须使用 Delivery 验证子状态

`fullTestStatus` MUST 为 `not-ready | awaiting-user-decision | authorized | passed | failed`。

它 MUST 属于 Flowkit 拥有的 Delivery 验证子状态，MUST NOT 成为 Delivery 主状态。项目验证工具 MUST 继续拥有完整 Full Test 结果。Delivery Full Test MUST 是 Owner-authorized Delivery verification behavior，MUST NOT 是 Standard Formal Action 或 Standard Run。Bootstrap 阶段 Delivery YAML MUST 作为人工投影；03 完成后 Flowkit Delivery 状态/behavior model 才成为完整 machine authority。

#### Scenario: Owner 授权 Full Test

- **WHEN** `fullTestStatus=awaiting-user-decision`
- **AND** owner 明确授权
- **THEN** `fullTestStatus` MUST 进入 `authorized`
- **AND** Delivery Full Test behavior MAY 在其正式 executor 可用时执行
- **AND** MUST NOT 因授权创建 `full-test` Standard Run

#### Scenario: Q1 后 03 前 authorized 状态 fail-closed

- **WHEN** `fullTestStatus=authorized`
- **AND** Delivery Full Test behavior executor 尚未由 03 实现
- **THEN** Policy MUST 保持 deterministic/fail-closed
- **AND** MUST NOT 返回 `action: full-test`
