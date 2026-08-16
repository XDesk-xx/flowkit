## MODIFIED Requirements

### Requirement: verify:full 必须固定 Full Test Plan 但不能拥有 Owner authorization

`npm run verify:full` MUST 以固定 fail-fast 顺序执行 `quality → typecheck → lint → build → OpenSpec validate --all --strict → test:full`，并记录每项状态与耗时。OpenSpec strict step 与 public `test:full` MUST消费同一个正式 resolved OpenSpec executable authority；在启动 Full Test Node children 前 MUST将该 resolved identity 作为 execution context传播给 required real OpenSpec conformance target。Required real OpenSpec integration suite MUST实际执行，MUST NOT因为 executable context 缺失而 silent-skip/zero-test success。该命令是项目验证工具，不是 Flowkit Full Test Action；执行命令本身 MUST NOT 创建或推断 Owner authorization、`fullTestStatus=passed` 或 Delivery finalization eligibility。

#### Scenario: verify:full 全部通过
- **WHEN** 所有聚合检查成功
- **THEN** command MUST exit 0
- **AND** MUST 提供每项检查 status/duration 摘要

#### Scenario: verify:full 单项失败
- **WHEN** 任一聚合检查失败
- **THEN** command MUST fail non-zero
- **AND** MUST fail-fast 或明确标记后续未运行检查

#### Scenario: 未获 Owner 授权时项目命令不创造 Full Test fact
- **WHEN** Author/Reviewer 在 Change 内为了诊断或 F1 自身验收执行 `npm run verify:full`
- **AND** Flowkit 尚未进入 Owner-authorized Delivery Full Test Action
- **THEN** 该执行 MUST 只作为项目 verification evidence
- **AND** MUST NOT 自动更新 Delivery `fullTestStatus` 或绕过 Owner boundary

#### Scenario: real OpenSpec conformance 不得 silent skip
- **WHEN** frozen Full Test Plan包含 required real OpenSpec integration coverage
- **THEN** public `test:full` MUST向该 physical suite传播正式 resolved OpenSpec executable identity并真实执行 required cases
- **AND** executable resolution failure或 real-target failing sentinel MUST使 verification command non-zero
- **AND** zero-test/suite-skip MUST NOT满足 Full Test Plan
