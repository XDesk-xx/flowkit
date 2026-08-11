## MODIFIED Requirements

### Requirement: A1 OpenSpec integration 必须限制为 minimal initializer

A1 activation MUST只创建/验证 target Change minimal `.openspec.yaml` metadata，并 MUST NOT import/vendor OpenSpec runtime，也 MUST NOT在A1实现planningHome、artifactPaths、contextFiles、status/instructions、validation或archive adapter。完整OpenSpec 1.7 thin integration属于 `flowkit-openspec-1-7-thin-integration` capability。

C1 checkpoint之后新创建的 Change MUST在 pre-activation/activation request 中显式提供 `specDeltaMode: required | skip`。该值不需要建立第二个Manifest字段；activation成功后 `.openspec.yaml` 即成为该OpenSpec metadata事实的authority。Activation MUST按该 activation-time declaration写入：

```text
specDeltaMode = required
→ schema: spec-driven
→ created: YYYY-MM-DD

specDeltaMode = skip
→ schema: spec-driven
→ created: YYYY-MM-DD
→ skip_specs: true
```

A1 MUST NOT从goal、outputs、后续Proposal正文或spec文件数量猜测该值，也 MUST NOT在Propose/Revise-Propose期间silent rewrite metadata。若activation因partial retry发现`.openspec.yaml`已经存在，requested `specDeltaMode` MUST与既有metadata语义精确一致，否则fail closed。Activation完成后 `.openspec.yaml` 是当前 OpenSpec metadata authority。

Current C1已经以`schema: spec-driven`激活并被Review/Run semantic binding，C1实现 MUST NOT retroactively silent-migrate该metadata。为保证当前Delivery在C1 checkpoint后继续推进，C1 checkpoint前已经存在的 exact planned D1–G1 identities MAY省略 `specDeltaMode`，并仅在该bounded set中解释为`required`；不得形成未来通用default。

#### Scenario: activation 不调用完整 OpenSpec adapter

- **WHEN** A1激活一个planned Change
- **THEN**只允许依据已持久化的creation/pre-activation contract初始化minimal OpenSpec metadata
- **AND** MUST NOT执行OpenSpec archive、spec sync、validation或artifact path orchestration

#### Scenario: current C1 metadata 不被回写迁移

- **WHEN** C1自身已经以`schema: spec-driven`进入Explore/Review/Propose generation
- **THEN** C1 MUST保持该`.openspec.yaml` generation直到Change archive
- **AND** MUST NOT因新adapter、zero-delta支持或future metadata contract改写current C1 metadata

#### Scenario: future non-zero-delta Change metadata

- **WHEN** C1 checkpoint之后新Change activation显式提供`specDeltaMode=required`
- **THEN** activation metadata MUST包含`schema: spec-driven`与`created`
- **AND** MUST NOT写入`skip_specs: true`

#### Scenario: future zero-delta Change metadata

- **WHEN** C1 checkpoint之后新Change activation显式提供`specDeltaMode=skip`
- **THEN** activation metadata MUST包含`schema: spec-driven`、`created`与`skip_specs: true`
- **AND** Change MUST可以进入OpenSpec 1.7合法zero-delta lifecycle而无需Propose修改metadata

#### Scenario: new Change missing zero-delta declaration 被提前拒绝

- **WHEN** C1 checkpoint之后新Change activation request缺少`specDeltaMode`
- **THEN** pre-activation/activation MUST fail closed
- **AND** MUST NOT等到active/propose后才通过OpenSpec validation暴露不可修复metadata dead-end

#### Scenario: 当前 Delivery 既有 planned Change 使用 bounded compatibility

- **WHEN** Change identity恰为当前Delivery在C1 checkpoint前已经存在的 D1、E1、F1 或 G1
- **AND**activation request未显式提供`specDeltaMode`
- **THEN** A1 MAY仅对该exact bounded set解释为`required`
- **AND** MUST NOT把缺省`false`扩展到C1 checkpoint后新创建的Change
