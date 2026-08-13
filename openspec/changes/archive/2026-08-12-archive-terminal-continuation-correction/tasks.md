## 1. Contract Reset currentness routing

- [x] 1.1 建立bounded reset-aware lifecycle projection：approved Explore保持可复用；Proposal stage `propose/revise-propose/review-propose`、Apply stage `apply/revise-apply/review-apply` 与 Archive `archive` currentness只接受current完整 Contract Reset identity。
- [x] 1.2 让stage detection、`currentArtifactRun`、Policy `next/canRun`、preconditions/unified entry与B1 `deriveRunDescriptors`共用同一projection；明确 `revise-propose` / `revise-apply` 与同stage base producer使用同一reset filter，并移除会回退all historical lineage的路径。
- [x] 1.3 让immutable proposal producer selection与Action Package binding使用current proposal generation，确保旧090/091/094/095/097不能跨reset成为current artifact/review/authority。

## 2. Archive-sync contract identity preservation

- [x] 2.1 保持`Archive 后无 active Change 时进入 Checkpoint 边界` canonical scenario identity，同时保留matching archive Run terminal completed后才允许checkpoint的新语义。
- [x] 2.2 真实OpenSpec 1.7 strict/archive probe确认MODIFIED delta不会再因scenario identity丢失而拒绝sync。

## 3. Regression / verification

- [x] 3.1 增加096→Contract Reset→fresh propose routing regression，证明status/next/doctor/preparation一致且旧090-revise-propose、094-revise-apply、097-apply只保留历史，不能成为Current Artifact。
- [x] 3.2 增加new propose→review-propose→apply→revise-apply/review-apply binding regression，证明各stage producer/reviewer只消费current reset identity，不继承090/091/094/095。
- [x] 3.3 重跑D2既有archive continuation、future real OpenSpec lifecycle、historical085 recovery与checkpoint gate focused/affected regressions。
- [x] 3.4 执行适用Change Verification：focused/affected、typecheck、lint、build、quality、OpenSpec strict；不得自动运行Delivery Full Test。
