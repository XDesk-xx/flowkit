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
  // Q1-RA-008: absolute-path evidence MUST be rejected BEFORE any normalization
  // strips it. `normalizeSeparators` converts '\' to '/' (so a Windows path
  // `C:\tmp\x` becomes `C:/tmp/x`), and we must reject both a POSIX leading '/'
  // and a Windows drive letter BEFORE the leading-'/' strip below. Otherwise a
  // POSIX absolute ref such as `/openspec/changes/C1/proposal.md` would be
  // silently rewritten into a repository-relative-looking path.
  const separatorNormalized = normalizeSeparators(logicalRef);
  if (separatorNormalized.startsWith('/')) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must be repository-relative, not an absolute POSIX path: ${logicalRef}`,
      { logicalRef },
    );
  }
  if (/^[a-zA-Z]:/.test(separatorNormalized)) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must be repository-relative, not an absolute Windows path: ${logicalRef}`,
      { logicalRef },
    );
  }
  // From here the value is repository-relative (no leading '/', no drive
  // letter). Strip any remaining leading slashes defensively.
  const normalized = separatorNormalized.replace(/^\/+/, '');
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

/**
 * Prove that a logical ref is a canonical Change-artifact ref with the exact
 * root/field identity `openspec/changes/<changeId>/...` (Q1-RA-008).
 *
 * A non-Run artifact ref is a normalized repository-relative stable logical ref
 * under the canonical Change root. Rejections (`SCHEMA_VALIDATION_FAILED`):
 *   - empty / no path;
 *   - leading `/` or Windows drive (absolute evidence);
 *   - `..` traversal anywhere;
 *   - first segments not exactly `openspec/changes/<changeId>/` with a
 *     non-empty `changeId` and at least one remaining segment;
 *   - `result.json` target.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` when the ref is not a
 *   canonical Change-artifact ref.
 */
export function assertCanonicalArtifactRoot(logicalRef: string): void {
  // normalizeArtifactLogicalRef already rejects absolute/traversal/result.json;
  // call it first so the same boundary rules apply everywhere.
  const normalized = normalizeArtifactLogicalRef(logicalRef);
  const segments = normalized.split('/');
  if (segments.length < 4) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must be under openspec/changes/<changeId>/: ${logicalRef}`,
      { logicalRef },
    );
  }
  if (segments[0] !== 'openspec' || segments[1] !== 'changes' || segments[2] === '') {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must start with openspec/changes/<changeId>/: ${logicalRef}`,
      { logicalRef },
    );
  }
  // A trailing empty segment (e.g. 'openspec/changes/C1/') is not a file ref.
  if (segments[segments.length - 1] === '') {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `Artifact logical ref must name a file: ${logicalRef}`,
      { logicalRef },
    );
  }
}

/**
 * Canonical archive directory name grammar: `YYYY-MM-DD-<changeId>`.
 *
 * Q1-RA-008: archive discovery MUST accept only directories whose name exactly
 * matches `<date>-<changeId>` where `<date>` is a valid `YYYY-MM-DD` date and
 * `<changeId>` equals the target Change id after the date prefix. Suffix-based
 * `endsWith('-<changeId>')` matching is NOT sufficient — a directory named
 * `2026-02-02-execution-model-correction-extra` must never match.
 */
export function archiveDirectoryNameOf(changeId: string, date: string): string {
  return `${date}-${changeId}`;
}

/**
 * Extract the Change id from an archive directory name of the exact grammar
 * `YYYY-MM-DD-<changeId>`. Returns `undefined` when the name does not satisfy
 * the grammar.
 */
