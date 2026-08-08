/**
 * C1 formal-fact-reader-and-persistence: ResultRef adapter — non-self-
 * referential serialization, read-time derivation, and replacement detection
 * (D7, D10).
 *
 * Q1 execution-model-correction: Core-owned ResultRef authority. All production
 * ResultRef constructors live here. Caller NEVER provides versionFingerprint,
 * kind, or arbitrary path — only typed descriptors. Core resolves, computes
 * SHA-256, and constructs ResultRef via the appropriate constructor.
 *
 * The adapter only constructs objects and performs read-time derivation; it
 * MUST NOT serialize or publish (spec: adapter does not serialize / does not
 * publish). `writeRunResult` owns the sole terminal-result publish path.
 *
 * `versionFingerprint` is the SHA-256 of the referenced file content (D10:
 * content hash, not self-referential Commit SHA). result.json omits
 * `actionResult.runRef`; the fingerprint is derived from the file content on
 * read, breaking the self-reference cycle.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { normalizeSeparators } from '../shared/paths.js';
import { FlowkitError } from '../shared/errors.js';
import { parseRunId } from '../domain/run-id.js';
import type { ActionResult, ResultRef } from '../domain/types.js';
import type { ActionResultWithoutRunRef } from './serialization.js';

// ---------------------------------------------------------------------------
// Kind enum (Core-owned, caller cannot select)
// ---------------------------------------------------------------------------

/**
 * Kind tag for Run result references (`result.json` targets).
 */
export const RUN_RESULT_KIND = 'run-result';

/**
 * Kind tag for produced Change artifact references (mutable canonical paths).
 */
export const PRODUCED_ARTIFACT_KIND = 'produced-artifact';

/**
 * Kind tag for verification summary references (`verification.md`).
 */
export const VERIFICATION_SUMMARY_KIND = 'verification-summary';

/**
 * Complete set of valid ResultRef kind values. Core owns this enum; callers
 * MUST NOT supply their own kind.
 */
export const RESULT_REF_KINDS = [
  RUN_RESULT_KIND,
  PRODUCED_ARTIFACT_KIND,
  VERIFICATION_SUMMARY_KIND,
] as const;

export type ResultRefKind = (typeof RESULT_REF_KINDS)[number];

/**
 * Standard result.json filename within a Run directory.
 */
export const RESULT_JSON = 'result.json';

// ---------------------------------------------------------------------------
// Produced artifact tags (Core-owned Action+tag→path mapping)
// ---------------------------------------------------------------------------

/**
 * Tags that callers may declare for produced artifacts. Core maps each tag to
 * a canonical logical ref; caller provides ONLY the tag, never the path.
 */
export type ProducedArtifactTag = 'explore' | 'proposal' | 'design' | 'specs' | 'tasks';

/**
 * Actions that produce explore-stage artifacts.
 */
const EXPLORE_PRODUCING_ACTIONS = new Set(['explore', 'revise-explore']);

/**
 * Actions that produce propose-stage artifacts.
 */
const PROPOSE_PRODUCING_ACTIONS = new Set(['propose', 'revise-propose']);

/**
 * Permitted produced-artifact tags for a given Action.
 * Returns an empty array for Actions that do not produce artifacts
 * (apply / revise-apply / review-* / archive).
 */
export function permittedProducedArtifactTags(action: string): readonly ProducedArtifactTag[] {
  if (EXPLORE_PRODUCING_ACTIONS.has(action)) {
    return ['explore'];
  }
  if (PROPOSE_PRODUCING_ACTIONS.has(action)) {
    return ['proposal', 'design', 'specs', 'tasks'];
  }
  return [];
}

/**
 * Singleton tag → logical ref suffix mapping (relative to Change dir).
 * `specs` is special: it maps to the entire `specs/**` namespace and is
 * enumerated by Core at terminal preflight.
 */
const SINGLETON_TAG_PATHS: Readonly<Record<Exclude<ProducedArtifactTag, 'specs'>, string>> = {
  explore: 'explore.md',
  proposal: 'proposal.md',
  design: 'design.md',
  tasks: 'tasks.md',
};

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hex digest of a file's content.
 */
