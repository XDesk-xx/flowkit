## MODIFIED Requirements

### Requirement: 外部工具必须遵守权威边界

OpenSpec MUST拥有 `schema: spec-driven` 所定义的 planning contract graph、其 structured `planningHome/changeRoot/artifactPaths/contextFiles`、Change/spec validation，以及 archive operation内部 relocation/spec sync/terminal result。Flowkit MUST通过 C1 thin adapter消费这些 structured facts，MUST NOT复制 OpenSpec dependency graph、template/instruction state、spec sync或archive state machine。OpenSpec compatibility MUST以 stable `1.7.0` 为minimum baseline且不设固定 minor/major upper bound；version number只允许作为signal，高于baseline的支持必须由Flowkit实际依赖的required structured machine contract conformance决定，prerelease不得因numeric version自动放行。Mutating archive一旦child已经spawn，Flowkit MUST把 OpenSpec structured terminal result 与 post-invocation mutation-surface generation proof联合分类；structured failure本身不证明no mutation，terminal result丢失则属于 `outcome-unknown`。Flowkit MUST NOT把未知/partial-mutation状态伪装成普通failure或扫描filesystem猜测success。为了让该边界跨process/session成立，C1 MUST在spawn前先durable arm当前pending archive的machine-owned recovery guard；该guard只证明“第二次mutation是否可被允许”，不证明OpenSpec success/failure。 Recovery proof MUST只覆盖OpenSpec archive的active Change source、canonical specs与archive collision namespace；Flowkit `.flowkit` guard/control-plane及Git/dependency/build环境 MUST不进入该proof。

Flowkit Author MUST继续拥有 `explore.md` formal fact，Verification authority MUST继续拥有 post-Apply `verification.md` formal fact；二者可位于 OpenSpec resolved `changeRoot`并随目录 archive relocation移动，但 MUST NOT被伪称为 default `spec-driven` artifact graph node。

Git MUST拥有受版本管理文件、Diff和历史。Git Commit MUST NOT等同于续接切点或信息交换媒介。Change Checkpoint和Delivery Final MUST仍是正式Git边界。

Verification工具 MUST拥有原始检查结果。Flowkit MUST只消费标准状态、摘要和结果引用。Delivery Full Test授权 MUST继续由Owner控制，MUST NOT由Adapter、Agent、Skill、OpenSpec或Verification工具自行突破。

Archify MUST只接收Delivery架构上下文并返回架构结果引用。CodeGraph MUST只接收变化范围或查询上下文并返回依赖、影响范围和相关测试上下文。两者 MUST NOT决定Flowkit下一Action或产生最终Review Verdict。

#### Scenario: Git 边界不等于续接切点

- **WHEN** Flowkit判断是否形成续接切点
- **THEN** MUST NOT把Git Commit作为唯一判断条件
- **AND** Git边界 MUST NOT等同于续接切点
- **AND** MUST NOT等同于信息交换媒介

#### Scenario: Change Checkpoint 必须限定到所属 Delivery

- **WHEN** Reader为当前Delivery读取Change Checkpoint Git boundaries
- **THEN** MUST依据Git Delivery Start拓扑只接纳属于当前Delivery的boundary
- **AND** MUST NOT因其他Delivery存在同名 `<change-id>` checkpoint而把它作为当前Delivery的checkpoint fact
- **AND** legacy无`changeId` checkpoint与structured `changeId` checkpoint混合存在时 MUST保持有界兼容，MUST NOT因新增structured boundary让既有legacy checkpointed Change重新变成pending

#### Scenario: Archify 不决定下一 Action

- **WHEN** Archify返回架构结果
- **THEN** Archify MUST NOT决定Flowkit下一Action
- **AND** MUST NOT产生最终Review Verdict

#### Scenario: Verification 工具不突破 Full Test 授权

- **WHEN** Verification工具返回测试结果
- **THEN** Delivery Full Test授权 MUST继续由Owner控制
- **AND** Verification工具 MUST NOT自行触发Full Test

#### Scenario: OpenSpec version number 不成为第二 compatibility authority

- **WHEN** installed OpenSpec stable version高于`1.7.0`
- **THEN** Flowkit MUST NOT仅因固定minor/major upper bound拒绝
- **AND** MUST通过required command/JSON/path/coherence/archive machine contract决定当前surface是否兼容
- **AND**任一required contract不兼容 MUST fail closed
- **AND** prerelease MUST NOT仅因numeric components达到baseline自动获得支持

