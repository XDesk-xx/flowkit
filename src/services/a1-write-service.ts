import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  AuthorizationOnlyOwnerDecision,
  ChangeCreateInput,
  DeliveryCreateInput,
  OwnerDecisionRecord,
  OwnerDecisionRecordKind,
} from '../domain/a1-types.js';
import type { FullTestExecutionContract } from '../domain/full-test.js';
import type { ResolvedFullTestFailureFinding } from '../domain/full-test.js';
import {
  AUTHORIZATION_ONLY_OWNER_DECISIONS,
} from '../domain/a1-types.js';
import { ownerDecisionRefFor } from '../domain/owner-provenance.js';
import { acceptedSystemSourceFor } from '../architecture/architecture-lifecycle.js';
import { parseYaml } from '../facts/yaml-parser.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { next } from '../policy/next.js';
import { discoverActiveDelivery } from '../cli/context-loader.js';
import { atomicWriteFile } from '../shared/atomic-write.js';
import { FlowkitError } from '../shared/errors.js';
import {
  DeliveryManifestDocument,
  serializeNewDeliveryManifest,
} from '../persistence/delivery-manifest-document.js';

export interface A1ServiceOptions {
  /** C1 activation-time OpenSpec delta declaration. */
  readonly specDeltaMode?: 'required' | 'skip';
  readonly now?: () => Date;
  readonly atomicWrite?: (path: string, data: string) => Promise<void>;
}

export interface WriteOperationResult {
  readonly deliveryId: string;
  readonly ownerDecisionRef: string;
  readonly changeId?: string;
  readonly state?: 'planned' | 'active';
  readonly idempotent?: boolean;
}

const CHANGE_SCOPED_AUTH = new Set<AuthorizationOnlyOwnerDecision>([
  'authorize-apply',
  'authorize-archive',
  'authorize-checkpoint',
]);

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\n') || value.includes('\r')) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be a non-empty single-line string`, {
      field,
    });
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be boolean`, { field });
  }
  return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be an array of non-empty strings`, {
      field,
    });
  }
  return value as string[];
}


function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be a positive integer`, { field });
  }
  return value;
}

function normalizeFullTestExecution(value: unknown, field = 'fullTestExecution'): FullTestExecutionContract {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  if (obj['kind'] !== 'command') throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.kind must be command`);
  if (obj['launcherMode'] !== 'direct' && obj['launcherMode'] !== 'npm-shim') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.launcherMode must be direct|npm-shim`);
  }
  if (obj['scope'] !== 'delivery') throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.scope must be delivery`);
  if (obj['resultProtocol'] !== 'flowkit-full-test-result-v1') throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.resultProtocol is invalid`);
  if (obj['resultAuthority'] !== 'verification') throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.resultAuthority must be verification`);
  const statuses = obj['expectedTerminalStatuses'];
  if (!Array.isArray(statuses) || statuses.length != 2 || statuses[0] !== 'passed' || statuses[1] !== 'failed') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.expectedTerminalStatuses must be [passed, failed]`);
  }
  const command = nonEmpty(obj['command'], `${field}.command`);
  if (obj['launcherMode'] === 'npm-shim' && command !== 'npm') {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.command must be npm when launcherMode=npm-shim`);
  }
  return {
    id: nonEmpty(obj['id'], `${field}.id`),
    kind: 'command',
    command,
    args: stringArray(obj['args'], `${field}.args`),
    launcherMode: obj['launcherMode'],
    scope: 'delivery',
    timeoutMs: positiveInteger(obj['timeoutMs'], `${field}.timeoutMs`),
    resultProtocol: 'flowkit-full-test-result-v1',
    resultAuthority: 'verification',
    expectedTerminalStatuses: ['passed', 'failed'],
  };
}

