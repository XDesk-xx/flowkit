## ADDED Requirements

### Requirement: Standard Action 必须分离 entry 与 post-action facts

Standard Action entry contract MUST 只包含当时可知的 immutable inputs。对 `apply` / `revise-apply`，这些 inputs MUST 包含 canonical base、persisted entry workspace identity、Policy-first typed allowed-mutation declaration、applicable contract / Owner facts 与 semantic input fingerprint。最终 actual changes 与 verification facts MUST 只属于 post-action Core-owned authority，MUST NOT 回填 immutable entry context。

#### Scenario: Action 产生 declaration 范围内输出

- **WHEN** Action 在 persisted typed allowed-mutation declaration 范围内产生 post-entry output
- **THEN** entry semantic identity MUST 保持 immutable
- **AND** Core MUST 在 post-action record 中观察并分类实际输出

### Requirement: mutation declaration 必须来自 approved Design authority

对 `apply` / `revise-apply`，Core MUST 在 Policy 选择 Action 后，从 matching `review-propose` approved current Proposal bundle 的唯一 closed `flowkitMutationScope` block 派生同名 Action entry。declaration MUST 是有限、非空且可决定性匹配的允许范围，不是 candidate manifest；caller、executor 与 terminal result MUST NOT 提供、替换、合并或扩大它。

#### Scenario: Design declaration 无效

- **WHEN** approved Design 缺失对应 Action entry，或 selector 为空、非 normalized、包含 repository root/glob、重复、重叠或无法唯一归属
- **THEN** preparation MUST fail closed
- **AND** MUST NOT 使用 ActionDefinition、manifest outputs 或 caller paths 作为 fallback

### Requirement: workspace observation 不得伪造写入来源证明

若系统没有 exclusive worktree / lease authority，Core MUST 将 actualChangeSet 解释为 base/entry/post path 与 bytes 的观察结果，而非特定 actor 的来源证明。

#### Scenario: declared root 内出现 observed mutation

- **WHEN** Core 仅拥有 persisted snapshots 与 content fingerprints
- **THEN** Core MUST NOT 声称 hash 能证明 mutation 来源
- **AND** contract MUST 保留 single-writer bootstrap requirement 或明确的 authority limitation
