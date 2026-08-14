## 1. Schema 与 mutation declaration

- [ ] 1.1 定义 context v2/v3/v4/v5 closed union、ActionPackage v1/v2 pairing、entry snapshot 与 verification-selection record schema validators；new writer 只写 v5/v2。
- [ ] 1.2 实现 `createRun → buildContextFile/serialize → discriminateRunForReader → validate/read → FormalFactSnapshot consume` v5 链路，并为 v2 strict + fingerprint-bound pre-Q1 compatibility、v3 Owner-fact、v4 archive projection、v5 current writer 与 unknown-version fail-closed 分别增加 discriminator/reader fixtures，证明 historical bytes 不变。
- [x] 1.3 实现 approved Design 中唯一 `flowkitMutationScope` section 的 closed parser，拒绝缺失、重复、重叠、root、`.flowkit/`、glob 与 symlink escape selectors。
- [ ] 1.4 在 Policy 选择 Action 后派生同名 mutation declaration，将 Design source ref/fingerprint 和 canonical selectors 写入 context v5 与 ActionPackage v2。
- [ ] 1.5 增加 context/ActionPackage cross-version rejection、Design producer binding、selector canonicalization 与 invalid declaration 的 focused tests，禁止 silent authority synthesis。

## 2. Exact Run continuation 与 terminal admission

- [ ] 2.1 实现唯一 `prepareNewExecution(intent: next | review)` boundary：分别调用 shared `next` / `resolveReview/canRun`，无 pending 时才由 Core 分配 Delivery-wide NNN 并返回 durable receipt。
- [ ] 2.2 实现 `resumeRun(deliveryId, expectedRunId)`，只从 persisted target context 恢复同版本 entry identity；两个 new intents 遇到 pending 均返回 `exact-resume-required`，不隐式恢复或调用 allocator。
- [ ] 2.3 将 result admission 绑定 exact Run/context/package/logical descriptor，并统一为 Core preflight → post-action publication → immutable record commit marker → terminal CAS-last。
- [ ] 2.4 定义 transport timeout 为 `outcome-unknown`，要求 caller 从 durable receipt 恢复 `expectedRunId`；缺少 exact id 时 fail closed。
- [ ] 2.5 覆盖 normal next、non-author same-stage direct re-review、pending Reviewer exact resume、concurrent Core-only numbering、preparation timeout、late completion、equivalent/conflicting replay、wrong Run id 和 late-generation safety tests。

## 3. OpenSpec operation projection 与 process cancellation

- [ ] 3.1 引入 operation-scoped `OpenSpecOperationProjection`，在一次 formal operation 内共享 version、structured status、instructions、validation 与 diagnostics。
- [ ] 3.2 改造 formal reader、preparation 与 adapter callers，使 `getArtifactInstructions` 消费既有 structured status，terminal admission 强制新建 post-action projection。
- [ ] 3.3 增加 fake/real CLI invocation-count tests，证明同一 operation 的同一 projection 只执行一次且不会跨 mutation cache。
- [ ] 3.4 将 external command result 收敛为 `spawn-failed | exited | timed-out-cancelled | outcome-unknown` closed union。
- [ ] 3.5 实现 Windows owned process-tree cancellation seam；无法证明 descendants 已终止时保留 diagnostics 并返回 `outcome-unknown`。
- [ ] 3.6 覆盖 Windows launcher/process-tree、timeout race、late exit 与 OpenSpec write-side authoritative-state recheck tests。

## 4. Entry snapshot 与 actualChangeSet

- [ ] 4.1 在 Apply/revise-apply Run 创建前，以 canonical base 和 working tree 发布 immutable entry snapshot record，并持久化其 identity。
- [ ] 4.2 以 base → post-action state 派生 ordered `create | modify | delete` actualChangeSet、path kind 与最终 content fingerprint，并保留 entry 时已存在的 candidate bytes。
- [ ] 4.3 以 entry → post-action state 单独派生 observedActionMutations，将 Core-owned Run/entry/post-action/verification publications 排除于 candidate paths，同时拒绝 mutation declaration 外的 observed paths。
- [ ] 4.4 调整 pending resume semantic drift：declared Action-owned mutation 不构成 self-drift，undeclared、unowned 或其他 semantic drift 继续 fail closed。
- [ ] 4.5 增加 create/modify/delete、rename-like create+delete、line endings、directory derivation、undeclared path 与 resume drift tests。

