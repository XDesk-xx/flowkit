import { access, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ArchifyCliAdapter } from '../integrations/archify/archify-cli-adapter.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { next } from '../policy/next.js';
import { DeliveryManifestDocument } from '../persistence/delivery-manifest-document.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { runCommand } from '../shared/external-command.js';
import { FlowkitError } from '../shared/errors.js';
import {
  actualArchitectureRefFor,
  architectureCompareRefFor,
  buildCurrentArchitectureCycle,
  type CurrentArchitectureCycle,
} from './architecture-lifecycle.js';

export type DeliveryArchitectureKind = 'current' | 'planned' | 'actual';
export type RenderableArchitectureKind = DeliveryArchitectureKind;

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

async function currentRepositoryRevision(repoRoot: string): Promise<string> {
  const outcome = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, timeout: 10_000 });
  const revision = outcome.stdout.trim();
  if (!outcome.spawned || outcome.timedOut || outcome.exitCode !== 0 || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new FlowkitError('ARCHITECTURE_REPOSITORY_REVISION_UNAVAILABLE', 'cannot resolve exact repository revision for Actual Architecture', {
      exitCode: outcome.exitCode,
      stderr: outcome.stderr,
    });
  }
  return revision;
}

function actualDeclaredRevision(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const meta = (parsed as Record<string, unknown>)['meta'];
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined;
    const repository = (meta as Record<string, unknown>)['repository'];
    if (typeof repository !== 'object' || repository === null || Array.isArray(repository)) return undefined;
    const revision = (repository as Record<string, unknown>)['revision'];
    return typeof revision === 'string' ? revision : undefined;
  } catch {
    return undefined;
  }
}

export interface ArchitectureServiceOptions {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly adapter?: ArchifyCliAdapter;
  /** Bounded E1 test/host seams; production defaults remain formal Reader/Git/atomic writer. */
  readonly snapshotReader?: () => Promise<FormalFactSnapshot>;
  readonly repositoryRevision?: () => Promise<string>;
  readonly atomicWrite?: (path: string, data: string) => Promise<void>;
}

export interface ArchitectureCompareResult extends Record<string, unknown> {
  readonly architectureCycle?: CurrentArchitectureCycle;
}

export class ArchitectureService {
  readonly repoRoot: string;
  readonly deliveryId: string;
  readonly paths: DeliveryArchitecturePaths;
  private readonly adapter: ArchifyCliAdapter;
  private readonly snapshotReader: () => Promise<FormalFactSnapshot>;
  private readonly repositoryRevision: () => Promise<string>;
  private readonly atomicWrite: (path: string, data: string) => Promise<void>;

  constructor(options: ArchitectureServiceOptions) {
    this.repoRoot = resolve(options.repoRoot);
    this.deliveryId = options.deliveryId;
    this.paths = resolveDeliveryArchitecturePaths(this.repoRoot, this.deliveryId);
    this.adapter = options.adapter ?? new ArchifyCliAdapter({ repoRoot: this.repoRoot, env: options.env });
    this.snapshotReader = options.snapshotReader ?? (() => readFormalFactSnapshot({
      repoRoot: this.repoRoot,
      deliveryId: this.deliveryId,
      runsPathPrefix: '.flowkit/runs',
      openspecChangesPath: 'openspec/changes',
      manifestPathPrefix: 'openspec/delivery-groups',
    }));
    this.repositoryRevision = options.repositoryRevision ?? (() => currentRepositoryRevision(this.repoRoot));
    this.atomicWrite = options.atomicWrite ?? atomicWriteFile;
  }

  async render(kind: RenderableArchitectureKind): Promise<Record<string, unknown>> {
    const input = architectureJsonPath(this.paths, kind);
    const output = architectureHtmlPath(this.paths, kind);
    await requireInput(input, kind);
    await mkdir(this.paths.htmlRoot, { recursive: true });
    await this.adapter.validate('architecture', input, { repositoryRoot: this.repoRoot });
    return this.adapter.deliver('architecture', input, output, { repositoryRoot: this.repoRoot });
  }

