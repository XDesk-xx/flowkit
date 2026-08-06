# Action

- Delivery: `20260805-01-product-baseline`
- Change key: `E1`
- Change ID: `baseline-finalization-corrections`
- Action: `revise-explore`
- Role: `author`

## Goal

根据 043-review-explore 的 2 个 Blocking Findings 和 1 个 Non-blocking Finding 修正 explore.md。

## Source Review

- Review Run: `20260806-043-review-explore`
- Verdict: `changes-requested`

## Findings addressed

### E1-RE-001（Blocking）：旧 D1 Reference 删除没有对应的现存输入

`ref/d1-bootstrap-and-roadmap-reference.md` 不存在。移除该文件作为 E1 修正项。

修正：
- 移除 §2.5（旧 D1 Reference 需要替换）
- 移除 §4.5（E. 替换旧 Reference）
- 移除 Q5（旧 D1 Reference 何时删除？）
- 更新 §10.3：ref/ 内容的删除由 owner 决定，E1 不自动删除
- §5 不包含范围新增：删除 ref/ 内容（由 owner 决定）
- 章节和问题重新编号

### E1-RE-002（Blocking）：E1 Manifest outputs 漏列 Delivery Manifest 本身

Manifest 是 E1 的实际受控输出。加入 `openspec/delivery-groups/20260805-01-product-baseline.yaml` 到 E1 outputs。

修正：
- Manifest E1 outputs 新增 Delivery Manifest 文件
- explore.md §4.3 明确 Manifest 是 E1 受控输出

### E1-RE-003（Non-blocking）：§4.2 行号 L123 与 §2.2 不一致

§2.2 和原始文件均为 L127，但 §4.2 写为 L123。

修正：§4.2 统一为 L127。

## Prohibited work

- 不修改 042-explore 和 043-review-explore Run（terminal）
- 不创建 Proposal / Spec / Tasks
- 不运行 Full Test
- 不自动 Git Commit

## Required output

- explore.md 已修正
- Manifest E1 outputs 已更新
- 本 Run 的 `result.json`
- 下一 Action 为 `review-explore`