export function computeResultFileHash(fileContent: string): string {
  return createHash('sha256').update(fileContent, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Run-result ResultRef constructor (existing, retained)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Non-Run artifact ResultRef constructor (Q1 NEW)
// ---------------------------------------------------------------------------

/**
 * Construct a {@link ResultRef} for a non-Run artifact (produced Change
 * artifact or verification summary).
 *
 * `logicalRef` is the normalized repository-relative canonical path (e.g.
 * `openspec/changes/<changeId>/proposal.md`). `kind` is assigned by Core based
 * on the owning result field — caller MUST NOT choose kind. The constructor
 * does NOT append `result.json`.
 *
 * Rejections (throws `SCHEMA_VALIDATION_FAILED`):
 *   - kind not in {@link RESULT_REF_KINDS}
 *   - kind is `run-result` (use {@link buildRunResultRef} for Run results)
 *   - logicalRef contains `..` traversal
 *   - logicalRef is an absolute path
 *   - logicalRef ends with `result.json` (non-Run artifact MUST NOT point at
 *     a Run result file)
 */
export function buildArtifactResultRef(
  logicalRef: string,
  fileContent: string,
  kind: ResultRefKind,
): ResultRef {
  if (kind === RUN_RESULT_KIND) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'buildArtifactResultRef must not use run-result kind; use buildRunResultRef for Run results',
      { kind, logicalRef },
    );
  }
  if (!RESULT_REF_KINDS.includes(kind)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Unknown ResultRef kind: ${kind}`,
      { kind, logicalRef },
    );
  }
  const normalized = normalizeArtifactLogicalRef(logicalRef);
  return {
    ref: normalized,
    versionFingerprint: computeResultFileHash(fileContent),
    kind,
  };
}

// ---------------------------------------------------------------------------
// Replacement detection (existing, retained)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ref resolvers
// ---------------------------------------------------------------------------

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
 * Resolve a non-Run artifact {@link ResultRef} to its logical ref (canonical
 * path). Returns `ref.ref` when kind matches a non-Run artifact kind.
 *
 * @throws {Error} when the reference is a run-result kind.
 */
export function resolveArtifactResultRef(ref: ResultRef): string {
  if (ref.kind === RUN_RESULT_KIND) {
    throw new Error('Use resolveRunResultRef for run-result refs');
  }
  return ref.ref;
}

// ---------------------------------------------------------------------------
// Core-owned Action+tag→logical-ref resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a singleton produced-artifact tag to its canonical logical ref.
 *
 * Returns `openspec/changes/<changeId>/<artifactPath>` for singleton tags
 * (explore/proposal/design/tasks). The `specs` tag is NOT a singleton — it
 * requires namespace enumeration and MUST be handled separately.
 *
 * @throws {FlowkitError} when the tag is not permitted for the Action, or when
 *   `specs` tag is passed (use {@link resolveSpecsNamespace} instead).
 */
export function resolveSingletonArtifactRef(
  action: string,
  tag: ProducedArtifactTag,
  changeId: string,
): string {
  const permitted = permittedProducedArtifactTags(action);
  if (!permitted.includes(tag)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Action ${action} does not permit produced-artifact tag ${tag}`,
      { action, tag },
    );
  }
  if (tag === 'specs') {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      'specs tag is a namespace replacement; use resolveSpecsNamespace for enumeration',
      { action, tag },
    );
  }
  const suffix = SINGLETON_TAG_PATHS[tag];
  return `openspec/changes/${changeId}/${suffix}`;
}

/**
 * Resolve the verification summary logical ref from a changeId.
 *
 * Returns `openspec/changes/<changeId>/verification.md`. The caller does NOT
 * provide a path — Core derives it from `context.changeId`.
 */
export function resolveVerificationSummaryRef(changeId: string): string {
  return `openspec/changes/${changeId}/verification.md`;
}

// ---------------------------------------------------------------------------
// Logical ref validation
// ---------------------------------------------------------------------------

/**
 * Normalize and validate an artifact logical ref.
 *
 * Rejections (throws `SCHEMA_VALIDATION_FAILED`):
 *   - `..` path traversal segments
 *   - absolute paths (leading `/` or drive letter on Windows)
 *   - ref ends with `result.json` (non-Run artifact MUST NOT point at Run
 *     result file)
 */
