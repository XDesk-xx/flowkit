# Action: revise-apply

- Run: `20260806-177-revise-apply`
- Delivery: `20260806-01-deterministic-core`
- Change: `E1 diagnostic-cli`
- Role: author
- Execution Context: detached
- GitHub Base identity: `5fe8a0b096564052e41418e726962b5a35b9d423`
- Source Review: `20260806-176-review-apply`（`changes-requested`）
- Blocking Finding: `E1-RA-001`（author-actionable）

## 目标

修正 176 发现的真实 package bin process surface 缺陷，并对 E1 本轮新增/修改的 CLI、Reader projection、Policy Verification gate 与相关测试做一次同类路径检查，避免只修测试绕过点而遗漏相同入口问题。

## 本次修复

- 为 `src/bin/flowkit.ts` 增加 `#!/usr/bin/env node`，确保 `tsc` 输出的 `dist/bin/flowkit.js` 可作为 npm `bin.flowkit` 直接执行；
- 扩展 process-level regression，真实执行 `npm run build → npm pack → local npm install → node_modules/.bin/flowkit`；
- 至少覆盖安装后 `flowkit --version` 与 `flowkit status` 的启动、exit/stdout/stderr contract；
- 更新当前 E1 `verification.md`，记录 176 Finding、真实 package bin 回归和最新 affected checks；
- 同类路径检查只覆盖 E1 当前 Change 触及的新增/修改 surface，不借机重写与 Finding 无关的旧 Core。

## 约束

- 不修改已批准的 Proposal / Design / delta specs；
- 不修改 Reviewer-owned 176 artifacts；
- 不修改 Delivery `fullTestStatus`；
- 不执行 Archive、Checkpoint、Commit 或 Push；
- `npm test` 属于 affected Change Verification，不是 Delivery Full Test；
- 本轮不访问 GitHub。
