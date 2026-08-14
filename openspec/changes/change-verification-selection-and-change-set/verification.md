# Change Verification

<!-- flowkit-change-verification-status: passed -->

> Bootstrap verification：本 Change 的正式 Apply Run `20260814-118-apply` 使用历史 context v4，不能作为 context v5 / ActionPackage v2 dogfood evidence。v5 模型由 disposable Git-backed integration fixture 验证；首个 canonical v5 dogfood 将由后续 Change 的正常 Apply 入口产生。

## 已执行验证

- `npm run typecheck`：通过。
- `node --test --import tsx tests/unit/verification/change-selection/*.test.ts tests/unit/facts/formal-fact-reader-e1-verification.test.ts tests/unit/integrations/openspec-cli-adapter.test.ts tests/unit/external-command.test.ts`：49/49 通过。
- `node --test --import tsx tests/unit/services/b1-run-execution-service.test.ts`：32/32 通过。
- `node --test --import tsx tests/integration/e1-change-verification-selection.test.ts`：通过；覆盖 disposable Git base、entry/post snapshot、actualChangeSet、selection、Markdown/immutable record binding 与 replay validation。
- `npx openspec validate change-verification-selection-and-change-set --strict`：通过。
- `npm run quality`：通过，0 hard failures。
- `npm run test:full`：719/719 通过，0 failures。

## 边界

验证证明 E1 的 schema migration、exact resume、operation projection、Windows timeout `outcome-unknown` fallback、post-action selection/publication primitives 与 bootstrap fixture。它不宣称可由 hash 证明 writer attribution，也不把本 v4 Run 改写为 v5 evidence。