  async compare(baseKind: DeliveryArchitectureKind, headKind: DeliveryArchitectureKind): Promise<ArchitectureCompareResult> {
    const base = architectureJsonPath(this.paths, baseKind);
    const head = architectureJsonPath(this.paths, headKind);
    await requireInput(base, baseKind);
    await requireInput(head, headKind);
    await mkdir(this.paths.htmlRoot, { recursive: true });

    if (baseKind === 'planned' && headKind === 'actual') {
      await this.adapter.validate('architecture', head, { repositoryRoot: this.repoRoot });
    }
    const compareResult = await this.adapter.compareArchitecture(base, head, this.paths.deltaHtml, this.paths.deltaReceipt, { repositoryRoot: this.repoRoot });
    if (baseKind !== 'planned' || headKind !== 'actual') return compareResult;

    const snapshot = await this.snapshotReader();
    if (snapshot.conflicts.length > 0) {
      throw new FlowkitError('FORMAL_FACT_CONFLICT', 'cannot publish architecture cycle while formal facts conflict', {
        dimensions: snapshot.conflicts.map((conflict) => conflict.dimension),
      });
    }
    if (snapshot.deliveryFullTestRawStatus !== 'passed' || snapshot.deliveryFullTestStatus !== 'passed' || snapshot.deliveryFullTestResult === undefined) {
      throw new FlowkitError('ARCHITECTURE_COMPARE_GATE_MISMATCH', 'formal Planned-vs-Actual publication requires current passed Full Test result');
    }

    const actualBytes = await readFile(head, 'utf8');
    const repositoryRevision = await this.repositoryRevision();
    if (actualDeclaredRevision(actualBytes) !== repositoryRevision) {
      throw new FlowkitError('ARCHITECTURE_REPOSITORY_REVISION_MISMATCH', 'Actual Architecture repository revision must equal current exact Git revision', {
        expected: repositoryRevision,
        actual: actualDeclaredRevision(actualBytes),
      });
    }
    const actualArchitectureRef = actualArchitectureRefFor({
      deliveryId: this.deliveryId,
      jsonBytes: actualBytes,
      repositoryRevision,
    });
    const plannedLogicalPath = `architecture/${this.deliveryId}/json/planned.architecture.json`;
    const compareRef = architectureCompareRefFor({
      plannedPath: plannedLogicalPath,
      actualArchitectureRef,
      compareResult,
    });
    const fullTestAuthorizationRef = [...(snapshot.ownerDecisionFacts ?? [])]
      .reverse()
      .find((fact) => fact.decision === 'authorize-full-test' && fact.deliveryId === this.deliveryId && fact.changeId === undefined)?.ref;
    if (fullTestAuthorizationRef === undefined) {
      throw new FlowkitError('ARCHITECTURE_COMPARE_GATE_MISMATCH', 'current passed Full Test is missing its delivery-scoped Owner authorization occurrence');
    }
    const cycle = buildCurrentArchitectureCycle({
      fullTestAuthorizationRef,
      fullTestResultRef: snapshot.deliveryFullTestResult.resultRef,
      actualArchitectureRef,
      compareRef,
    });

    if (snapshot.architectureCurrentCycle !== undefined) {
      if (JSON.stringify(snapshot.architectureCurrentCycle) === JSON.stringify(cycle)) {
        return { ...compareResult, architectureCycle: cycle };
      }
      throw new FlowkitError('ARCHITECTURE_CYCLE_ALREADY_EXISTS', 'a different current architecture cycle is already published');
    }

    const policy = next(snapshot);
    if (policy.kind !== 'delivery-behavior' || policy.behavior !== 'architecture-actual-compare') {
      throw new FlowkitError('ARCHITECTURE_COMPARE_GATE_MISMATCH', 'current Policy is not requesting architecture-actual-compare behavior');
    }
    const manifestPath = join(this.repoRoot, 'openspec', 'delivery-groups', `${this.deliveryId}.yaml`);
    const document = DeliveryManifestDocument.parse(await readFile(manifestPath, 'utf8'));
    document.publishArchitectureCurrentCycle(cycle);
    await this.atomicWrite(manifestPath, document.toString());
    return { ...compareResult, architectureCycle: cycle };
  }
}