function normalizeChangeInput(value: unknown, field = 'change'): ChangeCreateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} must be an object`);
  }
  const obj = value as Record<string, unknown>;
  let corrective: ChangeCreateInput['corrective'];
  if (obj['corrective'] !== undefined) {
    const raw = obj['corrective'];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.corrective must be an object`);
    }
    const correctiveObj = raw as Record<string, unknown>;
    const keys = Object.keys(correctiveObj).sort();
    const expected = ['authorizationRef', 'findingId', 'sourceResultRef'];
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.corrective has unsupported fields`);
    }
    corrective = {
      findingId: nonEmpty(correctiveObj['findingId'], `${field}.corrective.findingId`),
      authorizationRef: nonEmpty(correctiveObj['authorizationRef'], `${field}.corrective.authorizationRef`),
      sourceResultRef: nonEmpty(correctiveObj['sourceResultRef'], `${field}.corrective.sourceResultRef`),
    };
  }
  let architectureRemediation: ChangeCreateInput['architectureRemediation'];
  if (obj['architectureRemediation'] !== undefined) {
    const raw = obj['architectureRemediation'];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.architectureRemediation must be an object`);
    }
    const remediationObj = raw as Record<string, unknown>;
    if (JSON.stringify(Object.keys(remediationObj).sort()) !== JSON.stringify(['cycleRef'])) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.architectureRemediation has unsupported fields`);
    }
    const cycleRef = nonEmpty(remediationObj['cycleRef'], `${field}.architectureRemediation.cycleRef`);
    if (!/^architecture-cycle:[0-9a-f]{64}$/.test(cycleRef)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.architectureRemediation.cycleRef is invalid`);
    }
    architectureRemediation = { cycleRef };
  }
  if (corrective !== undefined && architectureRemediation !== undefined) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field}.corrective and architectureRemediation are mutually exclusive`);
  }
  return {
    key: nonEmpty(obj['key'], `${field}.key`),
    id: nonEmpty(obj['id'], `${field}.id`),
    goal: nonEmpty(obj['goal'], `${field}.goal`),
    required: requireBoolean(obj['required'], `${field}.required`),
    dependsOn: stringArray(obj['dependsOn'], `${field}.dependsOn`),
    outputs: stringArray(obj['outputs'], `${field}.outputs`),
    architectureImpact: requireBoolean(obj['architectureImpact'], `${field}.architectureImpact`),
    ...(corrective !== undefined && { corrective }),
    ...(architectureRemediation !== undefined && { architectureRemediation }),
  };
}

export function validateChangeCreateInput(value: unknown): ChangeCreateInput {
  const change = normalizeChangeInput(value);
  validateNoDuplicateStrings(change.dependsOn, 'change.dependsOn');
  if (change.dependsOn.includes(change.id)) {
    throw new FlowkitError('INVALID_DEPENDENCY', `Change ${change.id} cannot depend on itself`);
  }
  return change;
}

export function validateDeliveryCreateInput(value: unknown): DeliveryCreateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'delivery input must be an object');
  }
  const obj = value as Record<string, unknown>;
  const scopeRaw = obj['scope'];
  const architectureRaw = obj['architecture'];
  if (typeof scopeRaw !== 'object' || scopeRaw === null || Array.isArray(scopeRaw)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'scope must be an object');
  }
  if (typeof architectureRaw !== 'object' || architectureRaw === null || Array.isArray(architectureRaw)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture must be an object');
  }
  const scope = scopeRaw as Record<string, unknown>;
  const architecture = architectureRaw as Record<string, unknown>;
  const archifyPlan = architecture['archifyPlan'];
  if (
    archifyPlan !== 'required' &&
    archifyPlan !== 'not-required' &&
    archifyPlan !== 'deferred' &&
    archifyPlan !== 'deferred-to-03'
  ) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architecture.archifyPlan is invalid');
  }
  if (!Array.isArray(obj['changes']) || (obj['changes'] as unknown[]).length === 0) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'changes must be a non-empty array');
  }
  const changes = (obj['changes'] as unknown[]).map((change, index) =>
    normalizeChangeInput(change, `changes[${index}]`),
  );
  const input: DeliveryCreateInput = {
    id: nonEmpty(obj['id'], 'id'),
    goal: nonEmpty(obj['goal'], 'goal'),
    branch: nonEmpty(obj['branch'], 'branch'),
    scope: {
      included: stringArray(scope['included'], 'scope.included'),
      excluded: stringArray(scope['excluded'], 'scope.excluded'),
    },
    acceptance: stringArray(obj['acceptance'], 'acceptance'),
    architecture: {
      impact: requireBoolean(architecture['impact'], 'architecture.impact'),
      archifyPlan,
    },
    fullTestPlan: stringArray(obj['fullTestPlan'], 'fullTestPlan'),
    fullTestExecution: normalizeFullTestExecution(obj['fullTestExecution']),
    changes,
  };
  validateDeliveryChangeGraph(input.changes);
  return input;
}

function validateNoDuplicateStrings(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `${field} contains duplicate values`, {
      field,
    });
  }
}

function validateDeliveryChangeGraph(changes: readonly ChangeCreateInput[]): void {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const change of changes) {
    if (keys.has(change.key)) throw new FlowkitError('CHANGE_ALREADY_EXISTS', `duplicate Change key ${change.key}`);
    if (ids.has(change.id)) throw new FlowkitError('CHANGE_ALREADY_EXISTS', `duplicate Change id ${change.id}`);
    keys.add(change.key);
    ids.add(change.id);
    validateNoDuplicateStrings(change.dependsOn, `${change.id}.dependsOn`);
    if (change.dependsOn.includes(change.id)) {
      throw new FlowkitError('INVALID_DEPENDENCY', `Change ${change.id} cannot depend on itself`);
    }
  }
  for (const change of changes) {
    for (const dependency of change.dependsOn) {
      if (!ids.has(dependency)) {
        throw new FlowkitError('INVALID_DEPENDENCY', `Unknown dependency ${dependency} for Change ${change.id}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(changes.map((change) => [change.id, change] as const));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new FlowkitError('INVALID_DEPENDENCY', `dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const change of changes) visit(change.id);
}

export function buildOwnerDecisionRecord(input: {
  readonly decision: OwnerDecisionRecordKind;
  readonly deliveryId: string;
  readonly sourceRef: string;
  readonly changeId?: string;
  readonly scope?: string;
  readonly requiredOutcomes?: readonly string[];
  readonly architectureCycleRef?: string;
}): OwnerDecisionRecord {
  const deliveryId = nonEmpty(input.deliveryId, 'deliveryId');
  const sourceRef = nonEmpty(input.sourceRef, 'sourceRef');
  const changeId = input.changeId === undefined ? undefined : nonEmpty(input.changeId, 'changeId');
  const scope = input.scope === undefined ? undefined : nonEmpty(input.scope, 'scope');
  const architectureCycleRef = input.architectureCycleRef === undefined ? undefined : nonEmpty(input.architectureCycleRef, 'architectureCycleRef');
  if (architectureCycleRef !== undefined && !/^architecture-cycle:[0-9a-f]{64}$/.test(architectureCycleRef)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'architectureCycleRef is invalid');
  }
  const requiredOutcomes = input.requiredOutcomes === undefined
    ? undefined
    : [...new Set(input.requiredOutcomes.map((value, index) => nonEmpty(value, `requiredOutcomes[${index}]`)))].sort();
  if (requiredOutcomes !== undefined && requiredOutcomes.length === 0) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'requiredOutcomes must not be empty');
  }
  const ref = ownerDecisionRefFor({
    decision: input.decision,
    deliveryId,
    sourceRef,
    ...(changeId !== undefined ? { changeId } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(requiredOutcomes !== undefined ? { requiredOutcomes } : {}),
    ...(architectureCycleRef !== undefined ? { architectureCycleRef } : {}),
  });
  return {
    ref,
    decision: input.decision,
    deliveryId,
    ...(changeId !== undefined ? { changeId } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(requiredOutcomes !== undefined ? { requiredOutcomes } : {}),
    ...(architectureCycleRef !== undefined ? { architectureCycleRef } : {}),
    sourceRef,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function activeDeliveryIds(repoRoot: string): Promise<readonly string[]> {
  const dir = join(repoRoot, 'openspec', 'delivery-groups');
  let entries: string[] = [];
  try {
    entries = (await readdir(dir)).filter((entry) => entry.endsWith('.yaml')).sort();
  } catch {
    return [];
  }
  const active: string[] = [];
  for (const entry of entries) {
    const content = await readFile(join(dir, entry), 'utf8');
    const parsed = parseYaml(content);
    if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null || Array.isArray(parsed.value)) {
      throw new FlowkitError('MANIFEST_PARSE_FAILED', `cannot parse ${entry}`);
    }
    const root = parsed.value as Record<string, unknown>;
    const delivery = root['delivery'];
    const id = root['id'];
    if (
      typeof id === 'string' &&
      typeof delivery === 'object' &&
      delivery !== null &&
      !Array.isArray(delivery) &&
      (delivery as Record<string, unknown>)['state'] === 'active'
    ) {
      active.push(id);
    }
  }
  return active;
}

function manifestPath(repoRoot: string, deliveryId: string): string {
  return join(repoRoot, 'openspec', 'delivery-groups', `${deliveryId}.yaml`);
}

async function readSnapshot(repoRoot: string, deliveryId: string): Promise<FormalFactSnapshot> {
  return readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
}

function assertConflictFree(snapshot: FormalFactSnapshot): void {
  if (snapshot.conflicts.length > 0) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'formal facts contain conflicts', {
      dimensions: snapshot.conflicts.map((conflict) => conflict.dimension),
    });
  }
}

function today(now: () => Date): string {
  return now().toISOString().slice(0, 10);
}

export async function createDelivery(
  repoRoot: string,
  rawInput: unknown,
  sourceRef: string,
  options: A1ServiceOptions = {},
): Promise<WriteOperationResult> {
  const input = validateDeliveryCreateInput(rawInput);
  const ownerSourceRef = nonEmpty(sourceRef, 'sourceRef');
  const active = await activeDeliveryIds(repoRoot);
  if (active.length !== 0) {
    throw new FlowkitError('ACTIVE_DELIVERY_EXISTS', `expected no active Delivery, found ${active.join(', ')}`);
  }
  const path = manifestPath(repoRoot, input.id);
  if (await pathExists(path)) {
    throw new FlowkitError('DELIVERY_ALREADY_EXISTS', `Delivery already exists: ${input.id}`);
  }
  const record = buildOwnerDecisionRecord({
    decision: 'create-delivery',
    deliveryId: input.id,
    sourceRef: ownerSourceRef,
  });
  const now = options.now ?? (() => new Date());
  const content = serializeNewDeliveryManifest(input, today(now), record);
  await mkdir(join(repoRoot, 'openspec', 'delivery-groups'), { recursive: true });
  await (options.atomicWrite ?? atomicWriteFile)(path, content);
  return { deliveryId: input.id, ownerDecisionRef: record.ref, state: 'active' };
}

export async function createChange(
  repoRoot: string,
  rawInput: unknown,
  sourceRef: string,
  options: A1ServiceOptions = {},
): Promise<WriteOperationResult> {
  const input = validateChangeCreateInput(rawInput);
  const deliveryId = await discoverActiveDelivery(repoRoot);
  const snapshot = await readSnapshot(repoRoot, deliveryId);
  assertConflictFree(snapshot);
  if (snapshot.deliveryState !== 'active') {
    throw new FlowkitError('DELIVERY_NOT_ACTIVE', `Delivery ${deliveryId} is not active`);
  }

  const policyResult = next(snapshot);
  const failedBoundary = policyResult.kind === 'blocked' && policyResult.diagnosis.reason === 'full-test-failed';
  const architectureRemediationBoundary =
    snapshot.deliveryFullTestRawStatus === 'passed'
    && snapshot.deliveryFullTestStatus === 'passed'
    && snapshot.architectureCurrentCycle?.acceptance.status === 'awaiting-owner-decision';
  if (failedBoundary) {
    if (input.corrective === undefined) {
      throw new FlowkitError('CORRECTIVE_BINDING_REQUIRED', 'full-test-failed boundary requires change.corrective binding');
    }
    if (!input.required) {
      throw new FlowkitError('CORRECTIVE_CHANGE_MUST_BE_REQUIRED', 'corrective Change must be required=true');
    }
    const current = snapshot.currentDeliveryFullTestFinding;
    if (current === undefined || snapshot.deliveryFullTestResult === undefined) {
      throw new FlowkitError('CORRECTIVE_FINDING_UNAVAILABLE', 'current Full Test failure occurrence is unavailable');
    }
    if (
      input.corrective.findingId !== current.findingId
      || input.corrective.authorizationRef !== current.authorizationRef
      || input.corrective.sourceResultRef !== current.sourceResultRef
    ) {
      throw new FlowkitError('CORRECTIVE_BINDING_MISMATCH', 'corrective binding does not match current Full Test failure occurrence');
    }
  } else if (input.corrective !== undefined) {
    throw new FlowkitError('CORRECTIVE_BINDING_NOT_ALLOWED', 'change.corrective is allowed only at the full-test-failed boundary');
  }

  if (architectureRemediationBoundary) {
    if (input.architectureRemediation === undefined) {
      throw new FlowkitError('ARCHITECTURE_REMEDIATION_BINDING_REQUIRED', 'passed architecture gate requires change.architectureRemediation binding');
    }
    if (!input.required) {
      throw new FlowkitError('ARCHITECTURE_REMEDIATION_CHANGE_MUST_BE_REQUIRED', 'architecture remediation Change must be required=true');
    }
    if (input.architectureRemediation.cycleRef !== snapshot.architectureCurrentCycle!.cycleRef) {
      throw new FlowkitError('ARCHITECTURE_REMEDIATION_BINDING_MISMATCH', 'architecture remediation binding does not match current cycle');
    }
  } else if (input.architectureRemediation !== undefined) {
    throw new FlowkitError('ARCHITECTURE_REMEDIATION_BINDING_NOT_ALLOWED', 'change.architectureRemediation is allowed only at passed + awaiting architecture acceptance boundary');
  }

  const ids = new Set(snapshot.changes.map((change) => change.id));
  const keys = new Set(snapshot.changes.map((change) => change.key));
  if (ids.has(input.id) || keys.has(input.key)) {
    throw new FlowkitError('CHANGE_ALREADY_EXISTS', `Change key/id already exists: ${input.key}/${input.id}`);
  }
  validateNoDuplicateStrings(input.dependsOn, 'change.dependsOn');
  for (const dependency of input.dependsOn) {
    if (!ids.has(dependency)) {
      throw new FlowkitError('INVALID_DEPENDENCY', `Unknown dependency ${dependency}`);
    }
  }

  const record = buildOwnerDecisionRecord({
    decision: 'create-change',
    deliveryId,
    changeId: input.id,
    sourceRef: nonEmpty(sourceRef, 'sourceRef'),
    ...(architectureRemediationBoundary ? { architectureCycleRef: snapshot.architectureCurrentCycle!.cycleRef } : {}),
  });
  const path = manifestPath(repoRoot, deliveryId);
  const original = await readFile(path, 'utf8');
  const doc = DeliveryManifestDocument.parse(original);
  if (failedBoundary) {
    const current = snapshot.currentDeliveryFullTestFinding!;
    const failedResult = snapshot.deliveryFullTestResult!;
    const resolved: ResolvedFullTestFailureFinding = {
      ...current,
      summary: failedResult.summary,
      resolution: {
        kind: 'corrective-change-created',
        changeId: input.id,
        ownerDecisionRef: record.ref,
      },
    };
    doc.retainFullTestFailureResult(failedResult);
    doc.appendResolvedFullTestFinding(resolved);
    doc.appendChange({ ...input, state: 'planned' });
    doc.appendOwnerDecision(record);
    doc.removeFullTestResult();
    doc.updateFullTestStatus('failed', 'not-ready');
  } else if (architectureRemediationBoundary) {
    doc.appendChange({ ...input, state: 'planned' });
    doc.appendOwnerDecision(record);
    doc.removeFullTestResult();
    doc.updateFullTestStatus('passed', 'not-ready');
    doc.removeArchitectureCurrentCycle();
  } else {
    doc.appendChange({ ...input, state: 'planned' });
    doc.appendOwnerDecision(record);
  }
  await (options.atomicWrite ?? atomicWriteFile)(path, doc.toString());
  return { deliveryId, changeId: input.id, ownerDecisionRef: record.ref, state: 'planned' };
}

function expectedAuthorizationTarget(
  snapshot: FormalFactSnapshot,
  decision: AuthorizationOnlyOwnerDecision,
  policyResult: ReturnType<typeof next>,
): string | undefined {
  if (!CHANGE_SCOPED_AUTH.has(decision)) return undefined;
  if (decision === 'authorize-apply' || decision === 'authorize-archive') {
    const active = snapshot.changes.filter((change) => change.state === 'active');
    if (active.length !== 1) {
      throw new FlowkitError('OWNER_DECISION_TARGET_MISMATCH', 'current Change target is not unique');
    }
    return active[0]!.id;
  }
  const changeKey = policyResult.kind === 'owner-decision' ? policyResult.context.changeKey : undefined;
  if (changeKey === undefined) {
    throw new FlowkitError('OWNER_DECISION_TARGET_MISMATCH', 'checkpoint decision is missing change target');
  }
  const matches = snapshot.changes.filter((change) => change.key === changeKey);
  if (matches.length !== 1) {
    throw new FlowkitError('OWNER_DECISION_TARGET_MISMATCH', `cannot resolve Change target for key ${changeKey}`);
  }
  return matches[0]!.id;
}

export async function recordOwnerDecision(
  repoRoot: string,
  input: {
    readonly decision: string;
    readonly sourceRef: string;
    readonly changeId?: string;
    readonly scope?: string;
    readonly requiredOutcomes?: readonly string[];
  },
  options: A1ServiceOptions = {},
): Promise<WriteOperationResult> {
  const isAuthorization = (AUTHORIZATION_ONLY_OWNER_DECISIONS as readonly string[]).includes(input.decision);
  const isContractReset = input.decision === 'contract-reset';
  const isArchitectureAcceptance = input.decision === 'accept-architecture';
  if (!isAuthorization && !isContractReset && !isArchitectureAcceptance) {
    throw new FlowkitError('OWNER_DECISION_NOT_RECORDABLE', `owner record does not support ${input.decision}`);
  }
  const decision = input.decision as OwnerDecisionRecordKind;
  const deliveryId = await discoverActiveDelivery(repoRoot);
  const sourceRef = nonEmpty(input.sourceRef, 'sourceRef');
  const path = manifestPath(repoRoot, deliveryId);

  if (isArchitectureAcceptance) {
    if (input.changeId !== undefined || input.scope !== undefined || input.requiredOutcomes !== undefined) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'accept-architecture is delivery-scoped and accepts only sourceRef');
    }
    const snapshot = await readSnapshot(repoRoot, deliveryId);
    assertConflictFree(snapshot);
    const cycle = snapshot.architectureCurrentCycle;
    if (cycle === undefined) {
      throw new FlowkitError('ARCHITECTURE_CYCLE_UNAVAILABLE', 'accept-architecture requires a current architecture cycle');
    }
    const record = buildOwnerDecisionRecord({
      decision: 'accept-architecture',
      deliveryId,
      sourceRef,
      architectureCycleRef: cycle.cycleRef,
    });
    if (
      cycle.acceptance.status === 'accepted'
      && cycle.acceptance.ownerDecisionRef === record.ref
      && snapshot.acceptedSystemSource?.ownerAcceptanceRef === record.ref
    ) {
      return { deliveryId, ownerDecisionRef: record.ref, idempotent: true };
    }
    const current = next(snapshot);
    if (
      current.kind !== 'owner-decision'
      || current.decision !== 'accept-architecture'
      || current.context.architectureCycleRef !== cycle.cycleRef
      || cycle.acceptance.status !== 'awaiting-owner-decision'
    ) {
      throw new FlowkitError('OWNER_DECISION_GATE_MISMATCH', 'current Policy is not requesting accept-architecture for the current cycle');
    }
    const acceptedCycle = {
      ...cycle,
      acceptance: { status: 'accepted' as const, ownerDecisionRef: record.ref },
    };
    const acceptedSource = acceptedSystemSourceFor({
      sourceDeliveryId: deliveryId,
      cycle: acceptedCycle,
      ownerAcceptanceRef: record.ref,
    });
    const original = await readFile(path, 'utf8');
    const doc = DeliveryManifestDocument.parse(original);
    doc.appendOwnerDecision(record);
    doc.publishArchitectureAcceptance(acceptedCycle, acceptedSource);
    await (options.atomicWrite ?? atomicWriteFile)(path, doc.toString());
    return { deliveryId, ownerDecisionRef: record.ref };
  }

  if (isContractReset) {
    if (input.changeId === undefined || input.scope === undefined || input.requiredOutcomes === undefined) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'contract-reset requires --change, scope and requiredOutcomes');
    }
  }
  const record = buildOwnerDecisionRecord({
    decision,
    deliveryId,
    sourceRef,
    ...(input.changeId !== undefined ? { changeId: input.changeId } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.requiredOutcomes !== undefined ? { requiredOutcomes: input.requiredOutcomes } : {}),
  });

  const retryProbe = DeliveryManifestDocument.parse(await readFile(path, 'utf8'));
  const retryProbeResult = retryProbe.appendOwnerDecision(record);
  if (!retryProbeResult.changed) {
    return {
      deliveryId,
      ...(input.changeId !== undefined ? { changeId: input.changeId } : {}),
      ownerDecisionRef: record.ref,
      idempotent: true,
    };
  }

  const snapshot = await readSnapshot(repoRoot, deliveryId);
  assertConflictFree(snapshot);

  if (isContractReset) {
    const target = snapshot.changes.find((change) => change.id === input.changeId);
    if (target === undefined || target.state !== 'active') {
      throw new FlowkitError('OWNER_DECISION_TARGET_MISMATCH', 'contract-reset target must be the active Change', {
        requestedChangeId: input.changeId,
        targetState: target?.state,
      });
    }
  } else {
    const authorizationDecision = decision as AuthorizationOnlyOwnerDecision;
    const current = next(snapshot);
    if (current.kind !== 'owner-decision' || current.decision !== authorizationDecision) {
      throw new FlowkitError('OWNER_DECISION_GATE_MISMATCH', `current Policy is not requesting ${authorizationDecision}`);
    }
    const expectedChangeId = expectedAuthorizationTarget(snapshot, authorizationDecision, current);
    if (expectedChangeId !== input.changeId) {
      throw new FlowkitError('OWNER_DECISION_TARGET_MISMATCH', 'requested Owner record target does not match current Policy', {
        expectedChangeId,
        requestedChangeId: input.changeId,
      });
    }
  }

  const original = await readFile(path, 'utf8');
  const doc = DeliveryManifestDocument.parse(original);
  const insertion = doc.appendOwnerDecision(record);
  if (insertion.changed && decision === 'authorize-full-test') {
    const raw = snapshot.deliveryFullTestRawStatus;
    if (raw !== 'not-ready' && raw !== 'awaiting-user-decision') {
      throw new FlowkitError('FULL_TEST_STATUS_MISMATCH', `authorize-full-test requires raw not-ready|awaiting-user-decision, got ${String(raw)}`);
    }
    doc.updateFullTestStatus(raw, 'authorized');
  }
  if (insertion.changed) {
    await (options.atomicWrite ?? atomicWriteFile)(path, doc.toString());
  }
  return {
    deliveryId,
    ...(input.changeId !== undefined ? { changeId: input.changeId } : {}),
    ownerDecisionRef: record.ref,
    idempotent: !insertion.changed,
  };
}

export async function ensureMinimalOpenSpecMetadata(
  repoRoot: string,
  changeId: string,
  options: A1ServiceOptions = {},
): Promise<{ path: string; created: boolean }> {
  nonEmpty(changeId, 'changeId');
  const mode = options.specDeltaMode ?? 'required';
  const dir = join(repoRoot, 'openspec', 'changes', changeId);
  const path = join(dir, '.openspec.yaml');
  const now = options.now ?? (() => new Date());
  const expected = `schema: spec-driven\ncreated: ${today(now)}\n${mode === 'skip' ? 'skip_specs: true\n' : ''}`;
  if (await pathExists(path)) {
    const current = await readFile(path, 'utf8');
    const exactRequired = /^schema: spec-driven\ncreated: \d{4}-\d{2}-\d{2}\n$/.test(current);
    const exactSkip = /^schema: spec-driven\ncreated: \d{4}-\d{2}-\d{2}\nskip_specs: true\n$/.test(current);
    if ((mode === 'required' && exactRequired) || (mode === 'skip' && exactSkip)) {
      return { path, created: false };
    }
    throw new FlowkitError('OPENSPEC_METADATA_MISMATCH', `existing OpenSpec metadata does not match specDeltaMode=${mode} for ${changeId}`);
  }
  await mkdir(dir, { recursive: true });
  await (options.atomicWrite ?? atomicWriteFile)(path, expected);
  return { path, created: true };
}

const CURRENT_DELIVERY_BOUNDED_REQUIRED_COMPAT = new Set([
  'review-findings-and-blocker-authority',
  'change-verification-selection-and-change-set',
  'archive-and-checkpoint-boundary',
  'change-cli-end-to-end-and-performance',
]);

function resolveActivationSpecDeltaMode(
  deliveryId: string,
  changeId: string,
  requested: A1ServiceOptions['specDeltaMode'],
): 'required' | 'skip' {
  if (requested !== undefined) return requested;
  if (deliveryId === '20260810-01-change-execution-loop' && CURRENT_DELIVERY_BOUNDED_REQUIRED_COMPAT.has(changeId)) {
    return 'required';
  }
  throw new FlowkitError(
    'SPEC_DELTA_MODE_REQUIRED',
    `activation requires explicit specDeltaMode=required|skip for ${changeId}`,
    { deliveryId, changeId },
  );
}

export async function activateChange(
  repoRoot: string,
  changeId: string,
  sourceRef: string,
  options: A1ServiceOptions = {},
): Promise<WriteOperationResult> {
  const requestedChangeId = nonEmpty(changeId, 'changeId');
  const deliveryId = await discoverActiveDelivery(repoRoot);
  const snapshot = await readSnapshot(repoRoot, deliveryId);
  assertConflictFree(snapshot);
  if (snapshot.deliveryState !== 'active') {
    throw new FlowkitError('DELIVERY_NOT_ACTIVE', `Delivery ${deliveryId} is not active`);
  }
  const active = snapshot.changes.filter((change) => change.state === 'active');
  if (active.length !== 0) {
    throw new FlowkitError('ACTIVE_CHANGE_EXISTS', `cannot activate while ${active.map((change) => change.id).join(', ')} is active`);
  }
  const target = snapshot.changes.find((change) => change.id === requestedChangeId);
  if (target === undefined || target.state !== 'planned') {
    throw new FlowkitError('CHANGE_NOT_PLANNED', `Change ${requestedChangeId} is not planned`);
  }
  for (const dependency of target.dependsOn) {
    if (!snapshot.changes.some((change) => change.id === dependency && change.state === 'completed')) {
      throw new FlowkitError('DEPENDENCY_INCOMPLETE', `dependency ${dependency} is not completed`);
    }
  }

  const current = next(snapshot);
  if (
    current.kind !== 'owner-decision' ||
    current.decision !== 'activate-change' ||
    !current.context.eligibleChangeKeys?.includes(target.key)
  ) {
    throw new FlowkitError('ACTIVATION_POLICY_MISMATCH', `Policy does not currently allow activation of ${requestedChangeId}`);
  }

  const specDeltaMode = resolveActivationSpecDeltaMode(deliveryId, requestedChangeId, options.specDeltaMode);

  const record = buildOwnerDecisionRecord({
    decision: 'activate-change',
    deliveryId,
    changeId: requestedChangeId,
    sourceRef: nonEmpty(sourceRef, 'sourceRef'),
  });

  // Safe partial ordering: exact OpenSpec metadata first.
  await ensureMinimalOpenSpecMetadata(repoRoot, requestedChangeId, { ...options, specDeltaMode });

  const path = manifestPath(repoRoot, deliveryId);
  const original = await readFile(path, 'utf8');
  const doc = DeliveryManifestDocument.parse(original);
  doc.appendOwnerDecision(record);
  doc.updateChangeState(requestedChangeId, 'planned', 'active');
  await (options.atomicWrite ?? atomicWriteFile)(path, doc.toString());
  return {
    deliveryId,
    changeId: requestedChangeId,
    ownerDecisionRef: record.ref,
    state: 'active',
  };
}