#### Scenario: OpenSpec planning graph 与非 graph formal facts 分权

- **WHEN** default `spec-driven` Change存在 `proposal/specs/design/tasks` 以及 Flowkit `explore.md`/`verification.md`
- **THEN** OpenSpec MUST只作为前四者的artifact graph authority
- **AND** Explore/Verification MUST继续由Flowkit Author/Verification authority拥有
- **AND** C1 MUST NOT建立custom schema/template copy来重新合并这些authority

#### Scenario: OpenSpec archive success 由 OpenSpec operation 定义

- **WHEN** Change Execution Loop在Flowkit已确认archive Action合法后调用OpenSpec archive
- **AND**本次invocation返回可接纳的OpenSpec structured terminal success
- **AND** post-invocation `OpenSpecArchiveMutationSurfaceV1` 与 stored pre-archive F 不同
- **THEN** OpenSpec MUST自己负责Change directory relocation、spec sync与operation success
- **AND** Flowkit MAY记录该external operation的structured success作为本次Action execution result
- **AND** Flowkit MUST NOT在operation success后通过扫描archive path、重放historical ResultRef或复制spec merge状态再次证明OpenSpec archive

#### Scenario: OpenSpec structured archive failure 必须结合 mutation proof 分类

- **WHEN** mutating archive child已经spawn并返回可接纳structured terminal failure
- **THEN** C1 MUST先durable保存bounded normalized failure terminalObservation
- **AND** C1 MUST重算post-invocation V1
- **AND**只有post V1 exact-match stored F 才 MAY按known-no-persistent-mutation failure普通terminal收口
- **AND**若post V1与F不同 MUST保持同一pending Run与durable recovery gate
- **AND** exact recovery到F后 MUST使用该durable failure observation terminal failed而不是respawn
- **AND** MUST NOT把structured failure本身当作no-mutation proof

#### Scenario: OpenSpec archive outcome unknown 不得被第二权威猜测

- **WHEN** mutating archive invocation已经在spawn前durable写入`armed` recovery guard
- **AND** timeout、transport loss、process crash或malformed/missing terminal machine result使Flowkit无法证明success/failure
- **THEN** C1 MUST保持同一pending archive Run与`armed` guard，并停在external recovery boundary
- **AND**新process/session MUST NOT把它降级为fresh/resumable pending archive
- **AND** MUST NOT通过archive path、active Change absence、spec bytes或retry `change_not_found`推断success
- **AND** MUST NOT自动重试archive
- **AND**只有machine-proven exact OpenSpec mutation-surface generation recovery MAY允许同一Run再次invoke

## REMOVED Requirements

### Requirement: C1 必须不修改 B1 已冻结文档

**Reason**: 该 requirement 使用早期 Delivery 的临时 `B1/C1` stage label作为长期 ownership 名称，当前 02 Delivery 的 C1 已经是 OpenSpec 1.7 thin integration；继续保留会让当前 Change无法合法修改 integration capability 本身。

**Migration**: 用下方 capability/authority-based requirement替代。已 checkpoint 的其它 capability contract仍受保护；真正行为变化必须通过当前 Change的显式 delta spec冻结，不能静默改写。

## ADDED Requirements

### Requirement: Integration capability 不得静默重定义已 checkpoint 的其它 authority contract

OpenSpec integration capability MAY为实现当前已批准 Change修改自身 adapter、相关 path consumer与显式列入本 Change delta的现有 capability requirement，但 MUST NOT仅因实现便利静默重定义已 checkpoint 的 Policy、Owner、Reviewer、Verification、Git或B1 ActionDefinition authority。若行为 contract需要改变，MUST由当前 Change的 proposal/spec/review链显式冻结。

#### Scenario: Integration 实现复用 B1 而不重定义 B1

- **WHEN** C1接入B1 logical Action Package/Result admission
- **THEN** C1 MAY提供OpenSpec structured context与physical mapping
- **AND** MUST NOT修改B1 fixed ActionDefinition、next authority或Reviewer/Owner boundary

#### Scenario: 发现未列入当前 Change 的真实 contract 冲突

- **WHEN** Apply发现必须改变一个未在当前Proposal/Specs声明的已checkpoint behavior contract
- **THEN**当前实现 MUST停止并返回contract drift
- **AND** MUST NOT把该改变静默塞入C1 implementation
