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
 * Resolve a Run ID to its `result.json` repo-relative path.
 *
 * Given a deliveryId, optional changeId, and runId, returns
 * `<runsPathPrefix>/<deliveryId>/<changeId?>/<runId>/result.json`.
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
  segments.push(runId);
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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Join `result.json` to a Run path, normalizing separators.
 */
function joinResultJson(runPath: string): string {
  const normalized = normalizeSeparators(runPath).replace(/\/+$/, '');
  return `${normalized}/${RESULT_JSON}`;
}