export function normalizeArtifactLogicalRef(logicalRef: string): string {
  const normalized = normalizeSeparators(logicalRef).replace(/^\/+/, '');
  // Reject absolute Windows paths (e.g. C:\, D:\).
  if (/^[a-zA-Z]:/.test(normalized)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must be repository-relative, not absolute: ${logicalRef}`,
      { logicalRef },
    );
  }
  // Reject path traversal.
  const segments = normalized.split('/');
  if (segments.some((s) => s === '..')) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must not contain '..' traversal: ${logicalRef}`,
      { logicalRef },
    );
  }
  // Reject non-Run result.json targets.
  if (normalized.endsWith(RESULT_JSON)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Non-Run artifact ref must not point at result.json: ${logicalRef}`,
      { logicalRef },
    );
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Run-ID → result.json path resolver
// ---------------------------------------------------------------------------

/**
 * Validate a Run-ID descriptor against the formal Run-ID grammar and reject
 * any path-shaped value BEFORE filesystem resolution (Q1-RA-005).
 *
 * Caller MUST NOT pass an arbitrary string into a path resolver. Only a
 * formal `YYYYMMDD-NNN-action` Run ID is a legitimate descriptor.
 *
 * @throws {FlowkitError} `RUN_ID_INVALID_FORMAT` (from {@link parseRunId}) when
 *   the value is not a formal Run ID, including path-shaped values (`../x`,
 *   `a/b`, `C:\\tmp`, absolute paths).
 */
export function validateRunIdDescriptor(value: string): string {
  // parseRunId enforces the full grammar: ^\d{8}-\d{3}-[a-z][a-z-]*$ with NNN in
  // 001–999. This inherently rejects slashes, backslashes, '..', absolute paths,
  // 'result.json' and any arbitrary filename — none of those can match.
  parseRunId(value);
  return value;
}

/**
 * Resolve a Run ID to its `result.json` repo-relative path.
 *
 * Given a deliveryId, optional changeId, and runId, returns
 * `<runsPathPrefix>/<deliveryId>/<changeId?>/<runId>/result.json`.
 *
 * The `runId` MUST already be a formal Run ID (validated via
 * {@link validateRunIdDescriptor}); this resolver does NOT sanitize caller
 * strings — it concatenates only validated identity segments.
 */
export function resolveRunResultPath(
  runsPathPrefix: string,
  deliveryId: string,
  changeId: string | undefined,
  runId: string,
): string {
  const prefix = normalizeSeparators(runsPathPrefix).replace(/^\/+|\/+$/g, '');
  const segments = [prefix, deliveryId];
  if (changeId !== undefined) {
    segments.push(changeId);
  }
  // Fail-closed: reject any path-shaped / non-Run-ID value before concatenation.
  segments.push(validateRunIdDescriptor(runId));
  return `${segments.join('/')}/${RESULT_JSON}`;
}

// ---------------------------------------------------------------------------
// Specs namespace enumeration (Q1: Core-owned complete expected set)
// ---------------------------------------------------------------------------

/**
 * Enumerate the complete `specs/**` namespace for a Change and construct a
 * produced-artifact ResultRef for each file.
 *
 * Q1-5.0 / Q1-5.3.1: Core MUST enumerate the actual canonical specs namespace
 * at terminal preflight and review entry — caller cannot shrink this set. Each
 * `.md` file under `openspec/changes/<changeId>/specs/` becomes a separate
 * ResultRef with kind=produced-artifact.
 *
 * @param repoRoot - Absolute path to the Git repository root.
 * @param changeId - The Change id (e.g. "execution-model-correction").
 * @returns Array of ResultRefs, sorted by logical ref for deterministic order.
 *          Empty array when the specs directory does not exist or is empty.
 */
export async function enumerateSpecsNamespace(
  repoRoot: string,
  changeId: string,
): Promise<readonly ResultRef[]> {
  const specsDir = join(repoRoot, 'openspec', 'changes', changeId, 'specs');
  const files = await collectMarkdownFiles(specsDir);
  const refs: ResultRef[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const relPath = normalizeSeparators(relative(repoRoot, file));
    refs.push(buildArtifactResultRef(relPath, content, PRODUCED_ARTIFACT_KIND));
  }
  // Sort by logical ref for deterministic comparison.
  refs.sort((a, b) => a.ref.localeCompare(b.ref));
  return refs;
}

/**
 * Extract the set of logical ref identities from specs ResultRefs.
 *
 * Used for the Q1-5.3.1 exact-set comparison:
 * `logicalIdentities(effectiveSpecs) == enumerateCanonicalSpecs(changeId)`.
 */
export function extractSpecsLogicalIdentities(
  refs: readonly ResultRef[],
): readonly string[] {
  return refs.map((r) => r.ref).sort();
}

/**
 * Recursively collect all `.md` files under a directory, sorted for
 * deterministic order. Returns empty array when the directory does not exist.
 */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const s = await stat(entryPath);
    if (s.isDirectory()) {
      const nested = await collectMarkdownFiles(entryPath);
      results.push(...nested);
    } else if (s.isFile() && entry.endsWith('.md')) {
      results.push(entryPath);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Archive-aware artifact resolver (Q1-10)
// ---------------------------------------------------------------------------

/**
 * Resolve a non-Run artifact logical ref to its physical filesystem path,
 * accounting for archive relocation.
 *
 * Q1-10: after archive, the active `openspec/changes/<changeId>/...` path is
 * absent and the artifact lives under exactly one
 * `openspec/changes/archive/<YYYY-MM-DD>-<changeId>/...` directory.
 *
 * Resolution rules:
 *   - Active path exists → return active path.
 *   - Active path absent → search `openspec/changes/archive/` for exactly one
 *     `<date>-<changeId>` directory containing the artifact. Return that path.
 *   - Active + archive both exist → ambiguity, throw (fail-closed).
 *   - Multiple archive matches → throw (fail-closed).
 *   - No match → throw RESULT_REF_TARGET_MISSING.
 *
 * @param repoRoot - Absolute path to the Git repository root.
 * @param logicalRef - Repository-relative canonical logical ref (e.g.
 *   `openspec/changes/<changeId>/proposal.md`).
 * @returns Absolute filesystem path to the artifact.
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when no target found.
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` on ambiguity.
 */
export async function resolveArchiveAwareArtifactPath(
  repoRoot: string,
  logicalRef: string,
): Promise<string> {
  const activePath = join(repoRoot, normalizeSeparators(logicalRef));
  const activeExists = await pathExists(activePath);

  // Search archive directories matching <date>-<changeId>.
  const archiveMatches = await findArchiveMatches(repoRoot, logicalRef);

  if (activeExists && archiveMatches.length > 0) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact ${logicalRef} exists in both active and archive locations (ambiguity fail-closed)`,
      { logicalRef, activePath, archiveMatches },
    );
  }
  if (archiveMatches.length > 1) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact ${logicalRef} matches multiple archive directories (fail-closed)`,
      { logicalRef, archiveMatches },
    );
  }
  if (activeExists) {
    return activePath;
  }
  if (archiveMatches.length === 1) {
    return archiveMatches[0];
  }
  throw new FlowkitError(
    'RESULT_REF_TARGET_MISSING',
    `Artifact ${logicalRef} not found in active or archive location`,
    { logicalRef, activePath },
  );
}

