## Why

当前 Change execution 同时存在两类时间边界缺口：Apply / revise-apply 的 immutable entry identity 不能预先包含 action 后才产生的 candidate 与 verification facts；而 caller timeout 后若重试 Policy `next`，又可能在旧 Run 晚完成后误创建下一 Action generation。重复 OpenSpec 子进程和 Windows process-tree 取消不完整进一步放大了该 race，因此必须在实现 Change Verification 前统一修复事实时间域与 persisted Run lifecycle。

## What Changes

- 分离 Standard Action 的 immutable entry facts 与 Core-owned post-action observations；typed allowed-mutation declaration 只约束允许范围，不充当最终 candidate manifest。
- **BREAKING**：new Run context writer 使用 v5，ActionPackage 使用 v2；historical context v2/v3/v4 与 ActionPackage v1 按各自 closed contract 保持 immutable、read-only，并通过显式 compatibility matrix 处理。
- 将 Policy-owned `next | review` new execution intents 与 `resumeRun(expectedRunId)` 分离；explicit review 继续支持 non-author blocker 后的 same-stage direct re-review，任何 pending continuation 只允许 exact resume。Run id / NNN 只由 Core 分配并通过 durable preparation receipt 返回。
- timeout / transport interruption 表达为 `outcome-unknown`；Apply/revise-apply admission 统一按 post-action observation → deterministic `verification.md` → immutable record commit marker → terminal CAS-last 收口，exact replay 不能推进 generation。
- 为 Windows 外部命令实现 bounded process-tree cancellation；无法证明完整终止时保持 durable `outcome-unknown`，不得宣称 writer 已停止。
- 为单次 formal operation 建立 bounded OpenSpec projection，复用 version/status/action instructions，并在 post-action admission boundary 重新读取，避免重复调用造成持续 timeout。
- Core 以 canonical Git base → post-action state 派生最终 candidate 的 normalized `create` / `modify` / `delete` actualChangeSet，并以 persisted entry → post-action state 单独验证本次 Action observed mutations 是否落在 declaration 内；第一版不把 heuristic rename detection 作为 authoritative primitive。
- 增加 source-controlled closed module map，以 unique path ownership、reverse dependency consumer closure 和 structured OpenSpec affected capabilities 确定性生成 ordered minimal focused/affected verificationScope。
- Core 发布独立 immutable per-Run verification-selection record，并由同一 writer 生成 canonical `verification.md`；current lineage exact-check current bytes，historical record/result 保持 point-in-time binding，不受后续合法 revise-apply 更新反向影响。Author terminal result 不得注入最终 path、fingerprint、change kind 或 verification scope。
- 保留 `recoverContractResetPendingRun` 的 narrow reset-only 语义，不增加 generic cancellation、generation manager、新 Standard Action 或 history rewrite。
- E1 以 v5 fixture / integration Run 做 bootstrap verification；G1 保留 Change CLI、full Change E2E、checkout/resume recovery validation、Run/package size、focused/affected timing 和 review convergence observations，只消费 E1 primitives。

## Capabilities

### New Capabilities

- `flowkit-change-verification-selection`: 定义 Core-owned actualChangeSet、module/capability selection、immutable verification-selection record 与 canonical Change Verification projection。

### Modified Capabilities

- `flowkit-core-model`: 定义 entry-time 与 post-action facts 的 authority boundary、canonical mutation primitives 和无 exclusive writer 时的能力限制。
- `flowkit-lean-run-and-action-package`: 保留 Policy-owned bounded `next | review` new execution intents，增加 exact target Run resume、terminal replay idempotency、timeout outcome 语义，以及 ActionPackage v1 → v2 compatibility。
- `flowkit-formal-fact-reader-and-persistence`: 增加 context v5、persisted entry identity、post-action record 与 historical v2/v3/v4 immutable readers。
- `flowkit-policy-engine`: 保持 Policy-first new Action selection，并禁止 exact retry 通过 `next` 改选或推进 Action。
- `flowkit-openspec-1-7-thin-integration`: 增加 operation-scoped structured projection、调用去重与 post-action refresh contract。
- `flowkit-runtime-foundation`: 增加 Windows process-tree cancellation 与无法确认终止时的 fail-closed outcome contract。

## Impact

影响 Run/context/ActionPackage serialization、B1 preparation/admission/recovery、formal fact reader、Policy preconditions、OpenSpec adapter、external command launcher、Git entry/post observation、module map、Change Verification selection/writer、`verification.md`、unit/integration fixtures 与 bootstrap documentation。E1 不新增 Change CLI surface；G1 继续拥有 CLI/E2E/recovery validation 和 observation outputs。当前 E1 Runs 仍是 v4 bootstrap evidence，不能宣称为 canonical v5 dogfood。
