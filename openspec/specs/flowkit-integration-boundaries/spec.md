# flowkit-integration-boundaries Specification

## Purpose

定义 Flowkit 与 OpenSpec、Git、Reviewer、项目验证工具、Archify、CodeGraph、Skill 和 Adapter 之间的事实权威、逻辑输入输出和权力边界，确保外部系统不会成为第二流程编排器。
## Requirements
### Requirement: Action Package 必须是 Standard Change Action 的逻辑执行输入视图

Action Package MUST是B1生成的 provider-neutral logical execution view，只服务十个 Standard Change Actions。Package MAY对 Apply/Archive等 Change Action引用适用 Owner authorization；Delivery Full Test与Delivery Finalize是Delivery behavior，MUST NOT被表达为B1 Standard Change Action Package或Standard Run。Package中的 OpenSpec、Git、Reviewer、Verification、Owner内容只能是当前执行所需refs/最小view，不得复制成第二 authority。

#### Scenario: Action Package 包含适用 Change Owner 授权状态
- **WHEN** current Standard Change Action为 Apply或Archive且该 Action适用 Owner authorization
- **THEN** Action Package MAY包含对应 Owner authorization ref/minimal view
- **AND** MUST NOT把 Delivery Full Test作为 Standard Change Action Package示例或目标

#### Scenario: 后置 adapter只做 physical mapping
- **WHEN** C1/03 integration或provider adapter消费B1 logical Action Package
- **THEN** adapter MUST只做structured context/physical serialization/execution mapping
- **AND** MUST NOT决定 next Action、重定义 package authority或引入 Delivery behavior Run

### Requirement: Action Result 必须记录发生事实而非决定下一步

Action Result MUST 记录执行状态、结果摘要、产生或更新的正式结果引用、消费的 Findings/授权/输入引用、失败或阻塞诊断（适用时）。Action Result MAY 包含 `nextActionRecommendation`，但它 MUST 只能是建议。

Action Result MUST NOT 自行推进 Change 或 Delivery 状态。Action Result MUST NOT 复制外部工具的完整专业状态。

#### Scenario: Result 不自行推进状态

- **WHEN** 执行者完成 Action 并返回 Action Result
- **THEN** Flowkit MUST 校验并接纳正式事实
- **AND** Policy MUST 重新计算下一 Action
- **AND** Result 中的 `nextActionRecommendation` MUST NOT 替代 Policy

#### Scenario: Result 不复制外部工具状态

- **WHEN** Action 消费了 OpenSpec、Git 或 Verification 工具的输出
- **THEN** Result MUST 只保存摘要和引用
- **AND** MUST NOT 复制外部工具的完整内部状态

### Requirement: ResultRef 必须满足最低引用语义

ResultRef MUST 能唯一识别被引用结果，并让接收方读取或定位结果；MUST NOT 绑定唯一 Provider。ResultRef 的失效语义 MUST 区分**当前 handoff exact binding**与**已结束历史 mutable point-in-time reference**，MUST NOT 把所有 ResultRef 统一解释为 future/current path 永久 immutability。

C1 MUST NOT 把 Git Commit SHA 固定为所有结果引用的唯一形式。具体环境 MAY 把 ResultRef 映射为 Git revision、Run result、artifact version、content hash 或其他不可歧义的正式版本引用。

#### Scenario: ResultRef 不绑定单一 Provider

- **WHEN** 不同环境需要引用同一正式结果
- **THEN** ResultRef MAY 映射为不同具体形式
- **AND** 但 MUST 保持唯一识别和其适用 handoff/point-in-time 语义

#### Scenario: 被引用结果失效

- **WHEN** ResultRef 正被当前 Action 用作 immutable input、review binding 或其他明确的 current handoff binding
- **AND** 该 handoff 所要求保持不变的目标在消费完成前被替换或修改
- **THEN** ResultRef MUST 能判断当前 handoff 已失效
- **AND** 当前 Review/续接/下一 Action MUST fail closed 或重新处理

#### Scenario: 历史 mutable ResultRef 是 point-in-time

- **WHEN** completed historical Run 中的 `produced-artifact` 或 terminal `verification-summary` ResultRef 已不再被当前 Action 作为 handoff 消费
- **AND** 同一 logical current path 在后续合法 lifecycle 中发生修改、替换或 OpenSpec relocation
- **THEN** 该 historical ResultRef MUST 继续表示建立引用时的版本
- **AND** MUST NOT 仅因 future/current path bytes 变化把历史 Review/Run 反向判为失效
- **AND** Flowkit MUST NOT 为此恢复 global generation replay 或 archive-path replay

