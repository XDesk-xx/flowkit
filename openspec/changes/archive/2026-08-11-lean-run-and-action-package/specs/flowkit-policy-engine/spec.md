## ADDED Requirements

### Requirement: B1 preparation 必须消费 shared Policy 的 bounded dual-entry 而不得复制 decision tree

B1 execution preparation MUST以fresh FormalFactSnapshot消费shared Policy，并且只接受两个高层intent：

```text
next
review
```

`next` MUST调用shared `next(snapshot)`并且仅当结果为Standard Change Action时prepare Run。`review` MUST调用shared `resolveReview(snapshot)`/`canRun(review-S)`等价统一review admission，由Policy解析具体review Action。Caller MUST NOT直接指定concrete Action。

这必须保留Q1语义：matching `changes-requested`含任一non-author blocker时，shared `next()`继续blocked authority boundary；explicit `review`仍可通过Policy合法解析same-stage review并创建new Reviewer generation。B1 MUST NOT自行判断“non-author fact是否已到位”，MUST NOT自动review，MUST NOT复制blockingAuthority/Stage transition table。

#### Scenario: pending Run存在时不复制 Policy推进
- **WHEN** selected Policy entry仍处在同一formal Action boundary且已有matching pending Run
- **THEN** preparation MUST resume该Run
- **AND** MUST NOT自行推导下一Stage/Action

#### Scenario: direct re-review 不改变 blocked next
- **WHEN** non-author blocker使`next()`返回blocked
- **AND** explicit unified `review`经shared Policy允许same-stage `review-S`
- **THEN** B1 MAY创建/恢复该Reviewer Run
- **AND** subsequent `next()` semantics MUST仍完全由shared Policy计算
- **AND** B1 MUST NOT把review recommendation当authority

#### Scenario: concrete caller-selected Action 被拒绝
- **WHEN** caller绕过bounded intent直接要求`review-propose`、`apply`或其它Action
- **THEN** B1 high-level preparation MUST拒绝
