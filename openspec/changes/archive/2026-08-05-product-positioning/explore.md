# A1 Explore：Flowkit 产品定位边界

## 1. 基本信息

- Delivery：`20260805-01-product-baseline`
- Change Key：`A1`
- Change ID：`product-positioning`
- Action：`explore`
- Review 结论：`approved`
- 当前结果：允许进入 `propose`

---

## 2. 已确认的前提

Flowkit 的产品方向已经确定，不在本 Change 中重新选择：

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

因此，A1 不再比较以下方向：

- Change 管理工具；
- 确定性交付编排器；
- 通用工作流平台。

其中“确定性交付编排器”是本 Change 的输入事实。

本次 Explore 只验证：

1. 该定位需要拥有的最小职责；
2. 该定位必须明确排除的职责；
3. Flowkit 与外部工具之间的事实权威边界；
4. 是否存在产品范围过宽或过窄的问题；
5. 哪些细节应留给后续 Change。

---

## 3. 本次探索要解决的问题

在已确认产品定位的前提下，需要进一步回答：

> Flowkit 作为确定性交付编排器，最少必须负责哪些事实，又必须拒绝拥有哪些事实？

如果这一边界不明确，后续实现可能再次出现：

- Flowkit 与 OpenSpec 同时维护 Change 契约；
- Flowkit 与 Git 同时维护版本历史事实；
- Delivery 被弱化为 Change 的附属分组；
- Review、Tests、Archify 或 CodeGraph 被吸收到 Flowkit 内部；
- 执行宿主或 Skill 成为第二个流程编排器；
- 为未知需求提前建立通用 Registry、Plugin 或 Evidence 系统；
- Flowkit 逐渐演变成通用工作流平台。

因此，A1 的任务是冻结产品边界，而不是设计完整生命周期或技术协议。

---

## 4. 产品定位

### 4.1 一句话定义

> Flowkit 是以 Delivery 为编排核心、以 Change 为实施单元、以 Action 为执行步骤的确定性交付编排器。

### 4.2 定义拆解

#### Delivery 是编排核心

Delivery 表达一条完整交付主线。

它决定：

- 本次交付的目标和边界；
- 包含哪些 Change；
- Change 之间的依赖和顺序；
- 最终验证和交付完成边界。

Delivery 不是 Change 的临时标签，也不是简单的 Change 集合。

#### Change 是实施单元

Change 表达一个边界明确、能够独立完成和审查的变更目标。

Change：

- 属于一个 Delivery；
- 在 Delivery Branch 上完成；
- 通过自身的 Explore、Propose、Apply 和 Archive 形成闭环；
- 不独立建立第二条交付主线。

#### Action 是执行步骤

Action 表达当前一次允许执行的流程动作。

Action：

- 具有明确输入和输出；
- 受到前置条件约束；
- 不能绕过 Review、Revision、Verification 或授权边界；
- 不与 Git Commit 一一对应。

具体 Action 状态、前置条件和转换规则留给 B1 定义。

---

## 5. Flowkit 的最小职责

Flowkit 应当拥有以下三类核心事实：

### 5.1 交付编排状态

Flowkit 需要知道：

- 当前活动 Delivery；
- 当前活动 Change，或者当前没有活动 Change；
- 当前 Change 已推进到哪个流程边界；
- Delivery 是否已经满足进入最终验证的条件。

这里确认的是职责归属，不在 A1 定义具体字段和状态枚举。

### 5.2 下一步合法性判断

Flowkit 需要能够判断：

- 当前 Action 是否允许执行；
- 当前 Action 的必要前置条件是否满足；
- 当前结果是否需要 Review；
- 是否存在必须处理的 Revision；
- 是否可以进入 Archive；
- 是否可以进入 Delivery Final。

Flowkit 的核心不是替代执行者完成专业工作，而是判断流程是否可以合法推进。

### 5.3 Delivery 与 Change 边界

Flowkit 需要保证：

- 一个仓库最多只有一个活动 Delivery；
- 一个活动 Delivery 中最多只有一个活动 Change；
- Change 不越过 Delivery 范围；
- Change 完成不等于 Delivery 完成；
- Delivery 的最终验证不能被普通 Change 自动触发；
- Full Test 和 Delivery Final 保持 owner 授权边界。

具体状态规则和恢复机制留给 B1 定义。

---

## 6. 确定性的含义

“确定性”在产品定位层表示：

> 对于相同的已知流程事实和输入，Flowkit 应产生相同的允许、阻塞或下一步判断。

确定性不表示：

- 所有专业判断都由代码自动完成；
- reviewer 的结论必须由程序推导；
- 产品需求可以自动决定；
- 架构取舍可以自动决定；
- 所有外部工具都必须由 Flowkit 实现。

