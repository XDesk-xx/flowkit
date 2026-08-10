<!-- flowkit-change-verification-status: passed -->

# Verification: A1 — delivery-change-creation-and-owner-input

## 1. 验证范围

本次验证覆盖 024 Proposal / Design / Specs / Tasks 已冻结并经 025 Reviewer `approved`、Owner 明确授权 Apply 的 A1 implementation：

- Delivery / Change bounded creation；
- deterministic Owner decision provenance 与 typed authorization applicability；
- `Change.id` dependency identity；
- Change-level `architectureImpact` create / persist / read / resume；
- Base `448fa...` 三份 source-controlled pre-A1 Manifest / 21 个 exact Change identity 的 bounded legacy-missing compatibility；
- authorization-only Owner record 的 fresh Policy exact decision/target gate；
- planned → active activation、minimal OpenSpec metadata 与 safe partial retry；
- `create delivery` / `create change` / `owner record` / `activate` 四个 write CLI；
- canonical specs、docs、AGENTS 与 tests alignment。

不包含 Decision DB/Registry/inbox/event ledger、完整 OpenSpec adapter、B1 Action Package、D1 Finding convergence、E1 verification selector、F1 archive/checkpoint executor、G1 complete Change CLI、03 Delivery behavior executor、自动 Commit/Push/Review loop。

## 2. 适用检查与结果

| 检查 | 命令/方法 | 状态 | 摘要 |
|---|---|---|---|
| A1 focused tests | `npm run test:focused -- tests/unit/services/a1-write-service.test.ts tests/unit/policy/owner-decision.test.ts tests/unit/facts/formal-fact-reader.test.ts tests/unit/policy/next.test.ts tests/integration/diagnostic-cli.test.ts tests/integration/execution-model-lifecycle.test.ts` | passed | 109 tests / 21 suites，109 pass，0 fail；5.480s；超过 focused 5s warning budget 0.480s，仅 performance observation |
| Change affected aggregate | `PATH=<OpenSpec-1.7-offline> npm run verify:change -- domain persistence facts policy cli` | passed | quality + affected + typecheck + lint + build + active Change strict + canonical specs strict 全部通过 |
| Affected tests | `npm run test:affected -- domain persistence facts policy cli` | passed | 582 tests / 132 suites，582 pass，0 fail；18.852s，低于 30s target |
| Typecheck | `npm run typecheck` | passed | production + test TypeScript 0 error |
| Lint | `npm run lint` | passed | ESLint 0 error |
| Build | `npm run build` | passed | TypeScript build passed |
| Quality Guard | `npm run quality` | passed | hard-failures 0；79 maintainability warnings/elevated-warnings，均为 observation |
| OpenSpec active Change strict | `openspec 1.7.0 validate delivery-change-creation-and-owner-input --strict --no-interactive` | passed | Change valid |
| Canonical specs strict | `openspec 1.7.0 validate --specs --strict --no-interactive` | passed | 11 passed，0 failed |
| Text hygiene | repository candidate text scan + package preflight | passed | no trailing whitespace / CRLF introduced；package finalization 再验证 EOF/SHA256 |
| Delivery Full Test | — | not-applicable | 未运行；本次仅 Change Verification，未执行 `test:full` / `verify:full` |

## 3. 关键行为验证

- Dependency：Manifest、Reader、Policy、create validation 与 tests 统一以 `Change.id` 解析 `dependsOn`。
- Owner authority：Run `ownerAuthorization` 不创造 authority；Reader 只从 Manifest `ownerDecisions` 投影 authorization facts，并验证 deterministic tuple hash、typed decision、Delivery/Change applicability。
- Owner gate：authorization-only record 必须 fresh-read formal facts，并与 current Policy 的 `owner-decision`、decision 与 canonical target 精确匹配；early/stale 输入拒绝且 Manifest byte-identical。
- Architecture impact：A1-created Change 必须持久化 boolean 并可 checkout/resume 恢复；future missing/malformed fail closed。
- Legacy boundedness：只有 Base `448fa...` 冻结的 3 个 Delivery / 21 个 exact `(deliveryId, Change.id)` 可以在字段缺失时恢复为 `pre-a1-legacy-missing`；不从 Delivery architecture、goal、outputs、Run 或日期推断 true/false，不 backfill。exact legacy Change activation 后仍保持 missing/unknown。
- Creation：`createDelivery` 只创建 active/not-ready Manifest + planned Change DAG + create provenance；`createChange` 只追加 planned Change + provenance；均不创建 Run/Git/Full Test/Archify side effect。
- Activation：formal facts conflict-free、Delivery active、无其他 active Change、Change.id dependencies completed 且 Policy eligible 后，先初始化 minimal `.openspec.yaml`，再单次 atomic Manifest publish `activate-change` provenance + `planned → active`；Manifest publish failure只留下 planned + exact metadata，可幂等 retry。
- CLI：四个 write command 是 service thin wrapper；`status/next/doctor/resume-context` 保持 read-only，不复制 Policy decision tree。

## 4. Scope Guard

通过 diff/code/spec review确认未引入：

- Decision Database / Approval Registry / workflow inbox / generic authority event ledger；
- external YAML runtime dependency；
- OpenSpec runtime adapter（A1 仅 minimal metadata initializer）；
- B1/C1/D1/E1/F1/G1/03 executor；
- automatic Commit / Push / PR / Review / Run loop；
- Delivery Full Test execution。

## 5. 总体状态

**passed**

A1 所有适用 Change Verification 已通过；Delivery Full Test 为 `not-applicable`。可以进入独立 `review-apply` generation。

## 6. 028 revise-apply — A1-RA-001 closure

027 Reviewer 唯一 Blocking Finding `A1-RA-001` 已关闭。

修复后的 authorization-only Owner record 顺序：

```text
discover active Delivery
→ build deterministic canonical Owner tuple/ref
→ read Manifest and probe exact existing tuple
   ├─ exact same tuple already exists
   │  → return same ref
   │  → idempotent=true
   │  → no Manifest mutation
   │  → no requirement that Policy still be at the old gate
   └─ record absent
      → fresh-read formal facts
      → current Policy MUST request exact same decision/target
      → persist one new record
```

same-ref / different decoded content 继续通过 Manifest collision validation fail-closed；stale/early different tuple 与 target mismatch 继续经过 current Policy gate 拒绝。

新增真实 regression：

```text
Policy before first record
→ owner-decision: authorize-apply

first exact tuple
→ success
→ idempotent=false
→ record count=1

Policy after first record
→ action: apply

second exact same tuple
→ success
→ same ownerDecisionRef
→ idempotent=true
→ Manifest byte-identical
→ record count=1
```

028 验证结果：

| 检查 | 状态 | 摘要 |
|---|---|---|
| A1 focused | passed | `tests/unit/services/a1-write-service.test.ts`：15/15 passed，1.164s |
| Affected | passed | domain + persistence + facts + policy + cli：583/583 passed，18.628s |
| `npm run typecheck` | passed | production + tests 0 error |
| `npm run lint` | passed | 0 error |
| `npm run build` | passed | passed |
| `npm run quality` | passed | hard-failures 0；81 maintainability observations |
| OpenSpec active Change strict | passed | `delivery-change-creation-and-owner-input` valid |
| Canonical specs strict | passed | 11/11 |
| `npm run verify:change -- domain persistence facts policy cli` | passed | full Change aggregate passed |
| Delivery Full Test | not-applicable | 未运行 |

028 没有修改 Proposal / Design / delta specs，没有扩大 A1 scope。