### Requirement: Continuation Context 必须是生成视图而非状态权威

Continuation Context MUST 定义为从正式事实生成的可恢复视图。Continuation Context MUST NOT 成为新的状态权威。

Continuation Context 至少 MUST 包含：deliveryId、changeId、lastCompletedAction、lastActionResultRef、activeVerdict/Findings、尚未消费的 Non-blocking Findings、有效 owner 授权、当前关键约束、nextAllowedAction、下一 Action 所需输入引用。

`nextAllowedAction` MUST 由 Policy 计算，MUST NOT 由 Continuation Context 自行填写。

#### Scenario: 摘要丢失可重建

- **WHEN** Continuation Context 丢失
- **THEN** 后续执行者 MUST 能从正式事实重新生成 Continuation Context
- **AND** 重新生成的 Context MUST 与正式事实一致

#### Scenario: 摘要与正式事实冲突

- **WHEN** Continuation Context 与正式事实冲突
- **THEN** MUST 以正式事实为准
- **AND** Continuation Context MUST NOT 自行修改 Delivery、Change 或 Action 状态

### Requirement: 续接切点必须是边界语义而非新实体

续接切点 MUST 只定义为：当前阶段已有稳定、可引用的正式结果，并且 Continuation Context 可以从正式事实生成时，形成一个可续接切点。

续接切点 MUST NOT 是新的 Action、Run 类型、领域角色、流程状态、特殊 Commit、GitHub 事件、Push/Pull、PR/MR 或文件传输协议。

是否需要 Commit、文件复制、远端同步或其他操作 MUST 由当前项目环境与 D1 决定，MUST NOT 进入 C1 核心契约。

#### Scenario: 续接不要求特定 Git 操作

- **WHEN** 当前阶段形成稳定正式结果
- **AND** Continuation Context 可以从正式事实生成
- **THEN** 形成可续接切点
- **AND** 该切点 MUST NOT 要求 Commit、Push、Remote 或 PR 作为必要条件

#### Scenario: 续接切点不创建新实体

- **WHEN** 形成续接切点
- **THEN** MUST NOT 创建新的 Action、Run 类型或流程状态
- **AND** MUST NOT 创建特殊 Commit 类型

### Requirement: Review 必须通过 reviewedResultRef 绑定正式结果

Review MUST 通过 `reviewedResultRef` 绑定被审查的正式结果。`reviewedResultRef` MUST 唯一指向被审查的正式结果。

如果被审查结果发生变化，原 Approval MUST 对新结果失效，MUST 重新 Review。

Review 是否有效 MUST NOT 依赖是否使用 GitHub、Remote 或 PR。C1 MUST NOT 把 Git Commit SHA 固定为所有 Review 绑定的唯一形式。

#### Scenario: 被审查结果变化导致 Approval 失效

- **WHEN** Review 已对某结果给出 `approved` Verdict
- **AND** 该结果后来发生变化
- **THEN** 原 Approval MUST 对新结果失效
- **AND** MUST 重新 Review 新结果

#### Scenario: Review 不依赖特定平台

- **WHEN** Review 绑定被审查结果
- **THEN** `reviewedResultRef` MAY 映射为不同具体形式
- **AND** Review 有效性 MUST NOT 依赖 GitHub、Remote 或 PR

### Requirement: Adapter 必须只负责边界转换

Adapter MUST 只负责将 Flowkit Core 的逻辑执行输入呈现给执行者，并将执行者的逻辑 Action Result 传回 Flowkit。

Adapter MUST NOT：判断当前 Action、改写 Change 契约、跳过 Review、将 Non-blocking Finding 自动升级为 Blocking、自行授权 Apply/Archive/Full Test/Finalize、自行创建新的 Change、成为第二个编排器。

C1 MUST NOT 建立 Provider Registry、Adapter Registry 或动态路由平台。

#### Scenario: Adapter 不判断 Action

- **WHEN** Adapter 接收 Flowkit Core 的逻辑执行输入
- **THEN** Adapter MUST 只将其呈现给执行者
- **AND** MUST NOT 自行判断或修改当前 Action

#### Scenario: Adapter 不跳过 Review

- **WHEN** 执行者通过 Adapter 返回 Action Result
- **AND** 该 Action 需要正式 Review
- **THEN** Adapter MUST NOT 跳过 Review
- **AND** MUST NOT 自行判定 Result 已通过