确定性主要约束流程判断，而不是替代人的产品和技术判断。

具体状态存储、重放和恢复机制留给 B1 及后续代码 Delivery。

---

## 7. One fact, one authority

Flowkit 固定采用：

> One fact, one authority。

一个事实只能有一个主要权威来源。

其他系统可以：

- 引用该事实；
- 消费该事实；
- 投影该事实；
- 验证该事实。

但不能成为第二个独立权威。

### 7.1 高层事实归属

| 事实 | 主要权威 |
|---|---|
| Delivery 和 Change 的流程状态 | Flowkit |
| Change 的需求和实施契约 | OpenSpec |
| 文件内容、版本历史和同步事实 | Git |
| 被接受的正式架构表达 | Archify |
| 代码依赖和影响范围上下文 | CodeGraph |
| 审查 Findings 和 Verdict | Reviewer |
| 测试和静态检查结果 | 项目验证工具 |

### 7.2 Flowkit 可以保存什么

Flowkit 可以保存：

- 外部事实的引用；
- 外部动作的执行状态；
- 外部结果是否满足当前流程要求；
- 流程继续所需的最小摘要。

### 7.3 Flowkit 不应复制什么

Flowkit 不应重复保存：

- OpenSpec 中的完整需求契约；
- Git 已经拥有的 Commit 历史；
- Archify 已经拥有的完整架构模型；
- CodeGraph 已经拥有的完整依赖图；
- 测试工具已经拥有的完整测试内部状态；
- reviewer 已经拥有的完整审查推理过程。

具体引用结构和调用协议留给 C1 定义。

---

## 8. 外部工具边界

Flowkit 的定位要求外部集成保持轻量。

基本原则：

```text
Flowkit
→ 决定何时需要某项专业工作
→ 提供当前流程所需上下文
→ 接收结构化结果
→ 判断流程是否可以继续

外部工具
→ 完成自身专业职责
```

因此：

- OpenSpec 不编排整个 Delivery；
- Git 不决定当前 Action；
- Archify 不决定 Change 是否完成；
- CodeGraph 不决定是否允许 Apply；
- reviewer 不自行推进 Change；
- Tests 不自行触发 Delivery Final；
- Skill 不成为隐藏流程控制器；
- 执行宿主不自行改变流程状态。

具体工具输入输出和失败处理留给 C1。

---

## 9. 执行角色中立

Flowkit 的正式产品模型不绑定具体宿主、模型或执行工具。

正式角色只使用：

```text
owner
author
reviewer
```

在 A1 中只确认以下高层含义：

- `owner`：拥有范围、授权和最终决策；
- `author`：执行当前允许的工作；
- `reviewer`：独立检查结果并返回 Findings 和 Verdict。

A1 不定义：

- 每个角色的完整操作清单；
- Review 的具体触发规则；
- Commit 和交接规则；
- reviewer 的选择机制。

这些协作细节留给 D1。

---

## 10. Flowkit 明确是什么

Flowkit 是：

- Delivery 驱动的交付编排器；
- Change 闭环的流程协调者；
- Action 合法性的确定性判断者；
- Delivery 和 Change 边界的维护者；
- 外部专业工具之间的协调层；
- Bootstrap 和未来自托管共用规则的承载者。

---

## 11. Flowkit 明确不是什么

Flowkit 不是：

- 通用任务工作流引擎；
- 通用执行者编排平台；
- 通用 Skill 平台；
- 通用插件平台；
- OpenSpec 替代品；
- Git 操作平台；
- 测试平台；
- Code Review 工具；
- Archify 或 CodeGraph 的内部实现；
- Evidence 或 Receipt 系统；
- 通用审计平台；
- 自动提交、推送、合并或回滚工具；
- 自动决定是否运行 Full Test 的系统；
- 自动替代 owner 做产品和流程决策的系统。

---

## 12. 产品边界检查

### 12.1 是否过窄

若 Flowkit 只管理 OpenSpec Change，则会产生：

- Delivery 失去主线地位；
- 无法表达最终验证；
- 无法区分 Change 完成与 Delivery 完成；
- 无法管理 Full Test 授权；
- 无法表达多个 Change 的完整交付闭环。

因此 Flowkit 不能只定位为 Change 管理工具。

### 12.2 是否过宽

若 Flowkit 直接实现或拥有以下能力：

- 通用执行者路由；
- 通用插件发现；
- 通用 Skill Registry；
- 完整测试平台；
- 完整审查平台；
- 完整架构建模；
- Evidence 或 Receipt 系统；

则会形成范围扩张和重复权威。

因此 Flowkit 必须保持：

```text
确定性流程核心
+
轻量外部集成
```

### 12.3 当前边界是否足够

当前定位可以覆盖：

