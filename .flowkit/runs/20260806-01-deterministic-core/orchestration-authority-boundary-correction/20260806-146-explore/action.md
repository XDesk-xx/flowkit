# Action: explore

- Run: `20260806-146-explore`
- Delivery: `20260806-01-deterministic-core`
- Change: `Q2 orchestration-authority-boundary-correction`
- Role: author
- Execution Context: detached
- Owner authorization: explicit（Owner 明确废弃旧 Q2 detached generation `run-authority-boundary-correction` 146–160，并要求从同一 Base 重新实现 Q2）
- GitHub Base: `6fe05c4cd28ebbdb6abf3640057a30bc01b1332d`

## 目标

重新调查 Q1 之后 Flowkit 的 authority 边界，避免再次通过增加 guard、generation、resolver 或历史 replay 来“提高安全性”而扩大 Flowkit 职责。

本 Explore 只回答：

1. Flowkit 为安全推进当前 Action 真正需要拥有哪些最小事实；
2. 哪些现有 Reader / Run / ResultRef / completion 规则在重复解释 OpenSpec、Git、Reviewer 或 Verification 的事实；
3. `pending` 等状态是否被错误提升为 Action/artifact lifecycle 语义；
4. OpenSpec `archive` 与 Flowkit `archive` Action 的职责边界应如何调查；
5. canonical specs、docs、AGENTS、production/tests 中哪些应 keep / clarify / remove。

## Owner 已冻结的前提

- Flowkit 是 thin orchestration authority，不是其他 authority 的二次证明系统；
- `One fact, one authority`：OpenSpec 管 Change contract/archive，Git 管 bytes/history/checkpoint，Reviewer 管 Findings/Verdict，Verification 管检查结果；
- Run 是 lightweight execution envelope，只保存当前执行与必要交接事实；
- `pending` 只属于 RunStatus，表示该 Run 尚未 terminal；Action 本身没有 `pending` 状态；
- 默认不新增机制；只有证明“不做会导致当前 Action 流转错误”时才允许增加；
- 旧 Q2 `run-authority-boundary-correction` 146–160 整代 abandoned，不继承其 Proposal、Review 或 Apply lineage。

## 约束

- 本 Action 只产出新的 Q2 `explore.md`、Change activation 和 146 Run；
- 不创建 Proposal / Design / Tasks / delta specs；
- 不修改生产代码、测试、canonical specs、AGENTS 或 docs；
- 不修改 Q1 archived artifacts 或历史 Runs；
- 不重新实现 OpenSpec archive，不增加 archive-aware resolver；
- 不运行 Delivery Full Test，不 checkpoint，不进入 propose；
- 任何潜在修复都只记录为待 Proposal 证明的候选，不在 Explore 阶段冻结实现。
