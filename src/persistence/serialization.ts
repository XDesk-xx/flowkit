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
} from '../domain/types.js';
import { BLOCKING_AUTHORITIES } from '../domain/types.js';
import {
  OPENSPEC_ARCHIVE_SURFACE_VERSION,
  type ArchiveMutationGuard,
  type OpenSpecArchiveSuccessObservation,
  type OpenSpecArchiveFailureObservation,
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
  /** Q1: typed Reviewer findings for completed `review-*` Runs. */
  readonly reviewFindings?: readonly ReviewFinding[];
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
export interface ContextFile {
  /** C1 format marker — fixed to `2`. */
  readonly schemaVersion: 2;
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
  /** C1 OpenSpec archive-only machine operational recovery field. */
  readonly archiveMutationGuard?: ArchiveMutationGuard;
  readonly constraints?: ContextFileConstraints;
  /** MUST be consistent with the actual filesystem Run directory path. */
  readonly runPath: string;
}

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
  'reviewFindings',
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

  // Q1: reviewFindings — when present, MUST be a valid typed array.
  const reviewFindingsRaw = obj['reviewFindings'];
  if (reviewFindingsRaw !== undefined) {
    if (!Array.isArray(reviewFindingsRaw)) {
      schemaFail('RunResultFile.reviewFindings must be an array', {
        reviewFindings: reviewFindingsRaw,
      });
    }
    for (let i = 0; i < reviewFindingsRaw.length; i++) {
      validateReviewFinding(reviewFindingsRaw[i], i);
    }
  }

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

  // schemaVersion MUST be exactly 2 (C1 format marker).
  if (obj['schemaVersion'] !== 2) {
    schemaFail('ContextFile.schemaVersion must equal 2', { schemaVersion: obj['schemaVersion'] });
  }

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

  // Current schemaVersion 2 Standard Runs are Change-only.
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

  const archiveMutationGuard = validateArchiveMutationGuard(obj['archiveMutationGuard'], action as ChangeAction);

  // constraints (optional object).
  const constraints = validateOptionalConstraints(obj['constraints']);

  const result: ContextFile = {
    schemaVersion: 2,
    runId,
    deliveryId,
    action: action as ChangeAction,
    role: role as Role,
    ownerAuthorization,
    ...(semanticInputFingerprint !== undefined && { semanticInputFingerprint }),
    runPath,
    changeKey,
    changeId,
    ...(inputRef !== undefined && { inputRef }),
    ...(verificationInputRef !== undefined && { verificationInputRef }),
    ...(sourceReviewRun !== undefined && { sourceReviewRun }),
    ...(sourceReviewVerdict !== undefined && { sourceReviewVerdict }),
    ...(reviewedRunId !== undefined && { reviewedRunId }),
    ...(archiveMutationGuard !== undefined && { archiveMutationGuard }),
    ...(constraints !== undefined && { constraints }),
  };
  return result;
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