export function changeIdFromArchiveDirectoryName(name: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(name);
  if (match === null) {
    return undefined;
  }
  const [, dateStr, changeId] = match;
  if (changeId.length === 0) {
    return undefined;
  }
  // The date prefix MUST be a real calendar date (YYYY-MM-DD). A directory
  // named `2026-13-99-C1` is not a valid archive directory even though it
  // matches the digit shape.
  const [yyyy, mm, dd] = dateStr.split('-');
  const year = Number(yyyy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined; // e.g. 2026-02-30 does not exist.
  }
  return changeId;
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
  // Q1-RA-008: prove the canonical `openspec/changes/<changeId>/...` root/field
  // identity BEFORE any filesystem resolution. This rejects traversal/absolute
  // evidence and refs that are not Change-artifact refs at the boundary.
  assertCanonicalArtifactRoot(logicalRef);

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
    // Q1-RA-008: archive discovery accepts ONLY the exact grammar
    // `YYYY-MM-DD-<changeId>` AND the Change id must equal the target changeId
    // after removing the date prefix. A directory named `2026-02-02-<changeId>-extra`
    // or `2026-02-02` or a plain `<changeId>` directory MUST NOT match.
    const entryChangeId = changeIdFromArchiveDirectoryName(entry);
    if (entryChangeId === undefined || entryChangeId !== changeId) {
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

// ---------------------------------------------------------------------------
// Q1-RA-006: Shared review exact-binding validator
// ---------------------------------------------------------------------------
//
// ONE authority for "a schemaVersion 2 review-* Run's exact binding proof over
// the reviewed Run's result.json". Used by terminal completion preflight
// (run-persistence), formal Reader (formal-fact-reader) and sibling-lineage
// admission (readRunVerdict). The expected target is ALWAYS re-derived from
// reviewedRunId — trusting a caller-supplied inputRef.ref and checking only that
// path's hash is NOT sufficient proof.

export interface ReviewRunBindingInput {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly action: string;
  readonly reviewedRunId?: string;
  readonly inputRef?: ResultRef;
  readonly runsPathPrefix: string;
  readonly repoRoot: string;
}

/**
 * Validate the exact binding of a schemaVersion 2 `review-*` Run.
 *
 * Rules (single source of truth):
 *   - action MUST be `review-*`;
 *   - `reviewedRunId` MUST exist;
 *   - `inputRef` MUST exist (structural requiredness is also enforced by
 *     validateContextFile);
 *   - `inputRef.kind === 'run-result'`;
 *   - the expected target MUST be Core-re-derived from `reviewedRunId` via
 *     `resolveRunResultPath(runsPathPrefix, deliveryId, changeId, reviewedRunId)`;
 *   - `inputRef.ref` MUST equal that expected target (a different readable
 *     result with a matching hash is STILL a binding violation);
 *   - the target MUST exist and be readable;
 *   - actual SHA-256 of the target bytes MUST equal `inputRef.versionFingerprint`.
 *
 * @throws {FlowkitError} `SCHEMA_VALIDATION_FAILED` for structural violations
 *   (missing reviewedRunId / inputRef / wrong kind / non-review action).
 * @throws {FlowkitError} `RESULT_REF_MISMATCH` for wrong-target / hash mismatch.
 * @throws {FlowkitError} `RESULT_REF_TARGET_MISSING` when the target is
 *   unreadable.
 */
export async function validateReviewRunBinding(input: ReviewRunBindingInput): Promise<void> {
  const { runId, action, reviewedRunId, inputRef, runsPathPrefix, deliveryId, changeId, repoRoot } = input;

  if (!action.startsWith('review-')) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `validateReviewRunBinding requires a review-* action, got ${action} (Run ${runId})`,
      { runId, action },
    );
  }
  if (reviewedRunId === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-* Run ${runId} MUST carry reviewedRunId for exact binding`,
      { runId, action },
    );
  }
  if (inputRef === undefined) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-* Run ${runId} MUST carry inputRef for exact binding`,
      { runId, action },
    );
  }
  if (inputRef.kind !== RUN_RESULT_KIND) {
    throw new FlowkitError(
      'SCHEMA_VALIDATION_FAILED',
      `review-* Run ${runId} inputRef.kind MUST be ${RUN_RESULT_KIND}, got: ${String(inputRef.kind)}`,
      { runId, kind: inputRef.kind },
    );
  }

  // Core re-derives the expected target from reviewedRunId.
  const expectedRef = resolveRunResultPath(runsPathPrefix, deliveryId, changeId, reviewedRunId);
  const actualRef = normalizeSeparators(inputRef.ref);
  if (actualRef !== expectedRef) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `review-* Run ${runId} inputRef.ref (${actualRef}) does not equal the Core-derived reviewedRunId target (${expectedRef})`,
      { runId, reviewedRunId, expectedRef, actualRef },
    );
  }

  const targetPath = join(repoRoot, actualRef);
  let content: string;
  try {
    content = await readFile(targetPath, 'utf-8');
  } catch {
    throw new FlowkitError(
      'RESULT_REF_TARGET_MISSING',
      `review-* Run ${runId} reviewed Run ${reviewedRunId} result.json not found or unreadable: ${actualRef}`,
      { runId, reviewedRunId, targetPath },
    );
  }
  const actualHash = computeResultFileHash(content);
  if (actualHash !== inputRef.versionFingerprint) {
    throw new FlowkitError(
      'RESULT_REF_MISMATCH',
      `review-* Run ${runId} inputRef.versionFingerprint does not match reviewed Run ${reviewedRunId} result.json actual SHA-256 (expected ${inputRef.versionFingerprint}, got ${actualHash})`,
      { runId, reviewedRunId, expected: inputRef.versionFingerprint, actual: actualHash },
    );
  }
}

