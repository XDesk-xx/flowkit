import { createHash } from 'node:crypto';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { FlowkitError } from '../../shared/errors.js';
import { normalizeSeparators } from '../../shared/paths.js';
import { OPENSPEC_ARCHIVE_SURFACE_VERSION } from './openspec-types.js';

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

function isWithin(parent: string, child: string): boolean {
  const root = resolve(parent);
  const target = resolve(child);
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function assertAbsolutePath(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '' || !isAbsolute(value)) {
    throw new FlowkitError('OPENSPEC_PATH_AUTHORITY_INVALID', `${field} must be an absolute path`, { field, value });
  }
  return resolve(value);
}

/** Lexical containment only. Use assertPhysicalPathWithin for structured CLI authority. */
export function assertPathWithin(parent: string, child: string, field: string): string {
  const root = resolve(parent);
  const target = resolve(child);
  if (isWithin(root, target)) return target;
  throw new FlowkitError('OPENSPEC_PATH_ESCAPE', `${field} escapes its authority root`, { field, parent: root, child: target });
}

function existingAncestor(path: string): string {
  let current = resolve(path);
  while (!existsSync(current)) {
    const next = dirname(current);
    if (next === current) {
      throw new FlowkitError('OPENSPEC_PATH_AUTHORITY_INVALID', 'No existing ancestor for structured OpenSpec path', { path });
    }
    current = next;
  }
  return current;
}

function assertNoSymlinkComponents(parent: string, child: string, field: string): void {
  const root = resolve(parent);
  const target = resolve(child);
  assertPathWithin(root, target, field);
  const rel = relative(root, target);
  const components = rel === '' ? [] : rel.split(sep).filter(Boolean);
  let current = root;
  // The authority root itself must not be a symlink alias.
  if (lstatSync(root).isSymbolicLink()) {
    throw new FlowkitError('OPENSPEC_PATH_ALIAS_UNSAFE', `${field} authority root is a symlink`, { field, path: root });
  }
  for (const component of components) {
    current = resolve(current, component);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new FlowkitError('OPENSPEC_PATH_ALIAS_UNSAFE', `${field} traverses a symlink`, { field, path: current });
    }
  }
}

/**
 * Structured OpenSpec physical-path admission. It requires lexical containment,
 * rejects symlink components, and proves the nearest existing ancestor resolves
 * inside the real authority root. The leaf may be absent (for a planned output).
 */
export function assertPhysicalPathWithin(parent: string, child: string, field: string): string {
  const root = resolve(parent);
  const target = assertPathWithin(root, resolve(child), field);
  if (!existsSync(root)) {
    throw new FlowkitError('OPENSPEC_PATH_AUTHORITY_INVALID', `${field} authority root does not exist`, { field, parent: root });
  }
  assertNoSymlinkComponents(root, target, field);
  const realRoot = realpathSync(root);
  const ancestor = existingAncestor(target);
  const realAncestor = realpathSync(ancestor);
  if (!isWithin(realRoot, realAncestor)) {
    throw new FlowkitError('OPENSPEC_PATH_ESCAPE', `${field} escapes its real authority root`, {
      field, parent: root, realParent: realRoot, child: target, realAncestor,
    });
  }
  if (existsSync(target)) {
    const realTarget = realpathSync(target);
    if (!isWithin(realRoot, realTarget)) {
      throw new FlowkitError('OPENSPEC_PATH_ESCAPE', `${field} resolves outside its real authority root`, {
        field, parent: root, realParent: realRoot, child: target, realChild: realTarget,
      });
    }
  }
  return target;
}

export function physicalToRepoLogical(repoRoot: string, physicalPath: string, field: string): string {
  const physical = assertPathWithin(repoRoot, assertAbsolutePath(physicalPath, field), field);
  const rel = relative(resolve(repoRoot), physical);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new FlowkitError('OPENSPEC_PATH_AUTHORITY_INVALID', `${field} does not identify a repository file/directory`, { field, physical });
  }
  return normalizeSeparators(rel);
}

export function assertRepoRootIdentity(expectedRepoRoot: string, actualRoot: unknown, field: string): string {
  const expected = resolve(expectedRepoRoot);
  const actual = assertAbsolutePath(actualRoot, field);
  if (!existsSync(expected) || !existsSync(actual)) {
    throw new FlowkitError('OPENSPEC_UNSUPPORTED_PLANNING_HOME', `${field} repo root must exist`, { expected, actual });
  }
  if (!samePath(expected, actual) || realpathSync(expected) !== realpathSync(actual)) {
    throw new FlowkitError('OPENSPEC_UNSUPPORTED_PLANNING_HOME', `${field} does not match canonical repo root`, {
      expected,
      actual,
      expectedReal: realpathSync(expected),
      actualReal: realpathSync(actual),
    });
  }
  if (lstatSync(actual).isSymbolicLink()) {
    throw new FlowkitError('OPENSPEC_PATH_ALIAS_UNSAFE', `${field} must not be a symlink alias`, { actual });
  }
  return expected;
}

