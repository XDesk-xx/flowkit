import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EntryWorkspaceIdentity } from '../../domain/types.js';
import { FlowkitError } from '../../shared/errors.js';
import { runCommand } from '../../shared/external-command.js';

export interface EntryWorkspaceSnapshot extends EntryWorkspaceIdentity {
  readonly schemaVersion: 1;
  readonly files: readonly { readonly path: string; readonly contentFingerprint: string }[];
}

export async function captureEntryWorkspaceSnapshot(repoRoot: string): Promise<EntryWorkspaceSnapshot> {
  const canonicalBase = await runGit(repoRoot, ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40,64}$/.test(canonicalBase)) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git rev-parse HEAD did not return a Git object id');
  }
  const listed = await runGit(repoRoot, ['ls-files', '-co', '--exclude-standard', '-z']);
  const paths = listed === ''
    ? []
    : listed.split('\0').filter((path) => path !== '' && !path.startsWith('.flowkit/')).sort();
  if (new Set(paths).size !== paths.length) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git ls-files returned duplicate paths');
  }
  const files = await Promise.all(paths.map(async (path) => {
    if (!isCanonicalPath(path)) {
      throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git ls-files returned a non-canonical candidate path', { path });
    }
    const physical = join(repoRoot, path);
    const metadata = await lstat(physical);
    if (!metadata.isFile()) {
      throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'entry workspace identity only admits regular files', { path });
    }
    return { path, contentFingerprint: sha256(await readFile(physical)) };
  }));
  const workspaceFingerprint = sha256(JSON.stringify({ canonicalBase, files }));
  return { schemaVersion: 1, canonicalBase, workspaceFingerprint, files };
}

export function validateEntryWorkspaceSnapshotRecord(value: unknown): EntryWorkspaceSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'entry workspace snapshot must be an object');
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const expected = ['canonicalBase', 'files', 'schemaVersion', 'workspaceFingerprint'];
  if (obj['schemaVersion'] !== 1 || keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'entry workspace snapshot must use the closed schemaVersion 1 shape');
  }
  if (typeof obj['canonicalBase'] !== 'string' || !/^[0-9a-f]{40,64}$/.test(obj['canonicalBase']) ||
      typeof obj['workspaceFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/.test(obj['workspaceFingerprint']) ||
      !Array.isArray(obj['files'])) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'entry workspace snapshot has invalid identity fields');
  }
  const files = obj['files'].map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `entry workspace snapshot files[${index}] must be an object`);
    }
    const file = value as Record<string, unknown>;
    const fileKeys = Object.keys(file).sort();
    if (fileKeys.length !== 2 || fileKeys[0] !== 'contentFingerprint' || fileKeys[1] !== 'path' ||
      typeof file['path'] !== 'string' || !isCanonicalPath(file['path']) ||
      typeof file['contentFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/.test(file['contentFingerprint'])) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `entry workspace snapshot files[${index}] is invalid`);
    }
    return { path: file['path'], contentFingerprint: file['contentFingerprint'] };
  });
  if (files.some((file, index) => index > 0 && files[index - 1]!.path >= file.path)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'entry workspace snapshot files must be lexical sorted and unique');
  }
  const expectedFingerprint = sha256(JSON.stringify({ canonicalBase: obj['canonicalBase'], files }));
  if (expectedFingerprint !== obj['workspaceFingerprint']) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'entry workspace snapshot workspaceFingerprint does not bind its file set');
  }
  return { schemaVersion: 1, canonicalBase: obj['canonicalBase'], workspaceFingerprint: obj['workspaceFingerprint'], files };
}

function isCanonicalPath(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.includes('\\') &&
    !path.startsWith('.flowkit/') && !path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

async function runGit(repoRoot: string, args: string[]): Promise<string> {
  const result = await runCommand('git', args, { cwd: repoRoot, timeout: 15_000 });
  if (!result.spawned || result.timedOut || result.exitCode !== 0) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_UNAVAILABLE', 'Cannot capture entry workspace identity from Git', {
      args, spawned: result.spawned, timedOut: result.timedOut, exitCode: result.exitCode, stderr: result.stderr,
    });
  }
  return result.stdout.trimEnd();
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Capture the post-E2 compact entry identity: exact Git Base plus only dirty path state. */
export async function captureCompactEntryWorkspaceIdentity(repoRoot: string): Promise<import('../../domain/types.js').CompactEntryWorkspaceIdentity> {
  const canonicalBase = await runGit(repoRoot, ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40,64}$/.test(canonicalBase)) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git rev-parse HEAD did not return a Git object id');
  }
  const tracked = await runGitRaw(repoRoot, ['diff', '--name-status', '--no-renames', '-z', canonicalBase]);
  const trackedParts = tracked.split('\0').filter((part) => part !== '');
  if (trackedParts.length % 2 !== 0) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git diff --name-status returned an incomplete NUL record');
  }
  const byPath = new Map<string, import('../../domain/types.js').CompactEntryWorkspacePath>();
  for (let index = 0; index < trackedParts.length; index += 2) {
    const status = trackedParts[index]!;
    const path = trackedParts[index + 1]!;
    if (path.startsWith('.flowkit/')) continue;
    if (!isCanonicalPath(path) || !/^[AMDT]$/.test(status)) {
      throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git diff returned unsupported compact entry path/status', { status, path });
    }
    if (status === 'D') {
      byPath.set(path, { path, state: 'deleted' });
      continue;
    }
    const physical = join(repoRoot, path);
    const metadata = await lstat(physical);
    if (!metadata.isFile()) throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'compact entry identity only admits regular files', { path });
    byPath.set(path, { path, state: status === 'A' ? 'added' : 'modified', contentFingerprint: sha256(await readFile(physical)) });
  }
  const untracked = await runGitRaw(repoRoot, ['ls-files', '-o', '--exclude-standard', '-z']);
  for (const path of untracked.split('\0').filter((path) => path !== '' && !path.startsWith('.flowkit/')).sort()) {
    if (!isCanonicalPath(path)) throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'git ls-files returned non-canonical untracked path', { path });
    const physical = join(repoRoot, path);
    const metadata = await lstat(physical);
    if (!metadata.isFile()) throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_INVALID', 'compact entry identity only admits regular untracked files', { path });
    byPath.set(path, { path, state: 'untracked', contentFingerprint: sha256(await readFile(physical)) });
  }
  const entries = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const workspaceFingerprint = sha256(canonicalJson({ canonicalBase, entries }));
  return { canonicalBase, workspaceFingerprint, entries };
}


