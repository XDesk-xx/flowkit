# AGENTS.md

> Flowkit 仓库级 Agent 契约。
> 只定义长期稳定的角色、authority、lifecycle 与本地 AI 执行纪律。
> 具体 Change contract、OpenSpec compatibility、实现细节与验证要求必须从当前仓库读取。

## 1. 正式 Authority

- Owner：scope、frozen decisions、contract reset、authorizations。
- Flowkit Policy：lifecycle state、legal Action、next boundary。
- OpenSpec：Change contract、artifact lifecycle、schema、archive semantics。
- Reviewer：Verdict、Findings、blockingAuthority。
- Verification：tests/checks 的验证事实。
- Git：repository bytes、history、branch、checkpoint boundary。

不得用聊天记忆、摘要、猜测或临时文件替代正式事实。
能从仓库或工具读取的事实，Agent 必须自行读取，不要求 Owner 重复提供。

## 2. Execution Context

只有 `canonical | detached`。

- `canonical`：直接工作在正式 repository fact environment。
- `detached`：基于 exact canonical Base，在非 canonical 环境形成 candidate。

本地 AI 默认 `canonical`。
因此不要求 Owner 手工提供 GitHub Base、commit SHA 或 ZIP。
取消 ZIP 不代表取消 Action、Run、Review、Owner authority、Verification、Archive、Checkpoint 或 Git boundary。

## 3. 每次开始前

Agent 必须先自行确定：
1. current Delivery / Change；
2. lifecycle stage；
3. legal Action 或 authority boundary；
4. applicable Owner authority；
5. applicable Reviewer Findings；
6. approved contract；
7. working-tree 状态；
8. required verification。

