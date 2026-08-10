import { spawn } from 'node:child_process';

export interface PlatformCommand {
  executable: string;
  args: string[];
}

export interface CommandResult {
  exitCode: number;
  durationMs: number;
}

export function resolvePlatformCommand(
  executable: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): PlatformCommand {
  if (platform === 'win32' && /\.(?:cmd|bat)$/iu.test(executable)) {
    return {
      executable: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', executable, ...args],
    };
  }
  return { executable, args: [...args] };
}

export async function runPlatformCommand(
  executable: string,
  args: readonly string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    stdio?: 'inherit' | 'pipe';
  },
): Promise<CommandResult> {
  const command = resolvePlatformCommand(executable, args, process.platform, options.env ?? process.env);
  const started = process.hrtime.bigint();

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const elapsed = Number(process.hrtime.bigint() - started) / 1_000_000;
      resolve({ exitCode: code ?? 1, durationMs: elapsed });
    });
  });
}
