# Proposal: C1 — OpenSpec 1.7 Thin Integration

## Why

当前 Flowkit 已能完整准备/恢复 Standard Change Run，但 OpenSpec 仍由 Bootstrap 人工调用，且 Core 多处直接拥有 `openspec/changes/<changeId>/**` 的 physical path 假设。真实 OpenSpec 1.7.0 probe 同时证明：CLI 已提供足够的 structured `status/instructions/validate/archive` authority，而默认 `spec-driven` graph 只管理 `proposal/specs/design/tasks`，与 Flowkit 的 `explore.md` / `verification.md` formal facts 存在必须显式解决的 authority split。

061 `review-propose` 已批准 C1 Proposal，但 062 Apply 后的 063 independent review 暴露 5 个实现/acceptance blocker。Owner 随后对 **OpenSpec compatibility contract** 做窄范围 reset，因此旧 062 Apply generation 被终止，本 Proposal 作为新的 planning generation：不重新 Explore，不重开 061 中未被 reset 的 frozen decisions，只吸收 063 的有效技术 evidence，并按 Owner 新 compatibility authority 重写版本兼容条款。

## What Changes

- 新增 production OpenSpec thin integration：仅通过外部 CLI 的 JSON machine surface 调用 `version/context/doctor/status/instructions/validate/archive`，不 import/vendor OpenSpec internals。
- 冻结新的 OpenSpec compatibility contract：
  - minimum supported baseline = stable `1.7.0`；
  - 不设置固定 minor / major version upper bound；
  - prerelease 不得仅因数值达到 `1.7.0` 自动获得支持，C1 未冻结 prerelease conformance fixture，因此默认 fail closed；
  - 高于 baseline 的 stable OpenSpec 版本，是否可被 Flowkit 使用由 **Flowkit 实际依赖的 structured machine contract conformance** 决定，而不是由 version number 单独决定；
  - required commands、JSON shape、path semantics、requested-Change identity、exit/result coherence、validation semantics、archive terminal/mutation semantics 任一不兼容时 MUST fail closed；
  - version number 仅是 compatibility signal，不是 compatibility authority。
- 冻结 **default `spec-driven` authority split**，不采用 experimental project-local custom schema：
  - OpenSpec artifact graph 拥有 `proposal/specs/design/tasks`；
  - Flowkit Author 拥有 `explore.md` formal fact，但它不是 OpenSpec graph node；
  - Verification authority 拥有 post-Apply `verification.md` formal fact，也不是 OpenSpec graph node；
  - 两者都位于 OpenSpec structured `changeRoot` 下，并随 OpenSpec archive 对整个 Change directory 的 relocation 一起移动。
- current C1 与 future Changes 都继续使用 `schema: spec-driven`；当前 C1 `.openspec.yaml` 不迁移。C1 checkpoint 后新创建的 Change MUST 在 pre-activation/activation request 中显式声明 `specDeltaMode: required | skip`：`required` 时 activation 写 minimal `schema + created`，`skip` 时额外写 `skip_specs: true`。该声明不得延后到 Propose。当前 Delivery 中 C1 前已存在的 exact planned D1–G1 作为 bounded legacy 缺省为 `required`，不建立未来通用默认。
- 将 planning artifact path/context resolution 从 Core hardcoded `openspec/changes/<id>/**` 收缩到 OpenSpec structured `planningHome/changeRoot/artifactPaths/contextFiles`；Flowkit-owned `explore.md` / `verification.md` 只允许在已验证 `changeRoot` 下派生。
- structured path admission 必须同时证明 **requested Change identity + physical containment identity + artifact singleton identity**：Apply `changeDir` 必须绑定当前 requested Change 的 validated root；repo/planning/change containment 必须 symlink-safe/realpath-safe 或具等价 machine proof；proposal/design/tasks 等 singleton artifact 必须拒绝 duplicate/resolved/existing/跨 artifact 冲突与 alias ambiguity。
- 为 Standard Change Actions 冻结最小 OpenSpec consumption：Explore 使用 validated `changeRoot`；Propose/Revise-Propose 真实消费 status artifact paths + planning artifact instructions；Apply/Revise-Apply 真实消费 `instructions apply` 的 exact `contextFiles + progress/state`；Review 继续审查 B1 ResultRef-bound target；Archive 只消费 OpenSpec archive structured operation result。该 Action-specific structured view 必须由 production preparation/execution caller 可取得并参与 same-Run semantic drift protection，不能停留为 dead adapter API；同时不改变 B1 static ActionDefinition / Policy authority。
- Change planning contract 在进入 terminal Propose/Revise-Propose 与 Apply 前使用 OpenSpec strict validation。Validation admission 必须检查 `process exit + top-level structured status + requested item.valid/issues` coherence：合法 invalid Change 可被结构化解析，但 `valid=true + nonzero exit`、`valid=true + error status` 或其它互相矛盾的组合必须 fail closed，B1 不得继续执行。
- C1 self-archive bootstrap seam 必须显式处理 OpenSpec 先 merge canonical spec、再 relocate active changeRoot、而 Flowkit Manifest 尚未从 active→completed 的窗口。Future structured Reader activation 不得只以 canonical capability spec 文件出现为条件；当前 C1 必须能在 relocation 后继续从 durable archive terminal observation / recovery facts接纳同一次 archive result并关闭 Change，而不能再去查询已被 OpenSpec move 掉的 active Change。
- Archive terminal classification 继续使用 061 已批准的 **durable structured terminal observation × post-invocation `OpenSpecArchiveMutationSurfaceV1` equality** 二维判定。Child spawn 前先 durable arm并保存 pre-archive fingerprint `F`；child 已 spawn 后，任何可接纳 structured terminal success/failure先持久化 normalized terminal observation，再重算 post V1 分类。`success + drift` 才可接纳 known success；`success + same` terminal mismatch；`failure + same` 才是 known-no-persistent-mutation failure；`failure + drift` recovery-required，exact恢复到F后必须使用同一 durable failure observation terminal failed且不得 respawn；只有完全无可接纳 terminal observation 的 outcome-unknown 才在 exact recovery 后允许 same-Run retry。
- production external-command seam 增加 bounded timeout、spawn-error 与 Windows `.cmd/.bat` launcher handling，供 OpenSpec adapter 复用，不建立 generic Executor/Provider Registry。
- 清理 canonical integration spec 中历史 `B1/C1` stage-name ownership wording，改用 capability/authority 表达。

