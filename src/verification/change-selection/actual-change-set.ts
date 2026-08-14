import type { MutationDeclaration } from '../../domain/types.js';
import { FlowkitError } from '../../shared/errors.js';
import { runCommand } from '../../shared/external-command.js';
import type { ActualChangeSetEntry, PathKind } from './contracts.js';
import type { EntryWorkspaceSnapshot } from './entry-snapshot.js';

export interface PostActionChangeObservation {
  readonly actualChangeSet: readonly ActualChangeSetEntry[];
  readonly observedActionMutations: readonly ActualChangeSetEntry[];
}

/** Derive base-to-post candidate facts without using entry-time candidate bytes. */
export async function deriveActualChangeSetFromCanonicalBase(
  repoRoot: string,
  canonicalBase: string,
  postAction: EntryWorkspaceSnapshot,
  reservedCoreOwnedPaths: ReadonlySet<string> = new Set(),
): Promise<readonly ActualChangeSetEntry[]> {
  if (postAction.canonicalBase !== canonicalBase) {
    throw new FlowkitError('POST_ACTION_BASE_DRIFT', 'Post-action state must retain the persisted canonical base');
  }
  const result = await runCommand('git', ['diff', '--name-status', '--no-renames', '-z', canonicalBase], {
    cwd: repoRoot,
    timeout: 15_000,
  });
  if (!result.spawned || result.timedOut || result.exitCode !== 0) {
    throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'Cannot derive base-to-post change set from Git', {
      canonicalBase,
      spawned: result.spawned,
      timedOut: result.timedOut,
      exitCode: result.exitCode,
      stderr: result.stderr,
    });
  }
  const postFiles = new Map(postAction.files.map((file) => [file.path, file.contentFingerprint]));
  const changed = parseNameStatus(result.stdout).filter(({ path }) => !reservedCoreOwnedPaths.has(path));
  const entries = changed.map(({ status, path }) => changeEntryForStatus(status, path, postFiles));
  const trackedChangedPaths = new Set(changed.map((entry) => entry.path));
  const untracked = await runCommand('git', ['ls-files', '-o', '--exclude-standard', '-z'], { cwd: repoRoot, timeout: 15_000 });
  if (!untracked.spawned || untracked.timedOut || untracked.exitCode !== 0) {
    throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'Cannot enumerate post-action untracked candidate paths', {
      canonicalBase,
      spawned: untracked.spawned,
      timedOut: untracked.timedOut,
      exitCode: untracked.exitCode,
      stderr: untracked.stderr,
    });
  }
  for (const path of untracked.stdout.split('\0').filter((path) => path !== '' && !path.startsWith('.flowkit/') && !reservedCoreOwnedPaths.has(path)).sort()) {
    if (trackedChangedPaths.has(path)) continue;
    const contentFingerprintAfter = postFiles.get(path);
    if (contentFingerprintAfter === undefined) {
      throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'Untracked Git path is absent from post-action state', { path });
    }
    entries.push({ path, kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Derive canonical mutation primitives from two immutable file-backed states.
 * Rename is intentionally represented as the corresponding delete + create.
 */
export function derivePostActionChangeObservation(
  base: EntryWorkspaceSnapshot,
  entry: EntryWorkspaceSnapshot,
  postAction: EntryWorkspaceSnapshot,
  declaration: MutationDeclaration,
  reservedCoreOwnedPaths: ReadonlySet<string> = new Set(),
): PostActionChangeObservation {
  if (base.canonicalBase !== entry.canonicalBase || base.canonicalBase !== postAction.canonicalBase) {
    throw new FlowkitError('POST_ACTION_BASE_DRIFT', 'Base, entry, and post-action observations must share the persisted canonical base');
  }
  const actualChangeSet = deriveChangeSet(base, postAction).filter((change) => !reservedCoreOwnedPaths.has(change.path));
  const observedActionMutations = deriveChangeSet(entry, postAction).filter((change) => !reservedCoreOwnedPaths.has(change.path));
  const undeclared = observedActionMutations.filter((entry) => !matchesDeclaration(entry.path, declaration));
  if (undeclared.length > 0) {
    throw new FlowkitError('UNDECLARED_ACTION_MUTATION', 'Post-action observation contains paths outside the persisted mutation declaration', {
      paths: undeclared.map((entry) => entry.path),
    });
  }
  return { actualChangeSet, observedActionMutations };
}

function deriveChangeSet(
  beforeSnapshot: EntryWorkspaceSnapshot,
  afterSnapshot: EntryWorkspaceSnapshot,
): readonly ActualChangeSetEntry[] {
  const before = new Map(beforeSnapshot.files.map((file) => [file.path, file.contentFingerprint]));
  const after = new Map(afterSnapshot.files.map((file) => [file.path, file.contentFingerprint]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const actualChangeSet: ActualChangeSetEntry[] = [];
  for (const path of paths) {
    const beforeFingerprint = before.get(path);
    const afterFingerprint = after.get(path);
    if (beforeFingerprint === afterFingerprint) continue;
    const pathKindBefore: PathKind = beforeFingerprint === undefined ? 'missing' : 'file';
    const pathKindAfter: PathKind = afterFingerprint === undefined ? 'missing' : 'file';
    const kind = beforeFingerprint === undefined ? 'create' : afterFingerprint === undefined ? 'delete' : 'modify';
    actualChangeSet.push({
      path,
      kind,
      pathKindBefore,
      pathKindAfter,
      ...(afterFingerprint !== undefined && { contentFingerprintAfter: afterFingerprint }),
    });
  }
  return actualChangeSet;
}

function matchesDeclaration(path: string, declaration: MutationDeclaration): boolean {
  return declaration.selectors.some((selector) =>
    selector.kind === 'exact' ? selector.path === path : path.startsWith(`${selector.path}/`),
  );
}

function parseNameStatus(value: string): readonly { readonly status: string; readonly path: string }[] {
  const parts = value.split('\0').filter((part) => part !== '');
  if (parts.length % 2 !== 0) {
    throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'git diff --name-status returned an incomplete NUL record');
  }
  const entries: { status: string; path: string }[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const status = parts[index]!;
    const path = parts[index + 1]!;
    if (!/^[AMDT]$/.test(status) || path.startsWith('.flowkit/') || path === '' || path.includes('\\') || path.startsWith('/')) {
      if (path.startsWith('.flowkit/')) continue;
      throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'git diff returned an unsupported candidate path or status', { status, path });
    }
    entries.push({ status, path });
  }
  return entries;
}

function changeEntryForStatus(
  status: string,
  path: string,
  postFiles: ReadonlyMap<string, string>,
): ActualChangeSetEntry {
  const after = postFiles.get(path);
  if (status === 'A') {
    if (after === undefined) throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'Added Git path is absent from post-action state', { path });
    return { path, kind: 'create', pathKindBefore: 'missing', pathKindAfter: 'file', contentFingerprintAfter: after };
  }
  if (status === 'D') return { path, kind: 'delete', pathKindBefore: 'file', pathKindAfter: 'missing' };
  if (after === undefined) throw new FlowkitError('ACTUAL_CHANGE_SET_UNAVAILABLE', 'Modified Git path is absent from post-action state', { status, path });
  return { path, kind: 'modify', pathKindBefore: 'file', pathKindAfter: 'file', contentFingerprintAfter: after };
}