// ---------------------------------------------------------------------------
// Q1-RA-007: Shared source-review tuple validator
// ---------------------------------------------------------------------------
//
// For schemaVersion 2 completed non-review Runs that address a prior review,
// `sourceReviewRun + sourceReviewVerdict + actionResult.reviewVerdictRef` form
// ONE immutable tuple. Any of them present ⇒ all three MUST be present and
// mutually consistent. An unadmitted / unvalidated source review is a CONFLICT,
// never a silent skip.

export interface SourceReviewTupleInput {
  readonly runId: string;
  readonly deliveryId: string;
  readonly changeId?: string;
  readonly action: string;
  readonly sourceReviewRun?: string;
  readonly sourceReviewVerdict?: string;
  readonly reviewVerdictRef?: ResultRef;
  readonly runsPathPrefix: string;
  readonly repoRoot: string;
}

export interface SourceReviewTupleProblem {
  readonly code:
    | 'missing-sourceReviewRun'
    | 'missing-sourceReviewVerdict'
    | 'missing-reviewVerdictRef'
    | 'wrong-kind'
    | 'wrong-target'
    | 'target-missing'
    | 'fingerprint-mismatch'
    | 'source-review-not-admitted'
    | 'verdict-mismatch'
    | 'wrong-review-stage'
    | 'verdict-not-changes-requested';
  readonly message: string;
}

/**
 * Q1-RA-007: The review Action stage a `revise-*` Action MUST consume as its
 * source review. Action decides the required predecessor review; field presence
 * NEVER decides requiredness.
 */
export function expectedSourceReviewActionFor(reviseAction: string): string | undefined {
  switch (reviseAction) {
    case 'revise-explore':
      return 'review-explore';
    case 'revise-propose':
      return 'review-propose';
    case 'revise-apply':
      return 'review-apply';
    default:
      return undefined;
  }
}

/**
 * Validate the complete source-review immutable tuple for a schemaVersion 2
 * completed non-review Run.
 *
 * Applicability: the tuple is REQUIRED when the Action contract requires a
 * prior review (e.g. `revise-*` Runs) AND any of the three components is
 * present. When none of the three is present, the Run simply has no source
 * review (initial explore/propose/apply) and validation passes.
 *
 * When any component is present:
 *   - all three MUST be present (missing counterpart fails closed);
 *   - `reviewVerdictRef.kind === 'run-result'`;
 *   - `reviewVerdictRef.ref` MUST equal the Core-derived
 *     `<sourceReviewRun>/result.json` path;
 *   - the target MUST exist / be readable;
 *   - actual SHA-256 MUST equal `reviewVerdictRef.versionFingerprint`;
 *   - the referenced review Run MUST be present in `admittedSourceReviewVerdicts`
 *     (a source review that itself failed schema/binding validation cannot be
 *     legitimate lineage evidence);
 *   - the actual admitted verdict MUST equal `sourceReviewVerdict`.
 *
 * This validator does NOT decide applicability from the Action alone — callers
 * (terminal preflight / Reader) determine whether the tuple is required per the
 * Action contract and pass `requiresTuple: true` when the Run must address a
 * prior review. Immutable refs stay strict across superseded / revision-window
 * generations because this validation is independent of mutable generation
 * classification.
 */
