/**
 * C1 formal-fact-reader-and-persistence: bounded legacy recognizer + three-way
 * discriminator (D16).
 *
 * Pre-C1 Bootstrap Runs (001-059) were hand-created with `schemaVersion: 1`
 * and do not conform to C1's `createRun` staging+publish protocol. C1 Runs use
 * `schemaVersion: 2`. The three-way discriminator classifies a `context.json`
 * record:
 *
 *   1. `schemaVersion === 2`           → C1 Run path (validateContextFile +
 *      validateContextFileIdentity; failure ⇒ FactConflict, MUST NOT degrade
 *      to Bootstrap).
 *   2. `schemaVersion === 1` / missing → legacy path (bounded recognizer,
 *      MUST NOT call validateContextFile).
 *   3. other `schemaVersion` values    → FactConflict (unknown format).
 *
 * The recognizer validates only the B1 Run minimal shape (runId, deliveryId,
 * action, role); it does not enforce C1 schema. Bootstrap string-form
 * `inputRef` is read as `Run.inputRef = undefined` (no ResultRef constructed).
 */

import { createHash } from 'node:crypto';
import { isFormalAction } from '../domain/actions.js';
import type { ResultRef, RunStatus } from '../domain/types.js';
import type { Role } from '../domain/types.js';
import type { FormalAction } from '../domain/actions.js';
import {
  validateContextFile,
  validateContextFileIdentity,
  type ContextFile,
} from './serialization.js';
import type { FactConflict } from '../facts/formal-fact-snapshot.js';

// ---------------------------------------------------------------------------
// Legacy recognition result
// ---------------------------------------------------------------------------

export const LEGACY_DELIVERY_ACTIONS = ['full-test', 'delivery-finalize'] as const;
export type LegacyDeliveryAction = (typeof LEGACY_DELIVERY_ACTIONS)[number];
export type LegacyAction = FormalAction | LegacyDeliveryAction;

export interface LegacyRun {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly action: LegacyAction;
  readonly role: Role;
  readonly status: RunStatus;
  readonly inputRef?: ResultRef;
}

export interface LegacyRecognitionSuccess {
  readonly ok: true;
  readonly run: LegacyRun;
}

export interface LegacyRecognitionFailure {
  readonly ok: false;
  readonly conflict: FactConflict;
}

export type LegacyRecognitionResult =
  | LegacyRecognitionSuccess
  | LegacyRecognitionFailure;



interface PreQ1RevisionContextCompatibility {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId: string;
  readonly action: 'revise-explore' | 'revise-propose';
  readonly sourceReviewRun: string;
  readonly sha256: string;
}

/**
 * Exact immutable Q1 bootstrap revision contexts created before Q1 froze the
 * source-review tuple requirement. This is intentionally a byte-fingerprint
 * allowlist, not a shape-based downgrade path. It exists only so the formal
 * fact Reader can read the already-persisted Q1 bootstrap corpus without
 * rewriting history. New/current schemaVersion 2 contexts remain strict.
 */
const PRE_Q1_REVISION_CONTEXT_COMPATIBILITY: readonly PreQ1RevisionContextCompatibility[] = [
  {
    runId: '20260810-003-revise-explore',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'revise-explore',
    sourceReviewRun: '20260810-002-review-explore',
    sha256: '2063182ccc686ed57cb336a5488b11efb89db179fedf62e97ed7accdaf2f9253',
  },
  {
    runId: '20260810-007-revise-propose',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'revise-propose',
    sourceReviewRun: '20260810-006-review-propose',
    sha256: '7f7072eed2f5e58d811dbb85e72e5ec7c8b806234f9f86703d4f3a3fe2a66fa1',
  },
  {
    runId: '20260810-009-revise-propose',
    deliveryId: '20260810-01-change-execution-loop',
    changeId: 'core-contract-alignment',
    action: 'revise-propose',
    sourceReviewRun: '20260810-008-review-propose',
    sha256: '6bd055d3054064ca164e9f1c4ee48a32da94735b7cc037347d3518164d97622b',
  },
] as const;