/**
 * Find all archive directories that contain the artifact identified by
 * `logicalRef`.
 *
 * The logical ref has the shape `openspec/changes/<changeId>/<relative>`.
 * Archive directories are named `<YYYY-MM-DD>-<changeId>` under
 * `openspec/changes/archive/`.
 */
async function findArchiveMatches(
  repoRoot: string,
  logicalRef: string,
): Promise<string[]> {
  // Parse the changeId and relative path from the logical ref.
  // Expected shape: openspec/changes/<changeId>/<relativePath>
  const normalized = normalizeSeparators(logicalRef).replace(/^\/+/, '');
  const parts = normalized.split('/');
  // parts[0]='openspec', parts[1]='changes', parts[2]=<changeId>, parts[3..]=relative
  if (parts.length < 4 || parts[0] !== 'openspec' || parts[1] !== 'changes') {
    return [];
  }
  const changeId = parts[2];
  const relativePath = parts.slice(3).join('/');

  const archiveDir = join(repoRoot, 'openspec', 'changes', 'archive');
  let entries: string[];
  try {
    entries = await readdir(archiveDir);
  } catch {
    return [];
  }

  const matches: string[] = [];
  for (const entry of entries) {
    // Archive dir name: <YYYY-MM-DD>-<changeId>
    if (!entry.endsWith(`-${changeId}`)) {
      continue;
    }
    const candidate = join(archiveDir, entry, relativePath);
    if (await pathExists(candidate)) {
      matches.push(candidate);
    }
  }
  return matches;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shared effective-set validation (Q1-RA-001 / Q1-RA-003)
// ---------------------------------------------------------------------------
//
// Used by completion preflight (run-persistence), review-entry (createRun) and
// Reader (formal-fact-reader) so the "current effective artifact set" contract
// has ONE authority. Each caller resolves which refs are the current effective
// set; these functions validate those refs against current canonical bytes and
// the specs namespace invariant.

/**
 * A problem detected while validating an effective artifact ref against current
 * canonical bytes. Callers translate these into `RESULT_REF_*` errors (preflight)
 * or `FactConflict`s (Reader) or pre-publish rejection (review-entry).
 */
export interface EffectiveArtifactProblem {
  readonly ref: string;
  readonly kind: 'missing' | 'ambiguous' | 'mismatch';
  readonly expected?: string;
  readonly actual?: string;
}

/**
 * Read the current canonical bytes for a non-Run artifact logical ref using
 * archive-aware resolution.
 *
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` / `SCHEMA_VALIDATION_FAILED`
 *   when the target cannot be uniquely resolved.
 */
export async function readArtifactBytes(
  repoRoot: string,
  logicalRef: string,
): Promise<string> {
  const filePath = await resolveArchiveAwareArtifactPath(repoRoot, logicalRef);
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `Artifact target unreadable: ${logicalRef}`,
      { logicalRef, filePath },
    );
  }
}

