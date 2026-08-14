/**
 * C1 formal-fact-reader-and-persistence: physical transport schemas + physical
 * projection validators.
 *
 * C1 owns the physical schemas for `context.json` (`ContextFile`) and
 * `result.json` (`RunResultFile`). Both are symmetric C1-owned schemas; B1 owns
 * only the logical domain types (`Run`, `ActionResult`, `ResultRef`).
 *
 * Validators:
 *   - `validateResultRefProjection` — C1's own ResultRef validator (B1's
 *     `validateResultRef` is private / not exported).
 *   - `validateActionResultWithoutRunRef` — validates the non-self-referential
 *     projection of ActionResult (runRef omitted, derived on read).
 *   - `validateContextFile` — schemaVersion:2 + required fields + Action-scope
 *     rules + inputRef projection.
 *   - `validateContextFileIdentity` — path consistency between ContextFile and
 *     the actual filesystem Run directory.
 *   - `validateRunResultFileCombination` — runStatus × actionResult combination
 *     gate (executionStatus single-source-of-truth).
 */

import { createHash } from 'node:crypto';
import {
  isFormalAction,
  isChangeAction,
  isRoleAllowedForAction,
  CHANGE_ACTIONS,
  getActionDefinition,
} from '../domain/actions.js';
import type { ChangeAction } from '../domain/actions.js';
import { isExecutionStatus } from '../domain/schema-validator.js';
import { FlowkitError } from '../shared/errors.js';
import { normalizeSeparators } from '../shared/paths.js';
import { parseRunId } from '../domain/run-id.js';
import {
  RUN_RESULT_KIND,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
  RESULT_REF_KINDS,
  normalizeArtifactLogicalRef,
} from './result-ref-adapter.js';
import type {
  ActionResult,
  ResultRef,
  ReviewVerdictValue,
  Role,
  BlockingAuthority,
  OwnerFactRef,
  EntryWorkspaceIdentity,
  MutationDeclaration,
  VersionedAuthorityRef,
  ActionPackageV2,
} from '../domain/types.js';
import { BLOCKING_AUTHORITIES } from '../domain/types.js';
import {
  OPENSPEC_ARCHIVE_SURFACE_VERSION,
  type ArchiveMutationGuard,
  type OpenSpecArchiveSuccessObservation,
  type OpenSpecArchiveFailureObservation,
  type ArchiveEntryOpenSpecProjection,
  OPENSPEC_SUPPORTED_ARTIFACT_IDS,
} from '../integrations/openspec/openspec-types.js';

// ---------------------------------------------------------------------------
// TerminalRunStatus + ActionResultWithoutRunRef
// ---------------------------------------------------------------------------

/**
 * Terminal Run statuses that may appear as `RunResultFile.runStatus`.
 * `pending` is intentionally absent — a pending Run has no result.json.
 */
export type TerminalRunStatus = 'completed' | 'failed' | 'cancelled';

/**
 * ActionResult with the self-referential `runRef` omitted. This is the shape
 * serialized to `result.json`; `runRef` is derived on read from the file
 * content SHA-256 (D7: non-self-referential serialization boundary).
 */
export type ActionResultWithoutRunRef = Omit<ActionResult, 'runRef'>;

// ---------------------------------------------------------------------------
// ReviewFinding (Q1 typed reviewer payload)
// ---------------------------------------------------------------------------

/**
 * Typed review finding — the minimal Reviewer-owned payload stored in a
 * completed `review-*` Run's `result.json`. Core validates this typed schema;
 * free-text findings arrays (`blockingFindings`, `nonBlockingFindings`) are
 * rejected by the closed schema.
 *
 * Q1: blocking findings declare exactly one `blockingAuthority`. Author-owned
 * blockers also declare `requiredChange`; non-author blockers MUST NOT.
 */
export interface ReviewFinding {
  /** Non-empty stable finding ID (e.g. "Q1-RP-001"). */
  readonly id: string;
  /** `blocking` or `non-blocking`. */
  readonly severity: 'blocking' | 'non-blocking';
  /** Non-empty short title. */
  readonly title: string;
  /** Non-empty description of the problem. */
  readonly problem: string;
  /** Optional location reference (file path, line range, or section). */
  readonly location?: string;
  /** Required for blocking severity; absent for non-blocking findings. */
  readonly blockingAuthority?: BlockingAuthority;
  /** Required only when blockingAuthority=author. */
  readonly requiredChange?: string;
}

export interface ReviewFindingV2 {
  readonly id: string;
  readonly severity: 'blocking' | 'non-blocking';
  readonly title: string;
  readonly problem: string;
  readonly contractRef: string;
  readonly invariant: string;
  readonly evidence: readonly string[];
  readonly impact: string;
  readonly location?: string;
  readonly blockingAuthority?: BlockingAuthority;
  readonly requiredOutcome?: string;
  readonly acceptance?: readonly string[];
}

export interface FindingConvergence {
  readonly findingId: string;
  readonly state: 'new' | 'still-open' | 'resolved' | 'superseded';
  readonly supersededByFindingId?: string;
}

// ---------------------------------------------------------------------------
// RunResultFile (result.json physical schema)
// ---------------------------------------------------------------------------

/**
 * Physical schema for `result.json`.
 *
 * The top level MUST NOT carry `executionStatus` (D8: single source of truth).
 * When `actionResult` is present, `executionStatus` is derived from
 * `actionResult.executionStatus`. When absent (runStatus=failed/cancelled),
 * there is no `executionStatus`.
 *
 * `reviewVerdict` (C1-AP-004) is the canonical review verdict payload for
 * `review-*` Runs. It is optional at the schema level (non-review Runs do not
 * carry it), but the Reader treats a missing `reviewVerdict` on a completed
 * `review-*` Run as a `FactConflict` — the verdict-to-reviewed-Run linkage is
 * a required Policy input.
 *
 * Q1: `reviewFindings` is the typed Reviewer-owned payload for completed
 * `review-*` Runs. Non-review Runs MUST NOT carry it. The closed schema
 * rejects free-text findings arrays (`blockingFindings`, `nonBlockingFindings`,
 * `resolvedFindings`) and other heavy bookkeeping fields (`verification[]`,
 * `archiveResults`, `manifestUpdate`, `policyRoute`, `commitPolicy`,
 * `consistencyScan`).
 */

export interface RunTerminalBinding {
  readonly schemaVersion: 1;
  /** Canonical digest of the provider/executor logical terminal descriptor. */
  readonly logicalDescriptorDigest: string;
  /** Required only for completed v5 Apply/revise-apply terminals. */
  readonly verificationSelection?: {
    readonly logicalRef: string;
    readonly versionFingerprint: string;
  };
}

export interface RunResultFile {
  readonly runStatus: TerminalRunStatus;
  /** Required when `runStatus === 'completed'`. */
  readonly actionResult?: ActionResultWithoutRunRef;
  /** Present when `runStatus === 'failed'`. */
  readonly failureDiagnosis?: string;
  /** Present when `runStatus === 'cancelled'`. */
  readonly cancellationReason?: string;
  /** Present for completed `review-*` Runs (C1-AP-004 canonical verdict payload). */
  readonly reviewVerdict?: ReviewVerdictValue;
  /** D1 writer marker; absent means historical Q1 transitional finding shape. */
  readonly reviewFindingSchemaVersion?: 2;
  /** Reviewer-owned findings. */
  readonly reviewFindings?: readonly (ReviewFinding | ReviewFindingV2)[];
  /** D1 pairwise previous→current finding closure. */
  readonly reviewFindingConvergence?: readonly FindingConvergence[];
  /** E1 v5 exact replay binding; absent on immutable historical terminal results. */
  readonly terminalBinding?: RunTerminalBinding;
}

// ---------------------------------------------------------------------------
// ContextFile (context.json physical schema)
// ---------------------------------------------------------------------------

/**
 * Constraints declared for a Run. All fields optional — the constraint set
 * varies by Action and role.
 */
export interface ContextFileConstraints {
  readonly mayCreateProposalArtifacts?: boolean;
  readonly mayWriteProductionCode?: boolean;
  readonly mayWriteTestCode?: boolean;
  readonly mayModifyProposalArtifacts?: boolean;
  readonly mayCheckpoint?: boolean;
  readonly mayFullTest?: boolean;
  readonly commitAllowed?: boolean;
}

/**
 * Physical schema for `context.json` — the Run input context and the
 * deterministic current-Run projection source.
 *
 * C1 Runs use `schemaVersion: 2` as the C1 format marker, distinct from the
 * Bootstrap corpus's `schemaVersion: 1` (D15/D16). Action-scope rules govern
 * `changeKey`/`changeId` presence (C1-PR-008). `inputRef` is an optional
 * `ResultRef` projecting directly to `Run.inputRef` (C1-PR-007).
 *
 * `reviewedRunId` (C1-AP-004) is the canonical reviewed-Run linkage for
 * `review-*` Runs — the Run being reviewed. It is required for `review-*`
 * actions and MUST be absent for non-review actions. This is distinct from
 * `sourceReviewRun`, which is the prior review being addressed by a
 * `revise-*` Run.
 */
interface ContextFileBase {
  readonly runId: string;
  readonly deliveryId: string;
  /** Every current schemaVersion 2 Run is Change-scoped. */
  readonly changeKey: string;
  readonly changeId: string;
  readonly action: ChangeAction;
  readonly role: Role;
  readonly ownerAuthorization: string;
  /**
   * B1 compact semantic authority identity for pending-run continuation.
   * Historical pre-B1 Runs may omit it; every Run prepared through the B1
   * high-level surface persists it.
   */
  readonly semanticInputFingerprint?: string;
  /** D1 bounded structured Owner fact refs; current writers use v3. Transitional v2 bytes are read-only and ignored. */
  readonly ownerFactRefs?: readonly OwnerFactRef[];
  /** Optional ResultRef projecting directly to `Run.inputRef`. */
  readonly inputRef?: ResultRef;
  /**
   * Q2/v6: review-apply entry-time binding over current verification.md.
   * Core derives this field when the review Run is created; callers never
   * supply it. It is required only for review-apply and survives resume so
   * terminal completion can detect review-period drift.
   */
  readonly verificationInputRef?: ResultRef;
  /** Prior review being addressed by a `revise-*` Run. */
  readonly sourceReviewRun?: string;
  /** Verdict of the prior review being addressed by a `revise-*` Run. */
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  /** Run being reviewed by a `review-*` Run (C1-AP-004 canonical linkage). */
  readonly reviewedRunId?: string;
  /** D2 future archive entry semantic projection; v4 archive-only. */
  readonly archiveEntryOpenSpecProjection?: ArchiveEntryOpenSpecProjection;
  /** C1 OpenSpec archive-only machine operational recovery field. */
  readonly archiveMutationGuard?: ArchiveMutationGuard;
  readonly constraints?: ContextFileConstraints;
  /** MUST be consistent with the actual filesystem Run directory path. */
  readonly runPath: string;
}

/** Immutable historical context contracts. They never acquire v5 fields. */
export interface HistoricalContextFile extends ContextFileBase {
  readonly schemaVersion: 2 | 3 | 4;
}

interface ContextFileV5Common extends ContextFileBase {
  readonly schemaVersion: 5;
  /** Git identity used by Core to derive the final actualChangeSet. */
  readonly canonicalBase: string;
  /** Frozen applicable contract / Owner fact identities at Action entry. */
  readonly applicableFactRefs: readonly VersionedAuthorityRef[];
  /** Immutable minimal package view used by exact resume; never recomputed through Policy. */
  readonly actionPackage: ActionPackageV2;
}

export interface ContextFileV5Apply extends ContextFileV5Common {
  readonly action: 'apply' | 'revise-apply';
  readonly entryWorkspaceIdentity: EntryWorkspaceIdentity;
  readonly mutationDeclaration: MutationDeclaration;
}

export interface ContextFileV5NonApply extends ContextFileV5Common {
  readonly action: Exclude<ChangeAction, 'apply' | 'revise-apply'>;
  readonly entryWorkspaceIdentity?: never;
  readonly mutationDeclaration?: never;
}