function sha256Utf8(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Reader-only discriminator with one exact, immutable pre-Q1 compatibility
 * seam. Strict discrimination always runs first. A schemaVersion 2 failure is
 * normalized only when BOTH the formal identity and raw-byte SHA-256 match one
 * of the known Q1 bootstrap contexts. No caller outside the formal Reader uses
 * this function, so current writers/entry validation never inherit the seam.
 */
export function discriminateRunForReader(
  rawContext: string,
  contextJson: unknown,
  expectedRunDir: string,
): RunClassification {
  const strict = discriminateRun(contextJson, expectedRunDir);
  if (strict.kind !== 'conflict') return strict;
  if (readSchemaVersion(contextJson) !== 2) return strict;
  if (typeof contextJson !== 'object' || contextJson === null || Array.isArray(contextJson)) return strict;

  const obj = contextJson as Record<string, unknown>;
  const fingerprint = sha256Utf8(rawContext);
  const match = PRE_Q1_REVISION_CONTEXT_COMPATIBILITY.find((entry) =>
    entry.sha256 === fingerprint &&
    obj['runId'] === entry.runId &&
    obj['deliveryId'] === entry.deliveryId &&
    obj['changeId'] === entry.changeId &&
    obj['action'] === entry.action
  );
  if (match === undefined) return strict;

  try {
    const normalized = validateContextFile({
      ...obj,
      sourceReviewRun: match.sourceReviewRun,
      sourceReviewVerdict: 'changes-requested',
    });
    validateContextFileIdentity(normalized, expectedRunDir);
    return { kind: 'c1', contextFile: normalized, readerCompatibility: 'pre-q1-revision-context' };
  } catch {
    return strict;
  }
}

// ---------------------------------------------------------------------------
// recognizeLegacyRun
// ---------------------------------------------------------------------------

/**
 * Bounded legacy recognizer (D16). Validates the B1 Run minimal shape only;
 * MUST NOT call C1 `validateContextFile`. Satisfying the minimal shape yields
 * a Bootstrap Run (best-effort); failure yields a `FactConflict`.
 *
 * Minimal required fields: `runId`, `deliveryId`, `action` (current Change Action or bounded legacy Delivery Action), `role` (`owner`/`author`/`reviewer`). `changeId` is optional.
 * String-form `inputRef` → `Run.inputRef = undefined` (no ResultRef).
 */
export function recognizeLegacyRun(contextJson: unknown): LegacyRecognitionResult {
  if (typeof contextJson !== 'object' || contextJson === null || Array.isArray(contextJson)) {
    return fail('legacy-context', 'context.json must be an object', contextJson);
  }
  const obj = contextJson as Record<string, unknown>;

  const runId = obj['runId'];
  if (typeof runId !== 'string' || runId === '') {
    return fail('legacy-run-id', 'context.json missing string runId', { runId });
  }

  const deliveryId = obj['deliveryId'];
  if (typeof deliveryId !== 'string' || deliveryId === '') {
    return fail('legacy-delivery-id', 'context.json missing string deliveryId', { deliveryId });
  }

  const action = obj['action'];
  if (typeof action !== 'string' || (!isFormalAction(action) && !isLegacyDeliveryAction(action))) {
    return fail('legacy-action', 'context.json action must be a current Change Action or bounded legacy Delivery Action', { action });
  }

  const role = obj['role'];
  if (role !== 'owner' && role !== 'author' && role !== 'reviewer') {
    return fail('legacy-role', 'context.json role must be owner|author|reviewer', { role });
  }

  // changeId optional (B1 Run.changeId?).
  const changeIdRaw = obj['changeId'];
  const changeId =
    changeIdRaw === undefined ? undefined : typeof changeIdRaw === 'string' ? changeIdRaw : undefined;

  // String-form inputRef → undefined (no ResultRef construction).
  // Object-form inputRef is also tolerated as undefined for legacy (Bootstrap
  // never carried a valid ResultRef).
  const inputRefRaw = obj['inputRef'];
  const inputRef = undefined;
  void inputRefRaw;

  const run: LegacyRun = {
    runId,
    deliveryId,
    action: action as LegacyAction,
    role: role as Role,
    status: 'pending', // will be normalized by normalizeBootstrapRunStatus
    ...(changeId !== undefined && { changeId }),
    inputRef,
  };

  return { ok: true, run };
}

// ---------------------------------------------------------------------------
// Bootstrap runStatus normalization (from result.json)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: readonly RunStatus[] = ['completed', 'failed', 'cancelled'];

export interface RunStatusNormalizationSuccess {
  readonly ok: true;
  readonly status: RunStatus;
}

export interface RunStatusNormalizationFailure {
  readonly ok: false;
  readonly conflict: FactConflict;
}

export type RunStatusNormalizationResult =
  | RunStatusNormalizationSuccess
  | RunStatusNormalizationFailure;

/**
 * Normalize a Bootstrap Run's status from its `result.json` content.
 *
 * - `result.json` absent ⇒ `pending`.
 * - `result.json` present ⇒ read `status` field, normalize to
 *   `completed`/`failed`/`cancelled` (MUST NOT degrade to a bare `terminal`).
 * - `status` missing or value outside the enum ⇒ `FactConflict` (fail-closed).
 *
 * @param resultJson - Parsed `result.json` content, or `null` when absent.
 * @param hasResultFile - Whether `result.json` exists on disk.
 */
export function normalizeBootstrapRunStatus(
  resultJson: unknown,
  hasResultFile: boolean,
): RunStatusNormalizationResult {
  if (!hasResultFile) {
    return { ok: true, status: 'pending' };
  }

  if (typeof resultJson !== 'object' || resultJson === null || Array.isArray(resultJson)) {
    return fail('bootstrap-result', 'result.json must be an object', resultJson);
  }
  const obj = resultJson as Record<string, unknown>;
  const status = obj['status'];
  if (typeof status !== 'string') {
    return fail('bootstrap-result-status', 'result.json missing string status', { status });
  }
  if (!(TERMINAL_STATUSES as readonly string[]).includes(status)) {
    return fail('bootstrap-result-status', `result.json status not in {completed,failed,cancelled}: ${status}`, {
      status,
    });
  }
  return { ok: true, status: status as RunStatus };
}

// ---------------------------------------------------------------------------
// Three-way discriminator
// ---------------------------------------------------------------------------

export type RunClassification =
  | { readonly kind: 'c1'; readonly contextFile: ContextFile; readonly readerCompatibility?: 'pre-q1-revision-context' }
  | { readonly kind: 'legacy'; readonly run: LegacyRun }
  | { readonly kind: 'conflict'; readonly conflict: FactConflict };

export function isLegacyDeliveryAction(value: string): value is LegacyDeliveryAction {
  return (LEGACY_DELIVERY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Three-way discriminator (D16, C1-PR-006). Classifies a parsed `context.json`
 * record into C1 Run, legacy Bootstrap Run, or `FactConflict`.
 *
 *   1. `schemaVersion === 2` → C1 Run path: `validateContextFile` +
 *      `validateContextFileIdentity`. Failure ⇒ `FactConflict` (fail-closed,
 *      MUST NOT degrade to Bootstrap).
 *   2. `schemaVersion === 1` or missing → legacy path: `recognizeLegacyRun`
 *      (MUST NOT call `validateContextFile`).
 *   3. Other `schemaVersion` values ⇒ `FactConflict` (unknown format).
 *
 * @param contextJson - Parsed `context.json` content.
 * @param expectedRunDir - Actual filesystem Run directory path (for identity
 *   validation on the C1 path).
 */
export function discriminateRun(
  contextJson: unknown,
  expectedRunDir: string,
): RunClassification {
  const schemaVersion = readSchemaVersion(contextJson);

  if (schemaVersion === 2) {
    // C1 Run path (fail-closed, MUST NOT degrade).
    try {
      const contextFile = validateContextFile(contextJson);
      try {
        validateContextFileIdentity(contextFile, expectedRunDir);
      } catch (e) {
        return {
          kind: 'conflict',
          conflict: toConflict('context-identity', 'C1 Run identity validation failed', e),
        };
      }
      return { kind: 'c1', contextFile };
    } catch (e) {
      return {
        kind: 'conflict',
        conflict: toConflict('context-schema', 'C1 Run schema validation failed', e),
      };
    }
  }

  if (schemaVersion === 1 || schemaVersion === undefined) {
    // Legacy path (MUST NOT call validateContextFile).
    const result = recognizeLegacyRun(contextJson);
    if (result.ok) {
      return { kind: 'legacy', run: result.run };
    }
    return { kind: 'conflict', conflict: result.conflict };
  }

  // Unknown schemaVersion.
  return {
    kind: 'conflict',
    conflict: fail('schema-version', `unknown schemaVersion: ${schemaVersion}`, { schemaVersion })
      .conflict,
  };
}

/**
 * Read `schemaVersion` from a parsed context.json. Returns `undefined` when
 * absent; returns the raw value (number or other) otherwise.
 */
function readSchemaVersion(contextJson: unknown): number | undefined {
  if (typeof contextJson !== 'object' || contextJson === null || Array.isArray(contextJson)) {
    return undefined;
  }
  const obj = contextJson as Record<string, unknown>;
  const v = obj['schemaVersion'];
  if (typeof v === 'number') {
    return v;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(dimension: string, message: string, detail?: unknown): LegacyRecognitionFailure {
  return {
    ok: false,
    conflict: { dimension, authority: 'legacy-recognizer', message, ...(detail !== undefined && { detail }) },
  };
}

function toConflict(dimension: string, message: string, error: unknown): FactConflict {
  const detail =
    error instanceof Error
      ? { message: error.message, ...(error as { context?: unknown }).context !== undefined && { context: (error as { context?: unknown }).context } }
      : { message: String(error) };
  return {
    dimension,
    authority: 'legacy-recognizer',
    message,
    detail,
  };
}