/**
 * Validate a set of effective produced-artifact refs against current canonical
 * bytes. Returns a list of problems (empty ⇒ all refs match current bytes).
 *
 * This is the shared "current effective artifact set" validator used by
 * completion preflight, review-entry and Reader. Each caller decides which refs
 * are the current effective set; this function only checks byte consistency.
 */
export async function validateEffectiveArtifactRefs(
  repoRoot: string,
  refs: readonly ResultRef[],
): Promise<EffectiveArtifactProblem[]> {
  const problems: EffectiveArtifactProblem[] = [];
  for (const ref of refs) {
    let content: string;
    try {
      content = await readArtifactBytes(repoRoot, ref.ref);
    } catch (e) {
      if (e instanceof FlowkitError && e.code === 'SCHEMA_VALIDATION_FAILED') {
        problems.push({ ref: ref.ref, kind: 'ambiguous' });
      } else {
        problems.push({ ref: ref.ref, kind: 'missing' });
      }
      continue;
    }
    const actualHash = computeResultFileHash(content);
    if (actualHash !== ref.versionFingerprint) {
      problems.push({
        ref: ref.ref,
        kind: 'mismatch',
        expected: ref.versionFingerprint,
        actual: actualHash,
      });
    }
  }
  return problems;
}

/**
 * Validate the specs namespace exact-set invariant: the effective specs
 * logical-ref identities MUST exactly equal the current canonical `specs/**`
 * namespace. Returns the mismatch detail or `null` when the sets match.
 */
