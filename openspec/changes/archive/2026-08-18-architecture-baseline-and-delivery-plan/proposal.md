## Why

C1 已把 Archify 2.14.0 固定为 exact managed external runtime，D1 也已证明 Current / Planned Architecture 的时间边界与 repository-evidence route 可行；但 057 的 failed revise-apply 暴露了 reference visualization physical model 仍需重新冻结。Owner 已明确选择同时长期保留 Workflow 与 Sequence 两种互补视角：Workflow 表达完整 Change / Delivery orchestration，Sequence 表达 Owner / Policy / Author / Reviewer / Verification / OpenSpec / Archify / Git 等参与者之间的交互时序。两者都只是 formal facts 的 durable visualization projection，不能反向成为 Policy、OpenSpec 或 lifecycle authority。

因此本 fresh Proposal generation supersede 057 failed generation，不修改 057 Run 或 failed Verification，并重新冻结 D1 reference physical contract 后再进入新的 Apply。

## What Changes

- 保留两类严格分权的 Architecture JSON source：
  - `architecture/reference/json/**`：长期、Git-tracked、human/AI-readable 的产品/lifecycle visualization source；是 canonical formal facts 的 projection，不是 Flowkit Policy / OpenSpec / lifecycle state / next-Action / Owner decision / development decision authority。
  - `architecture/<delivery-id>/json/**`：Delivery Architecture assets。D1 对 03 只形成 `current.architecture.json` 与 `planned.architecture.json`；`actual.architecture.json` 仍属于 E1。
- D1 reference durable source 改为四张互补视图：
  - `change-lifecycle.workflow.json`：完整 Change orchestration 主视角；
  - `change-lifecycle.sequence.json`：Change 多角色/authority 交互时序补充视角；
  - `delivery-lifecycle.workflow.json`：完整 Delivery orchestration 主视角；
  - `delivery-lifecycle.sequence.json`：Delivery 多角色/authority 交互时序补充视角。
- D1 不保存 `full-test-lifecycle.lifecycle.json`。`lifecycle` 仍是 Archify 合法类型，但仅适合未来明确需要的 bounded state machine（如 Full Test status / Run status），不作为本 Change 的完整 Delivery 主/reference durable source。
- Change Workflow 必须在图结构中显式覆盖 explore/review/revise、Owner apply/archive/checkpoint gates、Change Verification、OpenSpec archive、completed 与 separate Git checkpoint；Sequence 必须补充角色间调用/返回/授权关系，但不能成为第二套 lifecycle authority。
- Delivery Workflow 必须显式覆盖 Delivery Start、Current/Planned、required Changes + Checkpoints、Ready + Owner Full Test、passed/failed split、failed corrective loop、passed Actual/Compare/architecture acceptance/Owner finalize/Delivery Final/Merge/next Current；Sequence 必须补充参与者交互与 fresh re-authorization 时序。
- authority direction 固定为：`Owner decisions + Flowkit Policy + OpenSpec + canonical code/tests/Git facts → architecture/reference visualization projection`。若 reference 与 formal facts 冲突，reference stale；`formal facts win`。
- Current 保持 exact pre-03 `main @ 74d46f0920c0dfc6f19b5b264cf9de138f4c2bec`；Planned 保持 original 03 Delivery Start `f132db761bd209e6aff72411108b8e3e1c9801f5` planning provenance。057、104c14cc、9d27efef 都不得取代这两个时间边界。
- `archify-flowkit-review-v3-cn-104c14cc.zip` 与已经 Owner 认可的 preview 仅作为信息密度/交互表达 authoring input；旧包与 preview 不是 authority，若与当前 formal facts 冲突则以 formal facts 为准。
- 扩展 `ArchifyCliAdapter` 的 renderable validate/deliver type，最薄加入 `sequence`；保持 exact managed `archify@2.14.0` identity、无 ambient fallback，不给 workflow/sequence/lifecycle 传 `--repo-root`。Architecture repository evidence 仍只通过显式 `--repo-root` seam。
- 保持 `flowkit architecture render current|planned` 与 mechanical compare 的 Delivery-scoped thin binding；reference 四张图不新增 lifecycle Action/Run。
- 保持 JSON/HTML Git hygiene：`architecture/**/json/**` durable/tracked；`architecture/**/html/**` generated/disposable/default-not-tracked/no freshness authority。
- 扩展 D1 structural tests：不仅验证 renderer PASS，还必须验证 Workflow 的完整 graph structure、Sequence 的关键 participants/messages/authority ordering、Change non-author STOP boundary、Delivery corrective loop/fresh Full Test authorization、archive/checkpoint separation 与 finalization path。
- 保持现有 Verification ownership：reference 四张 JSON 均由 `architecture` module 唯一拥有；CLI 仍由 `cli-diagnostics` 拥有并通过 `flowkit-architecture-assets` capability relation admission；adapter 仍由 `external-tools` 拥有。

## Capabilities

### New Capabilities

- `flowkit-architecture-assets`: 定义四张长期 reference visualization JSON 与 Delivery-scoped Current/Planned Architecture JSON 的分权边界、Workflow+Sequence 互补视角、03 Bootstrap provenance、derived HTML hygiene、thin render/compare behavior、reference staleness rule 与 future-Delivery generic boundary。

### Modified Capabilities

- `flowkit-external-tool-runtime`: exact managed Archify validate/deliver renderable type 以最薄方式增加 `sequence`，同时保留 architecture-only explicit `--repo-root` seam 与 C1 exact identity boundary。
- `flowkit-change-verification-selection`: `tests-architecture` physical closure 必须覆盖四张 reference JSON（Workflow + Sequence）、Current/Planned、Archify sequence type extension 与完整结构回归；expected D1 actualChangeSet 仍形成 matched capability relation。

## Impact

- D1 最终 reference durable JSON：`change-lifecycle.workflow.json`、`change-lifecycle.sequence.json`、`delivery-lifecycle.workflow.json`、`delivery-lifecycle.sequence.json`。
- 旧 failed generation 中的 `delivery-lifecycle.lifecycle.json` 作为 superseded candidate path，在新的 Apply 中删除，不进入最终 D1 durable source。
- Current / Planned 路径与内容边界保持不变；不新增 Actual。
- 影响 `architecture/.gitignore`、`src/architecture/**`、`src/cli/**`、`src/integrations/archify/archify-cli-adapter.ts`、`src/verification/change-selection/**` 与对应 D1/external-tools/verification tests。
- 不新增 Full Test lifecycle durable reference、Dataflow reference、global `system.architecture.json`、SystemArchitectureRef promotion、architecture DB/Registry、HTML freshness ledger、per-Change architecture Action/Run 或 reference-as-Policy。
