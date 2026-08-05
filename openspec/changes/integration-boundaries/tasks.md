## 1. 集成边界文档

- [ ] 1.1 创建 `docs/integration-boundaries.md`
- [ ] 1.2 定义 Action Definition 与 Action Package 的逻辑边界
- [ ] 1.3 定义 Action Result 的逻辑边界（记录发生，不决定下一步）
- [ ] 1.4 定义 ResultRef 的最低语义（唯一识别、可判断失效、不绑定 Provider）
- [ ] 1.5 定义 Continuation Context 为生成视图而非状态权威
- [ ] 1.6 定义续接切点为边界语义而非新实体
- [ ] 1.7 定义 `reviewedResultRef` 为 Review 绑定正式结果的抽象
- [ ] 1.8 定义 Adapter 只负责边界转换，不得成为第二个编排器
- [ ] 1.9 定义 Skill 只声明方法类别，不绑定具体标识
- [ ] 1.10 定义 OpenSpec 权威边界（拥有 Change 契约，不决定流程）
- [ ] 1.11 定义 Git 权威边界（拥有文件和历史，不等同续接切点）
- [ ] 1.12 定义 Verification 权威边界（拥有原始结果，不突破 Full Test 授权）
- [ ] 1.13 定义 Archify 和 CodeGraph 权威边界（不决定下一 Action）
- [ ] 1.14 定义信息交换媒介中立原则
- [ ] 1.15 定义 C1 与 D1 的分界
- [ ] 1.16 声明不修改 B1 已冻结文档

## 2. OpenSpec 契约

- [ ] 2.1 创建 `flowkit-integration-boundaries` capability spec
- [ ] 2.2 覆盖 Action Package 为逻辑执行输入视图
- [ ] 2.3 覆盖 Action Result 记录发生而非决定下一步
- [ ] 2.4 覆盖 ResultRef 最低引用语义
- [ ] 2.5 覆盖 Continuation Context 为生成视图
- [ ] 2.6 覆盖续接切点为边界语义
- [ ] 2.7 覆盖 `reviewedResultRef` Review 绑定
- [ ] 2.8 覆盖 Adapter 只负责边界转换
- [ ] 2.9 覆盖 Skill 只声明方法类别
- [ ] 2.10 覆盖外部工具权威边界（OpenSpec、Git、Verification、Archify、CodeGraph）
- [ ] 2.11 覆盖信息交换媒介中立
- [ ] 2.12 覆盖不修改 B1 已冻结文档

## 3. 废止方向声明

- [ ] 3.1 声明不固定 GitHub／Remote Forge
- [ ] 3.2 声明不固定 Remote Author + Local Materializer
- [ ] 3.3 声明不固定 Workspace Capability 枚举
- [ ] 3.4 声明不把 Materializer 设为必备组件
- [ ] 3.5 声明不把 Git Commit 当成所有续接必要条件
- [ ] 3.6 声明不枚举协作拓扑

## 4. 文档影响声明

- [ ] 4.1 声明 C1 Apply 预计创建 `docs/integration-boundaries.md`
- [ ] 4.2 声明 D1 后续预计更新 `docs/bootstrap-reference.md`、`docs/development-roadmap.md`、`AGENTS.md`
- [ ] 4.3 声明应废止的旧草案（`docs/local-author-materializer-workflow.md`、`docs/adapters/github-snapshot-workspace.md`）

## 5. Verification

- [ ] 5.1 创建 `verification.md`
- [ ] 5.2 声明适用检查项及 not-run 状态
- [ ] 5.3 声明 C1 不运行 Full Test