export async function validateSourceReviewTuple(
  input: SourceReviewTupleInput,
  options: {
    requiresTuple: boolean;
    admittedSourceReviewVerdicts: readonly { reviewRunId: string; verdict: string; action: string }[];
  },
): Promise<SourceReviewTupleProblem[]> {
  const problems: SourceReviewTupleProblem[] = [];
  const {
    runId,
    deliveryId,
    changeId,
    sourceReviewRun,
    sourceReviewVerdict,
    reviewVerdictRef,
    runsPathPrefix,
    repoRoot,
  } = input;
  const { requiresTuple, admittedSourceReviewVerdicts } = options;

  const hasAny = sourceReviewRun !== undefined || sourceReviewVerdict !== undefined || reviewVerdictRef !== undefined;
  if (!hasAny) {
    // No source-review evidence at all. If the Action requires one, that is a
    // requiredness violation (missing reviewVerdictRef evidence).
    if (requiresTuple) {
      problems.push({
        code: 'missing-reviewVerdictRef',
        message: `Run ${runId} Action requires a source review but no sourceReviewRun/sourceReviewVerdict/reviewVerdictRef is present`,
      });
    }
    return problems;
  }

  // 1. Completeness: all three MUST be present.
  if (sourceReviewRun === undefined) {
    problems.push({
      code: 'missing-sourceReviewRun',
      message: `Run ${runId} carries source-review evidence but sourceReviewRun is missing`,
    });
  }
  if (sourceReviewVerdict === undefined) {
    problems.push({
      code: 'missing-sourceReviewVerdict',
      message: `Run ${runId} carries source-review evidence but sourceReviewVerdict is missing`,
    });
  }
  if (reviewVerdictRef === undefined) {
    problems.push({
      code: 'missing-reviewVerdictRef',
      message: `Run ${runId} carries source-review evidence but actionResult.reviewVerdictRef is missing`,
    });
  }
  if (sourceReviewRun === undefined || sourceReviewVerdict === undefined || reviewVerdictRef === undefined) {
    return problems;
  }

  // 2. kind.
  if (reviewVerdictRef.kind !== RUN_RESULT_KIND) {
    problems.push({
      code: 'wrong-kind',
      message: `Run ${runId} reviewVerdictRef.kind is ${String(reviewVerdictRef.kind)}, expected run-result`,
    });
    return problems;
  }

  // 3. Target MUST equal Core-derived <sourceReviewRun>/result.json.
  const expectedRef = resolveRunResultPath(runsPathPrefix, deliveryId, changeId, sourceReviewRun);
  const actualRef = normalizeSeparators(reviewVerdictRef.ref);
  if (actualRef !== expectedRef) {
    problems.push({
      code: 'wrong-target',
      message: `Run ${runId} reviewVerdictRef (${actualRef}) does not equal the Core-derived sourceReviewRun target (${expectedRef})`,
    });
    return problems;
  }

  // 4. Target readable + SHA-256.
  const targetPath = join(repoRoot, actualRef);
  let content: string;
  try {
    content = await readFile(targetPath, 'utf-8');
  } catch {
    problems.push({
      code: 'target-missing',
      message: `Run ${runId} source review ${sourceReviewRun} result.json not found or unreadable: ${actualRef}`,
    });
    return problems;
  }
  const actualHash = computeResultFileHash(content);
  if (actualHash !== reviewVerdictRef.versionFingerprint) {
    problems.push({
      code: 'fingerprint-mismatch',
      message: `Run ${runId} reviewVerdictRef fingerprint mismatch for source review ${sourceReviewRun} (expected ${reviewVerdictRef.versionFingerprint}, got ${actualHash})`,
    });
    return problems;
  }

  // 5. The referenced review MUST be admitted.
  const admittedVerdict = admittedSourceReviewVerdicts.find((v) => v.reviewRunId === sourceReviewRun);
  if (admittedVerdict === undefined) {
    problems.push({
      code: 'source-review-not-admitted',
      message: `Run ${runId} sourceReviewRun ${sourceReviewRun} is not an admitted completed review; a non-admitted source review cannot be legitimate lineage evidence`,
    });
    return problems;
  }

  // 6. Actual admitted verdict MUST equal sourceReviewVerdict.
  if (admittedVerdict.verdict !== sourceReviewVerdict) {
    problems.push({
      code: 'verdict-mismatch',
      message: `Run ${runId} sourceReviewVerdict (${sourceReviewVerdict}) does not match the admitted verdict of source review ${sourceReviewRun} (${admittedVerdict.verdict})`,
    });
  }

  // Q1-RA-007: Action-owned lineage — the source review MUST be the matching
  // review stage for this revise Action, and (revise-* can only follow
  // changes-requested) BOTH the actual admitted verdict and the persisted
  // sourceReviewVerdict MUST be `changes-requested`. Internal tuple
  // consistency (path/hash/verdict equal) alone is NOT sufficient proof.
  const expectedReviewAction = expectedSourceReviewActionFor(input.action);
  if (expectedReviewAction !== undefined) {
    if (admittedVerdict.action !== expectedReviewAction) {
      problems.push({
        code: 'wrong-review-stage',
        message: `Run ${runId} Action ${input.action} requires a source review of stage ${expectedReviewAction}, but source review ${sourceReviewRun} is ${admittedVerdict.action}`,
      });
    }
    if (admittedVerdict.verdict !== 'changes-requested') {
      problems.push({
        code: 'verdict-not-changes-requested',
        message: `Run ${runId} Action ${input.action} can only follow a changes-requested review, but source review ${sourceReviewRun} has admitted verdict ${admittedVerdict.verdict}`,
      });
    }
    if (sourceReviewVerdict !== 'changes-requested') {
      problems.push({
        code: 'verdict-not-changes-requested',
        message: `Run ${runId} Action ${input.action} requires sourceReviewVerdict changes-requested, got ${sourceReviewVerdict}`,
      });
    }
  }

  return problems;
}
