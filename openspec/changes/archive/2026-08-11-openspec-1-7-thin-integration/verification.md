# Verification: C1 — openspec-1-7-thin-integration

<!-- flowkit-change-verification-status: passed -->

本记录属于 067 review-apply 后的 068 revise-apply generation C1 Change Verification。OpenSpec 继续拥有 Change contract/artifact/archive authority；Flowkit 仅消费经 C1 typed conformance admission 的固定 machine surfaces。即使 affected 覆盖较广，也不取得 Delivery Full Test lifecycle 语义。

## 1. 执行边界

```text
Role: Author
Execution Context: detached
GitHub Base: 338aec5bcb3ea3216ebb25d3ae8a306b3ebd456f
Revise-Apply Run: 20260812-068-revise-apply
Source Review: 20260812-067-review-apply (changes-requested, 1 author blocking finding: C1-RA-006)
Reviewed Proposal: 20260812-065-review-propose (approved, 0 blocking findings)
Owner Apply authorization: owner:85410ab288ab01ba934a5d5c2f7f9a14e5ba4af7b6c9d441b87b15599e7c75e4
OpenSpec baseline runtime: stable 1.7.0
platform: linux x64
Node: v22.16.0
```

本次仅关闭 067 的 Author blocker；不进入新的 `review-apply`、`archive`、Change Checkpoint 或 Delivery Full Test。

## 2. Owner-reset compatibility acceptance

已验证的新 contract：

```text
minimum supported baseline = stable 1.7.0
fixed minor/major upper bound = none
prerelease = not admitted by numeric version alone
higher stable release = admitted only while required structured machine contracts conform
version number = compatibility signal, not sole compatibility authority
```

Unit fixtures 覆盖：

- stable `1.7.0 / 1.7.9 / 1.8.0 / 2.0.0 / 10.4.3+build.7` 在 required typed surface compatible 时可进入 machine conformance；
- `1.6.99`、malformed 与 `1.7.0-beta.1 / 2.0.0-rc.1` fail closed；
- higher stable version 若 schema/JSON/path/coherence 等 required contract drift，仍 fail closed；
- 不存在旧的 `1.8.0 → reject` acceptance。

## 3. Focused verification

068 针对 `C1-RA-006` 直接执行 `tests/unit/integrations/openspec-cli-adapter.test.ts`。

结果：

```text
files: 1
suites: 1
tests: 8
passed: 8
failed: 0
```

其中 version fixture 明确覆盖：

- valid stable：`1.7.0 / 1.7.9 / 1.8.0 / 2.0.0 / 10.4.3+build.7`；
- below-baseline / prerelease / malformed core version继续 fail closed；
- 新增 adversarial malformed build metadata：`1.7.0+..`、`1.7.0+.abc`、`1.7.0+abc.`、`1.7.0+abc..def` 全部 fail closed；
- higher stable version仍由 structured machine-contract conformance决定兼容性，不恢复 fixed upper bound。

更广泛的 OpenSpec 1.7 real CLI、archive recovery、path authority、Action context 等回归继续由第 5 节 affected suite 全量覆盖。

## 4. 063 / 067 technical findings closure evidence

### C1-RA-001 — self-archive bootstrap

新增回归模拟：

```text
canonical C1 spec 已出现
+ active C1 changeRoot 已 relocation
+ Manifest/同一 pending archive Run 尚在收口
```

此时 `status / doctor / resume-context`、pending archive resume 与 terminal admission均继续工作；current C1 不因 canonical marker 提前启用 structured Reader，因此不会查询已 relocation 的 active C1，也不会扫描 archive filesystem 猜 success。

### C1-RA-002 — compatibility reset

按 Owner Reset 改为 stable 1.7.0 minimum、无 fixed upper bound、prerelease fail-closed、higher stable machine-contract conformance。旧 `<1.8.0` gate 已移除。

### C1-RA-003 — structured identity/path authority

覆盖 wrong requested Change root、lexical escape、symlink escape/alias、repo containment、duplicate singleton resolved/existing、cross-artifact alias/conflict；Apply `changeDir` 必须 exact-bind validated requested Change root。

### C1-RA-004 — validation coherence

