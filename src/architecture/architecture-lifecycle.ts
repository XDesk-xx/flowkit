import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseYaml } from '../facts/yaml-parser.js';
import { FlowkitError } from '../shared/errors.js';
import { ownerDecisionRefFor } from '../domain/owner-provenance.js';

const SHA256_RE = /^[0-9a-f]{64}$/;
const OWNER_REF_RE = /^owner:[0-9a-f]{64}$/;
const FULL_TEST_RESULT_REF_RE = /^verification:full-test:[0-9a-f]{64}$/;
const ARCHITECTURE_CYCLE_REF_RE = /^architecture-cycle:[0-9a-f]{64}$/;
const ARCHITECTURE_COMPARE_REF_RE = /^architecture-compare:[0-9a-f]{64}$/;
const GIT_REVISION_RE = /^[0-9a-f]{40}$/;

export interface ActualArchitectureRef {
  readonly path: string;
  readonly sha256: string;
  readonly repositoryRevision: string;
}

export interface ArchitectureCycleAcceptanceAwaiting {
  readonly status: 'awaiting-owner-decision';
}

export interface ArchitectureCycleAcceptanceAccepted {
  readonly status: 'accepted';
  readonly ownerDecisionRef: string;
}

export type ArchitectureCycleAcceptance =
  | ArchitectureCycleAcceptanceAwaiting
  | ArchitectureCycleAcceptanceAccepted;

export interface CurrentArchitectureCycle {
  readonly schemaVersion: 1;
  readonly cycleRef: string;
  readonly fullTestAuthorizationRef: string;
  readonly fullTestResultRef: string;
  readonly actualArchitectureRef: ActualArchitectureRef;
  readonly compareRef: string;
  readonly acceptance: ArchitectureCycleAcceptance;
}

export interface AcceptedSystemSource {
  readonly schemaVersion: 1;
  readonly sourceDeliveryId: string;
  readonly actualArchitectureRef: ActualArchitectureRef;
  readonly compareRef: string;
  readonly ownerAcceptanceRef: string;
}

export interface FutureCurrentArchitectureSource {
  readonly sourceDeliveryId: string;
  readonly sourceActualArchitectureRef: ActualArchitectureRef;
  readonly sourceArchitecture: Record<string, unknown>;
  readonly futureDeliveryId: string;
  readonly futureRepositoryRevision: string;
  readonly targetPath: string;
}

function hash(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function sha256Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedLogicalPath(path: string, deliveryId?: string): string {
  const value = path.replace(/\\/g, '/').trim();
  if (value === '' || value.startsWith('/') || value.includes('..') || value.includes('//')) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture path must be a normalized repository-relative path', { path });
  }
  if (deliveryId !== undefined && value !== `architecture/${deliveryId}/json/actual.architecture.json`) {
    throw new FlowkitError('ARCHITECTURE_REF_MISMATCH', 'Actual Architecture ref path is not owned by the source Delivery', {
      path: value,
      deliveryId,
    });
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be a non-empty string`);
  }
  return value;
}

function requireClosedObject(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const actual = Object.keys(obj).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} has unsupported or missing fields`, { actual, expected });
  }
  return obj;
}

export function parseActualArchitectureRef(value: unknown, deliveryId?: string): ActualArchitectureRef {
  const obj = requireClosedObject(value, 'actualArchitectureRef', ['path', 'repositoryRevision', 'sha256']);
  const path = normalizedLogicalPath(requireString(obj['path'], 'actualArchitectureRef.path'), deliveryId);
  const sha256 = requireString(obj['sha256'], 'actualArchitectureRef.sha256');
  const repositoryRevision = requireString(obj['repositoryRevision'], 'actualArchitectureRef.repositoryRevision');
  if (!SHA256_RE.test(sha256)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'actualArchitectureRef.sha256 must be lowercase sha256');
  if (!GIT_REVISION_RE.test(repositoryRevision)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'actualArchitectureRef.repositoryRevision must be an exact Git revision');
  return { path, sha256, repositoryRevision };
}

