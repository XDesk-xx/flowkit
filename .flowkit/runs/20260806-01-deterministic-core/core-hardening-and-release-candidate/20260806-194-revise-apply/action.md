# Action: revise-apply

- Run: `20260806-194-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `F1 core-hardening-and-release-candidate`
- Role: author
- Execution Context: detached
- Base identity: `efc045b31d55bed65b3ba4ae5793d884fdd127e7`
- Source Review: `20260806-193-review-apply`

## 目标

关闭 193 的 author-actionable public `verify:full` reliability blocker。独立分析完整聚合路径的资源与进程生命周期，修复 final full step 在前置步骤之后无法稳定获得 terminal result 的问题；保持 188 已批准的 fixed order、fail-fast、full-set equivalence、status+duration 与 authority boundary。

## 边界

- Reviewer 的实现方向仅作为 non-binding example；Author 自行选择满足 acceptance 的最小实现；
- 允许修改 F1 verification tooling、直接相关测试与 verification evidence；
- 不修改 F1 Proposal/Design/Spec/Tasks contract，除非实现发现批准 contract 本身不可满足；
- 不运行或记录 Delivery Full Test，不 Archive、不 Checkpoint、不 Commit/Push；
- 面向人的说明默认简体中文。
