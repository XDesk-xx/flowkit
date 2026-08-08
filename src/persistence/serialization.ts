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

import {
  isFormalAction,
  isChangeAction,
  isDeliveryAction,
  CHANGE_ACTIONS,
  DELIVERY_ACTIONS,
} from '../domain/actions.js';
import type { ChangeAction, DeliveryAction } from '../domain/actions.js';
import { isExecutionStatus } from '../domain/schema-validator.js';
import { FlowkitError } from '../shared/errors.js';
import { normalizeSeparators } from '../shared/paths.js';
import { parseRunId } from '../domain/run-id.js';
import {
  RUN_RESULT_KIND,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
  RESULT_REF_KINDS,
} from './result-ref-adapter.js';
import type {
  ActionResult,
  ResultRef,
  ReviewVerdictValue,
  Role,
} from '../domain/types.js';

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
 * Q1 design Q1-2: each finding has a minimal structure. `severity=blocking`
 * findings MUST have a non-empty `requiredChange` when the verdict is
 * `changes-requested`.
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
  /** Required for `blocking` severity: what the author must change. */
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
  /** C1-specific; required for Change-level Runs, MUST be absent for Delivery-level. */
  readonly changeKey?: string;
  /** Maps to B1 `Run.changeId`; required for Change-level Runs, MUST be absent for Delivery-level. */
  readonly changeId?: string;
  readonly action: ChangeAction | DeliveryAction;
  readonly role: Role;
  readonly ownerAuthorization: string;
  /** Optional ResultRef projecting directly to `Run.inputRef`. */
  readonly inputRef?: ResultRef;
  /** Prior review being addressed by a `revise-*` Run. */
  readonly sourceReviewRun?: string;
  /** Verdict of the prior review being addressed by a `revise-*` Run. */
  readonly sourceReviewVerdict?: ReviewVerdictValue;
  /** Run being reviewed by a `review-*` Run (C1-AP-004 canonical linkage). */
  readonly reviewedRunId?: string;
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
    action: action as ChangeAction | DeliveryAction,
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
  const knownFields = new Set(['id', 'severity', 'title', 'problem', 'location', 'requiredChange']);
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

  // Optional requiredChange — required for blocking severity.
  const requiredChangeRaw = obj['requiredChange'];
  if (requiredChangeRaw !== undefined) {
    if (typeof requiredChangeRaw !== 'string' || requiredChangeRaw.trim() === '') {
      schemaFail(`reviewFindings[${index}].requiredChange must be a non-empty string`, {
        requiredChange: requiredChangeRaw,
        index,
      });
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
    // Each blocking finding MUST have non-empty requiredChange.
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      if (f.severity === 'blocking') {
        if (f.requiredChange === undefined || f.requiredChange.trim() === '') {
          throw new FlowkitError(
            'SCHEMA_VALIDATION_FAILED',
            `blocking reviewFindings[${i}] MUST have non-empty requiredChange (action=${action})`,
            { action, index: i, findingId: f.id },
          );
        }
      }
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
 *   - Action-scope rules: `action ∈ DELIVERY_ACTIONS` ⇒ `changeKey`/`changeId`
 *     absent; `action ∈ CHANGE_ACTIONS` ⇒ `changeKey`/`changeId` present.
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
  const ownerAuthorization = requireString(obj, 'ownerAuthorization');
  const runPath = requireNonEmptyString(obj, 'runPath');

  // Action-scope rules (C1-PR-008).
  const hasChangeKey = obj['changeKey'] !== undefined;
  const hasChangeId = obj['changeId'] !== undefined;
  if (isDeliveryAction(action)) {
    if (hasChangeKey || hasChangeId) {
      schemaFail('Delivery-level Run must not carry changeKey/changeId', {
        action,
        changeKey: obj['changeKey'],
        changeId: obj['changeId'],
      });
    }
  } else if (isChangeAction(action)) {
    if (!hasChangeKey || !hasChangeId) {
      schemaFail('Change-level Run must carry changeKey and changeId', {
        action,
        changeKey: obj['changeKey'],
        changeId: obj['changeId'],
      });
    }
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

  const changeKey =
    obj['changeKey'] === undefined ? undefined : requireString(obj, 'changeKey');
  const changeId =
    obj['changeId'] === undefined ? undefined : requireString(obj, 'changeId');

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

  // constraints (optional object).
  const constraints = validateOptionalConstraints(obj['constraints']);

  const result: ContextFile = {
    schemaVersion: 2,
    runId,
    deliveryId,
    action: action as ChangeAction | DeliveryAction,
    role: role as Role,
    ownerAuthorization,
    runPath,
    ...(changeKey !== undefined && { changeKey }),
    ...(changeId !== undefined && { changeId }),
    ...(inputRef !== undefined && { inputRef }),
    ...(sourceReviewRun !== undefined && { sourceReviewRun }),
    ...(sourceReviewVerdict !== undefined && { sourceReviewVerdict }),
    ...(reviewedRunId !== undefined && { reviewedRunId }),
    ...(constraints !== undefined && { constraints }),
  };
  return result;
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
 *   - Change-level Run: `contextFile.changeId` appears as a path segment.
 *   - Delivery-level Run: skip changeId segment check.
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

  // Change-level Run: changeId MUST appear as a path segment.
  // Delivery-level Run: changeId absent ⇒ skip.
  if (contextFile.changeId !== undefined) {
    if (!segments.includes(contextFile.changeId)) {
      schemaFail('ContextFile.changeId must match a Change-level path segment', {
        changeId: contextFile.changeId,
        segments,
      });
    }
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

export { CHANGE_ACTIONS, DELIVERY_ACTIONS };