## 5. Deterministic verification selection

- [ ] 5.1 新增 closed `module-map.ts` data 与 validator，拒绝 ownership 重叠、unknown edge/scope/capability、cycle 和 nondeterministic ordering。
- [ ] 5.2 由 actual paths 唯一选择 seed modules，并沿 reverse dependency edges 递归计算 consumer closure。
- [ ] 5.3 仅从 structured OpenSpec delta artifacts 解析 capability ids/refs，验证 delta capability 与 seed module 双向关联。
- [ ] 5.4 生成 lexical sorted/deduped modules、capabilities 与 verification scopes；仅接受 closed predicate 证明的 explicit `not-applicable`。
- [ ] 5.5 从 stable selection payload + renderer version deterministic render `verification.md`，先原子发布 Markdown、再以 immutable per-Run verification-selection record 作为 commit marker；拒绝 record 回写和 Author terminal result 注入 post-action facts。
- [ ] 5.6 实现 Formal Reader current-lineage selection：只验证唯一 current `apply` / `revise-apply` producer record 与 current Markdown；pending publication 投影 unavailable/in-flight，historical records 不读取 future canonical bytes。
- [ ] 5.7 增加 module ownership、reverse closure、capability mismatch、not-applicable 与 Markdown determinism tests，并覆盖 absent/absent、Markdown-only、record+pending、terminal-present 每个 publication boundary 的 crash/recovery/replay。
- [ ] 5.8 覆盖 Apply terminal → review changes-requested → revise-apply successor record/Markdown → old/new lineage Reader 与 exact replay，证明旧 result/record 不产生 historical FactConflict。

## 6. Bootstrap migration 与文档

- [ ] 6.1 建立 v2/v3/v4 historical compatibility fixtures 与 disposable context v5 / ActionPackage v2 integration Run，验证新 writer 而不把 105–116 historical Runs 声称为 v5 evidence。
- [ ] 6.2 完成 E1 bootstrap integration，覆盖 exact resume、operation projection、Windows cancellation seam、actualChangeSet 与 verification selection 的联动。
- [ ] 6.3 更新 `02-change-execution-loop-delivery-implementation-reference-v3.md`，记录 timeout outcome-unknown、exact Run resume、Core-only numbering 与单 operation projection contract。
- [ ] 6.4 更新长期 self-hosting/migration 参考文档，明确 E1 bootstrap capability boundary、无 exclusive worktree 时的 attribution 限制，以及首个 canonical v5 dogfood 从后续 Change 开始。
- [ ] 6.5 保持 G1 ownership boundary：不在 E1 增加 Change CLI、full Change E2E、checkout/resume acceptance、size/timing 或 review-convergence reports。

## 7. Verification 与交付证据

- [ ] 7.1 运行 schema、persistence、service、Policy、OpenSpec adapter、runner 与 verification selection focused tests。
- [ ] 7.2 运行受影响的 integration tests、TypeScript build/typecheck 与 repository quality checks，并记录 exact commands/results。
- [ ] 7.3 运行 `npx openspec validate change-verification-selection-and-change-set --strict` 和 applicable canonical specs validation。
- [ ] 7.4 对完整 Change artifact inventory 执行 LF、trailing whitespace、U+FFFD、EOF newline 与 Markdown reference 检查，不把 `git diff --check` 当作 untracked coverage。
- [ ] 7.5 生成 canonical `verification.md`，明确标记 `bootstrap verification`、列出 actual evidence scope，并声明 105–116 context v4 不是 v5 dogfood。