/** Closed physical context schema. New writers only emit the v5 variants. */
export type ContextFile = HistoricalContextFile | ContextFileV5Apply | ContextFileV5NonApply;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Reject with a `SCHEMA_VALIDATION_FAILED` FlowkitError.
 */
function schemaFail(message: string, context?: Record<string, unknown>): never {
  throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message, context);
}

/**
 * Require a string field on a record; throw `SCHEMA_VALIDATION_FAILED` if
 * missing or not a string.
 */
function requireString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string') {
    schemaFail(`Field ${field} must be a string`, { field });
  }
  return v;
}

/**
 * Require a non-empty string field (after trimming).
 */
function requireNonEmptyString(obj: Record<string, unknown>, field: string): string {
  const v = requireString(obj, field);
  if (v.trim() === '') {
    schemaFail(`Field ${field} must be a non-empty string`, { field });
  }
  return v;
}

/**
 * Ensure a value is a plain object (not null, not array).
 */
function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    schemaFail(`${label} must be an object`, { value });
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// validateResultRefProjection (C1-owned ResultRef validator)
// ---------------------------------------------------------------------------

/**
 * Known fields for ResultRef closed-schema validation.
 */
const RESULT_REF_KNOWN_FIELDS = new Set(['ref', 'versionFingerprint', 'kind']);

/**
 * C1's own ResultRef validator. Validates that `ref` and `versionFingerprint`
 * are non-empty strings and that `kind` is a non-empty member of the Core-owned
 * {@link RESULT_REF_KINDS} enum.
 *
 * Q1-RA-004: `kind` is REQUIRED for every schemaVersion 2 ResultRef projection.
 * Missing, empty, or unknown kind is rejected. Legacy schemaVersion 1 is
 * handled separately by the legacy recognizer and never reaches this validator.
 *
 * Q1: closed schema — unknown fields are rejected (not passed through).
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` when validation fails.
 */
export function validateResultRefProjection(value: unknown): ResultRef {
  const obj = asObject(value, 'ResultRef');

  // Closed schema: reject unknown fields.
  for (const key of Object.keys(obj)) {
    if (!RESULT_REF_KNOWN_FIELDS.has(key)) {
      schemaFail(`ResultRef contains unknown field: ${key}`, { field: key });
    }
  }

  const ref = requireNonEmptyString(obj, 'ref');
  const versionFingerprint = requireNonEmptyString(obj, 'versionFingerprint');

  // Q1-RA-004: kind is REQUIRED (non-empty, in the Core-owned enum).
  const kindRaw = obj['kind'];
  if (kindRaw === undefined) {
    schemaFail('ResultRef.kind is required for schemaVersion 2 projections', { ref });
  }
  if (typeof kindRaw !== 'string') {
    schemaFail('ResultRef.kind must be a string', { kind: kindRaw });
  }
  if (kindRaw.trim() === '') {
    schemaFail('ResultRef.kind must be a non-empty string', { kind: kindRaw });
  }
  if (!(RESULT_REF_KINDS as readonly string[]).includes(kindRaw)) {
    schemaFail(
      `ResultRef.kind must be one of ${RESULT_REF_KINDS.join(', ')}, got: ${kindRaw}`,
      { kind: kindRaw },
    );
  }
  const result: ResultRef = {
    ref,
    versionFingerprint,
    kind: kindRaw,
  };
  return result;
}

// ---------------------------------------------------------------------------
// validateActionResultWithoutRunRef
// ---------------------------------------------------------------------------

/**
 * Known fields for ActionResultWithoutRunRef closed-schema validation.
 */
const ACTION_RESULT_KNOWN_FIELDS = new Set([
  'action',
  'executionStatus',
  'summary',
  'producedResultRefs',
  'consumedInputRefs',
  'verificationSummaryRef',
  'reviewVerdictRef',
  'failureDiagnosis',
  'nextActionRecommendation',
]);

/**
 * Validate an unknown value as {@link ActionResultWithoutRunRef}.
 *
 * `runRef` MUST be absent — it is derived on read from the file content
 * SHA-256 (D7). Required fields: `action` (in B1 Action Catalog),
 * `executionStatus` (via B1 `isExecutionStatus`), `summary` (non-empty
 * string). Nested ResultRef fields are validated via
 * {@link validateResultRefProjection} with field-specific kind binding.
 *
 * Q1: closed schema — unknown fields are rejected. Field-specific kind
 * binding enforces:
 *   - `producedResultRefs` → kind MUST be `produced-artifact`
 *   - `consumedInputRefs` → kind MUST be `run-result`
 *   - `verificationSummaryRef` → kind MUST be `verification-summary`
 *   - `reviewVerdictRef` → kind MUST be `run-result`
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any validation failure.
 * @throws {FlowkitError} `UNKNOWN_ACTION` when `action` is not a formal Action.
 */
export function validateActionResultWithoutRunRef(
  value: unknown,
): ActionResultWithoutRunRef {
  const obj = asObject(value, 'ActionResultWithoutRunRef');

  // runRef MUST be absent (D7: non-self-referential serialization).
  if ('runRef' in obj) {
    schemaFail('runRef must be absent in ActionResultWithoutRunRef (derived on read)', {
      runRef: obj['runRef'],
    });
  }

  // Q1: closed schema — reject unknown fields.
  for (const key of Object.keys(obj)) {
    if (!ACTION_RESULT_KNOWN_FIELDS.has(key)) {
      schemaFail(`ActionResultWithoutRunRef contains unknown field: ${key}`, {
        field: key,
      });
    }
  }

  const action = requireNonEmptyString(obj, 'action');
  if (!isFormalAction(action)) {
    throw new FlowkitError('UNKNOWN_ACTION', `Unknown action: ${action}`, { action });
  }

  const executionStatusRaw = obj['executionStatus'];
  if (!isExecutionStatus(executionStatusRaw)) {
    schemaFail('Field executionStatus must be a valid ExecutionStatus', {
      executionStatus: executionStatusRaw,
    });
  }
  const executionStatus = executionStatusRaw;

  const summary = requireNonEmptyString(obj, 'summary');

  // Optional ResultRef arrays with field-specific kind binding.
  const producedResultRefs = validateOptionalResultRefArray(
    obj,
    'producedResultRefs',
    PRODUCED_ARTIFACT_KIND,
  );
  const consumedInputRefs = validateOptionalResultRefArray(
    obj,
    'consumedInputRefs',
    RUN_RESULT_KIND,
  );

  // Optional single ResultRefs with field-specific kind binding.
  const verificationSummaryRef = validateOptionalResultRef(
    obj,
    'verificationSummaryRef',
    VERIFICATION_SUMMARY_KIND,
  );
  const reviewVerdictRef = validateOptionalResultRef(
    obj,
    'reviewVerdictRef',
    RUN_RESULT_KIND,
  );

  // Optional strings.
  const failureDiagnosis = validateOptionalString(obj, 'failureDiagnosis');
  const nextActionRecommendation = validateOptionalString(obj, 'nextActionRecommendation');

  const result: ActionResultWithoutRunRef = {
    action: action as ChangeAction,
    executionStatus,
    summary,
    ...(producedResultRefs !== undefined && { producedResultRefs }),
    ...(consumedInputRefs !== undefined && { consumedInputRefs }),
    ...(verificationSummaryRef !== undefined && { verificationSummaryRef }),
    ...(reviewVerdictRef !== undefined && { reviewVerdictRef }),
    ...(failureDiagnosis !== undefined && { failureDiagnosis }),
    ...(nextActionRecommendation !== undefined && { nextActionRecommendation }),
  };
  return result;
}

/**
 * Validate an optional ResultRef field with field-specific kind binding.
 *
 * Q1-RA-004: `kind` is always present (enforced by
 * {@link validateResultRefProjection}); this requires EXACT equality with
 * `expectedKind`. No legacy tolerance for absent/mismatched kind.
 */
function validateOptionalResultRef(
  obj: Record<string, unknown>,
  field: string,
  expectedKind: string,
): ResultRef | undefined {
  const v = obj[field];
  if (v === undefined) {
    return undefined;
  }
  const ref = validateResultRefProjection(v);
  // Q1-RA-004: exact field-specific kind equality.
  if (ref.kind !== expectedKind) {
    schemaFail(
      `Field ${field} ResultRef.kind must be ${expectedKind}, got: ${ref.kind}`,
      { field, expectedKind, actualKind: ref.kind },
    );
  }
  return ref;
}

/**
 * Validate an optional ResultRef array with field-specific kind binding.
 *
 * Q1-RA-004: each ref's `kind` MUST exactly equal `expectedKind`.
 */