`valid=true + exitCode!=0`、`valid=true + error status`、`valid=true + error issue`、requested item identity ambiguity全部 fail closed；合法 `valid=false` structured diagnosis仍可消费。

### C1-RA-005 — production Action-specific consumption

production B1 preparation 现在构造 bounded `OpenSpecActionContext`：

- Propose/Revise-Propose 保留 proposal/specs/design/tasks instructions；
- Apply/Revise-Apply 保留 exact contextFiles + progress/state；
- view 的 fingerprint进入 Run semantic descriptor；progress/state变化会改变 external semantic identity；
- B1 fixed ActionDefinition / Policy / Reviewer / Owner authority均未改变。

### C1-RA-006 — malformed stable SemVer build metadata

067 发现 version admission 的 build metadata regex 允许空 dot identifier。068 将 build metadata 收紧为一个或多个非空 `[0-9A-Za-z-]+` identifier，并只允许以单点分隔，因此 `1.7.0+..`、`1.7.0+.abc`、`1.7.0+abc.`、`1.7.0+abc..def` 均 fail closed；合法 `10.4.3+build.7` 等 stable SemVer 仍被接受并继续进入 structured machine-contract conformance。该修复不恢复 fixed upper bound，也不放行 prerelease。

## 5. Affected Change Verification

执行：

```text
npm run verify:change -- shared domain persistence facts cli verification
```

`PATH` 指向提供的 stable OpenSpec 1.7.0 runtime。结果：

| 检查 | 状态 | 结果 |
|---|---|---|
| quality | passed | hard failures = 0；119 个既有/非阻塞 maintainability warnings |
| affected tests | passed | 672/672，152 suites，0 failed |
| typecheck | passed | production + test TypeScript 无错误 |
| lint | passed | eslint exit 0 |
| build | passed | tsc exit 0 |
| current Change OpenSpec strict | passed | `openspec-1-7-thin-integration` valid |
| canonical specs strict | passed | 12/12 canonical specs valid |

## 6. Retained disposable real archive merge preflight

068 未修改 Proposal/Design/delta Specs 或 archive merge implementation；因此沿用 066 对同一 exact delta-spec bytes 的 disposable stable OpenSpec 1.7.0 real archive preflight，而不把本次 parser-only revision 冒充成重新执行该 preflight：

```text
validate openspec-1-7-thin-integration --strict
archive openspec-1-7-thin-integration --json --yes
validate --specs --strict
```

真实 archive result：

```text
specsUpdated: true
added: 11
modified: 5
removed: 1
renamed: 0
post-archive canonical specs: 13/13 passed
```

对全部 5 个 `MODIFIED Requirements` 做 baseline canonical scenario retention：

```text
modified requirements checked: 5
baseline scenarios dropped: 0
```

因此 C1 不依赖 strict validation 单独证明 delta merge；真实 archive preflight 也证明原 canonical scenarios 保留。

## 7. Boundary invariants

已确认：

- Standard Change Action catalog未增加 Delivery behavior；
- Delivery Full Test / Finalize 仍不是 Run；
- Git Change Checkpoint 仍不是 Action/Run；
- Reviewer Verdict / Owner authorization authority 未转移给 OpenSpec；
- planning artifact identity只来自 structured `changeRoot/artifactPaths/contextFiles`；
- `explore.md` / `verification.md` 只从 validated changeRoot 派生 owned filename；
- OpenSpec archive仍使用 durable terminal observation × post-V1 matrix；
- archive guard machine fields不进入 B1 semantic fingerprint；
- `.git/node_modules/dist/unrelated repo` 不进入 ArchiveMutationSurfaceV1；
- current C1 self-bootstrap是 bounded seam，不成为 future general compatibility。

## 8. Tasks completion

```text
tasks total: 32
completed [x]: 32
remaining [ ]: 0
```

## 9. Delivery Full Test

```text
Delivery Full Test: NOT RUN
Owner Full Test authorization: NOT PRESENT
verify:full: NOT RUN
fullTestStatus lifecycle mutation: NONE
```

## 10. Overall result

C1 068 revise-apply Change Verification：**passed**。

`Verification passed ≠ Reviewer approved`。068 terminal 后下一合法边界必须是新的独立 `review-apply`。