export function parseCurrentArchitectureCycle(value: unknown, deliveryId?: string): CurrentArchitectureCycle {
  const obj = requireClosedObject(value, 'architecture.currentCycle', [
    'acceptance', 'actualArchitectureRef', 'compareRef', 'cycleRef', 'fullTestAuthorizationRef', 'fullTestResultRef', 'schemaVersion',
  ]);
  if (obj['schemaVersion'] !== 1) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture.currentCycle.schemaVersion must be 1');
  const cycleRef = requireString(obj['cycleRef'], 'architecture.currentCycle.cycleRef');
  const fullTestAuthorizationRef = requireString(obj['fullTestAuthorizationRef'], 'architecture.currentCycle.fullTestAuthorizationRef');
  const fullTestResultRef = requireString(obj['fullTestResultRef'], 'architecture.currentCycle.fullTestResultRef');
  const compareRef = requireString(obj['compareRef'], 'architecture.currentCycle.compareRef');
  if (!ARCHITECTURE_CYCLE_REF_RE.test(cycleRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'cycleRef is invalid');
  if (!OWNER_REF_RE.test(fullTestAuthorizationRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'fullTestAuthorizationRef is invalid');
  if (!FULL_TEST_RESULT_REF_RE.test(fullTestResultRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'fullTestResultRef is invalid');
  if (!ARCHITECTURE_COMPARE_REF_RE.test(compareRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compareRef is invalid');
  const actualArchitectureRef = parseActualArchitectureRef(obj['actualArchitectureRef'], deliveryId);
  const acceptanceObj = obj['acceptance'];
  if (typeof acceptanceObj !== 'object' || acceptanceObj === null || Array.isArray(acceptanceObj)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture.currentCycle.acceptance must be an object');
  }
  const acceptanceRaw = acceptanceObj as Record<string, unknown>;
  let acceptance: ArchitectureCycleAcceptance;
  if (acceptanceRaw['status'] === 'awaiting-owner-decision') {
    if (JSON.stringify(Object.keys(acceptanceRaw).sort()) !== JSON.stringify(['status'])) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'awaiting architecture acceptance must contain only status');
    }
    acceptance = { status: 'awaiting-owner-decision' };
  } else if (acceptanceRaw['status'] === 'accepted') {
    if (JSON.stringify(Object.keys(acceptanceRaw).sort()) !== JSON.stringify(['ownerDecisionRef', 'status'])) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'accepted architecture acceptance requires only status + ownerDecisionRef');
    }
    const ownerDecisionRef = requireString(acceptanceRaw['ownerDecisionRef'], 'architecture.currentCycle.acceptance.ownerDecisionRef');
    if (!OWNER_REF_RE.test(ownerDecisionRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture acceptance ownerDecisionRef is invalid');
    acceptance = { status: 'accepted', ownerDecisionRef };
  } else {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture.currentCycle.acceptance.status is invalid');
  }
  const cycle: CurrentArchitectureCycle = {
    schemaVersion: 1,
    cycleRef,
    fullTestAuthorizationRef,
    fullTestResultRef,
    actualArchitectureRef,
    compareRef,
    acceptance,
  };
  const expected = architectureCycleRefFor(cycle);
  if (cycleRef !== expected) {
    throw new FlowkitError('ARCHITECTURE_CYCLE_REF_MISMATCH', 'architecture current cycle does not match canonical identity', { expected, actual: cycleRef });
  }
  return cycle;
}

export function parseAcceptedSystemSource(value: unknown, deliveryId?: string): AcceptedSystemSource {
  const obj = requireClosedObject(value, 'architecture.acceptedSystemSource', [
    'actualArchitectureRef', 'compareRef', 'ownerAcceptanceRef', 'schemaVersion', 'sourceDeliveryId',
  ]);
  if (obj['schemaVersion'] !== 1) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture.acceptedSystemSource.schemaVersion must be 1');
  const sourceDeliveryId = requireString(obj['sourceDeliveryId'], 'architecture.acceptedSystemSource.sourceDeliveryId');
  if (deliveryId !== undefined && sourceDeliveryId !== deliveryId) {
    throw new FlowkitError('ARCHITECTURE_SOURCE_MISMATCH', 'acceptedSystemSource.sourceDeliveryId must equal owning Delivery');
  }
  const compareRef = requireString(obj['compareRef'], 'architecture.acceptedSystemSource.compareRef');
  const ownerAcceptanceRef = requireString(obj['ownerAcceptanceRef'], 'architecture.acceptedSystemSource.ownerAcceptanceRef');
  if (!ARCHITECTURE_COMPARE_REF_RE.test(compareRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'acceptedSystemSource.compareRef is invalid');
  if (!OWNER_REF_RE.test(ownerAcceptanceRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'acceptedSystemSource.ownerAcceptanceRef is invalid');
  return {
    schemaVersion: 1,
    sourceDeliveryId,
    actualArchitectureRef: parseActualArchitectureRef(obj['actualArchitectureRef'], sourceDeliveryId),
    compareRef,
    ownerAcceptanceRef,
  };
}

export function actualArchitectureRefFor(input: {
  readonly deliveryId: string;
  readonly jsonBytes: string | Buffer;
  readonly repositoryRevision: string;
}): ActualArchitectureRef {
  if (!GIT_REVISION_RE.test(input.repositoryRevision)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'repositoryRevision must be an exact Git revision');
  }
  return {
    path: `architecture/${input.deliveryId}/json/actual.architecture.json`,
    sha256: sha256Bytes(input.jsonBytes),
    repositoryRevision: input.repositoryRevision,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(object).sort()) result[key] = canonicalize(object[key]);
  return result;
}

export function architectureCompareRefFor(input: {
  readonly plannedPath: string;
  readonly actualArchitectureRef: ActualArchitectureRef;
  readonly compareResult: unknown;
}): string {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    plannedPath: normalizedLogicalPath(input.plannedPath),
    actualArchitectureRef: input.actualArchitectureRef,
    compareResult: canonicalize(input.compareResult),
  });
  return hash('architecture-compare', canonical);
}

export function architectureCycleRefFor(input: Omit<CurrentArchitectureCycle, 'cycleRef' | 'acceptance'> | CurrentArchitectureCycle): string {
  const canonical = JSON.stringify({
    schemaVersion: 1,
    fullTestAuthorizationRef: input.fullTestAuthorizationRef,
    fullTestResultRef: input.fullTestResultRef,
    actualArchitectureRef: input.actualArchitectureRef,
    compareRef: input.compareRef,
  });
  return hash('architecture-cycle', canonical);
}

export function buildCurrentArchitectureCycle(input: {
  readonly fullTestAuthorizationRef: string;
  readonly fullTestResultRef: string;
  readonly actualArchitectureRef: ActualArchitectureRef;
  readonly compareRef: string;
}): CurrentArchitectureCycle {
  if (!OWNER_REF_RE.test(input.fullTestAuthorizationRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'fullTestAuthorizationRef is invalid');
  if (!FULL_TEST_RESULT_REF_RE.test(input.fullTestResultRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'fullTestResultRef is invalid');
  if (!ARCHITECTURE_COMPARE_REF_RE.test(input.compareRef)) throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compareRef is invalid');
  const base = { schemaVersion: 1 as const, ...input };
  return {
    ...base,
    cycleRef: architectureCycleRefFor(base),
    acceptance: { status: 'awaiting-owner-decision' },
  };
}

export function acceptedSystemSourceFor(input: {
  readonly sourceDeliveryId: string;
  readonly cycle: CurrentArchitectureCycle;
  readonly ownerAcceptanceRef: string;
}): AcceptedSystemSource {
  if (input.cycle.acceptance.status !== 'accepted' || input.cycle.acceptance.ownerDecisionRef !== input.ownerAcceptanceRef) {
    throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'accepted system source requires an accepted cycle bound to the same Owner decision');
  }
  return {
    schemaVersion: 1,
    sourceDeliveryId: input.sourceDeliveryId,
    actualArchitectureRef: input.cycle.actualArchitectureRef,
    compareRef: input.cycle.compareRef,
    ownerAcceptanceRef: input.ownerAcceptanceRef,
  };
}

export function acceptedSourceMatchesCycle(source: AcceptedSystemSource | undefined, cycle: CurrentArchitectureCycle | undefined): boolean {
  return source !== undefined
    && cycle !== undefined
    && cycle.acceptance.status === 'accepted'
    && source.sourceDeliveryId !== ''
    && source.compareRef === cycle.compareRef
    && source.ownerAcceptanceRef === cycle.acceptance.ownerDecisionRef
    && JSON.stringify(source.actualArchitectureRef) === JSON.stringify(cycle.actualArchitectureRef);
}

export async function readAcceptedSystemSource(input: {
  readonly repoRoot: string;
  readonly sourceDeliveryId: string;
}): Promise<AcceptedSystemSource> {
  const manifestPath = join(input.repoRoot, 'openspec', 'delivery-groups', `${input.sourceDeliveryId}.yaml`);
  const parsed = parseYaml(await readFile(manifestPath, 'utf8'));
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
    throw new FlowkitError('MANIFEST_PARSE_FAILED', `cannot read accepted system source for ${input.sourceDeliveryId}`);
  }
  const root = parsed.value as Record<string, unknown>;
  const architecture = root['architecture'];
  if (typeof architecture !== 'object' || architecture === null || Array.isArray(architecture)) {
    throw new FlowkitError('ARCHITECTURE_SOURCE_MISSING', 'source Delivery has no architecture mapping');
  }
  const architectureObj = architecture as Record<string, unknown>;
  const cycle = parseCurrentArchitectureCycle(architectureObj['currentCycle'], input.sourceDeliveryId);
  const source = parseAcceptedSystemSource(architectureObj['acceptedSystemSource'], input.sourceDeliveryId);
  if (!acceptedSourceMatchesCycle(source, cycle)) {
    throw new FlowkitError('ARCHITECTURE_SOURCE_MISMATCH', 'accepted system source does not match accepted current cycle');
  }
  const ownerDecisions = root['ownerDecisions'];
  if (!Array.isArray(ownerDecisions)) {
    throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'accepted source requires Owner decision records');
  }
  const owner = ownerDecisions.find((candidate) =>
    typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>)['ref'] === source.ownerAcceptanceRef,
  );
  if (typeof owner !== 'object' || owner === null || Array.isArray(owner)) {
    throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'accepted source Owner acceptance record is missing');
  }
  const ownerObj = owner as Record<string, unknown>;
  if (
    ownerObj['decision'] !== 'accept-architecture'
    || ownerObj['deliveryId'] !== input.sourceDeliveryId
    || ownerObj['architectureCycleRef'] !== cycle.cycleRef
    || typeof ownerObj['sourceRef'] !== 'string'
    || ownerObj['sourceRef'].trim() === ''
  ) {
    throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'accepted source Owner record does not bind the same cycle');
  }
  const expectedOwnerRef = ownerDecisionRefFor({
    decision: 'accept-architecture',
    deliveryId: input.sourceDeliveryId,
    architectureCycleRef: cycle.cycleRef,
    sourceRef: ownerObj['sourceRef'],
  });
  if (expectedOwnerRef !== source.ownerAcceptanceRef) {
    throw new FlowkitError('ARCHITECTURE_ACCEPTANCE_MISMATCH', 'accepted source Owner record ref is non-canonical');
  }
  const bytes = await readFile(join(input.repoRoot, source.actualArchitectureRef.path));
  if (sha256Bytes(bytes) !== source.actualArchitectureRef.sha256) {
    throw new FlowkitError('ARCHITECTURE_SOURCE_MISMATCH', 'accepted Actual content fingerprint does not match durable source');
  }
  return source;
}