/** Reconstruct the producing Apply post-action compact identity while excluding only
 * Core-owned Verification authority bytes from the current workspace. The original
 * verification.md entry is restored from the producing Apply entry identity so the
 * resulting fingerprint can be compared with the persisted post-action fingerprint. */
export async function captureCompactReverificationCandidateIdentity(
  repoRoot: string,
  originEntryValue: unknown,
  verificationLogicalRef: string,
): Promise<import('../../domain/types.js').CompactEntryWorkspaceIdentity> {
  const originEntry = validateCompactEntryWorkspaceIdentity(originEntryValue);
  const current = await captureCompactEntryWorkspaceIdentity(repoRoot);
  if (current.canonicalBase !== originEntry.canonicalBase) {
    throw new FlowkitError('VERIFICATION_RETRY_CANDIDATE_DRIFT', 're-verification candidate canonical Base differs from producing Apply');
  }
  const historyPrefix = `${verificationLogicalRef.slice(0, verificationLogicalRef.lastIndexOf('/') + 1)}verification-history/`;
  const entries = current.entries
    .filter((entry) => entry.path !== verificationLogicalRef && !entry.path.startsWith(historyPrefix));
  const originalVerificationEntry = originEntry.entries.find((entry) => entry.path === verificationLogicalRef);
  if (originalVerificationEntry !== undefined) entries.push(originalVerificationEntry);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const workspaceFingerprint = sha256(canonicalJson({ canonicalBase: current.canonicalBase, entries }));
  return { canonicalBase: current.canonicalBase, workspaceFingerprint, entries };
}

export function validateCompactEntryWorkspaceIdentity(value: unknown): import('../../domain/types.js').CompactEntryWorkspaceIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compact entry workspace identity must be an object');
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const expected = ['canonicalBase', 'entries', 'workspaceFingerprint'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compact entry workspace identity must use the closed structural shape');
  }
  if (typeof obj['canonicalBase'] !== 'string' || !/^[0-9a-f]{40,64}$/.test(obj['canonicalBase']) ||
      typeof obj['workspaceFingerprint'] !== 'string' || !/^[0-9a-f]{64}$/.test(obj['workspaceFingerprint']) || !Array.isArray(obj['entries'])) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compact entry workspace identity has invalid identity fields');
  }
  const entries = obj['entries'].map((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `compact entry entries[${index}] must be an object`);
    }
    const entry = raw as Record<string, unknown>;
    const state = entry['state'];
    if (state !== 'added' && state !== 'modified' && state !== 'deleted' && state !== 'untracked') {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `compact entry entries[${index}].state is invalid`);
    }
    const path = entry['path'];
    if (typeof path !== 'string' || !isCanonicalPath(path)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `compact entry entries[${index}].path is invalid`);
    }
    const contentFingerprint = entry['contentFingerprint'];
    const entryKeys = Object.keys(entry).sort();
    if (state === 'deleted') {
      if (entryKeys.join(',') !== 'path,state' || contentFingerprint !== undefined) {
        throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `compact deleted entry ${path} must not carry contentFingerprint`);
      }
      return { path, state } as const;
    }
    if (entryKeys.join(',') !== 'contentFingerprint,path,state' || typeof contentFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(contentFingerprint)) {
      throw new FlowkitError('SCHEMA_VALIDATION_FAILED', `compact entry ${path} requires contentFingerprint`);
    }
    return { path, state, contentFingerprint } as const;
  });
  if (entries.some((entry, index) => index > 0 && entries[index - 1]!.path >= entry.path)) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compact entry paths must be lexical sorted and unique');
  }
  const expectedFingerprint = sha256(canonicalJson({ canonicalBase: obj['canonicalBase'], entries }));
  if (expectedFingerprint !== obj['workspaceFingerprint']) {
    throw new FlowkitError('SCHEMA_VALIDATION_FAILED', 'compact entry workspaceFingerprint does not bind its delta');
  }
  return { canonicalBase: obj['canonicalBase'], workspaceFingerprint: obj['workspaceFingerprint'], entries };
}

async function runGitRaw(repoRoot: string, args: string[]): Promise<string> {
  const result = await runCommand('git', args, { cwd: repoRoot, timeout: 15_000 });
  if (!result.spawned || result.timedOut || result.exitCode !== 0) {
    throw new FlowkitError('ENTRY_WORKSPACE_IDENTITY_UNAVAILABLE', 'Cannot capture compact entry workspace identity from Git', {
      args, spawned: result.spawned, timedOut: result.timedOut, exitCode: result.exitCode, stderr: result.stderr,
    });
  }
  return result.stdout;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
