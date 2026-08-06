/**
 * C1 formal-fact-reader-and-persistence: ResultRef adapter — non-self-
 * referential serialization, read-time derivation, and replacement detection
 * (D7, D10).
 *
 * The adapter only constructs objects and performs read-time derivation; it
 * MUST NOT serialize or publish (spec: adapter does not serialize / does not
 * publish). `writeRunResult` owns the sole terminal-result publish path.
 *
 * `versionFingerprint` is the SHA-256 of the result.json file content (D10:
 * content hash, not self-referential Commit SHA). result.json omits
 * `actionResult.runRef`; the fingerprint is derived from the file content on
 * read, breaking the self-reference cycle.
 */

import { createHash } from 'node:crypto';
import { normalizeSeparators } from '../shared/paths.js';
import type { ActionResult, ResultRef } from '../domain/types.js';
import type { ActionResultWithoutRunRef } from './serialization.js';

/**
 * Kind tag for Run result references.
 */
export const RUN_RESULT_KIND = 'run-result';

/**
 * Standard result.json filename within a Run directory.
 */
export const RESULT_JSON = 'result.json';

/**
 * Compute the SHA-256 hex digest of a file's content.
 */
export function computeResultFileHash(fileContent: string): string {
  return createHash('sha256').update(fileContent, 'utf8').digest('hex');
}

/**
 * Construct a {@link ResultRef} pointing at a Run's `result.json`.
 *
 * `ref` is the normalized path to `result.json`; `versionFingerprint` is the
 * SHA-256 of `fileContent`; `kind` is {@link RUN_RESULT_KIND}.
 */
export function buildRunResultRef(
  runPath: string,
  fileContent: string,
): ResultRef {
  const ref = joinResultJson(runPath);
  return {
    ref,
    versionFingerprint: computeResultFileHash(fileContent),
    kind: RUN_RESULT_KIND,
  };
}

/**
 * Reconstruct a complete {@link ActionResult} from its non-self-referential
 * projection by deriving `runRef` from the file content SHA-256 (D7).
 */
export function reconstructActionResult(
  actionResultWithoutRunRef: ActionResultWithoutRunRef,
  runPath: string,
  fileContent: string,
): ActionResult {
  const runRef = buildRunResultRef(runPath, fileContent);
  return {
    ...actionResultWithoutRunRef,
    runRef,
  };
}

/**
 * Replacement detection (D10): returns `true` when `ref.versionFingerprint`
 * matches the SHA-256 of `actualFileContent`, `false` otherwise.
 *
 * A `false` result signals the referenced file was replaced after the
 * reference was recorded.
 */
export function verifyResultRef(
  ref: ResultRef,
  actualFileContent: string,
): boolean {
  const actual = computeResultFileHash(actualFileContent);
  return ref.versionFingerprint === actual;
}

/**
 * Resolve a Run-result {@link ResultRef} back to its `result.json` filesystem
 * path.
 *
 * For references built by {@link buildRunResultRef}, `ref.ref` already holds
 * the result.json path. This function returns `ref.ref` when `kind` matches
 * {@link RUN_RESULT_KIND} (or is absent), enabling callers to locate the file.
 *
 * @throws {Error} when the reference does not point at a run result.
 */
export function resolveRunResultRef(ref: ResultRef): string {
  if (ref.kind !== undefined && ref.kind !== RUN_RESULT_KIND) {
    throw new Error(`ResultRef kind ${ref.kind} is not a run result`);
  }
  return ref.ref;
}

/**
 * Join `result.json` to a Run path, normalizing separators.
 */
function joinResultJson(runPath: string): string {
  const normalized = normalizeSeparators(runPath).replace(/\/+$/, '');
  return `${normalized}/${RESULT_JSON}`;
}