function validateOptionalResultRefArray(
  obj: Record<string, unknown>,
  field: string,
  expectedKind: string,
): readonly ResultRef[] | undefined {
  const v = obj[field];
  if (v === undefined) {
    return undefined;
  }
  if (!Array.isArray(v)) {
    schemaFail(`Field ${field} must be an array`, { field });
  }
  return v.map((item, i) => {
    try {
      const ref = validateResultRefProjection(item);
      // Q1-RA-004: exact field-specific kind equality.
      if (ref.kind !== expectedKind) {
        schemaFail(
          `Field ${field}[${i}] ResultRef.kind must be ${expectedKind}, got: ${ref.kind}`,
          { field, index: i, expectedKind, actualKind: ref.kind },
        );
      }
      return ref;
    } catch {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Field ${field}[${i}] is not a valid ResultRef`,
        { field, index: i },
      );
    }
  });
}

function validateOptionalString(
  obj: Record<string, unknown>,
  field: string,
): string | undefined {
  const v = obj[field];
  if (v === undefined) {
    return undefined;
  }
  if (typeof v !== 'string') {
    schemaFail(`Field ${field} must be a string`, { field });
  }
  return v;
}


function validateRunTerminalBinding(value: unknown): RunTerminalBinding {
  const obj = asObject(value, 'terminalBinding');
  const keys = Object.keys(obj).sort();
  const allowed = obj['verificationSelection'] === undefined
    ? ['logicalDescriptorDigest', 'schemaVersion']
    : ['logicalDescriptorDigest', 'schemaVersion', 'verificationSelection'];
  if (obj['schemaVersion'] !== 1 || keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    schemaFail('terminalBinding must use the closed schemaVersion 1 shape');
  }
  const digest = obj['logicalDescriptorDigest'];
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
    schemaFail('terminalBinding.logicalDescriptorDigest must be SHA-256');
  }
  const verificationRaw = obj['verificationSelection'];
  let verificationSelection: RunTerminalBinding['verificationSelection'];
  if (verificationRaw !== undefined) {
    const verification = asObject(verificationRaw, 'terminalBinding.verificationSelection');
    const verificationKeys = Object.keys(verification).sort();
    if (verificationKeys.length !== 2 || verificationKeys[0] !== 'logicalRef' || verificationKeys[1] !== 'versionFingerprint') {
      schemaFail('terminalBinding.verificationSelection must use the closed logicalRef/versionFingerprint shape');
    }
    const logicalRef = verification['logicalRef'];
    const versionFingerprint = verification['versionFingerprint'];
    if (typeof logicalRef !== 'string' || logicalRef === '' || logicalRef.startsWith('/') || logicalRef.includes('\\') || logicalRef.split('/').some((part) => part === '' || part === '.' || part === '..')) {
      schemaFail('terminalBinding.verificationSelection.logicalRef must be a normalized repository-relative path');
    }
    if (typeof versionFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(versionFingerprint)) {
      schemaFail('terminalBinding.verificationSelection.versionFingerprint must be SHA-256');
    }
    verificationSelection = { logicalRef, versionFingerprint };
  }
  return { schemaVersion: 1, logicalDescriptorDigest: digest, ...(verificationSelection !== undefined && { verificationSelection }) };
}

// ---------------------------------------------------------------------------
// validateRunResultFileCombination
// ---------------------------------------------------------------------------

/**
 * Known fields for RunResultFile closed-schema validation.
 */
const RUN_RESULT_FILE_KNOWN_FIELDS = new Set([
  'runStatus',
  'actionResult',
  'failureDiagnosis',
  'cancellationReason',
  'reviewVerdict',
  'reviewFindingSchemaVersion',
  'reviewFindings',
  'reviewFindingConvergence',
  'terminalBinding',
]);

/**
 * Validate the `runStatus` × `actionResult` combination gate (D8:
 * executionStatus single-source-of-truth).
 *
 * Allowed combinations:
 *   - completed + actionResult(executionStatus ∈ {completed, failed, blocked})
 *   - failed + no actionResult
 *   - cancelled + no actionResult
 *
 * Rejected combinations:
 *   - pending + any (pending has no result.json)
 *   - completed + no actionResult
 *   - completed + actionResult(executionStatus = in-progress)
 *   - failed + actionResult
 *   - cancelled + actionResult
 *   - top-level `executionStatus` field present
 *
 * Q1: closed schema — unknown fields (including `blockingFindings`,
 * `nonBlockingFindings`, `resolvedFindings`, `verification`, `archiveResults`,
 * `manifestUpdate`, `policyRoute`, `commitPolicy`, `consistencyScan`) are
 * rejected.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any invalid combination.
 */
export function validateRunResultFileCombination(value: RunResultFile): void {
  const obj = asObject(value, 'RunResultFile');

  // Q1: closed schema — reject unknown fields.
  for (const key of Object.keys(obj)) {
    if (!RUN_RESULT_FILE_KNOWN_FIELDS.has(key)) {
      schemaFail(`RunResultFile contains unknown field: ${key} (closed schema rejects heavy bookkeeping fields)`, {
        field: key,
      });
    }
  }

  // Top-level executionStatus MUST be absent (D8).
  if ('executionStatus' in obj) {
    schemaFail('RunResultFile must not carry top-level executionStatus', {
      executionStatus: obj['executionStatus'],
    });
  }

  const runStatus = obj['runStatus'];
  if (runStatus !== 'completed' && runStatus !== 'failed' && runStatus !== 'cancelled') {
    schemaFail('Field runStatus must be completed|failed|cancelled', { runStatus });
  }

  // reviewVerdict (C1-AP-004): optional at the schema level, but when present
  // MUST be a valid ReviewVerdictValue. The action-specific requirement
  // (completed review-* Runs MUST carry reviewVerdict, non-review MUST NOT)
  // is enforced at publication time by validateReviewVerdictIntegrity
  // (C1-AP-006), not here — RunResultFileCombination does not know the action.
  const reviewVerdictRaw = obj['reviewVerdict'];
  if (reviewVerdictRaw !== undefined) {
    if (reviewVerdictRaw !== 'approved' && reviewVerdictRaw !== 'changes-requested') {
      schemaFail('RunResultFile.reviewVerdict must be approved|changes-requested', {
        reviewVerdict: reviewVerdictRaw,
      });
    }
  }

  const findingSchemaVersion = obj['reviewFindingSchemaVersion'];
  if (findingSchemaVersion !== undefined && findingSchemaVersion !== 2) {
    schemaFail('RunResultFile.reviewFindingSchemaVersion must equal 2 when present');
  }

  // reviewFindings — v2 when versioned, historical transitional otherwise.
  const reviewFindingsRaw = obj['reviewFindings'];
  if (reviewFindingsRaw !== undefined) {
    if (!Array.isArray(reviewFindingsRaw)) {
      schemaFail('RunResultFile.reviewFindings must be an array', {
        reviewFindings: reviewFindingsRaw,
      });
    }
    for (let i = 0; i < reviewFindingsRaw.length; i++) {
      if (findingSchemaVersion === 2) validateReviewFindingV2(reviewFindingsRaw[i], i);
      else validateReviewFinding(reviewFindingsRaw[i], i);
    }
    const ids = reviewFindingsRaw.map((finding) => asObject(finding, 'reviewFinding')['id']);
    if (new Set(ids).size !== ids.length) schemaFail('reviewFindings contains duplicate finding IDs');
  }
  const convergenceRaw = obj['reviewFindingConvergence'];
  if (findingSchemaVersion === 2) {
    if (!Array.isArray(convergenceRaw)) schemaFail('v2 review result requires reviewFindingConvergence array');
    for (let i = 0; i < convergenceRaw.length; i += 1) validateFindingConvergence(convergenceRaw[i], i);
    const currentIds = new Set((reviewFindingsRaw ?? []).map((finding) => asObject(finding, 'reviewFinding')['id'] as string));
    const convergence = convergenceRaw as unknown[];
    const convergenceIds = convergence.map((entry) => requireNonEmptyString(asObject(entry, 'reviewFindingConvergence'), 'findingId'));
    if (new Set(convergenceIds).size !== convergenceIds.length) schemaFail('reviewFindingConvergence contains duplicate findingId entries');
    const newIds = new Set<string>();
    for (const entry of convergence) {
      const record = asObject(entry, 'reviewFindingConvergence');
      const findingId = record['findingId'] as string;
      const state = record['state'];
      if ((state === 'new' || state === 'still-open') && !currentIds.has(findingId)) {
        schemaFail(`${state} convergence findingId must exist in current reviewFindings`, { findingId });
      }
      if ((state === 'resolved' || state === 'superseded') && currentIds.has(findingId)) {
        schemaFail(`${state} convergence findingId must be absent from current reviewFindings`, { findingId });
      }
      if (state === 'new') newIds.add(findingId);
    }
    for (const entry of convergence) {
      const record = asObject(entry, 'reviewFindingConvergence');
      if (record['state'] === 'superseded' && !newIds.has(record['supersededByFindingId'] as string)) {
        schemaFail('supersededByFindingId must reference a current new finding');
      }
    }
  } else if (convergenceRaw !== undefined) {
    schemaFail('transitional review result must not carry reviewFindingConvergence');
  }

  const terminalBindingRaw = obj['terminalBinding'];
  if (terminalBindingRaw !== undefined) validateRunTerminalBinding(terminalBindingRaw);

  const hasActionResult = obj['actionResult'] !== undefined;

  if (runStatus === 'completed') {
    if (!hasActionResult) {
      schemaFail('completed runStatus requires actionResult', { runStatus });
    }
    const ar = asObject(obj['actionResult'], 'actionResult');
    const es = ar['executionStatus'];
    if (es === 'in-progress') {
      schemaFail('completed runStatus must not pair with in-progress executionStatus', {
        runStatus,
        executionStatus: es,
      });
    }
    if (es !== 'completed' && es !== 'failed' && es !== 'blocked') {
      schemaFail('completed runStatus requires actionResult.executionStatus ∈ {completed,failed,blocked}', {
        runStatus,
        executionStatus: es,
      });
    }
    return;
  }

  if (runStatus === 'failed' || runStatus === 'cancelled') {
    if (hasActionResult) {
      schemaFail(`${runStatus} runStatus must not carry actionResult`, { runStatus });
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Q1-RA-010: Action-owned ResultRef applicability
// ---------------------------------------------------------------------------

/**
 * Actions that produce Change artifacts via `producedResultRefs`.
 *
 * Q1-RA-010: `producedResultRefs` is owned by exactly this set. All other
 * Actions (apply / revise-apply / review-* / archive / delivery-level) MUST NOT
 * carry `producedResultRefs` — Core never derives it for them.
 */
const ARTIFACT_PRODUCING_ACTIONS = new Set([
  'explore',
  'revise-explore',
  'propose',
  'revise-propose',
]);

/**
 * Validate that an {@link ActionResultWithoutRunRef} projection is Action-owned:
 * the projected `action` MUST equal the Context action, every ResultRef field
 * MUST be applicable to that Action, and every required field for a top-level
 * completed physical result MUST be structurally present.
 *
 * Q1-RA-010: `validateActionResultWithoutRunRef` proves field shape + field-kind
 * binding, but NOT that the Action is allowed to own the field nor that a
 * top-level completed result carries its Action-owned required evidence.
 * Requiredness is derived from the top-level physical `runStatus` + Context
 * action — NEVER from `actionResult.executionStatus`. A well-shaped but
 * Action-impossible projection (e.g. `review-propose` carrying
 * `reviewVerdictRef`, `apply` carrying `verificationSummaryRef`, `archive`
 * carrying `producedResultRefs`, or `actionResult.action != context.action`)
 * MUST fail closed. Writer/terminal preflight and Reader/admitC1RunResult share
 * this SAME validator so a result Core could never legally publish is never
 * admitted as a valid C1 formal fact.
 *
 * Scope enforced (physical Action-result matrix):
 *   - `actionResult.action === contextAction`
 *   - `runStatus === 'completed'` + artifact-producing Action ⇒
 *     `producedResultRefs` MUST be structurally present (full exact-set /
 *     current bytes remain owned by `validateCurrentStageArtifactSet`)
 *   - `runStatus === 'completed'` + `review-apply` ⇒ `verificationSummaryRef`
 *     MUST be present (regardless of `actionResult.executionStatus`)
 *   - `producedResultRefs` forbidden on non-artifact-producing Actions
 *   - `verificationSummaryRef` only on `review-apply`
 *   - `reviewVerdictRef` forbidden on `review-*` (self-reference); its
 *     applicability on non-review Runs follows the Q1-RA-007 source-review
 *     tuple validator, not here
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any scope violation.
 */
export function validateActionResultApplicability(
  contextAction: string,
  runStatus: string | undefined,
  actionResult: ActionResultWithoutRunRef,
): void {
  // 1. Action identity: the projected action MUST equal the Context action.
  if (actionResult.action !== contextAction) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `actionResult.action (${actionResult.action}) does not match context.action (${contextAction})`,
      { contextAction, projectedAction: actionResult.action },
    );
  }

  const isReviewAction = contextAction.startsWith('review-');
  const isTopLevelCompleted = runStatus === 'completed';

  // 2. producedResultRefs: forbidden on non-artifact-producing Actions; REQUIRED
  //    on a top-level completed artifact-producing projection.
  const isArtifactProducing = ARTIFACT_PRODUCING_ACTIONS.has(contextAction);
  if (actionResult.producedResultRefs !== undefined && !isArtifactProducing) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `producedResultRefs is only allowed on artifact-producing Actions (explore/revise-explore/propose/revise-propose); forbidden on ${contextAction}`,
      { contextAction },
    );
  }
  if (isTopLevelCompleted && isArtifactProducing && actionResult.producedResultRefs === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `top-level completed ${contextAction} projection MUST carry producedResultRefs (structural required evidence); full exact-set/bytes stay owned by validateCurrentStageArtifactSet`,
      { contextAction },
    );
  }

  // 3. verificationSummaryRef: only review-apply, and REQUIRED for a top-level
  //    completed review-apply projection regardless of executionStatus.
  const isReviewApply = contextAction === 'review-apply';
  if (actionResult.verificationSummaryRef !== undefined && !isReviewApply) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `verificationSummaryRef is only allowed on review-apply; forbidden on ${contextAction}`,
      { contextAction },
    );
  }
  if (isTopLevelCompleted && isReviewApply && actionResult.verificationSummaryRef === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'top-level completed review-apply projection MUST carry verificationSummaryRef (regardless of actionResult.executionStatus)',
      { contextAction, runStatus },
    );
  }

  // 4. reviewVerdictRef: forbidden on review-* (self-reference).
  if (isReviewAction && actionResult.reviewVerdictRef !== undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-* Run MUST NOT carry reviewVerdictRef (self-reference, action=${contextAction})`,
      { contextAction },
    );
  }
}

// ---------------------------------------------------------------------------
// Shared C1 terminal result admission helper (Q1-RA-006)
// ---------------------------------------------------------------------------

/**
 * Parse + fully validate a C1 (schemaVersion 2) `result.json` bytes into a
 * typed {@link RunResultFile}.
 *
 * This is the ONE admission pipeline every C1 reader (formal-fact Reader and
 * review-entry sibling lineage) must use before ANY formal fact is promoted
 * from a terminal result. It runs the full closed-schema stack:
 *   1. `JSON.parse`;
 *   2. `validateRunResultFileCombination` — runStatus × actionResult gate +
 *      closed schema (rejects heavy bookkeeping fields);
 *   3. `validateActionResultWithoutRunRef` — closed actionResult projection
 *      with field-kind binding (produced-artifact / run-result /
 *      verification-summary);
 *   4. `validateReviewVerdictIntegrity(action, result)` — action-specific
 *      review verdict × findings consistency.
 *
 * A result that fails any stage is NOT admitted — the caller MUST surface a
 * fail-closed FactConflict and MUST NOT project a pending Run from it.
 *
 * @param raw - Raw JSON bytes of `result.json`.
 * @param action - The Run's formal action (from context.json), used for the
 *   action-specific review verdict integrity check.
 * @returns The typed {@link RunResultFile}.
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any admission failure.
 */
export function admitC1RunResult(raw: string, action: string): RunResultFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `result.json is not valid JSON: ${(e as Error).message}`,
    );
  }
  const result = parsed as RunResultFile;
  // 1. runStatus × actionResult gate + closed schema.
  validateRunResultFileCombination(result);
  // 2. Closed actionResult projection with field-kind binding.
  const ar = (result as { actionResult?: unknown })['actionResult'];
  if (ar !== undefined) {
    const validatedAr = validateActionResultWithoutRunRef(ar);
    // 3. Q1-RA-010: Action-owned ResultRef applicability (action identity +
    //    required/forbidden field matrix) keyed on the top-level runStatus —
    //    the SAME semantic the terminal writer enforces.
    validateActionResultApplicability(action, result.runStatus, validatedAr);
  }
  // 4. Action-specific review verdict × findings integrity.
  validateReviewVerdictIntegrity(action, result);
  return result;
}