- Delivery 主线；
- Change 闭环；
- Action 推进；
- Review 和 Revision 边界；
- Change Verification；
- Delivery Full Test；
- Delivery Final；
- Bootstrap 与自托管过渡。

同时不要求 Flowkit 实现外部工具的专业内部能力。

因此当前产品边界足够支持后续设计。

---

## 13. 与后续 Change 的边界

### 13.1 A1 当前冻结

A1 只冻结：

- Flowkit 的一句话定义；
- Delivery 驱动的产品方向；
- Change 和 Action 的高层位置；
- 确定性约束的含义；
- One fact, one authority；
- Flowkit 拥有和不拥有的高层事实；
- 执行角色中立；
- 产品非目标。

### 13.2 B1 `core-model`

B1 再定义：

- Delivery、Change、Action 的正式模型；
- 活动 Delivery 和活动 Change 规则；
- Change 的四个主 Action；
- Review 和 Revision 的流程位置；
- 状态字段和状态转换；
- Verification 和 Full Test 的流程位置；
- Action 前置条件和合法性判断；
- checkout 后的流程恢复要求。

### 13.3 C1 `integration-boundaries`

C1 再定义：

- OpenSpec 的具体职责和调用方式；
- Git 的读取和写入边界；
- Archify 的生命周期和权威范围；
- CodeGraph 的上下文边界；
- Findings、Verdict 和测试结果的结构化接口；
- Skill 和执行宿主边界；
- thin integration 的具体要求。

### 13.4 D1 `bootstrap-and-roadmap`

D1 再定义：

- Bootstrap 人工执行规则；
- owner、author、reviewer 的具体协作方式；
- 内容展示、Review 和 Revision 规则；
- Commit 和跨环境交接规则；
- 仓库级指令；
- 后续开发路线；
- 自托管切换条件。

---

## 14. 主要风险与控制方式

### 风险一：产品范围再次扩张

表现：

- 新增通用 Registry；
- 新增通用插件系统；
- 新增与当前 Delivery 无关的抽象；
- 将所有外部能力纳入 Flowkit。

控制：

- 新机制必须直接服务当前已确认 Delivery；
- 无当前场景时不进入核心模型；
- 外部工具优先通过轻量适配接入。

### 风险二：Delivery 再次被弱化

表现：

- Change 成为最高层；
- Delivery 只用于分组；
- Full Test 被纳入单个 Change；
- Change 完成直接等于交付完成。

控制：

- Delivery 始终是编排和最终验收主线；
- Change 完成只代表局部闭环；
- Delivery Final 保持独立边界。

### 风险三：重复事实

表现：

- 同一个状态存在多个文件；
- 同一个契约同时由 Flowkit 和 OpenSpec维护；
- Git SHA 被写回受 Git 跟踪状态文件；
- 架构计划在多个系统中独立维护。

控制：

- 每类事实指定唯一主要权威；
- 其他系统只保存引用或最小投影；
- 不建立额外 current 文件或隐式状态源。

### 风险四：执行工具耦合

表现：

- 正式模型写死具体执行工具；
- Skill 决定流程；
- reviewer 自行推进 Change；
- 不同宿主拥有不同流程语义。

控制：

- 正式模型使用中立角色；
- 所有宿主消费同一 Flowkit 判断；
- reviewer 只产生 Findings 和 Verdict；
- 流程推进仍由 owner 授权和 Flowkit 规则决定。

---

## 15. 探索结论

A1 Explore 冻结以下结论：

1. Flowkit 是确定性交付编排器；
2. Delivery 是编排核心和最终验收主线；
3. Change 是属于 Delivery 的实施单元；
4. Action 是受前置条件约束的流程步骤；
5. Flowkit 的确定性主要约束流程合法性判断；
6. Flowkit 拥有流程状态和下一步合法性判断；
7. OpenSpec、Git、Archify、CodeGraph、Reviewer 和项目验证工具保持各自事实权威；
8. Flowkit 只保存流程所需的最小引用和结果状态；
9. Flowkit 不成为通用工作流、插件、Skill、Git、测试、审查或审计平台；
10. 正式产品模型使用中立角色，不绑定具体执行工具；
11. 状态模型、集成协议和 Bootstrap 协作细节分别留给 B1、C1、D1。

---

## 16. Review 处理记录

本次 Explore 经独立 reviewer 审查后进入 `revise-explore`，并处理以下 Findings：

- 删除对已冻结产品定位的重新选择；
- 将 Explore 任务改为验证职责、非目标和权威边界；
- 收缩与 B1 状态模型的重叠；
- 收缩与 C1 集成协议的重叠；
- 将具体角色协作规则留给 D1。

修订结果经 owner 确认，Explore 通过，可以进入 `propose`。
