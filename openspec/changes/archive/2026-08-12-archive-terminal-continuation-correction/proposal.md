## Why

D2 已经修通 archive terminal continuation 主链，但 096/097 又暴露了同一 corrective scope 下的两个收口缺口：OpenSpec `MODIFIED` delta 必须保留 canonical checkpoint scenario identity；更关键的是，Owner Contract Reset 后 Policy routing 与 formal preparation 对“当前 contract generation”的判断不一致，导致旧 Proposal/Apply lineage 仍能影响 `stage/next`，而 immutable contract binding 又会正确 fail closed。新的 contract generation 必须从正常 `propose → review-propose → apply → review-apply → archive` 重新建立 currentness。

## What Changes

- 保留 D2 已实现的 archive continuation 修复：future archive entry keyed OpenSpec projection、post-relocation same-Run terminalization、historical 085 bounded recovery、active Change preparation precedence 与 terminal archive checkpoint gate均保持不变。
- 保留 canonical checkpoint scenario identity `Archive 后无 active Change 时进入 Checkpoint 边界`，同时继续要求 matching archive Run 已合法 terminal completed 才允许 checkpoint readiness；不得通过重命名既有 `MODIFIED` scenario 改写 OpenSpec identity。
- 收敛 Contract Reset currentness：Contract Reset 产生新的 **proposal contract generation**。已批准 Explore discovery仍可作为新 Proposal 的输入；旧 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` Runs若未绑定当前完整 reset identity，只能作为 immutable history，不能决定 current stage、current artifact、current lineage、current review、`next`、`canRun` 或 formal preparation binding。
- 统一 Policy 与 B1 preparation 的 reset-aware projection：Proposal stage 的 current producers/reviewers MUST覆盖 `propose/revise-propose/review-propose`，Apply stage MUST覆盖 `apply/revise-apply/review-apply`，Archive stage覆盖 `archive`；这些 actions 一律按同一完整 Contract Reset identity判断 currentness。新 reset 后 first current producer MUST是 `propose`；新 `review-propose` MUST审当前 proposal-stage producer；只有 current review approved并获得新的合法 apply authority后，Apply 才能绑定这一代 review。不得回退到旧 090/091/094/095/097 currentness。
- 将 097 保留为 historical completed Run，但由本次 Owner Contract Reset使其 generation non-current；不得删除、改写或伪造成当前 Apply。
- 不新增 Generation Registry、Generation Manager、supersession database 或通用 generation framework；只修现有 Contract Reset identity 在 stage/lineage/routing/preparation 中的使用一致性。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `flowkit-lean-run-and-action-package`: Contract Reset 后 normal preparation必须从 fresh propose producer开始，并与 Policy 使用同一 reset-currentness；旧 `propose/revise-propose/review-propose/apply/revise-apply/review-apply/archive` lineage不得重新进入 Action Package binding。
- `flowkit-formal-fact-reader-and-persistence`: current reset identity必须把 Proposal/Apply/Archive stage 的全部 producer/reviewer actions（含 `revise-propose` / `revise-apply`）投影为 current 或 historical，同时保留已批准 Explore discovery作为 fresh Proposal input。
- `flowkit-openspec-1-7-thin-integration`: 保留既有 archive continuation / legacy 085 recovery contract，并确保 checkpoint delta继续使用 canonical scenario identity。
- `flowkit-policy-engine`: stage/currentArtifactRun/lineage/current review/next/canRun 必须基于同一 Contract Reset current projection，并覆盖各 stage 的 revise producer；fresh reset contract generation必须回到 `propose`，旧 `090-revise-propose` / `094-revise-apply` 也不得把 stage 或 authority 拉回旧 generation。

## Impact

- 主要新增影响集中在 reset-aware stage/lineage helper、Policy preconditions/next 与 B1 `deriveRunDescriptors` / immutable producer binding；不改变 Standard Action catalog。
- 既有 D2 archive continuation production implementation继续保留；新 Apply只需修 reset-currentness routing consistency及相应 tests/verification，除非 Review发现与新 contract不一致。
- Owner/Reviewer/Verification/OpenSpec/Git authority边界不变；Contract Reset仍只来自 Manifest `ownerDecisions`，Run只携带 bounded Owner fact refs。
