# Tasks: C1 — OpenSpec 1.7 Thin Integration

> 064 generation reset：旧 062 Apply generation 已终止。本 Tasks 重新从 planning contract 表达待实现工作；061 未被 Owner reset 的 frozen decisions继续有效，063 findings作为已知 acceptance 输入。此文件不表示旧 062 production bytes继续存在。

## 1. External command mechanics

- [x] 1.1 为 `src/shared/external-command.ts` 实现 bounded timeout、spawn-error 与 process diagnostics，同时保持既有 stdout/stderr/exitCode compatibility。
- [x] 1.2 增加 production Windows `.cmd/.bat` launcher resolution，并覆盖 `ComSpec` / non-Windows regression。

## 2. OpenSpec typed adapter and compatibility conformance

- [x] 2.1 新增/收口 `src/integrations/openspec/**` typed contracts与 `OpenSpecCliAdapter`，实现 version/context/doctor/status/instructions/apply/validate/archive 固定 machine command surface；不提供 generic passthrough。
- [x] 2.2 实现 Owner-reset compatibility contract：stable `1.7.0` 为 minimum baseline、无固定 minor/major upper bound；below-baseline/malformed fail closed；prerelease不得由numeric version自动放行；stable higher version必须按 required command/JSON/path/coherence/archive machine-contract conformance admission。
- [x] 2.3 实现 repo-local planningHome/actionContext admission；unsupported store/root mode返回稳定 machine error。
- [x] 2.4 为 higher stable version conformance 增加 compatible/incompatible structured fixture：证明 `1.8.0`/更高版本不被版本号机械拒绝，同时任何 required machine contract drift都 fail closed。

## 3. Structured path and artifact authority

- [x] 3.1 实现 absolute OpenSpec physical path → contained repo-relative logical ref转换，containment必须 symlink-safe/realpath-safe 或等价 machine proof；拒绝 lexical-only escape/alias。
- [x] 3.2 将 Apply `changeDir` 与 current requested Change 的 validated structured root exact-bind；`changeName`相等不得替代 root identity proof。
- [x] 3.3 固定 planning artifacts `proposal/specs/design/tasks`只消费 OpenSpec `artifactPaths/contextFiles`；proposal/design/tasks singleton必须拒绝 duplicate resolved/existing、跨artifact alias/conflict与不唯一 identity。
- [x] 3.4 固定 `explore.md` / `verification.md`为 validated `changeRoot` 下 Flowkit/Verification-owned formal files，且不调用 OpenSpec artifact instructions。

## 4. Existing Core/B1 integration and C1 self-bootstrap

- [x] 4.1 将 FormalFactReader / ResultRef resolver / Run persistence 需要的 planning paths迁移到 C1 normalized structured view，不建立第二 OpenSpec graph。
- [x] 4.2 将 Propose/Revise-Propose 的 status artifactPaths + required planning artifact instructions、Apply/Revise-Apply 的 exact contextFiles + progress/state 接入 **production** preparation/execution view；不得只调用 adapter后丢弃。该 OpenSpecActionContext 或等价薄 view必须参与 pending Run semantic input drift protection，同时保持 B1 fixed ActionDefinition/Policy/ResultRef authority。
- [x] 4.3 扩展 A1 pre-activation/activation request contract：C1 checkpoint后新 Change activation显式提供 `specDeltaMode: required | skip`，activation据此写 `skip_specs: true` 或普通 spec-driven metadata；不新增Manifest副本字段；current C1 metadata不迁移，当前 Delivery exact D1–G1缺省仅作 bounded `required` compatibility。
- [x] 4.4 修复 current C1 self-archive bootstrap activation seam：global structured Reader不得仅因canonical C1 capability spec出现就启用；在 OpenSpec已merge canonical spec + relocate C1 changeRoot、Manifest仍active的窗口，status/doctor/archive result admission必须可继续并最终完成C1，不查询已relocated active C1，也不扫描filesystem猜archive success。

## 5. Validation and archive