export interface ReaderRunResultProvenance {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId: string;
}

interface PreQ1ReviewResultCompatibility extends ReaderRunResultProvenance {
  readonly action: 'review-explore' | 'review-propose';
  readonly sha256: string;
}

/** Exact immutable Q1 bootstrap Reviews that predate blockingAuthority. */
const PRE_Q1_REVIEW_RESULT_COMPATIBILITY: readonly PreQ1ReviewResultCompatibility[] = [
  {
    runId: '20260810-002-review-explore',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'review-explore',
    sha256: '09a0da2b699269f8915f88632d6a21cfa494988dd7e4beed4a969b761e8b1a05',
  },
  {
    runId: '20260810-006-review-propose',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'review-propose',
    sha256: 'ecb18b20011d56e99a293c4aa804345bf32fff9dd11fa921467360e6f4835972',
  },
  {
    runId: '20260810-008-review-propose',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'review-propose',
    sha256: '95e71ff2dab4b5abc2fa594323c363cfd4d8cd3ba9f227e6b1267bf0273a0795',
  },
] as const;

function rawSha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Reader-only compatibility for immutable pre-Q1 typed Review findings.
 *
 * Strict admission always runs first. Compatibility is possible only when the
 * caller supplies persisted Run provenance AND the exact raw-byte SHA-256
 * matches one of the known immutable Q1 bootstrap Review results. Shape alone
 * is never sufficient. New/current schemaVersion 2 Reviews therefore remain
 * strict and fail closed when blockingAuthority is missing. No bytes are
 * rewritten.
 */
export function admitC1RunResultForReader(
  raw: string,
  action: string,
  provenance?: ReaderRunResultProvenance,
): RunResultFile {
  try {
    return admitC1RunResult(raw, action);
  } catch (strictError) {
    if (provenance === undefined) throw strictError;
    const fingerprint = rawSha256(raw);
    const compatible = PRE_Q1_REVIEW_RESULT_COMPATIBILITY.some((entry) =>
      entry.sha256 === fingerprint &&
      entry.action === action &&
      entry.runId === provenance.runId &&
      entry.deliveryId === provenance.deliveryId &&
      entry.changeId === provenance.changeId
    );
    if (!compatible) throw strictError;

    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw strictError; }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw strictError;
    const obj = parsed as Record<string, unknown>;
    if (obj['runStatus'] !== 'completed' || obj['reviewVerdict'] !== 'changes-requested' || !Array.isArray(obj['reviewFindings'])) throw strictError;

    let normalized = false;
    const reviewFindings = obj['reviewFindings'].map((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
      const finding = value as Record<string, unknown>;
      if (finding['severity'] === 'blocking' && finding['blockingAuthority'] === undefined && typeof finding['requiredChange'] === 'string' && finding['requiredChange'].trim() !== '') {
        normalized = true;
        return { ...finding, blockingAuthority: 'author' };
      }
      return finding;
    });
    if (!normalized) throw strictError;
    return admitC1RunResult(JSON.stringify({ ...obj, reviewFindings }), action);
  }
}

/**
 * Validate a single ReviewFinding entry (Q1 typed payload).
 *
 * Each finding MUST have:
 *   - non-empty `id`
 *   - `severity` ∈ {blocking, non-blocking}
 *   - non-empty `title`
 *   - non-empty `problem`
 *   - optional non-empty `location`
 *   - optional non-empty `requiredChange` (required for blocking severity)
 */
function validateReviewFinding(value: unknown, index: number): void {
  const obj = asObject(value, `reviewFindings[${index}]`);

  // Closed schema for ReviewFinding.
  const knownFields = new Set(['id', 'severity', 'title', 'problem', 'location', 'blockingAuthority', 'requiredChange']);
  for (const key of Object.keys(obj)) {
    if (!knownFields.has(key)) {
      schemaFail(`reviewFindings[${index}] contains unknown field: ${key}`, {
        field: key,
        index,
      });
    }
  }

  const id = requireNonEmptyString(obj, 'id');
  // Allow `id` to be re-validated but rename for clarity.
  void id;

  const severityRaw = obj['severity'];
  if (severityRaw !== 'blocking' && severityRaw !== 'non-blocking') {
    schemaFail(`reviewFindings[${index}].severity must be blocking|non-blocking`, {
      severity: severityRaw,
      index,
    });
  }

  requireNonEmptyString(obj, 'title');
  requireNonEmptyString(obj, 'problem');

  // Optional location.
  const locationRaw = obj['location'];
  if (locationRaw !== undefined) {
    if (typeof locationRaw !== 'string' || locationRaw.trim() === '') {
      schemaFail(`reviewFindings[${index}].location must be a non-empty string`, {
        location: locationRaw,
        index,
      });
    }
  }

  const authorityRaw = obj['blockingAuthority'];
  const requiredChangeRaw = obj['requiredChange'];
  if (severityRaw === 'blocking') {
    if (typeof authorityRaw !== 'string' || !(BLOCKING_AUTHORITIES as readonly string[]).includes(authorityRaw)) {
      schemaFail(`reviewFindings[${index}].blockingAuthority must be author|owner|verification|external`, {
        blockingAuthority: authorityRaw,
        index,
      });
    }
    if (authorityRaw === 'author') {
      if (typeof requiredChangeRaw !== 'string' || requiredChangeRaw.trim() === '') {
        schemaFail(`author blocking reviewFindings[${index}] must have non-empty requiredChange`, { index });
      }
    } else if (requiredChangeRaw !== undefined) {
      schemaFail(`non-author blocking reviewFindings[${index}] MUST NOT carry requiredChange`, {
        blockingAuthority: authorityRaw,
        index,
      });
    }
  } else {
    if (authorityRaw !== undefined) {
      schemaFail(`non-blocking reviewFindings[${index}] MUST NOT carry blockingAuthority`, { index });
    }
    if (requiredChangeRaw !== undefined) {
      schemaFail(`non-blocking reviewFindings[${index}] MUST NOT carry requiredChange`, { index });
    }
  }
}

function nonEmptyStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    schemaFail(`${field} must be a non-empty string array`);
  }
  return value as string[];
}

function validateReviewFindingV2(value: unknown, index: number): void {
  const obj = asObject(value, `reviewFindings[${index}]`);
  const knownFields = new Set([
    'id', 'severity', 'title', 'problem', 'contractRef', 'invariant', 'evidence', 'impact',
    'location', 'blockingAuthority', 'requiredOutcome', 'acceptance',
  ]);
  for (const key of Object.keys(obj)) {
    if (!knownFields.has(key)) schemaFail(`reviewFindings[${index}] contains unknown field: ${key}`);
  }
  requireNonEmptyString(obj, 'id');
  const severity = obj['severity'];
  if (severity !== 'blocking' && severity !== 'non-blocking') schemaFail(`reviewFindings[${index}].severity must be blocking|non-blocking`);
  requireNonEmptyString(obj, 'title');
  requireNonEmptyString(obj, 'problem');
  requireNonEmptyString(obj, 'contractRef');
  requireNonEmptyString(obj, 'invariant');
  nonEmptyStringArray(obj['evidence'], `reviewFindings[${index}].evidence`);
  requireNonEmptyString(obj, 'impact');
  if (obj['location'] !== undefined) requireNonEmptyString(obj, 'location');
  if (severity === 'blocking') {
    if (typeof obj['blockingAuthority'] !== 'string' || !(BLOCKING_AUTHORITIES as readonly string[]).includes(obj['blockingAuthority'])) {
      schemaFail(`reviewFindings[${index}].blockingAuthority must be author|owner|verification|external`);
    }
    requireNonEmptyString(obj, 'requiredOutcome');
    nonEmptyStringArray(obj['acceptance'], `reviewFindings[${index}].acceptance`);
  } else {
    for (const field of ['blockingAuthority', 'requiredOutcome', 'acceptance']) {
      if (obj[field] !== undefined) schemaFail(`non-blocking reviewFindings[${index}] MUST NOT carry ${field}`);
    }
  }
}

function validateFindingConvergence(value: unknown, index: number): void {
  const obj = asObject(value, `reviewFindingConvergence[${index}]`);
  const known = new Set(['findingId', 'state', 'supersededByFindingId']);
  for (const key of Object.keys(obj)) if (!known.has(key)) schemaFail(`reviewFindingConvergence[${index}] contains unknown field: ${key}`);
  requireNonEmptyString(obj, 'findingId');
  const state = obj['state'];
  if (state !== 'new' && state !== 'still-open' && state !== 'resolved' && state !== 'superseded') {
    schemaFail(`reviewFindingConvergence[${index}].state is invalid`);
  }
  if (state === 'superseded') requireNonEmptyString(obj, 'supersededByFindingId');
  else if (obj['supersededByFindingId'] !== undefined) schemaFail(`reviewFindingConvergence[${index}].supersededByFindingId only allowed for superseded`);
}

// ---------------------------------------------------------------------------
// validateReviewVerdictIntegrity (C1-AP-006)
// ---------------------------------------------------------------------------

/**
 * Validate review verdict integrity before terminal publication (C1-AP-006).
 *
 * `validateRunResultFileCombination` validates that `reviewVerdict` (when
 * present) is a valid `ReviewVerdictValue`, but does not know the action —
 * so it cannot enforce the action-specific requirement. This function closes
 * that gap at publication time (`writeRunResult`), BEFORE the result is
 * atomically published:
 *
 * - `completed` + `review-*` → `reviewVerdict` MUST be present. The Reader
 *   relies on it to reconstruct `ReviewVerdictFact`; detecting its absence
 *   only at Reader time is too late — the result is already terminal and
 *   immutable.
 * - `failed`/`cancelled` + `review-*` → `reviewVerdict` MUST be absent. An
 *   incomplete review has no verdict.
 * - Any status + non-`review-*` → `reviewVerdict` MUST be absent.
 *
 * Q1: verdict × findings consistency:
 * - `changes-requested` MUST have at least 1 blocking `reviewFindings` entry.
 * - `approved` MUST NOT have any blocking `reviewFindings` entry.
 * - Each blocking finding MUST have non-empty `requiredChange`.
 * - Non-review Runs MUST NOT carry `reviewFindings`.
 * - `failed`/`cancelled` review-* Runs MUST NOT carry `reviewFindings`.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any violation.
 */
