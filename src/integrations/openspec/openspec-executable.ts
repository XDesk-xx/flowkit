import { access } from 'node:fs/promises';
import { join } from 'node:path';

import {
  managedToolHomeExists,
  resolveManagedToolInvocation,
  type ExternalToolInvocation,
} from '../external-tools/managed-tool.js';
import { FlowkitError } from '../../shared/errors.js';

export interface ResolveOpenSpecExecutableOptions {
  readonly executable?: string;
  readonly invocation?: ExternalToolInvocation;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

export async function resolveOpenSpecInvocation(
  options: ResolveOpenSpecExecutableOptions = {},
): Promise<ExternalToolInvocation> {
  if (options.invocation !== undefined) return options.invocation;
  if (options.executable !== undefined) {
    return {
      toolId: 'openspec',
      source: 'explicit-compat',
      command: options.executable,
      argsPrefix: [],
      propagationEnv: { FLOWKIT_OPENSPEC_BIN: options.executable },
    };
  }

  const env = options.env ?? process.env;
  if (await managedToolHomeExists('openspec', env)) {
    return resolveManagedToolInvocation('openspec', { env });
  }

  const propagatedExecutable = env['FLOWKIT_OPENSPEC_BIN'];
  if (propagatedExecutable !== undefined && propagatedExecutable.trim() !== '') {
    return {
      toolId: 'openspec',
      source: 'legacy-compat',
      command: propagatedExecutable,
      argsPrefix: [],
      propagationEnv: { FLOWKIT_OPENSPEC_BIN: propagatedExecutable },
    };
  }

  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    return {
      toolId: 'openspec',
      source: 'ambient-compat',
      command: 'openspec',
      argsPrefix: [],
      propagationEnv: {},
    };
  }

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
        return {
          toolId: 'openspec',
          source: 'ambient-compat',
          command: candidate,
          argsPrefix: [],
          propagationEnv: {},
        };
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

/** Historical helper retained for compatibility-only callers/tests. */
export async function resolveOpenSpecExecutable(
  options: ResolveOpenSpecExecutableOptions = {},
): Promise<string> {
  return (await resolveOpenSpecInvocation(options)).command;
}