export async function validateSpecsExactSet(
  repoRoot: string,
  changeId: string,
  effectiveSpecsRefs: readonly ResultRef[],
): Promise<{ effective: readonly string[]; canonical: readonly string[] } | null> {
  const effectiveIdentities = extractSpecsLogicalIdentities(effectiveSpecsRefs);
  const canonicalRefs = await enumerateSpecsNamespace(repoRoot, changeId);
  const canonicalIdentities = extractSpecsLogicalIdentities(canonicalRefs);
  if (effectiveIdentities.join(',') !== canonicalIdentities.join(',')) {
    return { effective: effectiveIdentities, canonical: canonicalIdentities };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared stage-aware effective-set completeness validator (Q1-RA-003)
// ---------------------------------------------------------------------------
//
// ONE authority for "what is the complete current effective artifact set" used
// by terminal completion preflight (run-persistence), review-entry (createRun)
// and Reader current-generation validation (formal-fact-reader). Requiredness
// comes from the Action/stage, NOT from field presence: a missing, empty,
// partial, malformed, extra, wrong-kind or drift-produced set all fail closed.

/** Stage an artifact-producing Action belongs to. */
export type ArtifactStage = 'explore' | 'propose';

/** Category of an effective-set problem detected by {@link validateStageEffectiveSet}. */
export type EffectiveSetProblemKind =
  | 'empty-set'
  | 'wrong-kind'
  | 'missing-singleton'
  | 'extra-identity'
  | 'missing-target'
  | 'ambiguous-target'
  | 'fingerprint-mismatch'
  | 'specs-mismatch';

/** A single fail-closed problem in an effective produced-artifact set. */
export interface EffectiveSetProblem {
  readonly kind: EffectiveSetProblemKind;
  /** Logical ref of the offending produced ref / expected identity, when applicable. */
  readonly ref?: string;
  readonly message: string;
}

/**
 * Validate a produced-artifact effective set against the stage invariant.
 *
 * Shared by terminal completion preflight, review-entry and the Reader so the
 * "current effective artifact set" contract has ONE authority.
 *
 * Semantics:
 *   - `stage=explore`: the effective set MUST exactly bind `explore.md`
 *     (single produced-artifact ref, kind=produced-artifact, current bytes).
 *   - `stage=propose`: the effective set MUST exactly bind the singleton
 *     identities `proposal.md`, `design.md`, `tasks.md` AND the complete
 *     current canonical `specs/**` namespace.
 *
 * For every produced ref the function checks:
 *   - kind MUST be `produced-artifact`;
 *   - target MUST resolve uniquely (archive-aware) and be readable;
 *   - fingerprint MUST match the current canonical bytes.
 *
 * Structural checks:
 *   - missing field / empty array / partial set / extra identity all fail
 *     closed (a legitimately-empty specs namespace does NOT excuse a missing
 *     singleton — singletons and the specs namespace are validated together).
 *
 * @returns List of problems; empty ⇒ the effective set satisfies the stage
 *   invariant. Callers translate these into their own error type
 *   (`FlowkitError` for preflight/review-entry, `FactConflict` for Reader).
 */
export async function validateStageEffectiveSet(
  repoRoot: string,
  changeId: string,
  stage: ArtifactStage,
  producedRefs: readonly ResultRef[],
): Promise<readonly EffectiveSetProblem[]> {
  const problems: EffectiveSetProblem[] = [];

  // Empty set is never a legal produced set for an artifact stage.
  if (producedRefs.length === 0) {
    problems.push({
      kind: 'empty-set',
      message: `${stage} produced set is empty; the complete Core-expected effective set is required`,
    });
  }

  // Byte / target validation for every present ref (missing/ambiguous/mismatch).
  const byteProblems = await validateEffectiveArtifactRefs(repoRoot, producedRefs);
  for (const p of byteProblems) {
    const kind: EffectiveSetProblemKind =
      p.kind === 'ambiguous'
        ? 'ambiguous-target'
        : p.kind === 'mismatch'
          ? 'fingerprint-mismatch'
          : 'missing-target';
    problems.push({
      kind,
      ref: p.ref,
      message: `${kind}: ${p.ref}${p.expected !== undefined ? ` (expected ${p.expected}, got ${p.actual})` : ''}`,
    });
  }

  // Every produced ref MUST carry the produced-artifact kind (Core-owned).
  for (const ref of producedRefs) {
    if (ref.kind !== PRODUCED_ARTIFACT_KIND) {
      problems.push({
        kind: 'wrong-kind',
        ref: ref.ref,
        message: `produced ref ${ref.ref} has kind ${String(ref.kind)}, expected produced-artifact`,
      });
    }
  }

  // Build the Core-enumerated expected identity set for the stage.
  const expectedIdentities: string[] = [];
  if (stage === 'explore') {
    expectedIdentities.push(resolveSingletonArtifactRef('explore', 'explore', changeId));
  } else {
    expectedIdentities.push(resolveSingletonArtifactRef('propose', 'proposal', changeId));
    expectedIdentities.push(resolveSingletonArtifactRef('propose', 'design', changeId));
    expectedIdentities.push(resolveSingletonArtifactRef('propose', 'tasks', changeId));
    const specsRefs = await enumerateSpecsNamespace(repoRoot, changeId);
    expectedIdentities.push(...specsRefs.map((r) => r.ref));
  }
  const expectedSet = new Set(expectedIdentities);
  const producedSet = new Set(producedRefs.map((r) => r.ref));

  // Missing expected identities (singletons are never optional).
  for (const identity of expectedIdentities) {
    if (!producedSet.has(identity)) {
      problems.push({
        kind: 'missing-singleton',
        ref: identity,
        message: `expected produced identity missing from effective set: ${identity}`,
      });
    }
  }

  // Extra identities not in the Core-expected set.
  for (const ref of producedRefs) {
    if (!expectedSet.has(ref.ref)) {
      problems.push({
        kind: 'extra-identity',
        ref: ref.ref,
        message: `produced identity not in Core-expected set: ${ref.ref}`,
      });
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Join `result.json` to a Run path, normalizing separators.
 */
function joinResultJson(runPath: string): string {
  const normalized = normalizeSeparators(runPath).replace(/\/+$/, '');
  return `${normalized}/${RESULT_JSON}`;
}