export function assertRequestedChangeRoot(
  repoRoot: string,
  changesDir: string,
  changeRoot: unknown,
  changeId: string,
): { physical: string; logical: string } {
  const repo = resolve(repoRoot);
  const changes = assertPhysicalPathWithin(repo, assertAbsolutePath(changesDir, 'planningHome.changesDir'), 'planningHome.changesDir');
  const root = assertPhysicalPathWithin(changes, assertAbsolutePath(changeRoot, 'changeRoot'), 'changeRoot');
  const relFromChanges = normalizeSeparators(relative(changes, root));
  if (relFromChanges !== changeId || relFromChanges.includes('/')) {
    throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'changeRoot does not match requested Change identity', {
      changeId,
      changeRoot: root,
      relative: relFromChanges,
    });
  }
  const expected = resolve(changes, changeId);
  if (!samePath(root, expected) || (existsSync(root) && realpathSync(root) !== realpathSync(expected))) {
    throw new FlowkitError('OPENSPEC_CHANGE_IDENTITY_MISMATCH', 'changeRoot physical identity does not match requested Change root', {
      changeId, changeRoot: root, expected,
    });
  }
  return { physical: root, logical: physicalToRepoLogical(repo, root, 'changeRoot') };
}

interface SurfaceEntry {
  readonly type: 'dir' | 'file' | 'absent';
  readonly path: string;
  readonly bytesHash?: string;
}

async function enumerateTree(repoRoot: string, root: string, absentAllowed: boolean): Promise<SurfaceEntry[]> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && absentAllowed) {
      return [{ type: 'absent', path: physicalToRepoLogical(repoRoot, root, 'surfaceRoot') }];
    }
    throw error;
  }
  if (rootStat.isSymbolicLink() || (!rootStat.isDirectory() && !rootStat.isFile())) {
    throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_UNSUPPORTED_ENTRY', 'archive mutation surface contains unsupported root entry', { root });
  }
  const results: SurfaceEntry[] = [];
  const visit = async (path: string): Promise<void> => {
    const s = await lstat(path);
    const logical = physicalToRepoLogical(repoRoot, path, 'archiveMutationSurface');
    if (s.isSymbolicLink()) {
      throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_UNSUPPORTED_ENTRY', 'archive mutation surface contains symlink', { path: logical });
    }
    if (s.isDirectory()) {
      results.push({ type: 'dir', path: logical });
      const entries = await readdir(path);
      entries.sort();
      for (const entry of entries) await visit(resolve(path, entry));
      return;
    }
    if (s.isFile()) {
      results.push({ type: 'file', path: logical, bytesHash: createHash('sha256').update(await readFile(path)).digest('hex') });
      return;
    }
    throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_UNSUPPORTED_ENTRY', 'archive mutation surface contains unsupported entry', { path: logical });
  };
  await visit(root);
  return results.sort((a, b) => `${a.path}\0${a.type}`.localeCompare(`${b.path}\0${b.type}`));
}

async function enumerateArchiveNamespace(repoRoot: string, archiveRoot: string): Promise<SurfaceEntry[]> {
  try {
    const s = await lstat(archiveRoot);
    if (s.isSymbolicLink() || !s.isDirectory()) {
      throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_UNSUPPORTED_ENTRY', 'archive namespace root must be a directory', { archiveRoot });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [{ type: 'absent', path: physicalToRepoLogical(repoRoot, archiveRoot, 'archiveNamespaceRoot') }];
    }
    throw error;
  }
  const rootLogical = physicalToRepoLogical(repoRoot, archiveRoot, 'archiveNamespaceRoot');
  const results: SurfaceEntry[] = [{ type: 'dir', path: rootLogical }];
  const entries = await readdir(archiveRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new FlowkitError('OPENSPEC_ARCHIVE_SURFACE_UNSUPPORTED_ENTRY', 'archive namespace contains unsupported immediate child', { entry: entry.name });
    }
    results.push({ type: entry.isDirectory() ? 'dir' : 'file', path: `${rootLogical}/${entry.name}` });
  }
  return results.sort((a, b) => `${a.path}\0${a.type}`.localeCompare(`${b.path}\0${b.type}`));
}

function canonicalStream(section: string, entries: readonly SurfaceEntry[]): string {
  return [section, ...entries.map((entry) => `${entry.type}\0${entry.path}\0${entry.bytesHash ?? ''}`)].join('\n');
}

export async function computeOpenSpecArchiveMutationSurfaceV1(input: {
  readonly repoRoot: string;
  readonly changeRoot: string;
  readonly archiveNamespaceRoot: string;
}): Promise<string> {
  const repoRoot = resolve(input.repoRoot);
  const changeRoot = assertPathWithin(repoRoot, input.changeRoot, 'changeRoot');
  const canonicalSpecsRoot = resolve(repoRoot, 'openspec/specs');
  const archiveNamespaceRoot = assertPathWithin(repoRoot, input.archiveNamespaceRoot, 'archiveNamespaceRoot');
  const [a, b, c] = await Promise.all([
    enumerateTree(repoRoot, changeRoot, true),
    enumerateTree(repoRoot, canonicalSpecsRoot, true),
    enumerateArchiveNamespace(repoRoot, archiveNamespaceRoot),
  ]);
  return createHash('sha256')
    .update([
      `flowkit-${OPENSPEC_ARCHIVE_SURFACE_VERSION}`,
      canonicalStream('A', a),
      canonicalStream('B', b),
      canonicalStream('C', c),
    ].join('\n'))
    .digest('hex');
}
