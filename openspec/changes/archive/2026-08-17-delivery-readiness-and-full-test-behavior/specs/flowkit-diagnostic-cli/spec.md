## MODIFIED Requirements

### Requirement: next 必须完整、确定地呈现 PolicyResult

`flowkit next` MUST 对共享 snapshot 调用现有 Policy `next`，并以确定格式呈现 `action`、`owner-decision`、`delivery-behavior` 或 `blocked`。CLI MUST NOT 重写 Policy decision tree，也 MUST NOT 因诊断便利将 `blocked` 自动转换为 Action。

`kind=action` MUST 只输出：

```text
kind: action
action: <FormalAction>
```

`kind=owner-decision` MUST 按以下固定顺序输出全部 context fields；缺失值 MUST 为 `none`：

```text
kind: owner-decision
decision: <OwnerDecision>
context-change: <changeKey | none>
context-eligible-changes: <eligibleChangeKeys | none>
context-full-test: <deliveryFullTestStatus | none>
context-detail: <detail | none>
```

`context-eligible-changes` MUST 保留 Policy 提供的原顺序。

`kind=delivery-behavior` MUST 按以下固定顺序输出；A1 当前只允许 `behavior=full-test`：

```text
kind: delivery-behavior
behavior: full-test
context-full-test: <deliveryFullTestStatus>
context-detail: <detail | none>
```

该输出只呈现 Policy boundary，MUST NOT 执行 Full Test。

`kind=blocked` MUST 按以下固定顺序输出：

```text
kind: blocked
reason: <BlockedReason>
unmet: <unmetPreconditions | none>
conflicts: <count>
conflict[0]: dimension=<dimension>; authority=<authority>; message=<message>
...
owner-actions: <suggestedOwnerActions | none>
```

`unmetPreconditions` 与 `suggestedOwnerActions` MUST 保留 Policy 原顺序。`conflict[i]` MUST 保留 `dimension / authority / message`，并按 `(dimension, authority, message)` 升序排序后编号。CLI MUST NOT 丢弃 owner-decision context 或 blocked conflict diagnosis。Q1 新增的 `non-author-review-blocker`、`delivery-behavior-not-implemented` 与 A1 `full-test-execution-outcome-unknown` MUST 作为普通 `BlockedReason` 通过同一格式稳定呈现；CLI MUST NOT 为二者新增独立 decision branch，也 MUST NOT 把它们转换为 `review-*`、`full-test` 或 `delivery-finalize` Action。

#### Scenario: next 返回 action

- **WHEN** Policy `next(snapshot)` 返回 `kind=action`
- **THEN** CLI MUST 输出 `kind` 与该 action
- **AND** MUST NOT 执行该 action

#### Scenario: next 返回带 context 的 owner-decision

- **WHEN** Policy 返回 `kind=owner-decision`
- **THEN** CLI MUST 输出 owner decision 类型
- **AND** MUST 输出 `context-change / context-eligible-changes / context-full-test / context-detail`
- **AND** 不适用的 context field MUST 输出 `none`
- **AND** MUST NOT 替 Owner 记录 authorization

#### Scenario: activate-change owner-decision 保留候选上下文

- **WHEN** Policy 返回 `decision=activate-change`
- **AND** context 携带 `changeKey` 与 `eligibleChangeKeys`
- **THEN** stdout MUST 包含对应 `context-change`
- **AND** MUST 包含对应 `context-eligible-changes`
- **AND** 相同 PolicyResult MUST 产生 byte-stable 输出

#### Scenario: next 返回 Delivery behavior

- **WHEN** Policy 返回 `kind=delivery-behavior, behavior=full-test`
- **THEN** CLI MUST 输出 `kind / behavior / context-full-test / context-detail`
- **AND** MUST NOT 因 `flowkit next` 执行 `npm run verify:full`、修改 Manifest 或创建 Run

#### Scenario: next 返回带 conflicts 的 blocked

- **WHEN** Policy 返回 `kind=blocked`
- **AND** diagnosis 包含一个或多个 conflicts
- **THEN** CLI MUST 输出 blocked reason、unmet、conflict count 与每个 conflict 的 dimension/authority/message
- **AND** MUST 输出 suggested owner actions 或 `none`
- **AND** blocked MUST 被视为合法诊断结果而不是自动 repair 信号

#### Scenario: Q1 新 blocked reason 只做稳定呈现

- **WHEN** Policy 返回 `reason=non-author-review-blocker` 或仍适用于未实现 Delivery behavior（例如 F1 前 Finalize）的 `reason=delivery-behavior-not-implemented`
- **THEN** `flowkit next` MUST 使用既有 `kind=blocked` 格式原样输出该 reason
- **AND** MUST 保留 Policy 提供的 unmet/conflicts/owner-actions
- **AND** CLI MUST NOT 自行选择 direct re-review、Author revise、Delivery Full Test 或 Delivery Finalize

#### Scenario: outcome-unknown execution blocker 只做稳定只读呈现

- **WHEN** Policy 因 current Full Test `executionBlock.reason=outcome-unknown` 返回 `reason=full-test-execution-outcome-unknown`
- **THEN** `flowkit next` MUST 使用既有 `kind=blocked` 格式原样输出该 reason
- **AND** `status/doctor/resume-context` MUST 保持同一 fail-closed diagnosis 语义
- **AND** diagnostics MUST NOT 清除 blocker、重试 Full Test、写 Manifest 或生成 Verification `failed`/`resultRef`
