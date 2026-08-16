## MODIFIED Requirements

### Requirement: shared 工程基础模块

`src/shared/` MUST提供 `paths.ts`、`atomic-write.ts`、`external-command.ts`、`errors.ts` 等工程基础能力。`external-command.ts` MUST继续作为无业务语义的低层process helper，捕获stdout/stderr/exitCode，并支持bounded timeout、spawn-error diagnosis与跨平台`.cmd/.bat` launcher resolution；它 MUST NOT解析OpenSpec lifecycle或决定Flowkit Action。

#### Scenario: paths 模块提供跨平台路径归一化

- **WHEN**调用`normalizeSeparators`传入Windows路径
- **THEN**返回使用POSIX `/`分隔符的路径

#### Scenario: atomic-write 模块提供原子写入

- **WHEN**调用`atomicWriteFile`写入文件
- **THEN**先写入同目录临时文件
- **AND**再rename替换目标文件
- **AND**失败时不留下半写文件

#### Scenario: external-command 模块捕获命令输出

- **WHEN**调用`runCommand`执行外部命令
- **THEN**返回stdout、stderr与exitCode
- **AND**不继承父进程stdio
- **AND** spawn error/timeout MUST可由caller机器区分

#### Scenario: external-command timeout 有确定性终态

- **WHEN** configured timeout到期而child仍未结束
- **THEN** helper MUST进入确定性timeout completion path
- **AND** MUST NOT永久保持unresolved Promise
- **AND** caller MUST能够识别timed-out failure

#### Scenario: Windows command shim 使用 ComSpec

- **WHEN** platform为`win32`且target executable为`.cmd`或`.bat`
- **THEN** helper MUST通过`ComSpec || cmd.exe`与`/d /s /c`执行
- **AND** non-Windows executable MUST保持直接spawn语义

#### Scenario: errors 模块提供结构化错误

- **WHEN**创建`FlowkitError`
- **THEN**包含`code`、`message`和可选`context`
- **AND** `toJSON()`方法可序列化
