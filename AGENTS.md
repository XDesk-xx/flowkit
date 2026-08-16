# AGENTS.md

> 仓库级 Agent 操作约束。
> 正式事实以 Owner 明确输入、Flowkit Policy、OpenSpec、Git、Reviewer Result 和 Verification Result 为准，不依赖聊天记忆。
> 本文件只定义长期稳定的行为与 authority boundary；具体 Change contract、兼容规则和实现细节按需读取当前 artifacts、代码和测试。

## 基本规则

1. 开始正式工作前读取当前事实，并由 Flowkit Policy 确认 legal boundary。
2. Review Verdict 不直接决定 next：
   - `approved` = 当前 reviewed target 可批准；
   - `changes-requested` = 当前 reviewed target 不可批准；
   - 下一 boundary 必须重新由 Policy 计算。
3. 不重新打开已 Checkpoint Change；新问题进入当前合法流程或新的 corrective Change。
4. Author 不自审；Review 必须由独立 Reviewer 完成。
5. Owner authority 不得推断；Apply、Archive、Checkpoint、Delivery Full Test、Finalize 等需要的 Owner decision 必须独立明确。
6. Run / Action 不自动 Commit；普通 Commit 不推进 Flowkit lifecycle，也不自动成为 Checkpoint。
7. 正式 Change artifacts 写入 canonical Git-tracked 路径；`.tmp/**` 只用于可删除 scratch。
8. 不建立第二套流程权威；聊天、Memory、临时文件和辅助工具不能替代正式 authority。
9. 人类可读内容默认简体中文；Action、schema key、enum、CLI/code identifier、path、error code 等保持英文。
10. `AGENTS.md` 不定义 Policy、OpenSpec contract、具体 Change acceptance 或 Owner decision。

## 本地 canonical AI

在正式本地仓库根目录工作时默认 `Execution Context: canonical`。

开始时自行读取：

```text
flowkit status
flowkit next
flowkit doctor
git branch --show-current
git rev-parse HEAD
git status --short
```

并读取 applicable Run、OpenSpec artifacts、Owner decision、Reviewer Result、Verification Result。

- 不要求 Owner 重复提供 GitHub Base、SHA、ZIP、stage 或最新 Review Result。
- Author / Reviewer 不通过 ZIP 传递 candidate。
- 两者可使用同一 working tree，但必须串行，不得同时写仓库。
- 当前 boundary 不属于当前 Role 时 `STOP`。
- snapshot / sandbox / 临时 clone 等才使用 `detached`，并绑定 exact canonical Base。

## 本地 AI：CodeGraph MCP 优先

本节只优化**本地 AI 的代码理解成本**；CodeGraph 不是 Flowkit product dependency，也不是 authority。

正式 authority 永远高于 CodeGraph。代码导航时，如果 CodeGraph MCP 可用且索引对应当前仓库版本，优先：

```text
CodeGraph
→ symbols / callers / dependencies / affected modules / related tests
→ 精确读取相关 source / tests / contract
→ 实施或审查
```

优先用它解决：
- symbol / module 在哪里；
- 谁调用或依赖它；
- 修改影响哪些模块；
- 相关 tests 在哪里；
- Review / revise 应优先读哪些代码。

不要默认全仓递归读取、大范围 grep 后批量读文件或加载整个历史 Run corpus。

CodeGraph **不能**决定 legal Action、Owner authority、OpenSpec compliance、implementation correctness、Review Verdict、blockingAuthority、Verification result 或 Git boundary。

图谱只负责缩小搜索范围；最终判断必须回到真实 source / tests / formal contract。
图谱不可用、过期、无法确认对应当前 HEAD、结果缺失或与源码冲突时，退回 targeted search + exact file reads。
detached 只有图谱能对应 exact Base 时才使用，否则忽略本地图谱。

## Policy / Action

Standard Change Actions 只有：

```text
explore
review-explore
revise-explore
propose
review-propose
revise-propose
apply
review-apply
revise-apply
archive
```

Delivery Full Test、Delivery Finalize、Change Checkpoint 不是 Standard Change Action，也不创建 Standard Run。

Policy 可以返回 Action 之外的 Owner decision、Verification、External、Checkpoint、Blocked 或 Done boundary。

禁止：

```text
approved → 自动继续
changes-requested → 自动 revise
while(next) 自动 Author / Reviewer 循环
```

## Review / Revise

`review` = 完整审查：读取完整 target、全部 applicable contract / acceptance、relevant prior Findings，并独立检查 implementation / tests / verification，尽量一次列全 Blocking Findings。

`revise` = 最小安全修复：只关闭当前 author-owned Blocking Findings 和必要一致性修改；不扩大 scope、不顺手重构、不重做未被 Owner reset 的 approved contract。

- 小修改优先 focused checks；共享契约、公共类型或跨模块影响才扩大 affected checks。
- Review / Revise 不自动运行 Delivery Full Test。
- Reviewer 只写 Reviewer-owned Run / Result，不修改 Author artifacts、production code、tests 或 Manifest，也不替 Owner 授权。

### `changes-requested ≠ revise-required`

```text
blockingAuthority = author | owner | verification | external
```

