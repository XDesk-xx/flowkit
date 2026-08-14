import { FlowkitError } from '../../shared/errors.js';

export type ChangeKind = 'create' | 'modify' | 'delete';
export type PathKind = 'file' | 'directory' | 'missing';

export interface EntryWorkspaceSnapshot {
  readonly schemaVersion: 1;
  readonly canonicalBase: string;
  readonly workspaceFingerprint: string;
}

export interface ActualChangeSetEntry {
  readonly path: string;
  readonly kind: ChangeKind;
  readonly pathKindBefore: PathKind;
  readonly pathKindAfter: PathKind;
  readonly contentFingerprintAfter?: string;
}

function fail(message: string): never {
  throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireSha(value: unknown, label: string, git = false): string {
  if (typeof value !== 'string' || !(git ? /^[0-9a-f]{40,64}$/ : /^[0-9a-f]{64}$/).test(value)) fail(`${label} must be a lowercase ${git ? 'Git object id' : 'SHA-256'} fingerprint`);
  return value;
}

function requirePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.startsWith('.flowkit/') || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized candidate repository path`);
  return value;
}

export function validateEntryWorkspaceSnapshot(value: unknown): EntryWorkspaceSnapshot {
  const object = asObject(value, 'entryWorkspaceIdentity');
  const keys = Object.keys(object).sort();
  const expected = ['canonicalBase', 'schemaVersion', 'workspaceFingerprint'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || object['schemaVersion'] !== 1) fail('entryWorkspaceIdentity must use the closed schemaVersion 1 shape');
  return { schemaVersion: 1, canonicalBase: requireSha(object['canonicalBase'], 'entryWorkspaceIdentity.canonicalBase', true), workspaceFingerprint: requireSha(object['workspaceFingerprint'], 'entryWorkspaceIdentity.workspaceFingerprint') };
}

export function validateActualChangeSetEntries(value: unknown): readonly ActualChangeSetEntry[] {
  if (!Array.isArray(value)) fail('actualChangeSet must be an array');
  const actualChangeSet = value.map((entry, index) => validateActualChangeSetEntry(entry, index));
  const ordered = [...actualChangeSet].sort((a, b) => a.path.localeCompare(b.path));
  if (ordered.some((entry, index) => entry.path !== actualChangeSet[index]!.path) || new Set(actualChangeSet.map((entry) => entry.path)).size !== actualChangeSet.length) fail('actualChangeSet must be lexical sorted and unique');
  return actualChangeSet;
}

function validateActualChangeSetEntry(value: unknown, index: number): ActualChangeSetEntry {
  const object = asObject(value, `actualChangeSet[${index}]`);
  const expectedKeys = object['contentFingerprintAfter'] === undefined
    ? ['kind', 'path', 'pathKindAfter', 'pathKindBefore']
    : ['contentFingerprintAfter', 'kind', 'path', 'pathKindAfter', 'pathKindBefore'];
  const keys = Object.keys(object).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) fail(`actualChangeSet[${index}] must use the closed shape`);
  const kind = object['kind'];
  const before = object['pathKindBefore'];
  const after = object['pathKindAfter'];
  if ((kind !== 'create' && kind !== 'modify' && kind !== 'delete') || (before !== 'file' && before !== 'directory' && before !== 'missing') || (after !== 'file' && after !== 'directory' && after !== 'missing')) fail(`actualChangeSet[${index}] has invalid kinds`);
  if ((kind === 'create' && before !== 'missing') || (kind === 'delete' && after !== 'missing') || (kind === 'modify' && (before === 'missing' || after === 'missing'))) fail(`actualChangeSet[${index}] kind does not match path states`);
  const contentFingerprintAfter = object['contentFingerprintAfter'];
  if (after === 'file') requireSha(contentFingerprintAfter, `actualChangeSet[${index}].contentFingerprintAfter`);
  if (after !== 'file' && contentFingerprintAfter !== undefined) fail(`actualChangeSet[${index}].contentFingerprintAfter is only allowed for files`);
  return { path: requirePath(object['path'], `actualChangeSet[${index}].path`), kind, pathKindBefore: before, pathKindAfter: after, ...(after === 'file' && { contentFingerprintAfter: contentFingerprintAfter as string }) };
}
