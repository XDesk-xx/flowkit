# AGENTS.md

> 仓库级 Agent 操作约束。正式事实以当前 OpenSpec、Flowkit 状态、Git、
> Reviewer 结果和项目验证工具为准，不依赖聊天记忆推断。

## 基本规则

1. 执行 Action 前先读取当前正式事实，并由 Flowkit Policy 确认合法 Action。
2. 不重新打开已 Checkpoint Change；新问题通过当前合法流程或新的 corrective Change 处理。
3. `approved` 才向前推进；`changes-requested` 只表示当前 target 不可批准。只有 blocking findings 全部属于 `blockingAuthority=author` 时才执行对应 `revise-*`；存在任一 `owner / verification / external` blocker 时 Author revise 不合法。
4. Author 不自审；Review 必须由独立 Reviewer 完成。
5. Full Test、Archive、Checkpoint、Finalize 等 owner 边界不得自行授权。
6. Run / Action 不自动 Commit；普通 Commit 不推进 Flowkit 状态。
7. 正式 Change artifacts 必须写入其 canonical Git-tracked 路径；`.tmp/**` 只用于可删除 scratch。
8. 不建立第二套流程权威；不使用聊天、Memory、临时文件替代正式事实。
9. 人类可读内容默认使用简体中文；Action 名、schema key、enum、CLI/code identifier、path、error code 等机器标识保持英文。
10. `AGENTS.md` 只约束 Agent 操作方式，不定义 Policy、OpenSpec contract 或 owner 决策。

## Review / Revise

- `review` = **完整审查**：一次检查当前阶段全部适用契约和验收条件，尽量一次列全 Blocking Findings。
- `revise` = **最小安全修复**：只修当前 Blocking Findings，不扩大 scope，不顺手重构。
- 分析范围可以完整，实际修改范围必须最小。
- 小修改执行 focused checks；只有影响共享契约、公共类型或跨模块行为时才扩大到 affected checks。
- Review / Revise 不自动运行 Delivery Full Test。
- Reviewer 是只读审查者：只写 Reviewer-owned Run / Review artifact，不修改 Author artifacts、生产代码、测试或 Manifest；`changes-requested` 后必须按 `blockingAuthority` 分流：author-only 才交回 Author 修正，存在任一 non-author blocker 时停在对应 authority boundary。显式 same-stage re-review 在 Policy 层保持合法，但不得由 `next()` 自动触发。
- Reviewer 不替 owner 授权 Apply、Archive、Checkpoint、Full Test 或 Finalize。

### 契约修改 preflight

修改 `explore.md / proposal / design / spec` 前：

1. 完整读取 Finding、required resolution 和其引用的正式契约。
2. 枚举该问题涉及的全部同类对象和引用位置，避免只修 Reviewer 点名的一处。
3. 验证设计可实现：
   - 读取涉及的实际函数、类型和持久化约束；
   - 追踪 create → persist → read → consume 的完整数据流；
   - 排除自引用、循环依赖、不可执行约束和与现有实现冲突的假设。
4. 修改后只对受影响概念做一致性检查。

## 跨平台与文本卫生

- CLI / process 集成测试必须覆盖真实的平台 launcher 语义。Windows 下的 `.cmd` / `.bat` 不能默认按 POSIX 普通 executable 处理；调用 npm-installed CLI 或脚本时必须使用 Windows 可执行的 launcher 路径/command processor，并保留对应回归测试。
- Change Checkpoint 前必须执行 whitespace preflight：工作区检查使用 `git diff --check`；进入 checkpoint 暂存后必须再执行 `git diff --cached --check`。新增或生成的文本 artifact 不得包含 trailing whitespace 或 EOF 多余空白行；纯格式 defect 只做最小 normalization，不得借机修改 artifact 语义。

## 原则

能由 Core、类型、Policy、Git 或验证工具确定的事实，
不要要求 Agent 手工维护或重复证明。

- Run `result.json` 是 closed Core-validated schema；Agent 不得手工填写 `blockingFindings`、`verification[]`、`consistencyScan` 等重型 bookkeeping 字段。
- 所有 ResultRef（kind / path / fingerprint）由 Core 从真实目标派生；Agent 只提供必要的 typed target descriptor（如 `consumedRunId` / `reviewedRunId`），不手工构造 ResultRef。
- `pending` 只表示 Run 已开始但尚无 terminal result；不得把它解释为 Action 状态、revision window 或 artifact generation。
- 当前 Action 正在消费的 handoff ref 可以 exact-bind；已经完成的 mutable artifact / verification ref 只是 point-in-time 记录，后续合法修改不得反向使历史 Run 失效。
- 不为了“更安全”重复证明 OpenSpec、Git、Verification 或 Reviewer 已经拥有的事实；跨 authority 新增校验前必须证明它直接关系到当前 Action 的安全流转。

## B1 Lean Run / Action Package

- Standard Run 只能通过 B1 bounded preparation semantics 创建/续接：normal `next` 或 explicit unified `review`；不得由 Agent 直接选择 concrete Action、Role 或 NNN。
- pending Run 的 execution identity 是 runId + Core-derived `semanticInputFingerprint`。Action/Role/contract-handoff-review-verification-Owner authority identity 未变化才继续同一 Run；input drift 必须 fail-closed。
- 十个 Standard Change Actions 使用固定 compile-time ActionDefinition；Delivery Full Test / Finalize / Checkpoint 不进入 Standard Run 或 B1 Action Package。
- Action Package 只携带当前执行需要的 refs/minimal views；不得复制整个历史 Run corpus、专业 authority 正文、provider/chat transcript 或 Evidence ledger。
- logical Action Result 只能提交最小执行/Review/failure descriptor；所有 ResultRef/kind/path/fingerprint 继续由 Core `completeRun()` 派生。
- Delivery Manifest runtime 必须同时接受纯 LF/纯 CRLF working-tree input，successful mutation canonical write LF；不得要求 Windows 用户先手工换行。

## A1 Write-side 与 Owner Provenance

- 正常的新 Delivery/Change creation、authorization-only Owner record 与 Change activation 必须通过 Flowkit A1 write-side；不得再用 Agent prose、Run `ownerAuthorization` 或手工 Manifest patch 创造新的 Owner authority。
- Delivery Manifest `dependsOn` 统一使用 `Change.id`；`Change.key` 只用于短标签/展示。
- A1 write-side 新建 Change 必须显式提供并持久化 boolean `architectureImpact`。Base `448fa042de86d07e893bcc51da528f93eb7ced3a` 之前冻结的 3 个 Delivery / 21 个 exact Change.id 缺失该字段时只允许 Reader 表达 `pre-a1-legacy-missing`，不得猜 true/false 或回填。
- `flowkit owner record` 只允许当前 Policy 正在请求的同一 authorization decision/target；early/stale authorization 必须拒绝并保持 Manifest 不变。
- activation 不是 Formal Action、Run 或 Git boundary；成功 activation 只形成最小 OpenSpec metadata、Owner provenance 和 `planned → active`。
