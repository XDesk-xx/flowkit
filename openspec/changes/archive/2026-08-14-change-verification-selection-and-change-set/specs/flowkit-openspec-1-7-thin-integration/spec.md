## ADDED Requirements

### Requirement: formal operation 必须共享 bounded OpenSpec projection

单次 formal read/preparation operation MUST 使用一个 bounded immutable OpenSpec projection，复用已验证的 version、requested Change status 与 action-specific instructions/validation。相同 operation 内 artifacts、tasks、verification、contract refs 与 action context MUST NOT 为同一 authority 重复启动等价 version/status 调用。

#### Scenario: Proposal preparation 读取多个 artifacts

- **WHEN** 同一 preparation 需要 proposal、specs、design 与 tasks instructions
- **THEN** adapter MUST 复用同一个 validated Change status projection
- **AND** invocation-count contract MUST 能被 focused test 验证

### Requirement: post-action admission 必须刷新 OpenSpec authority

operation-scoped projection MUST 只在一个 formal operation 内复用。post-action admission 或后续独立 diagnostic MUST 新建 projection 并重新读取当前 OpenSpec authority，MUST NOT 跨 mutation boundary 使用 entry cache。

#### Scenario: artifacts 在 entry 后变化

- **WHEN** Action 合法修改 OpenSpec artifacts 后进入 terminal admission
- **THEN** Core MUST 使用新的 post-action OpenSpec projection
- **AND** MUST NOT 以 entry-time status/instructions 代替 current authority

### Requirement: affected capabilities 必须来自 structured delta paths

verification selection MUST 从当前 Change structured `artifactPaths.specs` 对应的 delta specs 提取 capability ids/refs，MUST NOT 通过自由文本、目录猜测或 caller 参数确定 affected capabilities。

#### Scenario: structured capability 与 module relation 不匹配

- **WHEN** structured delta capability missing、unknown、stale 或无法与 relevant modules 唯一关联
- **THEN** verification selection MUST fail closed
