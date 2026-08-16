## ADDED Requirements

### Requirement: shared external-command 必须支持 bounded Windows PowerShell ps1 launcher

当 platform=`win32`且 target executable为 `.ps1`时，`runCommand` MUST通过 bounded PowerShell launcher执行 script。Launcher resolution MUST优先 `pwsh.exe`，不可用时 fallback `powershell.exe`；两者都不可用时 MUST以 machine-distinguishable spawn/launcher failure终止。

PowerShell invocation MUST使用 non-profile、non-interactive script execution，并逐项传递 argv；MUST NOT使用 `shell:true`、`Invoke-Expression`、字符串 eval或依赖用户 PowerShell profile。该能力 MUST继续是无业务语义的 low-level process helper，不解析 OpenSpec lifecycle。

#### Scenario: ps1 使用 PowerShell child
- **WHEN** Windows `runCommand`收到 `.ps1` executable与多个 argv
- **THEN** helper MUST通过 `pwsh.exe`或 fallback `powershell.exe`执行 script
- **AND** argv MUST保持逐项边界而非拼接成 shell command string

#### Scenario: missing PowerShell fail closed
- **WHEN** target为 existing `.ps1`
- **AND** bounded resolution找不到 `pwsh.exe` 与 `powershell.exe`
- **THEN** helper MUST返回可由 caller机器识别的 launcher/spawn failure
- **AND** MUST NOT通过 `cmd.exe`、shell eval或其它隐式 launcher猜测执行

### Requirement: ps1 support 必须保持现有 cmd/bat 与 non-Windows semantics

D1 `.ps1` support MUST NOT改变现有 Windows `.cmd/.bat` 的 `ComSpec || cmd.exe /d /s /c` contract，也 MUST NOT改变 non-Windows executable direct-spawn semantics。Timeout、spawnError、exitCode、stdout/stderr MUST继续使用 existing process result model。

#### Scenario: cmd shim 仍使用 ComSpec
- **WHEN** Windows target executable为 `.cmd`或`.bat`
- **THEN** helper MUST继续使用 existing ComSpec execution path

#### Scenario: non-Windows 不经过 PowerShell launcher
- **WHEN** platform不是 `win32`
- **THEN** `.ps1` D1 compatibility MUST NOT改变普通 executable direct-spawn behavior