## 063 Finding Closure Contract

- `C1-RA-001`：保留；由 self-archive bootstrap activation seam + regression 关闭。
- `C1-RA-002`：技术 evidence 保留，但旧 `<1.8.0` / `1.8.0 → reject` acceptance 已被 Owner reset；改为 stable baseline `1.7.0` + prerelease fail-closed + higher-version machine-contract conformance。
- `C1-RA-003`：保留；由 requested-Change exact binding、real physical containment、singleton/alias ambiguity rejection 关闭。
- `C1-RA-004`：保留；由 validation process/result/status coherence admission 关闭。
- `C1-RA-005`：保留；由 production Action-specific structured execution view与调用链测试关闭。

## Capabilities

### New Capabilities

- `flowkit-openspec-1-7-thin-integration`: 定义以 stable 1.7.0 为 minimum baseline 的 OpenSpec external CLI compatibility/conformance、repo-local structured context/path normalization、artifact authority split、Action-specific consumption、validation coherence 与 archive operation/recovery contract。

### Modified Capabilities

- `flowkit-integration-boundaries`: 冻结 OpenSpec structured CLI / planning-artifact authority 与 Flowkit Explore/Verification authority split，并移除历史 `B1/C1` stage-name ownership wording。
- `flowkit-formal-fact-reader-and-persistence`: ResultRef resolver / Reader 对 planning artifact path 改为消费 C1 normalized structured view；Explore/Verification 仅从 validated `changeRoot` 派生；新增 C1 self-archive bootstrap-safe Reader activation seam；为 pending archive `context.json` 增加唯一 machine-owned mutable `archiveMutationGuard` 子字段与原子 compare-and-set persistence，entry identity字段继续不可改写。
- `flowkit-delivery-change-creation-and-owner-input`: 将 future Change 的 `specDeltaMode` activation-time declaration 与 metadata 映射冻结为 minimal OpenSpec seam；支持 zero-delta Change，但不让 A1承担 full adapter/schema lifecycle。
- `flowkit-runtime-foundation`: external-command 基础 seam 增加 bounded timeout、spawn-error 与 Windows command launcher contract，同时保持 external CLI 而非 runtime dependency。

## Impact

- **主要 production surface**：`src/integrations/openspec/**`、`src/shared/external-command.ts`、OpenSpec path consumers in facts/persistence/B1/A1 integration seams。
- **主要 tests**：stable 1.7.0 baseline、higher stable compatible/incompatible machine surfaces、prerelease/malformed version、structured JSON parser、requested-Change/root/realpath/symlink/singleton identity、validation exit/status/item coherence、Action-specific production consumption、C1 self-archive bootstrap window、archive success/failure/`outcome-unknown` recovery、post-spawn terminal-result × mutation-surface matrix、跨 process/session durable guard 与 exact OpenSpec mutation-surface recovery proof，以及 proposal-level disposable archive preflight。
- **canonical docs/specs**：integration boundaries、formal fact/persistence、A1 metadata seam、runtime foundation；只修真实 authority/path drift。
- **不修改 current C1 metadata**：`openspec/changes/openspec-1-7-thin-integration/.openspec.yaml` 在本 Change 继续 `schema: spec-driven`。
- **不引入**：fixed upper-bound version gate、custom schema/template copy、OpenSpec npm runtime dependency、Store Registry、第二 Policy、第二 archive/spec merge engine、stable Agent runtime、自动 Commit/Push、Delivery Full Test。