- [x] 5.1 在 Propose/Revise-Propose terminal与 Apply/Revise-Apply preparation接入 OpenSpec strict validation，并实现 requested-item identity + exit/status/item validity coherence admission：`valid=true + nonzero exit`、`valid=true + error status`及其它矛盾shape必须 fail closed；合法`valid=false` structured issues仍可消费。
- [x] 5.2 实现 OpenSpec archive structured handoff/result parser：`change/archivedAs/path/specsUpdated`为必需，`totals`为条件可选；present时严格校验，skip_specs合法 success不得因缺 totals被拒绝。
- [x] 5.3 实现 mutating archive **post-spawn terminal-result × post-V1 matrix**：spawn前先atomic arm并保存F；spawn后任何terminal/Change completed/retry决定前重算post V1。`success+drift`才接纳success；`success+same` fail closed；`failure+same`才是known-no-persistent-mutation；可接纳terminal result先durable写 normalized terminalObservation；`failure+drift`进入recovery-required并在exact restore后从同一observation terminal failed、不得respawn；无可接纳terminal observation时same/drift都outcome-unknown。
- [x] 5.4 扩展 pending archive `ContextFile`/persistence：仅允许 machine-owned `archiveMutationGuard` 子字段原子 compare-and-set；支持bounded normalized `terminalObservation`在structured result后、分类前 durable publish；entry identity fields保持 immutable，guard/observation不进入 B1 semantic fingerprint或V1；prepare/inspect/admission共享该 recovery gate。
- [x] 5.5 实现 `OpenSpecArchiveMutationSurfaceV1`：只 hash validated active `changeRoot` 全树、repo-local canonical `openspec/specs/**` 全树、`changes/archive` immediate child name/type collision namespace；明确排除 `.flowkit/.git/node_modules/dist` 与其它无关 repo 环境。Guard 持久化前后 fingerprint MUST 相等；`armed` 只有 current V1 exact-match stored generation 才能转为`recovery-admitted`，下一 invocation spawn前再次转回`armed`并复核。

## 6. Canonical alignment

- [x] 6.1 更新 integration/fact-persistence/A1/runtime canonical specs与必要 docs，使用 capability/authority 名称清理历史 `B1/C1` stage wording，并同步新的 no-upper-bound compatibility contract。
- [x] 6.2 确认不修改 B1 static ActionDefinition、Reviewer/Owner authority、Delivery Full Test/Finalize no-Run、Git checkpoint boundary。

## 7. Verification / 063 finding acceptance

- [x] 7.1 baseline fixture：用 stable OpenSpec 1.7.0真实 CLI覆盖 status、artifact instructions、apply contextFiles/progress/state、strict validate，以及有delta archive success（totals present）与 `skip_specs:true` zero-delta archive success（totals absent）。
- [x] 7.2 compatibility fixture：覆盖 stable 1.7.0 accepted；below-baseline/malformed rejected；`1.7.0-beta.1`等 prerelease不自动支持；`1.8.0`/higher stable compatible structured surface accepted；higher-version required contract drift rejected。**不得再把 `1.8.0 → reject` 作为 acceptance。**
- [x] 7.3 覆盖 wrong requested Change context、symlink escape/alias、repo-root containment、duplicate resolved/existing singleton、cross-artifact ambiguity/conflict。（关闭 `C1-RA-003`）
- [x] 7.4 覆盖 validation coherence：`valid=true + exitCode!=0`、`valid=true + error status`、requested item/status identity冲突必须fail closed；合法invalid structured result保留diagnosis且B1不得继续。（关闭 `C1-RA-004`）
- [x] 7.5 覆盖 production Action-specific consumption：Propose/Revise-Propose真实取得 planning artifact instructions；Apply/Revise-Apply真实取得 exact contextFiles + progress/state；这些facts参与same-Run semantic drift proof且不存在dead adapter API。（关闭 `C1-RA-005`）
- [x] 7.6 覆盖 current C1 self-archive sequence：canonical C1 spec已merge、active changeRoot已relocate、Manifest仍active时 `status/doctor` 与 archive result admission/recovery仍可工作；不得查询已relocated active C1，不得respawn。（关闭 `C1-RA-001`）
- [x] 7.7 覆盖 durable archive recovery与完整二维终态矩阵：arm写入 `.flowkit` guard前后 V1 proof完全相同；`structured success + drift`成功、`success + same` mismatch fail closed、`structured failure + same`普通失败、真实/等价 `archive_target_exists` after canonical spec writes + drift 必须durable failure observation + recovery-required，exact restore后terminal failed且不得respawn；无terminal result在same/drift两种情况下都outcome-unknown；跨process/session不得直接retry；`.git/node_modules/dist/unrelated repo` drift不得改变 proof；只有无terminalObservation的outcome-unknown exact恢复后才可`recovery-admitted`并由同一Run再次arm/spawn；retry not-found不得当success。
- [x] 7.8 覆盖 default spec-driven authority split、A1 `specDeltaMode` future metadata/legacy D1–G1 boundary、B1 package/ResultRef integration。
- [x] 7.9 增加 proposal-level disposable stable OpenSpec 1.7.0 archive preflight，证明全部 MODIFIED requirements在 real archive merge中保留 canonical scenarios；不能只依赖 `validate --strict`。
- [x] 7.10 运行 focused + affected Change Verification、typecheck、lint、build、quality、OpenSpec strict；Delivery Full Test保持 not-run。
- [x] 7.11 关闭 `C1-RA-006`：stable SemVer admission 对 build metadata 使用非空 dot-separated identifiers；拒绝 leading/trailing/consecutive empty identifiers（如 `+..`、`+.abc`、`+abc.`、`+abc..def`），同时保留 valid build metadata、no fixed upper bound 与 prerelease fail-closed。
