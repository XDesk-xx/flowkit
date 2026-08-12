import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  platform?: NodeJS.Platform;
  comSpec?: string;
  /** D1 bounded test/host override. Normal Windows order is pwsh.exe then powershell.exe. */
  powerShellCandidates?: readonly string[];
}

export interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly usedWindowsLauncher: boolean;
}

export interface RunCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** True only after Node emitted the child's `spawn` event. */
  readonly spawned: boolean;
  /** True when the configured timeout elapsed before terminal close/error. */
  readonly timedOut: boolean;
  /** Bounded process fact for failures that occur before/while spawning. */
  readonly spawnError?: {
    readonly code?: string;
    readonly message: string;
  };
}

/**
 * Resolve platform launch mechanics without changing the logical command.
 * On Windows, `.cmd`/`.bat` shims are launched through ComSpec because direct
 * `spawn()` semantics are not portable. PowerShell scripts are handled by the
 * bounded `.ps1` launcher in `runCommand`. Non-Windows commands are unchanged.
 */
export function resolveCommandForPlatform(
  command: string,
  args: readonly string[],
  options: Pick<RunCommandOptions, 'platform' | 'comSpec'> = {},
): ResolvedCommand {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) {
    return { command, args: [...args], usedWindowsLauncher: false };
  }

  const comSpec = options.comSpec ?? process.env['ComSpec'] ?? process.env['COMSPEC'] ?? 'cmd.exe';
  // /d disables AutoRun; /s + /c preserves cmd.exe's documented quoting mode.
  // Passing the command as its own argv token avoids shell interpolation by
  // Flowkit. cmd.exe remains the platform launcher authority.
  return {
    command: comSpec,
    args: ['/d', '/s', '/c', command, ...args],
    usedWindowsLauncher: true,
  };
}

/** D1 bounded PowerShell script argv contract: no shell, no profile, no expression evaluation. */
export function resolvePowerShellScriptCommand(
  script: string,
  args: readonly string[],
  launcher: string,
): ResolvedCommand {
  return {
    command: launcher,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, ...args],
    usedWindowsLauncher: true,
  };
}

function runResolvedCommand(
  resolved: ResolvedCommand,
  options?: RunCommandOptions,
): Promise<RunCommandResult> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(resolved.command, [...resolved.args], {
        cwd: options?.cwd,
        env: options?.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      resolve({
        stdout: '',
        stderr: '',
        exitCode: 1,
        spawned: false,
        timedOut: false,
        spawnError: {
          ...(err.code !== undefined && { code: err.code }),
          message: err.message,
        },
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let spawned = false;
    let timedOut = false;
    let settled = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const finish = (result: RunCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      resolve(result);
    };

    child.once('spawn', () => {
      spawned = true;
    });

    child.stdout?.on('data', (data: Buffer | string) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer | string) => {
      stderr += data.toString();
    });

    child.once('error', (error: NodeJS.ErrnoException) => {
      finish({
        stdout,
        stderr,
        exitCode: 1,
        spawned,
        timedOut,
        spawnError: {
          ...(error.code !== undefined && { code: error.code }),
          message: error.message,
        },
      });
    });

    child.once('close', (exitCode: number | null) => {
      finish({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
        spawned,
        timedOut,
      });
    });

    const timeout = options?.timeout;
    if (timeout !== undefined && Number.isFinite(timeout) && timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // close/error remains the terminal transport signal.
        }
      }, timeout);
      timeoutHandle.unref?.();
    }
  });
}

/**
 * Run an external command with bounded process mechanics and capture stdout,
 * stderr, exit status, spawn/timeout diagnostics. It never inherits stdio.
 *
 * D1: on Windows a `.ps1` script is launched through PowerShell Core first,
 * then Windows PowerShell only when the first launcher itself is absent. Once
 * a launcher starts, script/exit/timeout failure is terminal and MUST NOT fall
 * through to another launcher or to a `.cmd` sibling.
 */
export async function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<RunCommandResult> {
  const platform = options?.platform ?? process.platform;
  if (platform === 'win32' && /\.ps1$/i.test(command)) {
    const candidates = options?.powerShellCandidates ?? ['pwsh.exe', 'powershell.exe'];
    for (let index = 0; index < candidates.length; index += 1) {
      const launcher = candidates[index]!;
      const result = await runResolvedCommand(resolvePowerShellScriptCommand(command, args, launcher), options);
      const launcherAbsent = !result.spawned && result.spawnError?.code === 'ENOENT';
      if (!launcherAbsent) return result;
      if (index === candidates.length - 1) {
        return {
          ...result,
          spawnError: {
            code: 'POWERSHELL_NOT_FOUND',
            message: `No PowerShell launcher available for ${command}; tried ${candidates.join(', ')}`,
          },
        };
      }
    }
  }

  return runResolvedCommand(resolveCommandForPlatform(command, args, options), options);
}
