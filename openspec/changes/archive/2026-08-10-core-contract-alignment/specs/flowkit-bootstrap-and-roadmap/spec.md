## MODIFIED Requirements

### Requirement: AGENTS 必须只约束 Agent 行为并保持语言与 Reviewer 边界

仓库级 `AGENTS.md` MUST 只约束 Agent 在正式 Flowkit/OpenSpec/Git/Reviewer/Verification authority 下如何操作，不得成为 next Action、Change contract 或 Owner decision 的第二套 authority。

面向人的说明性内容默认 MUST 使用简体中文；Action 名、schema key、CLI/code identifier、path、error code、enum 等机器/代码标识 MAY 保持英文。

Reviewer MUST 只读审查 reviewed candidate；除 Reviewer-owned Run/Review artifact 外 MUST NOT 修改 Author artifacts、production code、tests 或 Manifest。Reviewer 发现问题 MUST 通过 typed Findings/Verdict 返回。`changes-requested` 只表示 target 不可批准；只有 blocking findings 全部属于 `blockingAuthority=author` 时才交回 Author 执行对应 Revision。owner / verification / external blocker MUST 停在各自 authority boundary，MUST NOT 通过 Author no-op revise 关闭。Reviewer MUST NOT 替 Owner 授权 Archive、Checkpoint、Full Test 或 Finalize。

#### Scenario: AGENTS 不成为流程 authority

- **WHEN** AGENTS 描述 Agent 操作规则
- **THEN** MUST NOT 自己决定唯一下一 Action
- **AND** MUST NOT 覆盖 OpenSpec Change contract
- **AND** MUST NOT 创造 Owner authorization

#### Scenario: 人类可读内容默认简体中文

- **WHEN** Agent 生成 action.md、Explore/Proposal/Design/Tasks 正文、Review summary/Findings 或 verification summary 等人类可读说明
- **THEN** 默认 MUST 使用简体中文
- **AND** 机器/代码标识 MAY 保持英文

#### Scenario: Reviewer mutation 与 blocker authority boundary

- **WHEN** Reviewer 执行 review-*
- **THEN** reviewed candidate MUST 只读
- **AND** Reviewer MAY 写自己的 Review Run/artifact
- **AND** MUST NOT 修改 Author artifact、production code、tests 或 Manifest
- **AND** blocking finding MUST 声明 `blockingAuthority`
- **AND** author-only blocker MAY 进入 Author Revision
- **AND** non-author blocker MUST NOT 机械交回 Author 修复
- **AND** Reviewer MUST NOT 自行授予 Archive、Checkpoint、Full Test 或 Finalize
