import { spawn } from 'node:child_process';

export interface RunCommandOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run an external command and capture its stdout, stderr, and exit code.
 * Does not inherit parent process stdio.
 */
export function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<RunCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    child.on('error', () => {
      resolve({
        stdout,
        stderr,
        exitCode: 1,
      });
    });
  });
}
