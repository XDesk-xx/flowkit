import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { MutationDeclaration } from '../domain/types.js';
import { readFormalFactSnapshot } from '../facts/formal-fact-reader.js';
import type { FormalFactSnapshot } from '../facts/formal-fact-snapshot.js';
import { getCompletedUncheckpointedChanges } from '../policy/preconditions.js';
import { admitC1RunResultForReader, validateContextFile } from '../persistence/serialization.js';
import { next } from '../policy/next.js';
import { runCommand } from '../shared/external-command.js';
import { FlowkitError } from '../shared/errors.js';

export type CheckpointNormalizationOperation =
  | 'collapse-redundant-eof-blank-lines'
  | 'ensure-exactly-one-final-newline';

export interface CheckpointBoundaryHandoff {
  readonly deliveryId: string;
  readonly changeId: string;
  readonly ownerAuthorizationRef: string;
  readonly baseRevision: string;
  readonly subject: string;
  readonly trailers: readonly string[];
  readonly candidatePaths: readonly string[];
  readonly normalization: {
    readonly authority: 'same-owner-checkpoint-authorization';
    readonly scope: 'candidate-or-archive-touched-text-files';
    readonly allowed: readonly ['collapse-redundant-eof-blank-lines', 'ensure-exactly-one-final-newline'];
    readonly forbidden: readonly [
      'trailing-spaces-or-tabs-cleanup',
      'markdown-reflow',
      'internal-whitespace-rewrite',
      'semantic-text-change',
      'unrelated-file-mutation',
      'broad-formatter-execution',
    ];
    readonly operations: readonly {
      readonly path: string;
      readonly operations: readonly CheckpointNormalizationOperation[];
    }[];
  };
  readonly preflight: readonly ['git diff --check', 'git diff --cached --check'];
}

/**
 * Prepare the deterministic Git handoff for the one completed/uncheckpointed
 * Change. This service is read-only: it never mutates candidate bytes, stages,
 * commits, pushes, creates a Run, or persists a second checkpoint state.
 */
export async function prepareCheckpointBoundaryHandoff(
  repoRoot: string,
  deliveryId: string,
): Promise<CheckpointBoundaryHandoff> {
  const snapshot = await readFormalFactSnapshot({
    repoRoot,
    deliveryId,
    runsPathPrefix: '.flowkit/runs',
    openspecChangesPath: 'openspec/changes',
    manifestPathPrefix: 'openspec/delivery-groups',
  });
  assertConflictFree(snapshot);

  const target = getCompletedUncheckpointedChanges(snapshot);
  if (target.length !== 1) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_TARGET_UNAVAILABLE',
      'Checkpoint handoff requires exactly one completed/uncheckpointed Change',
      { changeIds: target.map((change) => change.id) },
    );
  }
  const change = target[0]!;
  const policy = next(snapshot);
  if (policy.kind !== 'owner-decision' || policy.decision !== 'authorize-checkpoint') {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_NOT_ALLOWED',
      'Current Policy is not requesting authorize-checkpoint',
      { policyKind: policy.kind, ...(policy.kind === 'owner-decision' ? { decision: policy.decision } : {}) },
    );
  }

  const authorizations = snapshot.ownerAuthorizations.filter((fact) =>
    fact.decision === 'authorize-checkpoint' &&
    fact.deliveryId === deliveryId &&
    fact.changeId === change.id
  );
  if (authorizations.length !== 1) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_AUTHORITY_UNAVAILABLE',
      'Checkpoint handoff requires exactly one matching authorize-checkpoint Owner fact',
      { deliveryId, changeId: change.id, ownerRefs: authorizations.map((fact) => fact.ref) },
    );
  }

  const owner = authorizations[0]!;
  const baseRevision = await gitText(repoRoot, ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40,64}$/.test(baseRevision)) {
    throw new FlowkitError('CHECKPOINT_HANDOFF_GIT_UNAVAILABLE', 'Checkpoint handoff requires an exact Git HEAD');
  }
  const staged = nulPaths(await gitRaw(repoRoot, ['diff', '--cached', '--name-only', '-z']));
  if (staged.length > 0) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_INDEX_NOT_EMPTY',
      'Checkpoint handoff requires an empty Git index before deriving the read-only execution plan',
      { paths: staged },
    );
  }

  const candidatePaths = await currentCandidatePaths(repoRoot, baseRevision);
  const archivedRoot = await uniqueArchivedChangeRoot(repoRoot, change.id);
  const canonicalSpecTargets = await archivedCanonicalSpecTargets(repoRoot, archivedRoot);
  const mutationDeclaration = await finalMutationDeclaration(repoRoot, deliveryId, change.id);
  const manifestPath = `openspec/delivery-groups/${deliveryId}.yaml`;
  const runPrefix = `.flowkit/runs/${deliveryId}/${change.id}`;

  const unrelated = candidatePaths.filter((path) => !isAllowedCandidatePath(
    path,
    manifestPath,
    runPrefix,
    archivedRoot,
    canonicalSpecTargets,
    mutationDeclaration,
  ));
  if (unrelated.length > 0) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_UNRELATED_CANDIDATE',
      'Checkpoint handoff candidate contains paths outside the current Change/formal-fact closure',
      { paths: unrelated },
    );
  }

  const normalizationOperations = await classifyNormalization(repoRoot, candidatePaths);

  return {
    deliveryId,
    changeId: change.id,
    ownerAuthorizationRef: owner.ref,
    baseRevision,
    subject: `chore(flowkit): checkpoint ${change.id}`,
    trailers: [
      `Flowkit-Delivery: ${deliveryId}`,
      `Flowkit-Change: ${change.id}`,
      'Flowkit-Boundary: change-checkpoint',
      `Owner-Authorization: ${owner.ref}`,
    ],
    candidatePaths,
    normalization: {
      authority: 'same-owner-checkpoint-authorization',
      scope: 'candidate-or-archive-touched-text-files',
      allowed: ['collapse-redundant-eof-blank-lines', 'ensure-exactly-one-final-newline'],
      forbidden: [
        'trailing-spaces-or-tabs-cleanup',
        'markdown-reflow',
        'internal-whitespace-rewrite',
        'semantic-text-change',
        'unrelated-file-mutation',
        'broad-formatter-execution',
      ],
      operations: normalizationOperations,
    },
    preflight: ['git diff --check', 'git diff --cached --check'],
  };
}

