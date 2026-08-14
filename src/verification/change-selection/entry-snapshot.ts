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