export function validateReviewVerdictIntegrity(
  action: string,
  result: RunResultFile,
): void {
  const isReviewAction = action.startsWith('review-');
  const hasReviewVerdict = result.reviewVerdict !== undefined;
  const hasReviewFindings = result.reviewFindings !== undefined;
  const hasReviewFindingVersion = result.reviewFindingSchemaVersion !== undefined;
  const hasReviewConvergence = result.reviewFindingConvergence !== undefined;
  const findings = result.reviewFindings ?? [];

  // Non-review Runs: MUST NOT carry reviewVerdict or reviewFindings.
  if (!isReviewAction) {
    if (hasReviewVerdict) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Non-review Run result MUST NOT contain reviewVerdict (action=${action})`,
        { action, runStatus: result.runStatus, reviewVerdict: result.reviewVerdict },
      );
    }
    if (hasReviewFindings) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Non-review Run result MUST NOT contain reviewFindings (action=${action})`,
        { action, runStatus: result.runStatus },
      );
    }
    if (hasReviewFindingVersion || hasReviewConvergence) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `Non-review Run result MUST NOT contain review finding version/convergence (action=${action})`);
    }
    return;
  }

  // Review-* Runs below.

  // failed/cancelled review-* Runs: MUST NOT carry reviewVerdict or reviewFindings.
  if (result.runStatus !== 'completed') {
    if (hasReviewVerdict) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Non-completed review-* Run MUST NOT contain reviewVerdict (action=${action}, runStatus=${result.runStatus})`,
        { action, runStatus: result.runStatus, reviewVerdict: result.reviewVerdict },
      );
    }
    if (hasReviewFindings) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `Non-completed review-* Run MUST NOT contain reviewFindings (action=${action}, runStatus=${result.runStatus})`,
        { action, runStatus: result.runStatus },
      );
    }
    if (hasReviewFindingVersion || hasReviewConvergence) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `Non-completed review-* Run MUST NOT contain review finding version/convergence (action=${action})`);
    }
    return;
  }

  // completed review-* Run: reviewVerdict MUST be present.
  if (!hasReviewVerdict) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `completed review-* Run result MUST contain reviewVerdict (action=${action}); a missing verdict cannot be detected after terminal publication (C1-AP-006)`,
      { action, runStatus: result.runStatus },
    );
  }

  // Q1: verdict × findings consistency.
  const blockingFindings = findings.filter((f) => f.severity === 'blocking');

  if (result.reviewVerdict === 'changes-requested') {
    // changes-requested MUST have at least 1 blocking finding.
    if (blockingFindings.length === 0) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `changes-requested review-* Run MUST have at least 1 blocking reviewFindings entry (action=${action})`,
        { action, runStatus: result.runStatus, reviewVerdict: result.reviewVerdict },
      );
    }
  } else if (result.reviewVerdict === 'approved') {
    // approved MUST NOT have any blocking finding.
    if (blockingFindings.length > 0) {
      throw new FlowkitError(
        'SCHEMA_VALIDATION_FAILED',
        `approved review-* Run MUST NOT have blocking reviewFindings entries (action=${action}, count=${blockingFindings.length})`,
        { action, runStatus: result.runStatus, reviewVerdict: result.reviewVerdict, blockingCount: blockingFindings.length },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// validateContextFile
// ---------------------------------------------------------------------------

/**
 * Validate an unknown value as {@link ContextFile}.
 *
 * Checks:
 *   - `schemaVersion === 2`
 *   - required fields: `runId`, `deliveryId`, `action`, `role`, `ownerAuthorization`, `runPath`
 *   - `action` in B1 Action Catalog; `role` ∈ {owner, author, reviewer}
 *   - current Action MUST be in the Change-only catalog and `changeKey`/`changeId` are required.
 *   - `inputRef` (optional): MUST be a ResultRef object (not string), validated
 *     via {@link validateResultRefProjection}.
 *   - `constraints` (optional): must be an object with valid field types.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any validation failure.
 * @throws {FlowkitError} `UNKNOWN_ACTION` when `action` is not a formal Action.
 */
export function validateContextFile(value: unknown): ContextFile {
  const obj = asObject(value, 'ContextFile');

  // Historical C1/D1/D2 v2/v3/v4 remain readable. New Standard Runs use v5.
  if (obj['schemaVersion'] !== 2 && obj['schemaVersion'] !== 3 && obj['schemaVersion'] !== 4 && obj['schemaVersion'] !== 5) {
    schemaFail('ContextFile.schemaVersion must equal 2, 3, 4, or 5', { schemaVersion: obj['schemaVersion'] });
  }
  const schemaVersion = obj['schemaVersion'];

  const runId = requireNonEmptyString(obj, 'runId');
  const deliveryId = requireNonEmptyString(obj, 'deliveryId');
  const action = requireNonEmptyString(obj, 'action');
  if (!isFormalAction(action)) {
    throw new FlowkitError('UNKNOWN_ACTION', `Unknown action: ${action}`, { action });
  }
  const role = requireString(obj, 'role');
  if (role !== 'owner' && role !== 'author' && role !== 'reviewer') {
    schemaFail('Field role must be owner|author|reviewer', { role });
  }
  if (isChangeAction(action) && !isRoleAllowedForAction(action, role as Role)) {
    schemaFail(`Action ${action} requires role ${action.startsWith('review-') ? 'reviewer' : 'author'}, got ${role}`, {
      action,
      role,
    });
  }
  const ownerAuthorization = requireString(obj, 'ownerAuthorization');
  const runPath = requireNonEmptyString(obj, 'runPath');
  const semanticInputFingerprintRaw = obj['semanticInputFingerprint'];
  let semanticInputFingerprint: string | undefined;
  if (semanticInputFingerprintRaw !== undefined) {
    if (
      typeof semanticInputFingerprintRaw !== 'string' ||
      !/^[0-9a-f]{64}$/.test(semanticInputFingerprintRaw)
    ) {
      schemaFail('semanticInputFingerprint must be a lowercase SHA-256 hex string', {
        semanticInputFingerprint: semanticInputFingerprintRaw,
      });
    }
    semanticInputFingerprint = semanticInputFingerprintRaw;
  }

  const canonicalBase = obj['canonicalBase'];
  const applicableFactRefs = obj['applicableFactRefs'];
  const actionPackageRaw = obj['actionPackage'];
  const entryWorkspaceIdentity = obj['entryWorkspaceIdentity'];
  const mutationDeclaration = obj['mutationDeclaration'];
  if (schemaVersion === 5) {
    if (typeof canonicalBase !== 'string' || !/^[0-9a-f]{40,64}$/.test(canonicalBase)) {
      schemaFail('schemaVersion 5 canonicalBase must be a lowercase Git object id', { canonicalBase });
    }
    if (semanticInputFingerprint === undefined) {
      schemaFail('schemaVersion 5 requires semanticInputFingerprint');
    }
    validateVersionedAuthorityRefs(applicableFactRefs, 'applicableFactRefs', { allowEmpty: true });
    if (actionPackageRaw === undefined) schemaFail('schemaVersion 5 requires actionPackage');
  } else if (
    canonicalBase !== undefined || applicableFactRefs !== undefined || actionPackageRaw !== undefined || entryWorkspaceIdentity !== undefined || mutationDeclaration !== undefined
  ) {
    schemaFail('v5-only ContextFile fields are forbidden in historical v2/v3/v4 contexts', { schemaVersion });
  }

  const ownerFactRefsRaw = obj['ownerFactRefs'];
  // A bounded bootstrap generation created schemaVersion 2 contexts carrying
  // provisional ownerFactRefs before D1 froze schemaVersion 3. Historical v2
  // bytes remain immutable/read-only compatible, but those projections MUST
  // NOT participate in current Owner authority or reset identity. Validate the
  // shape so malformed bytes still fail closed, then omit them from the typed
  // v2 projection below. New writers only emit ownerFactRefs with v3.
  let ownerFactRefs: OwnerFactRef[] | undefined;
  if (ownerFactRefsRaw !== undefined) {
    if (!Array.isArray(ownerFactRefsRaw)) schemaFail('ownerFactRefs must be an array');
    const knownOwnerFactFields = new Set([
      'ref', 'decision', 'deliveryId', 'changeId', 'scope', 'requiredOutcomes', 'sourceRef',
    ]);
    ownerFactRefs = ownerFactRefsRaw.map((entry, index) => {
      const fact = asObject(entry, `ownerFactRefs[${index}]`);
      for (const key of Object.keys(fact)) {
        if (!knownOwnerFactFields.has(key)) schemaFail(`ownerFactRefs[${index}] contains unknown field: ${key}`);
      }
      const ref = requireNonEmptyString(fact, 'ref');
      if (!/^owner:[0-9a-f]{64}$/.test(ref)) {
        schemaFail('ownerFactRefs.ref must be a stable owner:<sha256> identity', { index, ref });
      }
      if (fact['decision'] !== 'contract-reset') {
        schemaFail('ownerFactRefs.decision must be contract-reset', { index, decision: fact['decision'] });
      }
      const factDeliveryId = requireNonEmptyString(fact, 'deliveryId');
      const factChangeId = requireNonEmptyString(fact, 'changeId');
      const scope = requireNonEmptyString(fact, 'scope');
      const sourceRef = requireNonEmptyString(fact, 'sourceRef');
      const outcomesRaw = fact['requiredOutcomes'];
      if (
        !Array.isArray(outcomesRaw)
        || outcomesRaw.length === 0
        || outcomesRaw.some((value) => typeof value !== 'string' || value.trim() === '')
      ) {
        schemaFail('ownerFactRefs.requiredOutcomes must be a non-empty string array', { index });
      }
      const requiredOutcomes = outcomesRaw as string[];
      const normalizedOutcomes = [...new Set(requiredOutcomes.map((value) => value.trim()))].sort();
      if (
        normalizedOutcomes.length !== requiredOutcomes.length
        || normalizedOutcomes.some((value, outcomeIndex) => value !== requiredOutcomes[outcomeIndex])
      ) {
        schemaFail('ownerFactRefs.requiredOutcomes must be normalized sorted unique strings', { index });
      }
      return {
        ref,
        decision: 'contract-reset' as const,
        deliveryId: factDeliveryId,
        changeId: factChangeId,
        scope,
        requiredOutcomes: normalizedOutcomes,
        sourceRef,
      };
    });
    const refs = ownerFactRefs.map((fact) => fact.ref);
    if (new Set(refs).size !== refs.length) schemaFail('ownerFactRefs must not contain duplicate refs');
  }

  // Current schemaVersion 2/3/4 Standard Runs are Change-only.
  if (!isChangeAction(action)) {
    throw new FlowkitError('UNKNOWN_ACTION', `Unknown Change action: ${action}`, { action });
  }
  if (obj['changeKey'] === undefined || obj['changeId'] === undefined) {
    schemaFail('Current Run must carry changeKey and changeId', {
      action,
      changeKey: obj['changeKey'],
      changeId: obj['changeId'],
    });
  }

  // Review-scope rules (C1-AP-004): review-* actions MUST carry reviewedRunId
  // (the Run being reviewed); non-review actions MUST NOT carry it. This is
  // the canonical C1 reviewed-Run linkage, distinct from sourceReviewRun
  // (the prior review addressed by a revise-* Run).
  const hasReviewedRunId = obj['reviewedRunId'] !== undefined;
  const isReviewAction = action.startsWith('review-');
  if (isReviewAction && !hasReviewedRunId) {
    schemaFail('review-* Run must carry reviewedRunId (the Run being reviewed)', {
      action,
    });
  }
  if (!isReviewAction && hasReviewedRunId) {
    schemaFail('non-review Run must not carry reviewedRunId', {
      action,
      reviewedRunId: obj['reviewedRunId'],
    });
  }

  const changeKey = requireNonEmptyString(obj, 'changeKey');
  const changeId = requireNonEmptyString(obj, 'changeId');
  if (ownerFactRefs !== undefined) {
    for (const fact of ownerFactRefs) {
      if (fact.deliveryId !== deliveryId || fact.changeId !== changeId) {
        schemaFail('ownerFactRefs target must match the Run Delivery/Change identity', {
          runDeliveryId: deliveryId,
          runChangeId: changeId,
          factDeliveryId: fact.deliveryId,
          factChangeId: fact.changeId,
          ref: fact.ref,
        });
      }
    }
  }

  // inputRef: optional ResultRef object (MUST NOT be string).
  const inputRefRaw = obj['inputRef'];
  let inputRef: ResultRef | undefined;
  if (inputRefRaw !== undefined) {
    if (typeof inputRefRaw === 'string') {
      schemaFail('ContextFile.inputRef must be a ResultRef object, not a string', {
        inputRef: inputRefRaw,
      });
    }
    inputRef = validateResultRefProjection(inputRefRaw);
  }

  // Q1-RA-006: schemaVersion 2 review-* MUST carry inputRef with kind
  // == run-result (the exact-binding proof over the reviewed Run's
  // result.json). Structural requiredness here; the physical exact-binding
  // check (target == Core-derived reviewedRunId path + actual SHA-256) is the
  // shared validateReviewRunBinding used at terminal preflight / Reader /
  // sibling-lineage admission.
  if (isReviewAction) {
    if (inputRef === undefined) {
      schemaFail('review-* Run MUST carry inputRef (exact-binding proof over the reviewed Run result.json)', {
        action,
      });
    } else if (inputRef.kind !== RUN_RESULT_KIND) {
      schemaFail(`review-* Run inputRef.kind MUST be ${RUN_RESULT_KIND}, got: ${inputRef.kind}`, {
        action,
        kind: inputRef.kind,
      });
    }
  }

  // Q2/v6: review-apply carries one additional Core-owned point-in-time
  // verification input binding. It is required on review-apply and forbidden
  // everywhere else. This is an entry-time context fact, distinct from the
  // terminal actionResult.verificationSummaryRef.
  const verificationInputRefRaw = obj['verificationInputRef'];
  let verificationInputRef: ResultRef | undefined;
  if (verificationInputRefRaw !== undefined) {
    verificationInputRef = validateResultRefProjection(verificationInputRefRaw);
  }
  if (action === 'review-apply') {
    if (verificationInputRef === undefined) {
      schemaFail('review-apply Run MUST carry Core-owned verificationInputRef', { action });
    }
    if (verificationInputRef.kind !== VERIFICATION_SUMMARY_KIND) {
      schemaFail(`review-apply verificationInputRef.kind MUST be ${VERIFICATION_SUMMARY_KIND}`, {
        action,
        kind: verificationInputRef.kind,
      });
    }
    const verificationLogicalRef = normalizeArtifactLogicalRef(verificationInputRef.ref);
    if (!verificationLogicalRef.endsWith('/verification.md')) {
      schemaFail('review-apply verificationInputRef.ref must identify verification.md inside the validated Change root', {
        action,
        changeId,
        ref: verificationInputRef.ref,
      });
    }
  } else if (verificationInputRef !== undefined) {
    schemaFail('verificationInputRef is only allowed on review-apply', {
      action,
      verificationInputRef,
    });
  }

  // sourceReviewRun / sourceReviewVerdict (optional).
  // Q1-RA-005: sourceReviewRun is a Run-ID descriptor — it MUST satisfy the
  // formal Run-ID grammar (rejecting any path-shaped value) before it is ever
  // used to resolve a sibling Run's result.json.
  const sourceReviewRunRaw = obj['sourceReviewRun'];
  let sourceReviewRun: string | undefined;
  if (sourceReviewRunRaw !== undefined) {
    const s = requireString(obj, 'sourceReviewRun');
    try {
      parseRunId(s);
    } catch (e) {
      schemaFail('sourceReviewRun must be a formal Run ID (YYYYMMDD-NNN-action)', {
        sourceReviewRun: sourceReviewRunRaw,
        detail: (e as FlowkitError).message,
      });
    }
    sourceReviewRun = s;
  }
  const sourceReviewVerdictRaw = obj['sourceReviewVerdict'];
  let sourceReviewVerdict: ReviewVerdictValue | undefined;
  if (sourceReviewVerdictRaw !== undefined) {
    if (
      sourceReviewVerdictRaw !== 'approved' &&
      sourceReviewVerdictRaw !== 'changes-requested'
    ) {
      schemaFail('sourceReviewVerdict must be approved|changes-requested', {
        sourceReviewVerdict: sourceReviewVerdictRaw,
      });
    }
    sourceReviewVerdict = sourceReviewVerdictRaw;
  }

  // Q2: source-review tuple belongs only to revise-* lineage. It is required
  // there and forbidden everywhere else; approved forward consumers use the
  // ordinary consumedRunId/inputRef handoff instead of growing a second review
  // state machine.
  const isRevisionAction =
    action === 'revise-explore' || action === 'revise-propose' || action === 'revise-apply';
  if (isRevisionAction) {
    if (sourceReviewRunRaw === undefined || sourceReviewVerdictRaw === undefined) {
      schemaFail('revise-* Run requires sourceReviewRun + sourceReviewVerdict', {
        action,
        sourceReviewRun: sourceReviewRunRaw,
        sourceReviewVerdict: sourceReviewVerdictRaw,
      });
    }
    if (sourceReviewVerdict !== 'changes-requested') {
      schemaFail('revise-* sourceReviewVerdict MUST be changes-requested', {
        action,
        sourceReviewVerdict,
      });
    }
  } else if (sourceReviewRunRaw !== undefined || sourceReviewVerdictRaw !== undefined) {
    schemaFail('sourceReviewRun/sourceReviewVerdict are only allowed on revise-* Runs', {
      action,
      sourceReviewRun: sourceReviewRunRaw,
      sourceReviewVerdict: sourceReviewVerdictRaw,
    });
  }

  // reviewedRunId (C1-AP-004): required for review-*, absent for non-review.
  // Q1-RA-005: reviewedRunId is a Run-ID descriptor — it MUST satisfy the
  // formal Run-ID grammar (rejecting any path-shaped value) before it is used
  // to derive context.inputRef / resolve the reviewed result.json.
  let reviewedRunId: string | undefined;
  if (obj['reviewedRunId'] !== undefined) {
    const s = requireString(obj, 'reviewedRunId');
    try {
      parseRunId(s);
    } catch (e) {
      schemaFail('reviewedRunId must be a formal Run ID (YYYYMMDD-NNN-action)', {
        reviewedRunId: obj['reviewedRunId'],
        detail: (e as FlowkitError).message,
      });
    }
    reviewedRunId = s;
  }

  const archiveEntryOpenSpecProjection = validateArchiveEntryOpenSpecProjection(
    obj['archiveEntryOpenSpecProjection'],
    schemaVersion,
    action as ChangeAction,
    changeId,
  );
  const archiveMutationGuard = validateArchiveMutationGuard(obj['archiveMutationGuard'], action as ChangeAction);

  // constraints (optional object).
  const constraints = validateOptionalConstraints(obj['constraints']);

  const baseResult = {
    schemaVersion,
    runId,
    deliveryId,
    action: action as ChangeAction,
    role: role as Role,
    ownerAuthorization,
    ...(semanticInputFingerprint !== undefined && { semanticInputFingerprint }),
    ...((schemaVersion === 3 || schemaVersion === 4 || schemaVersion === 5) && ownerFactRefs !== undefined && { ownerFactRefs }),
    runPath,
    changeKey,
    changeId,
    ...(inputRef !== undefined && { inputRef }),
    ...(verificationInputRef !== undefined && { verificationInputRef }),
    ...(sourceReviewRun !== undefined && { sourceReviewRun }),
    ...(sourceReviewVerdict !== undefined && { sourceReviewVerdict }),
    ...(reviewedRunId !== undefined && { reviewedRunId }),
    ...(archiveEntryOpenSpecProjection !== undefined && { archiveEntryOpenSpecProjection }),
    ...(archiveMutationGuard !== undefined && { archiveMutationGuard }),
    ...(constraints !== undefined && { constraints }),
  };
  if (schemaVersion !== 5) return baseResult as HistoricalContextFile;

  const commonV5 = {
    ...baseResult,
    schemaVersion: 5 as const,
    canonicalBase: canonicalBase as string,
    applicableFactRefs: applicableFactRefs as readonly VersionedAuthorityRef[],
  };
  if (action === 'apply' || action === 'revise-apply') {
    const validatedEntryWorkspaceIdentity = validateEntryWorkspaceIdentity(entryWorkspaceIdentity);
    const validatedMutationDeclaration = validateMutationDeclaration(mutationDeclaration, action);
    const actionPackage = validateV5ActionPackage(
      actionPackageRaw,
      runId,
      deliveryId,
      changeId,
      action,
      semanticInputFingerprint!,
      canonicalBase as string,
      applicableFactRefs as readonly VersionedAuthorityRef[],
      validatedEntryWorkspaceIdentity,
      validatedMutationDeclaration,
      ownerFactRefs,
    );
    return {
      ...commonV5,
      action,
      actionPackage,
      entryWorkspaceIdentity: validatedEntryWorkspaceIdentity,
      mutationDeclaration: validatedMutationDeclaration,
    };
  }
  if (entryWorkspaceIdentity !== undefined || mutationDeclaration !== undefined) {
    schemaFail('entryWorkspaceIdentity/mutationDeclaration are only allowed on v5 apply/revise-apply contexts', { action });
  }
  return {
    ...commonV5,
    action: action as Exclude<ChangeAction, 'apply' | 'revise-apply'>,
    actionPackage: validateV5ActionPackage(
      actionPackageRaw,
      runId,
      deliveryId,
      changeId,
      action as Exclude<ChangeAction, 'apply' | 'revise-apply'>,
      semanticInputFingerprint!,
      canonicalBase as string,
      applicableFactRefs as readonly VersionedAuthorityRef[],
      undefined,
      undefined,
      ownerFactRefs,
    ),
  };
}

function validateVersionedAuthorityRefs(
  value: unknown,
  label: string,
  options: { readonly allowEmpty?: boolean } = {},
): readonly VersionedAuthorityRef[] {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    schemaFail(`${label} must be ${options.allowEmpty ? 'an array' : 'a non-empty array'}`);
  }
  const refs = value.map((raw, index) => {
    const obj = asObject(raw, `${label}[${index}]`);
    const keys = Object.keys(obj).sort();
    const expected = ['kind', 'ref', 'versionFingerprint'];
    if (keys.length !== expected.length || keys.some((key, keyIndex) => key !== expected[keyIndex])) {
      schemaFail(`${label}[${index}] must use the closed VersionedAuthorityRef shape`);
    }
    const ref = requireNonEmptyString(obj, 'ref');
    const kind = requireNonEmptyString(obj, 'kind');
    const versionFingerprint = requireNonEmptyString(obj, 'versionFingerprint');
    if (!/^[0-9a-f]{64}$/.test(versionFingerprint)) {
      schemaFail(`${label}[${index}].versionFingerprint must be a lowercase SHA-256 hex string`);
    }
    return { ref, kind, versionFingerprint };
  });
  const ordered = [...refs].sort((a, b) => a.ref.localeCompare(b.ref) || a.kind.localeCompare(b.kind));
  if (ordered.some((ref, index) => ref.ref !== refs[index]!.ref || ref.kind !== refs[index]!.kind)) {
    schemaFail(`${label} must be lexical sorted`);
  }
  if (new Set(refs.map((ref) => `${ref.kind}:${ref.ref}`)).size !== refs.length) {
    schemaFail(`${label} must not contain duplicate identities`);
  }
  return refs;
}

function validateEntryWorkspaceIdentity(value: unknown): EntryWorkspaceIdentity {
  const obj = asObject(value, 'entryWorkspaceIdentity');
  const keys = Object.keys(obj).sort();
  const expected = ['canonicalBase', 'workspaceFingerprint'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    schemaFail('entryWorkspaceIdentity must use the closed schema');
  }
  const canonicalBase = requireNonEmptyString(obj, 'canonicalBase');
  const workspaceFingerprint = requireNonEmptyString(obj, 'workspaceFingerprint');
  if (!/^[0-9a-f]{40,64}$/.test(canonicalBase) || !/^[0-9a-f]{64}$/.test(workspaceFingerprint)) {
    schemaFail('entryWorkspaceIdentity contains an invalid fingerprint');
  }
  return { canonicalBase, workspaceFingerprint };
}

function validateV5ActionPackage(
  value: unknown,
  runId: string,
  deliveryId: string,
  changeId: string,
  action: ChangeAction,
  semanticInputFingerprint: string,
  canonicalBase: string,
  applicableFactRefs: readonly VersionedAuthorityRef[],
  expectedEntryWorkspaceIdentity?: EntryWorkspaceIdentity,
  expectedMutationDeclaration?: MutationDeclaration,
  expectedOwnerFactRefs?: readonly OwnerFactRef[],
): ActionPackageV2 {
  const obj = asObject(value, 'actionPackage');
  if (obj['schemaVersion'] !== 2) schemaFail('v5 context actionPackage must use schemaVersion 2');
  const run = asObject(obj['run'], 'actionPackage.run');
  assertClosedKeys(run, 'actionPackage.run', [
    'action', 'changeId', 'deliveryId', 'role', 'runId', 'semanticInputFingerprint',
  ]);
  if (
    run['runId'] !== runId || run['deliveryId'] !== deliveryId || run['changeId'] !== changeId ||
    run['action'] !== action || run['role'] !== getActionDefinition(action).role
  ) {
    schemaFail('v5 context actionPackage.run must exactly match context identity');
  }
  const fingerprint = run['semanticInputFingerprint'];
  if (fingerprint !== semanticInputFingerprint) {
    schemaFail('v5 context actionPackage.run semanticInputFingerprint must equal the context fingerprint');
  }
  assertCanonicalValue(obj['definition'], getActionDefinition(action), 'actionPackage.definition must equal the canonical Action definition');
  assertCanonicalValue(obj['requiredResultContract'], getActionDefinition(action).terminalContract, 'actionPackage.requiredResultContract must equal the canonical terminal contract');
  const contractRefs = validateVersionedAuthorityRefs(obj['contractRefs'], 'actionPackage.contractRefs', { allowEmpty: true });
  const handoffRefs = validateVersionedAuthorityRefs(obj['handoffRefs'], 'actionPackage.handoffRefs', { allowEmpty: true });
  const packageApplicableFactRefs = [...contractRefs, ...handoffRefs]
    .sort((left, right) => `${left.ref}\u0000${left.kind}\u0000${left.versionFingerprint}`.localeCompare(`${right.ref}\u0000${right.kind}\u0000${right.versionFingerprint}`));
  if (!canonicalValuesEqual(packageApplicableFactRefs, applicableFactRefs)) {
    schemaFail('v5 context applicableFactRefs must equal the ActionPackage contract/handoff union');
  }
  validateOwnerAuthorizationRefs(obj['ownerAuthorizationRefs']);
  validateOptionalActionPackageViews(obj, expectedOwnerFactRefs);
  const packageAction = run['action'];
  const hasEntry = obj['entryWorkspaceIdentity'] !== undefined;
  const hasDeclaration = obj['mutationDeclaration'] !== undefined;
  if (packageAction === 'apply' || packageAction === 'revise-apply') {
    if (!hasEntry || !hasDeclaration) schemaFail('v2 Apply package requires entryWorkspaceIdentity and mutationDeclaration');
    assertClosedKeys(obj, 'actionPackage', expectedActionPackageKeys(obj, true));
    const packageEntry = validateEntryWorkspaceIdentity(obj['entryWorkspaceIdentity']);
    const packageDeclaration = validateMutationDeclaration(obj['mutationDeclaration'], packageAction);
    if (
      expectedEntryWorkspaceIdentity === undefined || expectedMutationDeclaration === undefined ||
      packageEntry.canonicalBase !== canonicalBase ||
      !canonicalValuesEqual(packageEntry, expectedEntryWorkspaceIdentity) ||
      !canonicalValuesEqual(packageDeclaration, expectedMutationDeclaration)
    ) {
      schemaFail('v2 Apply package entry fields must exactly equal their sibling v5 context fields');
    }
    return obj as unknown as ActionPackageV2;
  }
  if (hasEntry || hasDeclaration) schemaFail('v2 non-Apply package must not carry Apply fields');
  assertClosedKeys(obj, 'actionPackage', expectedActionPackageKeys(obj, false));
  return obj as unknown as ActionPackageV2;
}

function expectedActionPackageKeys(obj: Record<string, unknown>, isApply: boolean): readonly string[] {
  const required = [
    'contractRefs', 'definition', 'handoffRefs', 'ownerAuthorizationRefs',
    'requiredResultContract', 'run', 'schemaVersion',
    ...(isApply ? ['entryWorkspaceIdentity', 'mutationDeclaration'] : []),
  ];
  const optional = ['ownerFactRefs', 'reviewView', 'verificationView', 'externalContextFingerprint']
    .filter((key) => obj[key] !== undefined);
  return [...required, ...optional];
}

function assertClosedKeys(obj: Record<string, unknown>, label: string, expected: readonly string[]): void {
  const actual = Object.keys(obj).sort();
  const normalizedExpected = [...expected].sort();
  if (actual.length !== normalizedExpected.length || actual.some((key, index) => key !== normalizedExpected[index])) {
    schemaFail(`${label} must use a closed schema`, { actual, expected: normalizedExpected });
  }
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  return canonicalValue(left) === canonicalValue(right);
}

function assertCanonicalValue(actual: unknown, expected: unknown, message: string): void {
  if (!canonicalValuesEqual(actual, expected)) schemaFail(message);
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateOwnerAuthorizationRefs(value: unknown): void {
  if (!Array.isArray(value)) schemaFail('actionPackage.ownerAuthorizationRefs must be an array');
  const refs = value.map((raw, index) => {
    const obj = asObject(raw, `actionPackage.ownerAuthorizationRefs[${index}]`);
    assertClosedKeys(obj, `actionPackage.ownerAuthorizationRefs[${index}]`, [
      'decision', 'deliveryId', 'ref', 'sourceRef',
      ...(obj['changeId'] === undefined ? [] : ['changeId']),
    ]);
    const ref = requireNonEmptyString(obj, 'ref');
    requireNonEmptyString(obj, 'decision');
    requireNonEmptyString(obj, 'deliveryId');
    requireNonEmptyString(obj, 'sourceRef');
    if (obj['changeId'] !== undefined) requireNonEmptyString(obj, 'changeId');
    return ref;
  });
  if ([...refs].sort().some((ref, index) => ref !== refs[index]) || new Set(refs).size !== refs.length) {
    schemaFail('actionPackage.ownerAuthorizationRefs must be lexical sorted without duplicate refs');
  }
}

function validateOptionalActionPackageViews(
  obj: Record<string, unknown>,
  expectedOwnerFactRefs: readonly OwnerFactRef[] | undefined,
): void {
  if (obj['externalContextFingerprint'] !== undefined &&
    (typeof obj['externalContextFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/.test(obj['externalContextFingerprint']))) {
    schemaFail('actionPackage.externalContextFingerprint must be a lowercase SHA-256 hex string');
  }
  if (obj['reviewView'] !== undefined) validateReviewView(obj['reviewView']);
  if (obj['verificationView'] !== undefined) validateVerificationView(obj['verificationView']);
  if (obj['ownerFactRefs'] !== undefined) {
    if (expectedOwnerFactRefs === undefined || !canonicalValuesEqual(obj['ownerFactRefs'], expectedOwnerFactRefs)) {
      schemaFail('actionPackage.ownerFactRefs must exactly equal the sibling v5 context ownerFactRefs');
    }
  }
}

function validateReviewView(value: unknown): void {
  const obj = asObject(value, 'actionPackage.reviewView');
  const required = ['blockingAuthorities', 'findings', 'resultRef', 'reviewRunId', 'verdict'];
  const expected = obj['convergence'] === undefined ? required : [...required, 'convergence'];
  assertClosedKeys(obj, 'actionPackage.reviewView', expected);
  requireNonEmptyString(obj, 'reviewRunId');
  if (obj['verdict'] !== 'approved' && obj['verdict'] !== 'changes-requested') schemaFail('actionPackage.reviewView.verdict is invalid');
  validateVersionedAuthorityRefs([obj['resultRef']], 'actionPackage.reviewView.resultRef');
  if (!Array.isArray(obj['blockingAuthorities']) || obj['blockingAuthorities'].some((authority) =>
    typeof authority !== 'string' || !(BLOCKING_AUTHORITIES as readonly string[]).includes(authority))) {
    schemaFail('actionPackage.reviewView.blockingAuthorities is invalid');
  }
  if (!Array.isArray(obj['findings']) || !Array.isArray(obj['convergence'] ?? [])) {
    schemaFail('actionPackage.reviewView findings/convergence must be arrays');
  }
}

function validateVerificationView(value: unknown): void {
  const obj = asObject(value, 'actionPackage.verificationView');
  assertClosedKeys(obj, 'actionPackage.verificationView', obj['resultRef'] === undefined ? ['status'] : ['resultRef', 'status']);
  if (!['not-run', 'passed', 'failed', 'not-applicable', 'unavailable'].includes(obj['status'] as string)) {
    schemaFail('actionPackage.verificationView.status is invalid');
  }
  if (obj['resultRef'] !== undefined) validateVersionedAuthorityRefs([obj['resultRef']], 'actionPackage.verificationView.resultRef');
}

export function validateMutationDeclaration(value: unknown, action: 'apply' | 'revise-apply'): MutationDeclaration {
  const obj = asObject(value, 'mutationDeclaration');
  const keys = Object.keys(obj).sort();
  const expected = ['action', 'designRef', 'schemaVersion', 'selectors'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    schemaFail('mutationDeclaration must use the closed schema');
  }
  if (obj['schemaVersion'] !== 1 || obj['action'] !== action) {
    schemaFail('mutationDeclaration schemaVersion/action must match the v5 Apply context', { action });
  }
  const [designRef] = validateVersionedAuthorityRefs([obj['designRef']], 'mutationDeclaration.designRef');
  if (!Array.isArray(obj['selectors']) || obj['selectors'].length === 0) {
    schemaFail('mutationDeclaration.selectors must be a non-empty array');
  }
  const selectors = obj['selectors'].map((raw, index) => {
    const selector = asObject(raw, `mutationDeclaration.selectors[${index}]`);
    const selectorKeys = Object.keys(selector).sort();
    if (selectorKeys.length !== 2 || selectorKeys[0] !== 'kind' || selectorKeys[1] !== 'path') {
      schemaFail(`mutationDeclaration.selectors[${index}] must use the closed selector shape`);
    }
    const kind = selector['kind'];
    const path = requireNonEmptyString(selector, 'path');
    if ((kind !== 'exact' && kind !== 'prefix') || !isCanonicalMutationPath(path)) {
      schemaFail(`mutationDeclaration.selectors[${index}] is not a canonical selector`, { kind, path });
    }
    return { kind, path } as const;
  });
  const ordered = [...selectors].sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  if (ordered.some((selector, index) => selector.path !== selectors[index]!.path || selector.kind !== selectors[index]!.kind)) {
    schemaFail('mutationDeclaration.selectors must be lexical sorted');
  }
  for (let index = 0; index < selectors.length; index += 1) {
    for (let other = index + 1; other < selectors.length; other += 1) {
      if (selectorsOverlap(selectors[index]!, selectors[other]!)) {
        schemaFail('mutationDeclaration.selectors must not overlap', { first: selectors[index], second: selectors[other] });
      }
    }
  }
  return { schemaVersion: 1, action, designRef, selectors };
}

function isCanonicalMutationPath(path: string): boolean {
  return !path.startsWith('.') && !path.startsWith('/') && !path.includes('\\') &&
    !path.includes('*') && !path.includes('?') && !path.split('/').some((part) => part === '' || part === '.' || part === '..') &&
    !path.startsWith('.flowkit/');
}

function selectorsOverlap(first: { readonly kind: 'exact' | 'prefix'; readonly path: string }, second: { readonly kind: 'exact' | 'prefix'; readonly path: string }): boolean {
  if (first.path === second.path) return true;
  return (first.kind === 'prefix' && second.path.startsWith(`${first.path}/`)) ||
    (second.kind === 'prefix' && first.path.startsWith(`${second.path}/`));
}

function validateArchiveEntryOpenSpecProjection(
  value: unknown,
  schemaVersion: 2 | 3 | 4 | 5,
  action: ChangeAction,
  changeId: string,
): ArchiveEntryOpenSpecProjection | undefined {
  if (value === undefined) {
    // C1 pre-thin-integration archive fixtures/historical bootstrap paths have
    // no structured OpenSpec entry view to persist. The high-level B1
    // preparation path MUST supply this projection whenever structured
    // OpenSpec integration is active; the serializer only enforces that a
    // supplied projection is archive-only/current-schema and structurally
    // exact.
    return undefined;
  }
  if (schemaVersion !== 4) {
    schemaFail('archiveEntryOpenSpecProjection is only allowed on schemaVersion 4 Runs', { schemaVersion, action });
  }
  if (action !== 'archive') {
    schemaFail('archiveEntryOpenSpecProjection is only allowed on archive Runs', { action });
  }
  const obj = asObject(value, 'archiveEntryOpenSpecProjection');
  const known = new Set(['projectionVersion', 'version', 'changeId', 'changeRootLogical', 'artifactPaths']);
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) schemaFail(`archiveEntryOpenSpecProjection contains unknown field: ${key}`);
  }
  if (obj['projectionVersion'] !== 1) {
    schemaFail('archiveEntryOpenSpecProjection.projectionVersion must equal 1');
  }
  const version = requireNonEmptyString(obj, 'version');
  const projectedChangeId = requireNonEmptyString(obj, 'changeId');
  if (projectedChangeId !== changeId) {
    schemaFail('archiveEntryOpenSpecProjection.changeId must match ContextFile.changeId', {
      projectedChangeId, changeId,
    });
  }
  const changeRootLogical = requireNonEmptyString(obj, 'changeRootLogical');
  if (
    changeRootLogical.startsWith('/')
    || changeRootLogical.includes('\\')
    || changeRootLogical.split('/').some((part) => part === '' || part === '..' || part === '.')
  ) {
    schemaFail('archiveEntryOpenSpecProjection.changeRootLogical must be a normalized repo-relative POSIX path', {
      changeRootLogical,
    });
  }
  const artifactPathsObj = asObject(obj['artifactPaths'], 'archiveEntryOpenSpecProjection.artifactPaths');
  const expectedKeys = [...OPENSPEC_SUPPORTED_ARTIFACT_IDS];
  const actualKeys = Object.keys(artifactPathsObj).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length || actualKeys.some((key, index) => key !== sortedExpected[index])) {
    schemaFail('archiveEntryOpenSpecProjection.artifactPaths must use the closed OpenSpec artifact-id shape', {
      expected: sortedExpected,
      actual: actualKeys,
    });
  }
  const artifactPaths = Object.fromEntries(OPENSPEC_SUPPORTED_ARTIFACT_IDS.map((artifactId) => {
    const raw = artifactPathsObj[artifactId];
    if (!Array.isArray(raw) || raw.some((path) => typeof path !== 'string' || path.trim() === '')) {
      schemaFail(`archiveEntryOpenSpecProjection.artifactPaths.${artifactId} must be a string array`);
    }
    const paths = (raw as string[]).map((path) => normalizeSeparators(path));
    for (const path of paths) {
      if (
        path.startsWith('/')
        || path.includes('\\')
        || path.split('/').some((part) => part === '' || part === '..' || part === '.')
        || !path.startsWith(`${changeRootLogical}/`)
      ) {
        schemaFail(`archiveEntryOpenSpecProjection.artifactPaths.${artifactId} must contain normalized paths under changeRootLogical`, {
          path, changeRootLogical,
        });
      }
    }
    const normalized = [...new Set(paths)].sort();
    if (normalized.length !== paths.length || normalized.some((path, index) => path !== paths[index])) {
      schemaFail(`archiveEntryOpenSpecProjection.artifactPaths.${artifactId} must be normalized sorted unique paths`);
    }
    return [artifactId, normalized] as const;
  })) as unknown as Readonly<Record<(typeof OPENSPEC_SUPPORTED_ARTIFACT_IDS)[number], readonly string[]>>;
  return {
    projectionVersion: 1,
    version,
    changeId,
    changeRootLogical,
    artifactPaths,
  };
}

function validateArchiveMutationGuard(value: unknown, action: ChangeAction): ArchiveMutationGuard | undefined {
  if (value === undefined) return undefined;
  if (action !== 'archive') {
    schemaFail('archiveMutationGuard is only allowed on archive Runs', { action });
  }
  const obj = asObject(value, 'archiveMutationGuard');
  const state = requireString(obj, 'state');
  if (state !== 'armed' && state !== 'recovery-admitted') {
    schemaFail('archiveMutationGuard.state must be armed|recovery-admitted', { state });
  }
  if (obj['surfaceVersion'] !== OPENSPEC_ARCHIVE_SURFACE_VERSION) {
    schemaFail(`archiveMutationGuard.surfaceVersion must equal ${OPENSPEC_ARCHIVE_SURFACE_VERSION}`);
  }
  const changeRoot = requireNonEmptyString(obj, 'changeRoot');
  const canonicalSpecsRoot = requireNonEmptyString(obj, 'canonicalSpecsRoot');
  const archiveNamespaceRoot = requireNonEmptyString(obj, 'archiveNamespaceRoot');
  if (canonicalSpecsRoot !== 'openspec/specs') {
    schemaFail('archiveMutationGuard.canonicalSpecsRoot must equal openspec/specs');
  }
  for (const [field, path] of [['changeRoot', changeRoot], ['archiveNamespaceRoot', archiveNamespaceRoot]] as const) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '')) {
      schemaFail(`archiveMutationGuard.${field} must be a normalized repo-relative POSIX path`, { path });
    }
  }
  const fingerprint = requireNonEmptyString(obj, 'preArchiveGenerationFingerprint');
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    schemaFail('archiveMutationGuard.preArchiveGenerationFingerprint must be lowercase SHA-256');
  }

  let terminalObservation: ArchiveMutationGuard['terminalObservation'];
  if (obj['terminalObservation'] !== undefined) {
    const terminal = asObject(obj['terminalObservation'], 'archiveMutationGuard.terminalObservation');
    const kind = requireString(terminal, 'kind');
    if (kind !== 'success' && kind !== 'failure') schemaFail('terminalObservation.kind must be success|failure');
    const resultFingerprint = requireNonEmptyString(terminal, 'resultFingerprint');
    if (!/^[0-9a-f]{64}$/.test(resultFingerprint)) schemaFail('terminalObservation.resultFingerprint must be lowercase SHA-256');
    const normalized = asObject(terminal['normalized'], 'terminalObservation.normalized');
    if (normalized['kind'] !== kind) schemaFail('terminalObservation normalized.kind must match terminalObservation.kind');
    if (kind === 'success') {
      requireNonEmptyString(normalized, 'change');
      requireNonEmptyString(normalized, 'archivedAs');
      requireNonEmptyString(normalized, 'path');
      if (typeof normalized['specsUpdated'] !== 'boolean') schemaFail('success terminalObservation.specsUpdated must be boolean');
      if (normalized['totals'] !== undefined) {
        const totals = asObject(normalized['totals'], 'terminalObservation.normalized.totals');
        for (const field of ['added', 'modified', 'removed', 'renamed']) {
          const n = totals[field];
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) schemaFail(`terminalObservation totals.${field} must be a non-negative integer`);
        }
      }
      terminalObservation = { kind, resultFingerprint, normalized: normalized as unknown as OpenSpecArchiveSuccessObservation };
    } else {
      const exitCode = normalized['exitCode'];
      if (typeof exitCode !== 'number' || !Number.isInteger(exitCode)) schemaFail('failure terminalObservation.exitCode must be integer');
      const status = normalized['status'];
      if (!Array.isArray(status) || status.length === 0) schemaFail('failure terminalObservation.status must be a non-empty array');
      for (const item of status) {
        const st = asObject(item, 'terminalObservation.normalized.status[]');
        requireNonEmptyString(st, 'severity');
        if (st['code'] !== undefined && typeof st['code'] !== 'string') schemaFail('terminalObservation status.code must be string when present');
      }
      terminalObservation = { kind, resultFingerprint, normalized: normalized as unknown as OpenSpecArchiveFailureObservation };
    }
  }

  return {
    state,
    surfaceVersion: OPENSPEC_ARCHIVE_SURFACE_VERSION,
    changeRoot,
    canonicalSpecsRoot: 'openspec/specs',
    archiveNamespaceRoot,
    preArchiveGenerationFingerprint: fingerprint,
    ...(terminalObservation !== undefined && { terminalObservation }),
  };
}

function validateOptionalConstraints(
  value: unknown,
): ContextFileConstraints | undefined {
  if (value === undefined) {
    return undefined;
  }
  const obj = asObject(value, 'constraints');
  const result: ContextFileConstraints = {};
  const booleanFields: (keyof ContextFileConstraints)[] = [
    'mayCreateProposalArtifacts',
    'mayWriteProductionCode',
    'mayWriteTestCode',
    'mayModifyProposalArtifacts',
    'mayCheckpoint',
    'mayFullTest',
    'commitAllowed',
  ];
  for (const field of booleanFields) {
    const v = obj[field as string];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== 'boolean') {
      schemaFail(`constraints.${field} must be a boolean`, { field, value: v });
    }
    (result as Record<string, unknown>)[field as string] = v;
  }
  // Allow unknown constraint fields? The spec doesn't forbid them; be lenient
  // (Bootstrap constraints have varying shapes). For C1 Runs we validate the
  // known fields; unknown fields are passed through for forward compatibility.
  for (const key of Object.keys(obj)) {
    if (!booleanFields.includes(key as keyof ContextFileConstraints)) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// validateContextFileIdentity
// ---------------------------------------------------------------------------

/**
 * Validate path consistency between a {@link ContextFile} and the actual
 * filesystem Run directory (C1-PR-004).
 *
 * Checks:
 *   - `contextFile.runId` matches the Run directory basename.
 *   - `contextFile.deliveryId` appears as a path segment.
 *   - `contextFile.changeId` appears as a path segment.
 *   - `contextFile.runPath` is consistent with `expectedRunDir` (normalized).
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on any identity mismatch.
 */
export function validateContextFileIdentity(
  contextFile: ContextFile,
  expectedRunDir: string,
): void {
  const normalizedExpected = normalizeSeparators(expectedRunDir).replace(/\/+$/, '');
  const segments = normalizedExpected.split('/').filter((s) => s.length > 0);
  const dirBasename = segments.length > 0 ? segments[segments.length - 1] : '';

  if (contextFile.runId !== dirBasename) {
    schemaFail('ContextFile.runId must match Run directory name', {
      runId: contextFile.runId,
      directory: dirBasename,
    });
  }

  if (!segments.includes(contextFile.deliveryId)) {
    schemaFail('ContextFile.deliveryId must match a Delivery-level path segment', {
      deliveryId: contextFile.deliveryId,
      segments,
    });
  }

  if (!segments.includes(contextFile.changeId)) {
    schemaFail('ContextFile.changeId must match a Change-level path segment', {
      changeId: contextFile.changeId,
      segments,
    });
  }

  // runPath consistency: the normalized runPath must be a suffix of (or equal
  // to) the normalized expected directory. This tolerates runPath being
  // relative (`.flowkit/runs/.../<runId>/`) while expectedRunDir is absolute.
  const normalizedRunPath = normalizeSeparators(contextFile.runPath).replace(/\/+$/, '');
  const runPathSegments = normalizedRunPath.split('/').filter((s) => s.length > 0);
  if (runPathSegments.length === 0) {
    schemaFail('ContextFile.runPath must be a non-empty path', { runPath: contextFile.runPath });
  }
  const tail = segments.slice(-runPathSegments.length);
  if (tail.length !== runPathSegments.length || !tail.every((s, i) => s === runPathSegments[i])) {
    schemaFail('ContextFile.runPath must match the actual filesystem Run directory', {
      runPath: normalizedRunPath,
      expected: normalizedExpected,
    });
  }
}

// ---------------------------------------------------------------------------
// Re-exports for downstream convenience
// ---------------------------------------------------------------------------

export { CHANGE_ACTIONS };
