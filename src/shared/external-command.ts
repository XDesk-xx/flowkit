import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  platform?: NodeJS.Platform;
  comSpec?: string;
  /** D1 bounded test/host override. Normal Windows order is pwsh.exe then powershell.exe. */
  powerShellCandidates?: readonly string[];
  /** E1 owned Windows process-tree cancellation seam. Absence means termination cannot be proven. */
  windowsProcessTreeCanceller?: (input: { readonly pid: number; readonly command: string; readonly args: readonly string[] }) => Promise<{ readonly terminated: boolean; readonly diagnostics: readonly string[] }>;
}

export interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly usedWindowsLauncher: boolean;
}

interface RunCommandBase {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly spawned: boolean;
  readonly timedOut: boolean;
  readonly kind: 'spawn-failed' | 'exited' | 'timed-out-cancelled' | 'outcome-unknown';
  /** Bounded process fact for failures that occur before/while spawning. */
  readonly spawnError?: {
    readonly code?: string;
    readonly message: string;
  };
  /** E1 timeout ownership/termination diagnostics. */
  readonly processTreeDiagnostics?: readonly string[];
}

export type ExternalCommandOutcome =
  | (RunCommandBase & { readonly kind: 'spawn-failed'; readonly spawned: false; readonly timedOut: false; readonly spawnError: { readonly code?: string; readonly message: string } })
  | (RunCommandBase & { readonly kind: 'exited'; readonly timedOut: false })
  | (RunCommandBase & { readonly kind: 'timed-out-cancelled'; readonly spawned: true; readonly timedOut: true })
  | (RunCommandBase & { readonly kind: 'outcome-unknown' });

/**
 * Injection boundary retained for existing adapters/tests. Production
 * `runCommand` always returns ExternalCommandOutcome; adapters may supply a
 * legacy-shaped fake while they are migrated to assert an explicit outcome.
 */
export interface RunCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly spawned: boolean;
  readonly timedOut: boolean;
  readonly kind?: ExternalCommandOutcome['kind'];
  readonly spawnError?: { readonly code?: string; readonly message: string };
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
): Promise<ExternalCommandOutcome> {
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
        kind: 'spawn-failed',
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

    const finish = (result: ExternalCommandOutcome): void => {
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
      if (!spawned) {
        finish({
          kind: 'spawn-failed', stdout, stderr, exitCode: 1, spawned: false, timedOut: false,
          spawnError: { ...(error.code !== undefined && { code: error.code }), message: error.message },
        });
        return;
      }
      finish({
        kind: 'outcome-unknown', stdout, stderr, exitCode: 1, spawned: true, timedOut,
        spawnError: { ...(error.code !== undefined && { code: error.code }), message: error.message },
      });
    });

    child.once('close', (exitCode: number | null) => {
      if (timedOut) {
        if ((options?.platform ?? process.platform) === 'win32') return;
        finish({ kind: 'timed-out-cancelled', stdout, stderr, exitCode: exitCode ?? 1, spawned: true, timedOut: true });
        return;
      }
      finish({ kind: 'exited', stdout, stderr, exitCode: exitCode ?? 1, spawned, timedOut: false });
    });

    const timeout = options?.timeout;
    if (timeout !== undefined && Number.isFinite(timeout) && timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        if ((options?.platform ?? process.platform) === 'win32') {
          const pid = child.pid;
          const canceller = options?.windowsProcessTreeCanceller;
          if (pid === undefined || canceller === undefined) {
            try { child.kill('SIGKILL'); } catch { /* launcher best-effort only */ }
            finish({ kind: 'outcome-unknown', stdout, stderr, exitCode: 1, spawned, timedOut: true, processTreeDiagnostics: [
              `launcherPid=${String(pid ?? 'unknown')}`,
              `command=${resolved.command}`,
              'owned-process-tree-cancellation=unavailable',
            ] });
            return;
          }
          void canceller({ pid, command: resolved.command, args: resolved.args }).then((outcome) => {
            if (outcome.terminated) {
              finish({ kind: 'timed-out-cancelled', stdout, stderr, exitCode: 1, spawned: true, timedOut: true, processTreeDiagnostics: outcome.diagnostics });
            } else {
              finish({ kind: 'outcome-unknown', stdout, stderr, exitCode: 1, spawned: true, timedOut: true, processTreeDiagnostics: outcome.diagnostics });
            }
          }).catch((error) => {
            finish({ kind: 'outcome-unknown', stdout, stderr, exitCode: 1, spawned: true, timedOut: true, processTreeDiagnostics: [`cancellation-error=${error instanceof Error ? error.message : String(error)}`] });
          });
          return;
        }
        try { child.kill('SIGKILL'); } catch { /* close/error remains terminal transport signal */ }
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
): Promise<ExternalCommandOutcome> {
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
