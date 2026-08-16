import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../shared/errors.js';

export interface ResolveOpenSpecExecutableOptions {
  readonly executable?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

/**
 * Resolve the OpenSpec invocation identity without owning process-launch
 * semantics. On Windows the complete PATH is searched for PowerShell first,
 * then cmd; the chosen shim is returned as an absolute path so downstream
 * verification consumes the same identity that the adapter invokes.
 */
export async function resolveOpenSpecExecutable(
  options: ResolveOpenSpecExecutableOptions = {},
): Promise<string> {
  if (options.executable !== undefined) return options.executable;

  const env = options.env ?? process.env;
  const propagatedExecutable = env['FLOWKIT_OPENSPEC_BIN'];
  if (propagatedExecutable !== undefined && propagatedExecutable.trim() !== '') {
    return propagatedExecutable;
  }

  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return 'openspec';

  const pathValue = Object.entries(env)
    .filter(([key]) => key.toLowerCase() === 'path')
    .at(-1)?.[1] ?? '';
  const directories = pathValue
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const shim of ['openspec.ps1', 'openspec.cmd'] as const) {
    for (const directory of directories) {
      const candidate = join(directory, shim);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // `.cmd` is considered only after the complete `.ps1` search.
      }
    }
  }

  throw new FlowkitError(
    'OPENSPEC_SPAWN_FAILED',
    'OpenSpec Windows shim not found on PATH (expected openspec.ps1, fallback openspec.cmd)',
    { pathEntries: directories.length },
  );
}
