import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { FlowkitError } from '../../shared/errors.js';

export type ManagedToolId = 'openspec' | 'archify';

export interface ManagedToolDescriptor {
  readonly toolId: ManagedToolId;
  readonly version: string;
  readonly distributionRelativePath: string;
  readonly distributionSha256: string;
  readonly packageJsonRelativePath: string;
  readonly packageName: string;
  readonly entrypointRelativePath: string;
}

export interface ExternalToolInvocation {
  readonly toolId: ManagedToolId | 'openspec';
  readonly version?: string;
  readonly source: 'managed' | 'explicit-compat' | 'legacy-compat' | 'ambient-compat';
  readonly toolHome?: string;
  readonly command: string;
  readonly argsPrefix: readonly string[];
  readonly propagationEnv: Readonly<NodeJS.ProcessEnv>;
}

export const MANAGED_TOOL_DESCRIPTORS: Readonly<Record<ManagedToolId, ManagedToolDescriptor>> = {
  openspec: {
    toolId: 'openspec',
    version: '1.7.0',
    distributionRelativePath: 'distribution/fission-ai-openspec-1.7.0.tgz',
    distributionSha256: '3e0bd044bf1fae1732f201fab7b5c1c8ceb4ef89bed9923f89a33cb4f0750afd',
    packageJsonRelativePath: 'runtime/node_modules/@fission-ai/openspec/package.json',
    packageName: '@fission-ai/openspec',
    entrypointRelativePath: 'runtime/node_modules/@fission-ai/openspec/bin/openspec.js',
  },
  archify: {
    toolId: 'archify',
    version: '2.14.0',
    distributionRelativePath: 'distribution/archify.zip',
    distributionSha256: '1b610a4d8ff5821cccd7a3dfe2d0943d11e64bda1d2fb0511944df190472f175',
    packageJsonRelativePath: 'runtime/archify/package.json',
    packageName: 'archify',
    entrypointRelativePath: 'runtime/archify/bin/archify.mjs',
  },
};

export function resolveFlowkitHome(env: NodeJS.ProcessEnv = process.env): string {
  if (Object.prototype.hasOwnProperty.call(env, 'FLOWKIT_HOME')) {
    const explicit = env['FLOWKIT_HOME'];
    if (explicit === undefined || explicit.trim() === '' || !isAbsolute(explicit)) {
      throw new FlowkitError('EXTERNAL_TOOL_HOME_INVALID', 'FLOWKIT_HOME must be a non-empty absolute path');
    }
    return resolve(explicit);
  }
  return resolve(homedir(), '.flowkit');
}

export function managedToolHome(toolId: ManagedToolId, env: NodeJS.ProcessEnv = process.env): string {
  const descriptor = MANAGED_TOOL_DESCRIPTORS[toolId];
  return join(resolveFlowkitHome(env), 'tools', toolId, descriptor.version);
}

export async function managedToolHomeExists(
  toolId: ManagedToolId,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    await access(managedToolHome(toolId, env));
    return true;
  } catch {
    return false;
  }
}

export async function resolveManagedToolInvocation(
  toolId: ManagedToolId,
  options: { readonly env?: NodeJS.ProcessEnv; readonly nodeExecutable?: string } = {},
): Promise<ExternalToolInvocation> {
  const env = options.env ?? process.env;
  const descriptor = MANAGED_TOOL_DESCRIPTORS[toolId];
  const flowkitHome = resolveFlowkitHome(env);
  const toolHome = join(flowkitHome, 'tools', toolId, descriptor.version);
  const distribution = join(toolHome, descriptor.distributionRelativePath);
  const packageJson = join(toolHome, descriptor.packageJsonRelativePath);
  const entrypoint = join(toolHome, descriptor.entrypointRelativePath);

  let distributionBytes: Buffer;
  try {
    distributionBytes = await readFile(distribution);
  } catch (error) {
    throw new FlowkitError('EXTERNAL_TOOL_DISTRIBUTION_MISMATCH', 'Managed external-tool distribution is missing', {
      toolId,
      version: descriptor.version,
      distribution,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  const actualSha256 = createHash('sha256').update(distributionBytes).digest('hex');
  if (actualSha256 !== descriptor.distributionSha256) {
    throw new FlowkitError('EXTERNAL_TOOL_DISTRIBUTION_MISMATCH', 'Managed external-tool distribution SHA256 mismatch', {
      toolId,
      version: descriptor.version,
      expectedSha256: descriptor.distributionSha256,
      actualSha256,
    });
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(packageJson, 'utf8')) as unknown;
  } catch (error) {
    throw new FlowkitError('EXTERNAL_TOOL_PACKAGE_MISMATCH', 'Managed external-tool package metadata is missing or malformed', {
      toolId,
      packageJson,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new FlowkitError('EXTERNAL_TOOL_PACKAGE_MISMATCH', 'Managed external-tool package metadata must be an object', { toolId });
  }
  const packageRecord = metadata as Record<string, unknown>;
  if (packageRecord['name'] !== descriptor.packageName || packageRecord['version'] !== descriptor.version) {
    throw new FlowkitError('EXTERNAL_TOOL_PACKAGE_MISMATCH', 'Managed external-tool package identity mismatch', {
      toolId,
      expectedName: descriptor.packageName,
      expectedVersion: descriptor.version,
      actualName: packageRecord['name'],
      actualVersion: packageRecord['version'],
    });
  }
  try {
    await access(entrypoint);
  } catch (error) {
    throw new FlowkitError('EXTERNAL_TOOL_ENTRYPOINT_MISSING', 'Managed external-tool entrypoint is missing', {
      toolId,
      entrypoint,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    toolId,
    version: descriptor.version,
    source: 'managed',
    toolHome,
    command: options.nodeExecutable ?? process.execPath,
    argsPrefix: [entrypoint],
    propagationEnv: { FLOWKIT_HOME: flowkitHome },
  };
}
