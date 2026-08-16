/**
 * B1 domain-and-state-schema: Run ID parse / validate / allocate contract.
 *
 * Pure functions operating on supplied Run-ID string fixtures. B1 does NOT
 * perform filesystem traversal — C1 is responsible for collecting Run-ID
 * lists from the filesystem and for atomic create/persist behavior.
 *
 * Run ID grammar: `YYYYMMDD-NNN-action`
 *   - `YYYYMMDD`: eight-digit date
 *   - `NNN`: zero-padded three-digit sequence number in 001–999
 *   - `action`: a formal Action name (letters and hyphens)
 *
 * NNN rules (B1-RE-007, B1-RE-008):
 *   - Unique within a Delivery. Current Change Runs and bounded historical
 *     Delivery-level Run IDs share the NNN space for compatibility.
 *   - Strictly monotonic — never reused; a candidate must be > max(NNN).
 *   - Gaps are allowed (skipped numbers are not backfilled).
 *   - NNN is not reset by date, Change, Action, or role.
 *   - Upper bound 999 — fail-closed (throw, never emit an invalid ID).
 *   - A candidate must be a finite integer in 1–999 before monotonicity is
 *     evaluated (0, negative, fractional, NaN, Infinity are rejected).
 */

import { FlowkitError } from '../shared/errors.js';

/**
 * Parsed components of a Run ID.
 */
export interface ParsedRunId {
  /** Eight-digit date string (YYYYMMDD). */
  readonly date: string;
  /** Sequence number in 1–999. */
  readonly nnn: number;
  /** Formal Action name. */
  readonly action: string;
}

const RUN_ID_PATTERN = /^(\d{8})-(\d{3})-([a-z][a-z-]*)$/;
const NNN_MIN = 1;
const NNN_MAX = 999;

/**
 * Parse and validate the complete `YYYYMMDD-NNN-action` grammar.
 *
 * @throws {FlowkitError} `RUN_ID_INVALID_FORMAT` when the string does not
 *   match the grammar.
 * @throws {FlowkitError} `RUN_ID_NNN_OUT_OF_RANGE` when NNN is outside
 *   001–999.
 */
export function parseRunId(value: string): ParsedRunId {
  const match = RUN_ID_PATTERN.exec(value);
  if (match === null) {
    throw new FlowkitError('RUN_ID_INVALID_FORMAT', `Invalid Run ID format: ${value}`, {
      value,
    });
  }
  const date = match[1] as string;
  const nnnStr = match[2] as string;
  const action = match[3] as string;
  const nnn = Number.parseInt(nnnStr, 10);
  if (nnn < NNN_MIN || nnn > NNN_MAX) {
    throw new FlowkitError('RUN_ID_NNN_OUT_OF_RANGE', `NNN out of range 001-999: ${nnnStr}`, {
      nnn,
    });
  }
  return { date, nnn, action };
}

/**
 * Reject Delivery-wide duplicate NNN values.
 *
 * Scans current Change Run IDs plus any bounded historical Delivery-level Run
 * IDs supplied by the persistence layer; both retain the Delivery-wide NNN
 * space. The caller is responsible for collecting the complete compatible list.
 *
 * @throws {FlowkitError} `RUN_ID_DUPLICATE_NNN` when a duplicate NNN is found.
 */
export function validateRunIdUniqueness(
  existingRunIds: readonly string[],
): void {
  const seen = new Map<number, string>();
  for (const id of existingRunIds) {
    const parsed = parseRunId(id);
    const first = seen.get(parsed.nnn);
    if (first !== undefined) {
      throw new FlowkitError('RUN_ID_DUPLICATE_NNN', `Duplicate NNN ${parsed.nnn}: ${first} and ${id}`, {
        nnn: parsed.nnn,
        first,
        duplicate: id,
      });
    }
    seen.set(parsed.nnn, id);
  }
}

/**
 * Allocate the next NNN as max(NNN)+1.
 *
 * Validates uniqueness first, then returns the next sequence number. An empty
 * list yields 1. When the next value would exceed 999 the function fails
 * closed — it throws rather than emit an invalid ID.
 *
 * @throws {FlowkitError} `RUN_ID_DUPLICATE_NNN` when duplicates exist.
 * @throws {FlowkitError} `RUN_ID_NNN_EXHAUSTED` when max(NNN)+1 > 999.
 */
export function allocateNextNnn(existingRunIds: readonly string[]): number {
  validateRunIdUniqueness(existingRunIds);
  let maxNnn = 0;
  for (const id of existingRunIds) {
    const parsed = parseRunId(id);
    if (parsed.nnn > maxNnn) {
      maxNnn = parsed.nnn;
    }
  }
  const nextNnn = maxNnn + 1;
  if (nextNnn > NNN_MAX) {
    throw new FlowkitError('RUN_ID_NNN_EXHAUSTED', `NNN exhausted: next value ${nextNnn} exceeds 999`, {
      nextNnn,
    });
  }
  return nextNnn;
}

/**
 * Validate a candidate NNN.
 *
 * First validates that `candidateNnn` is a finite integer in 1–999 — 0,
 * negative, fractional, NaN, and Infinity are all rejected, aligned with
 * parseRunId's 001–999 grammar (B1-RE-008). Then validates monotonicity:
 * the candidate must be strictly greater than every allocated NNN. Gaps are
 * allowed (candidateNnn > max(NNN)+1 is legal; skipped numbers are not
 * backfilled).
 *
 * @throws {FlowkitError} `RUN_ID_NNN_OUT_OF_RANGE` when the candidate is not
 *   a finite integer in 1–999.
 * @throws {FlowkitError} `RUN_ID_NNN_NOT_MONOTONIC` when candidateNnn <=
 *   max(NNN).
 */
export function validateCandidateNnn(
  candidateNnn: number,
  existingRunIds: readonly string[],
): void {
  if (
    !Number.isFinite(candidateNnn) ||
    !Number.isInteger(candidateNnn) ||
    candidateNnn < NNN_MIN ||
    candidateNnn > NNN_MAX
  ) {
    throw new FlowkitError('RUN_ID_NNN_OUT_OF_RANGE', `Candidate NNN is not a finite integer in 1-999: ${candidateNnn}`, {
      candidateNnn,
    });
  }
  let maxNnn = 0;
  for (const id of existingRunIds) {
    const parsed = parseRunId(id);
    if (parsed.nnn > maxNnn) {
      maxNnn = parsed.nnn;
    }
  }
  if (candidateNnn <= maxNnn) {
    throw new FlowkitError('RUN_ID_NNN_NOT_MONOTONIC', `Candidate NNN ${candidateNnn} is not greater than max allocated ${maxNnn}`, {
      candidateNnn,
      maxNnn,
    });
  }
}
