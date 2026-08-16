## MODIFIED Requirements

### Requirement: Checkpoint handoff 必须绑定 exact Owner authorization 且不执行 Git mutation

在 current Policy 请求 `authorize-checkpoint` 且 Owner 已写入 exact Delivery/Change target 的合法 `authorize-checkpoint` record 后，Flowkit MAY生成 deterministic checkpoint handoff。Handoff MUST包含 canonical checkpoint subject、`Flowkit-Delivery`、`Flowkit-Change`、`Flowkit-Boundary: change-checkpoint` 与 matching `Owner-Authorization` ref，并 MUST要求正式 Git boundary 前执行 `git diff --check`、暂存后执行 `git diff --cached --check`。

同一个 exact `authorize-checkpoint` Owner authorization MUST同时覆盖 approved Explore Proof 5 已证明、deterministic 且严格 bounded 的 EOF-only hygiene mechanics；对于 current candidate/archive 已触及的 text files，Executor MAY折叠 redundant EOF blank lines并确保 exactly one final newline。该机械 normalization MUST NOT要求第二次 Owner business authorization，但 MUST在之后重新通过 `git diff --check` / staged `git diff --cached --check`。任何 trailing spaces/tabs cleanup、Markdown reflow、internal whitespace rewrite、semantic text mutation、unrelated-file mutation或 broad formatter execution均不属于该 authority，遇到时 MUST fail closed。

Flowkit handoff MUST NOT执行 `git commit`、`git push`、merge/rebase，MUST NOT持久化第二份 checkpoint state，也 MUST NOT创建 Standard Run。Git Commit与push仍由授权后的 Executor/Git workflow机械完成。

#### Scenario: Owner authorization 后生成 handoff

- **WHEN** completed-uncheckpointed Change 是唯一 checkpoint target
- **AND** matching `authorize-checkpoint` Owner fact 已合法存在
- **THEN** Flowkit MAY输出 `chore(flowkit): checkpoint <change-id>` 与 exact formal trailers/preflight requirements
- **AND** 输出 MUST绑定同一 Delivery、Change 与 Owner ref
- **AND** MUST NOT自动形成 Git commit或push

#### Scenario: Handoff target 或 Owner fact 不唯一

- **WHEN** checkpoint target、Owner authorization或其 Delivery/Change binding 缺失、冲突或歧义
- **THEN** handoff MUST fail closed
- **AND** MUST NOT执行任何 Git mutation

#### Scenario: bounded checkpoint whitespace normalization 不需要第二次 Owner 授权
- **WHEN** matching exact `authorize-checkpoint` Owner fact 已存在
- **AND** `git diff --check` finding 仅来自 current candidate/archive touched text files 的 redundant EOF blank lines / final-newline state
- **THEN** Executor MAY在同一 checkpoint mechanics authority 下做 bounded deterministic normalization
- **AND** MUST重新执行 required Git diff preflight
- **AND** MUST NOT要求仅为该 whitespace-only机械动作再次取得 Owner authorization

#### Scenario: 超出 bounded normalization 必须停止
- **WHEN** checkpoint hygiene 需要 trailing spaces/tabs cleanup、broad formatter、Markdown reflow、internal formatting、semantic content change或 unrelated-file mutation
- **THEN** 当前 checkpoint mechanics authority MUST NOT覆盖该修改
- **AND** Executor MUST fail closed 并等待新的合法 authority
