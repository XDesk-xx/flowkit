/**
 * C1 formal-fact-reader-and-persistence: filesystem Run-ID integration (D12).
 *
 * C1 collects the existing Run-ID list from the filesystem and delegates
 * allocation / validation to B1 pure functions (`allocateNextNnn`,
 * `validateCandidateNnn`, `validateRunIdUniqueness`). C1 does NOT reimplement
 * Run-ID allocation logic.
 *
 * Run-ID grammar: `YYYYMMDD-NNN-action` (B1-owned). NNN is Delivery-scoped and
 * shared across Change-level and Delivery-level Runs.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  allocateNextNnn,
  parseRunId,
  validateCandidateNnn,
  validateRunIdUniqueness,
} from '../domain/run-id.js';
import { FlowkitError } from '../shared/errors.js';

/**
 * Result of allocating a new Run-ID.
 */
export interface AllocatedRunId {
  readonly runId: string;
  readonly nnn: number;
}

/**
 * Collect existing Run-IDs from a Delivery's run directory tree.
 *
 * Layout:
 *   `<runsRoot>/<deliveryId>/<changeId>/<runId>/`  (Change-level)
 *   `<runsRoot>/<deliveryId>/<runId>/`             (Delivery-level)
 *
 * Both levels share the same NNN space within a Delivery. Staging directories
 * (`.tmp-<run-id>/`) are skipped.
 *
 * @param deliveryRunsDir - Absolute path to `<runsRoot>/<deliveryId>/`.
 * @returns Sorted list of existing Run-IDs.
 */
export async function collectRunIds(deliveryRunsDir: string): Promise<string[]> {
  const runIds: string[] = [];
  let topEntries: string[];
  try {
    topEntries = await readdir(deliveryRunsDir);
  } catch {
    // Directory does not exist ⇒ no Runs yet.
    return [];
  }

  for (const entry of topEntries) {
    if (entry.startsWith('.tmp-')) {
      continue; // staging directories are invisible to Run-ID collection.
    }
    const entryPath = join(deliveryRunsDir, entry);
    const isDir = await isDirectory(entryPath);
    if (!isDir) {
      continue;
    }

    // Change-level Runs: entry is a Change directory; its children are Runs.
    if (looksLikeChangeDir(entry)) {
      await collectChangeRunIds(entryPath, runIds);
      continue;
    }

    // Delivery-level Run: entry itself is a Run directory.
    if (looksLikeRunId(entry)) {
      runIds.push(entry);
    }
  }
  return runIds.sort();
}

async function collectChangeRunIds(
  changeDir: string,
  runIds: string[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(changeDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.tmp-')) {
      continue;
    }
    if (looksLikeRunId(entry)) {
      const entryPath = join(changeDir, entry);
      const isDir = await isDirectory(entryPath);
      if (isDir) {
        runIds.push(entry);
      }
    }
  }
}

/**
 * Allocate the next Run-ID for a Delivery.
 *
 * Collects existing Run-IDs, delegates to B1 `allocateNextNnn`, and composes
 * the full `YYYYMMDD-NNN-<action>` Run-ID.
 *
 * @param deliveryRunsDir - Absolute path to `<runsRoot>/<deliveryId>/`.
 * @param date - Eight-digit date string (YYYYMMDD).
 * @param action - Formal Action name.
 * @throws {FlowkitError} rethrows B1 errors (`RUN_ID_DUPLICATE_NNN`,
 *   `RUN_ID_NNN_EXHAUSTED`).
 */
export async function allocateNextRunId(
  deliveryRunsDir: string,
  date: string,
  action: string,
): Promise<AllocatedRunId> {
  const existing = await collectRunIds(deliveryRunsDir);
  const nnn = allocateNextNnn(existing);
  const nnnStr = String(nnn).padStart(3, '0');
  const runId = `${date}-${nnnStr}-${action}`;
  // Sanity: the composed ID must parse (validates the full grammar).
  parseRunId(runId);
  return { runId, nnn };
}

/**
 * Validate a candidate Run-ID against the filesystem state.
 *
 * Delegates NNN range/monotonicity to B1 `validateCandidateNnn` and uniqueness
 * to B1 `validateRunIdUniqueness`.
 *
 * @param candidateRunId - Full `YYYYMMDD-NNN-action` candidate.
 * @param deliveryRunsDir - Absolute path to `<runsRoot>/<deliveryId>/`.
 * @throws {FlowkitError} rethrows B1 errors.
 */
export async function validateCandidateRunId(
  candidateRunId: string,
  deliveryRunsDir: string,
): Promise<void> {
  const existing = await collectRunIds(deliveryRunsDir);
  const parsed = parseRunId(candidateRunId);
  validateCandidateNnn(parsed.nnn, existing);
  // Also ensure the full candidate is unique (NNN + action combination).
  if (existing.includes(candidateRunId)) {
    throw new FlowkitError('RUN_ID_DUPLICATE_NNN', `Run ID already exists: ${candidateRunId}`, {
      runId: candidateRunId,
    });
  }
  validateRunIdUniqueness([...existing, candidateRunId]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Heuristic: a Run-ID matches `YYYYMMDD-NNN-action`.
 */
function looksLikeRunId(name: string): boolean {
  return /^\d{8}-\d{3}-[a-z][a-z-]*$/.test(name);
}

/**
 * Heuristic: a Change directory is any directory that is not itself a Run-ID
 * and not a staging directory. Change directories typically use kebab-case
 * ids that do not start with a date.
 */
function looksLikeChangeDir(name: string): boolean {
  if (looksLikeRunId(name)) {
    return false;
  }
  // Change directories do not start with an 8-digit date prefix.
  return !/^\d{8}-/.test(name);
}
