## 1. Canonical identity 与领域契约

- [x] 1.1 将 Change dependency normative identity 统一为 `Change.id`，更新 `dependenciesMet`、相关 helper、真实 Manifest-shape fixtures，并证明当前三个 canonical Delivery Manifest 不需要 dependency migration。
- [x] 1.2 新增 Delivery/Change create input、`OwnerDecisionRecordKind` / Owner provenance record 与 enriched `OwnerAuthorizationFact` 的最小 provider-neutral type；将 Change `architectureImpact` 同步加入 persisted/read `Change` / `ChangeSummary` / `ChangeFact`（或等价正式投影）。A1-created Change 使用 strict boolean；exact pre-A1 legacy missing 使用 explicit unknown/legacy-missing，不新增 lifecycle 主状态。
- [x] 1.3 实现 create/Owner record runtime validation：Delivery/Change id/key uniqueness、required fields、dependency unknown/self/duplicate/cycle、typed decision target、sourceRef 与 cross-Delivery/Change applicability全部 fail-closed。

## 2. Delivery Manifest Owner provenance 与 bounded writer

- [x] 2.1 扩展 Delivery Manifest Reader/YAML subset，读取顶层 `ownerDecisions` 与 Change `architectureImpact`；加入 Base `448fa...` 三份 source-controlled Manifest / 21 个 exact `(deliveryId, Change.id)` 的静态 legacy allowlist。仅 allowlist 内 missing 可投影 explicit unknown，set 外 malformed/missing 必须 conflict；绝不从 Delivery architecture、Run `ownerAuthorization` 或其它内容推断 boolean/Owner fact。
- [x] 2.2 实现 deterministic Owner decision canonical tuple/hash ref 与 idempotent record insertion；相同 tuple重试不重复，不引入 timestamp/random identity。
- [x] 2.3 实现 existing Manifest bounded structured spans：唯一定位 `changes`/`ownerDecisions`/target state，只修改 owned bytes并原样保留 unknown sections；duplicate/ambiguous/unsupported owned shape fail-closed，最终 atomic publish。
- [x] 2.4 实现新 Delivery minimal deterministic serializer，并增加 Reader round-trip、LF/whitespace/EOF 与 one-active-Delivery validation。

## 3. Delivery / Change creation 与 authorization write-side

- [x] 3.1 实现 `createDelivery`：校验 repository 没有 active Delivery、完整 planned Change DAG，创建 `state=active` / `fullTestStatus=not-ready` Manifest，并在同一 publish记录 `create-delivery` provenance；不得创建 Git/Run/Full Test/Archify side effect。
- [x] 3.2 实现 `createChange`：只向唯一 active Delivery追加含 persisted `architectureImpact` 的 `state=planned` Change + `create-change` provenance；Delivery create initial planned Changes 使用同一 Change shape，dependency 只接受已存在 canonical Change.id，不初始化 OpenSpec/Run。
- [x] 3.3 实现 authorization-only `recordOwnerDecision`，只允许 apply/archive/checkpoint/full-test/finalize bounded vocabulary；任何 Manifest mutation 前 MUST fresh-read formal facts + current Policy，并要求 owner-decision、decision、canonical target 完全匹配，否则 fail-closed 且 Manifest byte-identical，拒绝 stale/early authorization。
- [x] 3.4 更新 FormalFactSnapshot Reader projection 与 Policy authorization helper，使 apply/archive 等 Change-scoped授权按 current `changeId` 匹配，Full Test/Finalize按 current Delivery匹配；增加 A1→B1 与 cross-Delivery leakage regression。

## 4. Activation 与 minimal OpenSpec initializer

- [x] 4.1 实现 activation preflight：shared formal snapshot conflicts=0、Delivery active、target planned、无其它 active Change、Change.id dependencies completed、Policy eligible set包含 target，并消费本次 Owner sourceRef。
- [x] 4.2 实现 minimal OpenSpec `.openspec.yaml` initializer（无 OpenSpec runtime dependency），使用 injectable clock生成 required date；exact metadata存在时幂等复用，mismatch/non-minimal metadata fail-closed。
- [x] 4.3 实现 two-step activation publish：metadata first → 单次 atomic Manifest publish(`activate-change` record + planned→active)；覆盖 Manifest publish failure、planned+exact-metadata retry、mismatch block，且不建立 transaction journal。
- [x] 4.4 验证 activation 成功后不创建 Explore Run/Git boundary/Push/Full Test，随后 shared Policy 自然返回 `explore`。

## 5. Bounded write CLI 与 diagnostics 分层

- [x] 5.1 在现有 CLI 增加 `flowkit create delivery --input <json> --source-ref <ref>` 与 `flowkit create change --input <json> --source-ref <ref>` 薄入口，复用 service validator并给出稳定 exit/error contract。
- [x] 5.2 增加 `flowkit owner record --decision ... [--change <change-id>] --source-ref <ref>` 与 `flowkit activate --change <change-id> --source-ref <ref>`，不得复制 Policy decision tree或自动执行后续 Action。
- [x] 5.3 保持 `status/next/doctor/resume-context` 严格 read-only；增加真实 Manifest id dependency、typed Owner fact 与 write-command isolation 的 CLI/integration tests。

## 6. Canonical alignment 与 Change Verification

- [x] 6.1 同步一个新 capability 与七个 affected canonical capability specs、`docs/core-model.md` / `docs/delivery-lifecycle.md` / `docs/integration-boundaries.md` / `docs/bootstrap-reference.md` / AGENTS 中 creation、Owner provenance、Change.id dependency、activation/no-Git-boundary 表达；不得改写 archived Q1/A1 history。
- [x] 6.2 增加 focused regression：三份 pre-A1 Manifest / 21 个 exact legacy identities 缺 `architectureImpact` 可读为 unknown 且 Base+A1 Apply 不 self-brick；future/new Change missing/malformed strict fail-closed、legacy shape copy 不得被吞；真实 `20260810-01-change-execution-loop.yaml` dependency shape、create validation、Change architectureImpact create/persist/read/resume、Manifest preservation、Owner ref idempotency/malformed record、stale/early authorization rejection、current Policy decision/target exact-match admission、cross-scope leakage、activation partial failure/retry、minimal OpenSpec init、checkout/resume。
- [x] 6.3 运行 A1 focused/affected tests、typecheck、lint、build、OpenSpec strict 与 whitespace checks，记录正式 Change Verification；任何 Change path不得运行/宣称 Delivery Full Test。
- [x] 6.4 复核 scope guard：无 Decision DB/Registry/inbox/event ledger、无外部 YAML/OpenSpec/GitHub runtime dependency、无 B1/C1/D1/E1/F1/G1/03 executor、无自动 Commit/Push/Review/Run loop。
- [x] 6.5 复核 legacy compatibility boundedness：allowlist 只含 Base `448fa...` 已存在的 3 个 Delivery / 21 个 Change.id；不得用日期/缺字段/状态/fuzzy shape 泛化，不 backfill 旧值，不让 future Change missing 通过。
