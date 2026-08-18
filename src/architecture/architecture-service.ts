import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ArchifyCliAdapter } from '../integrations/archify/archify-cli-adapter.js';
import { FlowkitError } from '../shared/errors.js';

export type DeliveryArchitectureKind = 'current' | 'planned' | 'actual';
export type D1RenderableArchitectureKind = 'current' | 'planned';

export interface DeliveryArchitecturePaths {
  readonly deliveryRoot: string;
  readonly jsonRoot: string;
  readonly htmlRoot: string;
  readonly currentJson: string;
  readonly plannedJson: string;
  readonly actualJson: string;
  readonly currentHtml: string;
  readonly plannedHtml: string;
  readonly actualHtml: string;
  readonly deltaHtml: string;
  readonly deltaReceipt: string;
}

export function resolveDeliveryArchitecturePaths(repoRoot: string, deliveryId: string): DeliveryArchitecturePaths {
  const normalizedDeliveryId = deliveryId.trim();
  if (normalizedDeliveryId === '' || normalizedDeliveryId.includes('/') || normalizedDeliveryId.includes('\\') || normalizedDeliveryId === '.' || normalizedDeliveryId === '..') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'deliveryId must be a single normalized path segment');
  }
  const deliveryRoot = join(resolve(repoRoot), 'architecture', normalizedDeliveryId);
  const jsonRoot = join(deliveryRoot, 'json');
  const htmlRoot = join(deliveryRoot, 'html');
  return {
    deliveryRoot,
    jsonRoot,
    htmlRoot,
    currentJson: join(jsonRoot, 'current.architecture.json'),
    plannedJson: join(jsonRoot, 'planned.architecture.json'),
    actualJson: join(jsonRoot, 'actual.architecture.json'),
    currentHtml: join(htmlRoot, 'current.html'),
    plannedHtml: join(htmlRoot, 'planned.html'),
    actualHtml: join(htmlRoot, 'actual.html'),
    deltaHtml: join(htmlRoot, 'delta.html'),
    deltaReceipt: join(htmlRoot, 'delta.receipt.json'),
  };
}

export function architectureJsonPath(paths: DeliveryArchitecturePaths, kind: DeliveryArchitectureKind): string {
  switch (kind) {
    case 'current': return paths.currentJson;
    case 'planned': return paths.plannedJson;
    case 'actual': return paths.actualJson;
  }
}

export function architectureHtmlPath(paths: DeliveryArchitecturePaths, kind: DeliveryArchitectureKind): string {
  switch (kind) {
    case 'current': return paths.currentHtml;
    case 'planned': return paths.plannedHtml;
    case 'actual': return paths.actualHtml;
  }
}

async function requireInput(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new FlowkitError('ARCHITECTURE_ASSET_MISSING', `${label} Architecture JSON is unavailable`, { path });
  }
}

export interface ArchitectureServiceOptions {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly adapter?: ArchifyCliAdapter;
}

export class ArchitectureService {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly paths: DeliveryArchitecturePaths;
  private readonly adapter: ArchifyCliAdapter;

  constructor(options: ArchitectureServiceOptions) {
    this.repoRoot = resolve(options.repoRoot);
    this.deliveryId = options.deliveryId;
    this.paths = resolveDeliveryArchitecturePaths(this.repoRoot, this.deliveryId);
    this.adapter = options.adapter ?? new ArchifyCliAdapter({ repoRoot: this.repoRoot, env: options.env });
  }

  async render(kind: D1RenderableArchitectureKind): Promise<Record<string, unknown>> {
    const input = architectureJsonPath(this.paths, kind);
    const output = architectureHtmlPath(this.paths, kind);
    await requireInput(input, kind);
    await mkdir(this.paths.htmlRoot, { recursive: true });
    await this.adapter.validate('architecture', input, { repositoryRoot: this.repoRoot });
    return this.adapter.deliver('architecture', input, output, { repositoryRoot: this.repoRoot });
  }

  async compare(baseKind: DeliveryArchitectureKind, headKind: DeliveryArchitectureKind): Promise<Record<string, unknown>> {
    const base = architectureJsonPath(this.paths, baseKind);
    const head = architectureJsonPath(this.paths, headKind);
    await requireInput(base, baseKind);
    await requireInput(head, headKind);
    await mkdir(this.paths.htmlRoot, { recursive: true });
    return this.adapter.compareArchitecture(base, head, this.paths.deltaHtml, this.paths.deltaReceipt, { repositoryRoot: this.repoRoot });
  }
}