export async function prepareFutureCurrentArchitectureSource(input: {
  readonly repoRoot: string;
  readonly sourceDeliveryId: string;
  readonly futureDeliveryId: string;
  readonly futureRepositoryRevision: string;
}): Promise<FutureCurrentArchitectureSource> {
  if (input.futureDeliveryId === input.sourceDeliveryId || input.futureDeliveryId.trim() === '' || input.futureDeliveryId.includes('/') || input.futureDeliveryId.includes('\\')) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'futureDeliveryId must be a different normalized Delivery id');
  }
  if (!GIT_REVISION_RE.test(input.futureRepositoryRevision)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'futureRepositoryRevision must be an exact Git revision');
  }
  const source = await readAcceptedSystemSource({ repoRoot: input.repoRoot, sourceDeliveryId: input.sourceDeliveryId });
  const raw = JSON.parse(await readFile(join(input.repoRoot, source.actualArchitectureRef.path), 'utf8')) as unknown;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new FlowkitError('ARCHITECTURE_SOURCE_MISMATCH', 'accepted Actual must be a JSON object');
  }
  return {
    sourceDeliveryId: input.sourceDeliveryId,
    sourceActualArchitectureRef: source.actualArchitectureRef,
    sourceArchitecture: raw as Record<string, unknown>,
    futureDeliveryId: input.futureDeliveryId,
    futureRepositoryRevision: input.futureRepositoryRevision,
    targetPath: `architecture/${input.futureDeliveryId}/json/current.architecture.json`,
  };
}