- 全部 blocker 为 `author` → 对应 `revise-*`。
- 存在任一 non-author blocker → Author `STOP`，等待对应 authority fact，再由 Policy 计算 next。
- non-author 新事实已关闭 blocker且 bytes 不变 → explicit same-stage re-review，不制造 no-op revise。

### Reviewer 输出

```text
结论：
- 处理人：Author / Owner / Verification / External / 无需处理
- Owner 决策：需要 / 不需要
- verdict：approved / changes-requested
- blocking findings：N
- 下一步：精确 lifecycle Action 或 authority boundary
```

随后说明 review chain、prior finding closure、新 findings、independent verification 和 exact next boundary。

### Contract preflight

修改 `explore.md / proposal / design / spec / tasks` 前：
1. 读完整 Finding、required outcome / acceptance 和引用 contract。
2. 枚举同类对象与引用，避免只修点名位置。
3. 优先用 CodeGraph 缩小影响面，再读实际函数、类型、persistence 和 tests。
4. 验证 `create → persist → read → consume` 链路。
5. 排除自引用、循环依赖、不可执行约束和 implementation 冲突。

## Owner Authority / Write-side

- 新 Owner authority 只能来自 Owner 独立明确输入；疑问、讨论、倾向、反问或 Agent 转述不能创造 authority。
- Delivery / Change creation、Owner authorization record、activation 使用当前 Flowkit write-side / Policy 合法入口。
- 不通过 Agent prose、Run 字段或手工 Manifest patch 创造 Owner authority。
- `flowkit owner record` 只记录当前 Policy 请求的同一 decision / target；early / stale authorization 必须拒绝。
- Change dependency 使用正式 `Change.id`；短标签不替代 identity。
- required fields 显式提供；legacy 缺失只按 Reader 定义表达，不猜测或静默回填。
- activation 不是 Formal Action、Run 或 Git boundary。
- Owner Contract Reset 改变 generation 根前提时，不把新 contract 静默混入旧 generation / `revise-*`；旧 approval 不跨 generation 自动生效。

## Lean Run / Result

- Standard Run 只能由 Flowkit preparation / Policy semantics 创建或续接；Agent 不直接选择 concrete Action、Role 或 NNN。
- pending Run 只有 Core-derived execution identity 未漂移时才能继续；semantic drift fail-closed。
- Action Package 只携带当前 Action 必要的 typed target、refs 和 minimal views；不复制整个历史 corpus、专业 authority 正文、聊天 transcript 或 Evidence ledger。
- Result 只提交最小 execution / review / failure descriptor；machine-derived bookkeeping 由 Core 产生。
- `result.json` 是 closed Core-validated schema；ResultRef kind / path / fingerprint 由 Core 派生。
- `pending` 只表示 Run 已开始但无 terminal result，不表示 Action state 或 artifact generation。
- mutable artifact / verification ref 是 point-in-time 记录；后续合法修改不反向使历史 Run 失效。
- 不重复证明 OpenSpec、Git、Verification 或 Reviewer 已拥有的专业事实。

## OpenSpec / Verification / Git

- OpenSpec 拥有 Change contract、artifact lifecycle、structured context、validation、archive semantics；Flowkit 只做 thin integration。
- 不建立第二套 OpenSpec state machine，不通过 filesystem scan 猜 archive success。
- OpenSpec 具体 version compatibility、CLI shape、recovery algorithm从当前 approved contract、代码和 tests 读取，不写死在本文件。
- Change Verification 与 Delivery Full Test 分离；Change 中运行广泛 tests 不自动取得 Delivery Full Test lifecycle 语义。
- Delivery Full Test 必须独立 Owner authorization。
- Archive 关闭 Change；Checkpoint 是 Git persistence / recovery / formal history boundary：`Archive ≠ Checkpoint`。
- 没有合法 authority，不自行 Commit、Checkpoint、Push、切换正式 branch 或 rewrite history。
- 普通 repository-maintenance commit 不自动成为 Flowkit Checkpoint，也不推进 lifecycle。

## 跨平台与文本卫生

- CLI / process 集成覆盖真实 platform launcher 语义。
- Windows `.cmd` / `.bat` / npm-installed CLI 不按 POSIX executable 假设执行；使用正确 launcher / command processor并保留回归测试。
- Reader 按当前 contract 接受合法 working-tree line endings；successful canonical mutation 使用规范化文本。
- Checkpoint 前 `git diff --check`；staging 后 `git diff --cached --check`。
- 新增或生成文本使用 LF、无 trailing whitespace、EOF 恰好一个 newline。
- 纯格式 defect 只做最小 normalization，不借机修改语义。

## 稳定性 / 本地入口

`AGENTS.md` 只保存长期稳定的 repository-level contract。
不使用 `Q1 / A1 / B1 / C1 ...` 等历史 Change 代号作为长期章节名，也不把尚未交付的未来 Change 设计写成当前事实。

Author：

```text
Role: Author
按照仓库 `AGENTS.md` 执行当前合法 Action。
```

Reviewer：

```text
Role: Reviewer
按照仓库 `AGENTS.md` review 当前正式 target。
```

本地 canonical 会话无需重复声明 `canonical`；其余 repository facts 由 Agent 自行读取。
