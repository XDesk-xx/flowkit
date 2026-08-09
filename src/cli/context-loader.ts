import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { parseYaml } from '../facts/yaml-parser.js';

export class DiagnosticDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagnosticDiscoveryError';
  }
}

export interface DiagnosticContext {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly snapshot: FormalFactSnapshot;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function discoverRepositoryRoot(startDir: string): Promise<string> {
  let current = resolve(startDir);
  while (true) {
    const hasDeliveryGroups = await isDirectory(join(current, 'openspec', 'delivery-groups'));
    const hasRuns = await isDirectory(join(current, '.flowkit', 'runs'));
    if (hasDeliveryGroups && hasRuns) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new DiagnosticDiscoveryError(
        'Flowkit repository root not found (requires openspec/delivery-groups/ and .flowkit/runs/)',
      );
    }
    current = parent;
  }
}

export async function discoverActiveDelivery(repoRoot: string): Promise<string> {
  const manifestDir = join(repoRoot, 'openspec', 'delivery-groups');
  let entries: string[];
  try {
    entries = (await readdir(manifestDir)).filter((entry) => entry.endsWith('.yaml')).sort();
  } catch (error) {
    throw new DiagnosticDiscoveryError(
      `cannot read delivery manifests: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const active: string[] = [];
  for (const entry of entries) {
    const path = join(manifestDir, entry);
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch (error) {
      throw new DiagnosticDiscoveryError(
        `cannot read delivery manifest ${entry}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const parsed = parseYaml(content);
    if (!parsed.ok) {
      throw new DiagnosticDiscoveryError(`malformed delivery manifest ${entry}: ${parsed.error}`);
    }
    if (typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
      throw new DiagnosticDiscoveryError(`malformed delivery manifest ${entry}: root must be a mapping`);
    }
    const root = parsed.value as Record<string, unknown>;
    const id = root['id'];
    const delivery = root['delivery'];
    if (typeof id !== 'string' || typeof delivery !== 'object' || delivery === null || Array.isArray(delivery)) {
      throw new DiagnosticDiscoveryError(`malformed delivery manifest ${entry}: missing id or delivery mapping`);
    }
    const state = (delivery as Record<string, unknown>)['state'];
    if (state === 'active') {
      active.push(id);
    }
  }

  if (active.length !== 1) {
    throw new DiagnosticDiscoveryError(
      `expected exactly one active Delivery, found ${active.length}${active.length > 0 ? `: ${active.join(', ')}` : ''}`,
    );
  }
  return active[0]!;
}

export async function loadDiagnosticContext(startDir: string): Promise<DiagnosticContext> {
  const repoRoot = await discoverRepositoryRoot(startDir);
  const deliveryId = await discoverActiveDelivery(repoRoot);
  const snapshot = await readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
  return { repoRoot, deliveryId, snapshot };
}