function assertConflictFree(snapshot: FormalFactSnapshot): void {
  if (snapshot.conflicts.length > 0) {
    throw new FlowkitError('FORMAL_FACT_CONFLICT', 'formal facts contain conflicts', {
      dimensions: snapshot.conflicts.map((conflict) => conflict.dimension),
    });
  }
}

async function currentCandidatePaths(repoRoot: string, baseRevision: string): Promise<readonly string[]> {
  const tracked = nulPaths(await gitRaw(repoRoot, ['diff', '--name-only', '--no-renames', '-z', baseRevision]));
  const untracked = nulPaths(await gitRaw(repoRoot, ['ls-files', '-o', '--exclude-standard', '-z']));
  return [...new Set([...tracked, ...untracked])].sort();
}

async function uniqueArchivedChangeRoot(repoRoot: string, changeId: string): Promise<string> {
  const archiveLogical = 'openspec/changes/archive';
  const archivePhysical = join(repoRoot, archiveLogical);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(archivePhysical, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const matches = entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${changeId}`))
    .map((entry) => `${archiveLogical}/${entry.name}`)
    .sort();
  if (matches.length !== 1) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_ARCHIVE_UNAVAILABLE',
      'Checkpoint handoff requires exactly one archived OpenSpec Change tree',
      { changeId, matches },
    );
  }
  return matches[0]!;
}

async function archivedCanonicalSpecTargets(repoRoot: string, archivedRoot: string): Promise<ReadonlySet<string>> {
  const specsRoot = join(repoRoot, archivedRoot, 'specs');
  let capabilities: import('node:fs').Dirent[];
  try {
    capabilities = await readdir(specsRoot, { withFileTypes: true });
  } catch {
    capabilities = [];
  }
  const result = new Set<string>();
  for (const entry of capabilities) {
    if (!entry.isDirectory()) continue;
    const specPath = join(specsRoot, entry.name, 'spec.md');
    try {
      if ((await stat(specPath)).isFile()) result.add(`openspec/specs/${entry.name}/spec.md`);
    } catch {
      // An archived Change may have no spec delta for a capability.
    }
  }
  return result;
}

async function finalMutationDeclaration(
  repoRoot: string,
  deliveryId: string,
  changeId: string,
): Promise<MutationDeclaration> {
  const changeRunsDir = join(repoRoot, '.flowkit', 'runs', deliveryId, changeId);
  let runIds: string[];
  try {
    runIds = (await readdir(changeRunsDir)).sort();
  } catch {
    runIds = [];
  }
  const candidates: { readonly runId: string; readonly declaration: MutationDeclaration }[] = [];
  for (const runId of runIds) {
    const contextPath = join(changeRunsDir, runId, 'context.json');
    const resultPath = join(changeRunsDir, runId, 'result.json');
    try {
      const context = validateContextFile(JSON.parse(await readFile(contextPath, 'utf8')) as unknown);
      if (context.deliveryId !== deliveryId || context.changeId !== changeId || (context.action !== 'apply' && context.action !== 'revise-apply')) continue;
      const resultRaw = await readFile(resultPath, 'utf8');
      const result = admitC1RunResultForReader(resultRaw, context.action, { runId, deliveryId, changeId });
      if (result.runStatus !== 'completed') continue;
      if (context.schemaVersion !== 5 || context.mutationDeclaration === undefined) continue;
      candidates.push({ runId, declaration: context.mutationDeclaration });
    } catch {
      // The formal Reader owns conflict projection. This bounded historical scan
      // simply ignores non-Apply/non-current-format entries and requires one
      // usable final completed Apply declaration below.
    }
  }
  const final = candidates.sort((left, right) => left.runId.localeCompare(right.runId)).at(-1);
  if (final === undefined) {
    throw new FlowkitError(
      'CHECKPOINT_HANDOFF_MUTATION_DECLARATION_UNAVAILABLE',
      'Checkpoint handoff requires a completed v5 Apply/revise-apply mutation declaration',
      { deliveryId, changeId },
    );
  }
  return final.declaration;
}

function isAllowedCandidatePath(
  path: string,
  manifestPath: string,
  runPrefix: string,
  archivedRoot: string,
  canonicalSpecTargets: ReadonlySet<string>,
  declaration: MutationDeclaration,
): boolean {
  if (path === manifestPath || path === runPrefix || path.startsWith(`${runPrefix}/`)) return true;
  if (path === archivedRoot || path.startsWith(`${archivedRoot}/`)) return true;
  if (canonicalSpecTargets.has(path)) return true;
  return declaration.selectors.some((selector) => selector.kind === 'exact'
    ? selector.path === path
    : path === selector.path || path.startsWith(`${selector.path}/`));
}

async function classifyNormalization(
  repoRoot: string,
  candidatePaths: readonly string[],
): Promise<readonly { readonly path: string; readonly operations: readonly CheckpointNormalizationOperation[] }[]> {
  const result: { path: string; operations: CheckpointNormalizationOperation[] }[] = [];
  for (const path of candidatePaths) {
    const physical = join(repoRoot, path);
    let metadata: import('node:fs').Stats;
    try {
      metadata = await stat(physical);
    } catch {
      // Deleted candidates have no bytes to normalize.
      continue;
    }
    if (!metadata.isFile()) {
      throw new FlowkitError('CHECKPOINT_HANDOFF_HYGIENE_UNSUPPORTED', 'Checkpoint handoff only supports regular-file candidate paths', { path });
    }
    const bytes = await readFile(physical);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    if (text.includes('\r')) {
      throw new FlowkitError('CHECKPOINT_HANDOFF_HYGIENE_UNSUPPORTED', 'Checkpoint handoff will not rewrite non-LF text', { path });
    }
    if (/[ \t]+(?=\n|$)/m.test(text)) {
      throw new FlowkitError(
        'CHECKPOINT_HANDOFF_NON_EOF_HYGIENE',
        'Checkpoint handoff refuses trailing spaces/tabs because checkpoint normalization is EOF-only',
        { path },
      );
    }
    const operations: CheckpointNormalizationOperation[] = [];
    if (text.endsWith('\n\n')) operations.push('collapse-redundant-eof-blank-lines');
    if (!text.endsWith('\n') || text.endsWith('\n\n')) operations.push('ensure-exactly-one-final-newline');
    if (operations.length > 0) result.push({ path, operations });
  }
  return result;
}

async function gitText(repoRoot: string, args: readonly string[]): Promise<string> {
  return (await gitRaw(repoRoot, args)).trim();
}

async function gitRaw(repoRoot: string, args: readonly string[]): Promise<string> {
  const outcome = await runCommand('git', [...args], { cwd: repoRoot, timeout: 15_000 });
  if (!outcome.spawned || outcome.timedOut || outcome.exitCode !== 0) {
    throw new FlowkitError('CHECKPOINT_HANDOFF_GIT_UNAVAILABLE', 'Checkpoint handoff cannot read required Git facts', {
      args,
      spawned: outcome.spawned,
      timedOut: outcome.timedOut,
      exitCode: outcome.exitCode,
      stderr: outcome.stderr,
    });
  }
  return outcome.stdout;
}

function nulPaths(value: string): readonly string[] {
  return value.split('\0').filter((path) => path !== '').sort();
}