### Requirement: Skill 必须只声明方法类别

Action Package MUST 通过方法类别声明所需 Skill，例如文档分析、契约审查、代码审查、安全审查、性能审查。

C1 MUST NOT 在核心契约中绑定具体 Skill 路径。C1 MUST NOT 绑定具体 Agent（Codex、ChatGPT 等）。C1 MUST NOT 让 Skill 决定流程。C1 MUST NOT 建立 Skill Registry、Router 或 DAG。

具体 Skill 标识 MAY 由项目配置、Adapter 或 Agent 环境解释。

#### Scenario: Skill 不绑定具体标识

- **WHEN** Action Package 声明所需方法类别
- **THEN** MUST 只使用抽象方法类别
- **AND** MUST NOT 绑定具体 Skill 路径或 Agent 标识

#### Scenario: Skill 不决定流程

- **WHEN** Skill 执行其方法
- **THEN** Skill MUST 只在当前 Action 内执行
- **AND** MUST NOT 决定下一 Action 或流程状态

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

### Requirement: Flowkit 必须对信息交换媒介保持中立

Flowkit MUST NOT 把以下任何方式固定为流程前提：GitHub、GitLab 或其他平台；Remote 存在；Push 或 Pull；PR 或 MR；本地或远程执行；一个或多个 AI；ChatGPT、Codex 或其他 Provider；Patch、ZIP 或共享目录；PowerShell、Shell 或特定操作系统；Worktree 数量；Materializer 存在；封闭的 Workspace Capability 枚举；封闭的协作拓扑枚举。

Flowkit MUST 只检查：正式结果可读取、上下文可恢复、Policy 可计算下一 Action。

#### Scenario: 不固定特定平台

- **WHEN** Flowkit 推进流程
- **THEN** MUST NOT 要求 GitHub、GitLab 或特定 Forge 作为前提
- **AND** MUST NOT 要求 Remote、Push 或 PR 作为流程前提

#### Scenario: 不固定执行位置

- **WHEN** 执行者执行 Action
- **THEN** Flowkit MUST NOT 要求本地或远程执行
- **AND** MUST NOT 要求特定 AI Provider
- **AND** MUST NOT 要求特定 Worktree 拓扑

### Requirement: Owner authority record、Run reference 与 Manifest lifecycle 必须保持单一 authority

Owner 独立输入的 formal provenance MUST 由 Delivery Manifest `ownerDecisions` 拥有；Run 只能保存 owner authorization reference/执行上下文，不得复制或创造 authority。Delivery/Change lifecycle state 继续由 Delivery Manifest 拥有，Policy 只消费 Reader projection，write CLI/service 只执行已合法的 mutation。

#### Scenario: Run 与 Owner record 不冲突
- **WHEN** Run action/context 声称 owner authorization explicit
- **BUT** Manifest 中不存在适用 Owner decision record
- **THEN** Policy MUST 不把 Run 文本当成 authorization authority

### Requirement: A1 OpenSpec seam 必须停在 metadata initialization

A1 activation 与 OpenSpec 的集成 MUST 仅创建/验证 target Change minimal `.openspec.yaml` metadata。OpenSpec artifact lifecycle、structured paths/context、validation、archive 与 sync 继续属于 OpenSpec/C1 authority；A1 MUST NOT import OpenSpec runtime 或复制其完整 path/state machine。

#### Scenario: metadata initializer 不拥有 archive
- **WHEN** A1 初始化新 active Change 的 OpenSpec metadata
- **THEN** A1 MUST NOT 创建 proposal/design/specs/tasks 或执行 archive
- **AND** 后续 OpenSpec lifecycle MUST 仍由对应正式 Change Action/C1 integration 处理

### Requirement: legacy missing architectureImpact 不得跨 authority 推断

当 pre-A1 exact legacy Change 缺少 Change-level `architectureImpact` 时，A1 只能表达该事实为 unknown/legacy-missing。Delivery-level `architecture.impact`、OpenSpec prose、Run、Git commit、Change goal/outputs 均不是该缺失 Change-level boolean 的替代 authority，MUST NOT 用于推断或 backfill。

#### Scenario: Delivery architecture impact 不下推到 Change
- **WHEN** Delivery-level `architecture.impact=true`
- **AND** 某 exact pre-A1 legacy Change 缺少 Change-level `architectureImpact`
- **THEN** Reader MUST NOT 推断该 Change 为 `architectureImpact=true`
- **AND** MUST 保持 explicit unknown/legacy-missing

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