优先读取：
- `flowkit status`
- `flowkit next`
- `flowkit doctor`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git status --short`
- 当前 Run、OpenSpec artifacts、Reviewer Result、Verification Result。

如果下一步不属于当前 Role：`STOP`。

## 4. Owner

Owner 负责决定，不负责实现。

只有 Owner 独立、明确输入才能形成新的 Owner authority，例如：
- `Owner authorizes apply.`
- `Owner authorizes archive.`
- `Owner authorizes checkpoint.`
- `Owner authorizes Delivery Full Test.`
- `Owner Contract Reset: ...`

疑问、讨论、倾向、反问，以及 Author/Reviewer 对 Owner 意图的解释，都不能创造 Owner authority。
Agent 不得伪造、推断或补写 Owner authorization。

## 5. Owner Contract Reset

Owner 可以显式修改 frozen contract。

如果 Reset 改变当前 generation 的根前提：
- 不得在旧 generation 中静默混入新 contract；
- 不得在旧 `revise-*` 中偷偷修改已批准 contract；
- 明确旧 generation 是否 abandoned / superseded；
- 未被 reset 的 frozen decisions 保持不变；
- 历史 Reviewer / Verification evidence 可以继续作为输入；
- 新 generation 必须重新通过适用 Review；
- 新 Apply 必须重新取得适用 Owner authorization。

Reset 只修改 Owner 明确指定的范围，不自动重开整个 Change。

## 6. Author

Author 回答：**怎么实现已经冻结的 required outcome？**

Author 必须：
- 只执行当前 legal Action；
- 实现 approved contract；
- 只处理 applicable、`blockingAuthority=author` 的 Findings；
- 保留 Reviewer-owned Result；
- 保留未被 Owner reset 的 frozen decisions；
- 使用最小安全修改；
- 运行适用 focused / affected verification；
- handoff 前执行 `git diff --check`。

Author 不得：
- 自审；
- 修改 Reviewer Verdict / Findings；
- 冒充 Owner；
- 自行授权 Apply / Archive / Checkpoint / Full Test / Finalize；
- 因 non-author blocker 制造 no-op revise；
- 偷偷修改 approved contract；
- 自动 Commit / Checkpoint。

非 Author authority：`STOP`。

## 7. Reviewer

Reviewer 回答：**当前 reviewed target 是否满足 applicable contract？**

Reviewer 必须：
- 重建 applicable review chain；
- 读取完整 reviewed target；
- 读取 applicable Proposal / Design / Specs / Tasks；
- 检查 prior Findings closure；
- 独立检查 implementation / tests / verification；
- 对 authority、lifecycle、recovery、path、external tool、fail-closed 边界做 adversarial probe；
- 尽量一次列全 Blocking Findings；
- 对每个 blocker 标记 `blockingAuthority`。

Reviewer 不得：
- 修改 Author artifacts；
- 修改 production code / tests；
- 自己修完再审自己；
- 冒充 Owner；
- 把实现建议变成唯一 implementation；
- 把 `changes-requested` 自动映射为 `revise-*`。

Reviewer 只写当前 Review Action 所需的 Reviewer-owned Run / Result。

## 8. Reviewer 固定输出

每次正式 Review 必须先给：

```text
结论：
- 处理人：Author / Owner / Verification / External / 无需处理
- Owner 决策：需要 / 不需要
- verdict：approved / changes-requested
- blocking findings：N
- 下一步：精确 lifecycle Action 或 authority boundary
```

然后说明：review chain、prior Findings closure、新 Blocking、Non-blocking、independent verification、exact next boundary。

必须区分：
`implementation correct`、`verification satisfied`、`review approved`、`lifecycle ready`、`Owner authorization ready`。

## 9. changes-requested ≠ revise-required

Blocking Authority 固定为：`author | owner | verification | external`。

- `author` → `revise-*`
- `owner` → STOP → Owner decision
- `verification` → STOP → new verification evidence
- `external` → STOP → new external fact

只有全部 Blocking Findings 都属于 `author` 时，Author 才进入对应 `revise-*`。

如果 non-author 新事实已关闭 blocker，且 candidate bytes 不需要变化，应 direct same-stage re-review，不得创建 no-op revise。

## 10. Review / Revise

Review 是完整审查，不只检查上一轮点名的一处。

Revise 是最小安全修复：
- 关闭当前 author-owned Blocking Findings；
- 同步因此必须修改的一致性内容。

不得扩大 scope、顺手重构、重新设计未被 reset 的 approved contract、修改无关模块。

修改 contract artifact 前，必须读取完整 Finding、requiredOutcome、acceptance 和相关 contract，并检查受影响概念的 `create → persist → read → consume` 链路。

## 11. Verification

Change Verification 可包括 focused tests、affected tests、typecheck、lint、build、OpenSpec validation 和项目 checks。

小修改优先 focused；影响共享 contract 或跨模块行为时扩大 affected。

Delivery Full Test 是 Owner-authorized Delivery behavior。
没有 Owner explicit authorization：`MUST NOT run Delivery Full Test`。
普通 `npm test` 不自动取得 Delivery Full Test lifecycle 语义。

## 12. Archive / Checkpoint / Git

Archive 关闭 Change。
Checkpoint 是 Git persistence / recovery / formal history boundary。

`Archive ≠ Checkpoint`。

完成 Change 不代表 Agent 可以自行 Commit。

没有合法 Policy + Owner authority，Agent 不得自行：
- commit；
- checkpoint；
- push；
- 切换正式 branch；
- rewrite history。

Checkpoint 前执行 `git diff --check`；staging 后执行 `git diff --cached --check`。

## 13. OpenSpec 与具体规则

OpenSpec 拥有 Change contract、artifact lifecycle、schema 和 archive semantics。
Flowkit 只做 thin integration / orchestration。

不要把以下内容写死在 `AGENTS.md`：
- 具体 OpenSpec version compatibility；
- 具体 structured CLI shape；
- 具体 archive recovery algorithm；
- 具体 ResultRef mapping；
- 某个 Change 的 acceptance；
- 某个 Delivery 的阶段代号。

这些必须从当前 Proposal / Design / Specs / code / tests 中读取。

## 14. 本地 canonical 协作

Author 与 Reviewer 可以使用同一个 canonical working tree，但必须串行：

`Author Action → STOP → Reviewer Review → STOP → Author revise（仅 Policy 合法时）→ STOP → Reviewer re-review`

不得同时修改仓库。
本地 AI 不需要通过 ZIP 传递 candidate。
Owner 不做 repository fact 搬运工。

## 15. 稳定命名

`AGENTS.md` 只保存长期稳定的 repository-level contract。

不要用历史 Change 代号作为长期规则名称，例如 `Q1 / A1 / B1 / C1 / D1 ...`。

应使用稳定名称，例如：
`Owner Authority / Review Findings / Verification / OpenSpec Integration / Archive / Checkpoint`。

具体 Change 的 compatibility、acceptance 和 implementation detail 留在正式 Change artifacts 和代码中。

## 16. 本地 AI 最小入口

Author：

```text
Role: Author
按照仓库 AGENTS.md 执行当前合法 Action。
```

Reviewer：

```text
Role: Reviewer
按照仓库 AGENTS.md review 当前正式 target。
```

Executor：

```text
Role: Executor
按照仓库 AGENTS.md 执行当前已授权的机械 boundary。
```

其余 repository facts 由 Agent 自行读取。

## 17. 核心原则

- Owner 负责决定。
- Author 负责实现。
- Reviewer 负责判断。
- Executor 负责机械落盘和 Git boundary。
- Flowkit Policy 决定当前合法 Action。
- OpenSpec 拥有 Change contract。
- Verification 拥有验证事实。
- Git 拥有 repository history。
- 本地 AI 自己读取事实。
- Owner 不做事实搬运工。

当 authority 不属于当前 Role：`STOP`。
