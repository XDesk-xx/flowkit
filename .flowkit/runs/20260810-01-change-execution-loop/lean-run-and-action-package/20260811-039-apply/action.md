# Action: apply

- Run: `20260811-039-apply`
- Delivery: `20260810-01-change-execution-loop`
- Change: `B1 lean-run-and-action-package`
- Action: `apply`
- Role: `author`
- Execution Context: `detached`
- GitHub Base: `da4eeb6a7e3787a44ea17fcff8b8ef08f9e05de1`
- Reviewed Proposal: `20260811-038-review-propose`
- Owner authorization: explicit (owner:ba3febcb579af60a6e979b119b1067f083daab25df7c45707595e0ecd8f0c26f)

## 目标

实现 037 冻结并由 038 approved 的 B1 Lean Run / Action Package / Action Result admission contract。

## Allowed work

- fixed ActionDefinition catalog 与领域 schema；
- 唯一 Run preparation/resume/new-instance surface；
- Delivery-wide Run ID 与低层 defense-in-depth；
- semanticInputFingerprint；
- logical ActionPackage 与 result admission；
- bounded CRLF Manifest compatibility；
- affected canonical docs/specs、tests 与 Change Verification。

## Prohibited work

- 不重新打开 Proposal/Design decisions；
- 不实现 C1/D1/E1/F1/G1/03 scope；
- 不引入 Registry/Router/Evidence/provider session store；
- 不自动 Commit/Push/Checkpoint；
- 不运行 Delivery Full Test。
