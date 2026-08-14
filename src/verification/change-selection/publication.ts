import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { VerificationStatus } from '../../domain/types.js';
import { FlowkitError } from '../../shared/errors.js';
import { validateActualChangeSetEntries, validateEntryWorkspaceSnapshot, type ActualChangeSetEntry } from './contracts.js';
import {
  publishVerificationEvidence,
  readVerificationEvidenceRecord,
  validateVerificationEvidenceForSelection,
  type VerificationEvidenceRecord,
} from './evidence.js';
import { validateVerificationSelection, type VerificationSelection } from './selection.js';

export interface VerificationSelectionPublication {
  readonly schemaVersion: 1;
  readonly producingRunId: string;
  readonly producingSemanticInputFingerprint: string;
  readonly logicalDescriptorDigest: string;
  readonly canonicalBase: string;
  readonly entryWorkspaceIdentity: {
    readonly schemaVersion: 1;
    readonly canonicalBase: string;
    readonly workspaceFingerprint: string;
  };
  readonly postActionWorkspaceFingerprint: string;
  readonly actualChangeSet: readonly ActualChangeSetEntry[];
  readonly selection: VerificationSelection;
  readonly verificationStatus: VerificationStatus;
  readonly rendererVersion: 1 | 2;
  readonly verificationMarkdownLogicalRef: string;
  readonly verificationMarkdownFingerprint: string;
}

export interface VerificationSelectionBinding {
  readonly logicalRef: string;
  readonly versionFingerprint: string;
}

export interface PublishVerificationSelectionInput {
  readonly runDir: string;
  readonly canonicalVerificationPath: string;
  readonly record: VerificationSelectionPublication;
  readonly evidence: VerificationEvidenceRecord;
}

export const VERIFICATION_SELECTION_FILE = 'verification-selection.json';

export function buildVerificationSelectionPublication(
  input: Omit<VerificationSelectionPublication, 'schemaVersion' | 'rendererVersion' | 'verificationMarkdownFingerprint' | 'verificationStatus'>,
  evidence: VerificationEvidenceRecord,
): VerificationSelectionPublication {
  validateVerificationEvidenceForSelection(evidence, input.selection, input.producingRunId);
  const draft = {
    ...input,
    verificationStatus: evidence.overallStatus,
    schemaVersion: 1 as const,
    rendererVersion: 2 as const,
  };
  const record = { ...draft, verificationMarkdownFingerprint: sha256(renderVerificationMarkdown(draft, evidence)) };
  return validateVerificationSelectionRecord(record);
}

/** Publish immutable Verification evidence, mutable Markdown, then immutable selection commit marker. */
export async function publishVerificationSelection(input: PublishVerificationSelectionInput): Promise<VerificationSelectionBinding> {
  const record = validateVerificationSelectionRecord(input.record);
  validateVerificationEvidenceForSelection(input.evidence, record.selection, record.producingRunId);
  if (record.verificationStatus !== input.evidence.overallStatus) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'Verification selection status does not match immutable Verification evidence');
  }
  const evidencePublication = await publishVerificationEvidence(input.runDir, input.evidence);
  const rendered = renderVerificationMarkdown(record, evidencePublication.record);
  if (sha256(rendered) !== record.verificationMarkdownFingerprint) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'Verification selection record does not bind rendered Markdown bytes');
  }
  await mkdir(dirname(input.canonicalVerificationPath), { recursive: true });
  let existingMarkdown: string | undefined;
  try { existingMarkdown = await readFile(input.canonicalVerificationPath, 'utf8'); }
  catch { existingMarkdown = undefined; }
  const currentRunMarker = `- Producing Run: \`${record.producingRunId}\``;
  if (existingMarkdown?.includes(currentRunMarker)) {
    if (existingMarkdown !== rendered) {
      throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Pending verification Markdown already claims this Run but differs from deterministic rendered bytes', { runDir: input.runDir });
    }
  } else {
    const markdownStagingPath = `${input.canonicalVerificationPath}.${process.pid}.flowkit-staging`;
    await writeFile(markdownStagingPath, rendered, 'utf8');
    await rename(markdownStagingPath, input.canonicalVerificationPath);
  }

  const recordPath = join(input.runDir, VERIFICATION_SELECTION_FILE);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  try {
    await writeFile(recordPath, serialized, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    const existing = await readExistingRecord(recordPath);
    if (existing !== serialized) {
      throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Immutable verification selection record already exists with different bytes', { recordPath, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { logicalRef: logicalRefForRunRecord(input.runDir), versionFingerprint: sha256(serialized) };
}

/**
 * Pending recovery validates immutable evidence+selection against current canonical Markdown.
 * This is intentionally NOT used for historical terminal replay.
 */
export async function validatePendingVerificationSelection(input: {
  readonly runDir: string;
  readonly canonicalVerificationPath: string;
  readonly producingRunId: string;
  readonly producingSemanticInputFingerprint: string;
  readonly logicalDescriptorDigest: string;
}): Promise<VerificationSelectionBinding | undefined> {
  const loaded = await readVerificationSelectionRecord(input.runDir, false);
  if (loaded === undefined) return undefined;
  const { record, fingerprint } = loaded;
  if (record.rendererVersion !== 2) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Historical verification selection publication cannot resume as evidence-aware pending publication', { runDir: input.runDir });
  }
  if (record.producingRunId !== input.producingRunId || record.producingSemanticInputFingerprint !== input.producingSemanticInputFingerprint || record.logicalDescriptorDigest !== input.logicalDescriptorDigest) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record does not bind pending Run/package/logical descriptor', { runDir: input.runDir });
  }
  const evidence = await readVerificationEvidenceRecord(input.runDir, true);
  if (evidence === undefined) throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing verification selection record has no immutable Verification evidence', { runDir: input.runDir });
  validateVerificationEvidenceForSelection(evidence.record, record.selection, record.producingRunId);
  if (record.verificationStatus !== evidence.record.overallStatus) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing verification selection status differs from immutable Verification evidence', { runDir: input.runDir });
  }
  let markdown: string;
  try { markdown = await readFile(input.canonicalVerificationPath, 'utf8'); }
  catch (error) { throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record has no canonical Markdown counterpart', { detail: error instanceof Error ? error.message : String(error) }); }
  if (record.verificationMarkdownFingerprint !== sha256(markdown) || renderVerificationMarkdown(record, evidence.record) !== markdown) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record does not exact-bind current canonical Markdown and evidence', { runDir: input.runDir });
  }
  return { logicalRef: logicalRefForRunRecord(input.runDir), versionFingerprint: fingerprint };
}

/** Historical terminal replay: validate only persisted result ↔ immutable evidence/selection identity. */
export async function validateTerminalVerificationSelectionBinding(input: {
  readonly runDir: string;
  readonly binding: VerificationSelectionBinding;
  readonly producingRunId: string;
  readonly producingSemanticInputFingerprint: string;
  readonly logicalDescriptorDigest: string;
}): Promise<VerificationSelectionPublication> {
  const loaded = await readVerificationSelectionRecord(input.runDir, true);
  if (loaded === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'terminal Apply result is missing its immutable verification-selection record', { runDir: input.runDir });
  const { record, fingerprint } = loaded;
  const expectedLogicalRef = logicalRefForRunRecord(input.runDir);
  if (input.binding.logicalRef !== expectedLogicalRef || input.binding.versionFingerprint !== fingerprint || record.producingRunId !== input.producingRunId || record.producingSemanticInputFingerprint !== input.producingSemanticInputFingerprint || record.logicalDescriptorDigest !== input.logicalDescriptorDigest) {
    throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'terminal Apply result does not exact-bind its immutable verification-selection record', { runDir: input.runDir });
  }
  if (record.rendererVersion === 1) {
    // Historical pre-RA-010 v5 publication: its immutable selection record and
    // terminal binding remain readable, but it does not satisfy the new
    // evidence-aware publication contract. Never synthesize evidence for it.
    return record;
  }
  const evidence = await readVerificationEvidenceRecord(input.runDir, true);
  if (evidence === undefined) throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'terminal Apply result is missing immutable Verification evidence', { runDir: input.runDir });
  try {
    validateVerificationEvidenceForSelection(evidence.record, record.selection, record.producingRunId);
    if (record.verificationStatus !== evidence.record.overallStatus || sha256(renderVerificationMarkdown(record, evidence.record)) !== record.verificationMarkdownFingerprint) {
      throw new Error('selection/evidence/Markdown fingerprint mismatch');
    }
  } catch (error) {
    throw new FlowkitError('TERMINAL_REPLAY_CONFLICT', 'terminal Apply immutable Verification evidence does not match selection record', { runDir: input.runDir, detail: error instanceof Error ? error.message : String(error) });
  }
  return record;
}

export async function readVerificationSelectionRecord(
  runDir: string,
  required: boolean,
): Promise<{ readonly record: VerificationSelectionPublication; readonly fingerprint: string } | undefined> {
  const recordPath = join(runDir, VERIFICATION_SELECTION_FILE);
  let raw: string;
  try { raw = await readFile(recordPath, 'utf8'); }
  catch (error) {
    if (!required) return undefined;
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Immutable verification selection record is missing', { recordPath, detail: error instanceof Error ? error.message : String(error) });
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch (error) { throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record is malformed JSON', { recordPath, detail: error instanceof Error ? error.message : String(error) }); }
  let record: VerificationSelectionPublication;
  try { record = validateVerificationSelectionRecord(parsed); }
  catch (error) { throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record violates the closed schema', { recordPath, detail: error instanceof Error ? error.message : String(error) }); }
  return { record, fingerprint: sha256(raw) };
}

export function validateVerificationSelectionRecord(value: unknown): VerificationSelectionPublication {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('verification-selection record must be an object');
  const obj = value as Record<string, unknown>;
  const expected = ['actualChangeSet', 'canonicalBase', 'entryWorkspaceIdentity', 'logicalDescriptorDigest', 'postActionWorkspaceFingerprint', 'producingRunId', 'producingSemanticInputFingerprint', 'rendererVersion', 'schemaVersion', 'selection', 'verificationMarkdownFingerprint', 'verificationMarkdownLogicalRef', 'verificationStatus'];
  const keys = Object.keys(obj).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || obj['schemaVersion'] !== 1 || (obj['rendererVersion'] !== 1 && obj['rendererVersion'] !== 2)) fail('verification-selection record must use the closed schemaVersion 1 shape');
  const producingRunId = nonEmpty(obj['producingRunId'], 'producingRunId');
  const producingSemanticInputFingerprint = requireSha(obj['producingSemanticInputFingerprint'], 'producingSemanticInputFingerprint');
  const logicalDescriptorDigest = requireSha(obj['logicalDescriptorDigest'], 'logicalDescriptorDigest');
  const canonicalBase = requireGitSha(obj['canonicalBase'], 'canonicalBase');
  const entryWorkspaceIdentity = validateEntryWorkspaceSnapshot(obj['entryWorkspaceIdentity']);
  if (entryWorkspaceIdentity.canonicalBase !== canonicalBase) fail('entryWorkspaceIdentity canonicalBase must equal record canonicalBase');
  const postActionWorkspaceFingerprint = requireSha(obj['postActionWorkspaceFingerprint'], 'postActionWorkspaceFingerprint');
  const actualChangeSet = validateActualChangeSetEntries(obj['actualChangeSet']);
  const selection = validateVerificationSelection(obj['selection']);
  const verificationStatus = validateStatus(obj['verificationStatus']);
  if (selection.capabilityRelation.kind === 'not-applicable' && verificationStatus !== 'not-applicable') fail('not-applicable selection requires verificationStatus not-applicable');
  if (selection.capabilityRelation.kind === 'matched' && verificationStatus === 'not-applicable') fail('matched selection cannot claim verificationStatus not-applicable');
  const verificationMarkdownLogicalRef = normalizedLogicalRef(obj['verificationMarkdownLogicalRef'], 'verificationMarkdownLogicalRef');
  const verificationMarkdownFingerprint = requireSha(obj['verificationMarkdownFingerprint'], 'verificationMarkdownFingerprint');
  return {
    schemaVersion: 1,
    producingRunId,
    producingSemanticInputFingerprint,
    logicalDescriptorDigest,
    canonicalBase,
    entryWorkspaceIdentity,
    postActionWorkspaceFingerprint,
    actualChangeSet,
    selection,
    verificationStatus,
    rendererVersion: obj['rendererVersion'] as 1 | 2,
    verificationMarkdownLogicalRef,
    verificationMarkdownFingerprint,
  };
}

export function renderVerificationMarkdown(
  record: Omit<VerificationSelectionPublication, 'verificationMarkdownFingerprint'> | VerificationSelectionPublication,
  evidence: VerificationEvidenceRecord,
): string {
  validateVerificationEvidenceForSelection(evidence, record.selection, record.producingRunId);
  const checkLines = evidence.checks.length === 0
    ? [`- not-applicable proof: \`${evidence.notApplicableProof?.predicateId ?? 'missing'}\``]
    : evidence.checks.flatMap((check, index) => [
        `### Check ${index + 1}`,
        '',
        `- scope: \`${check.scope}\``,
        `- applicability: \`${check.applicability}\``,
        `- command/method: \`${check.commandOrMethod}\``,
        `- status: \`${check.status}\``,
        `- summary: ${check.summary}`,
        `- result ref: \`${check.resultRef}\``,
        `- environment: \`${check.environment}\``,
        '',
      ]);
  return [
    '# Change Verification',
    '',
    '> Bootstrap verification: this E1 publication validates the v5 selection model; historical v4 Runs are not v5 dogfood.',
    `<!-- flowkit-change-verification-status: ${record.verificationStatus} -->`,
    '',
    `- Producing Run: \`${record.producingRunId}\``,
    `- canonicalBase: \`${record.canonicalBase}\``,
    `- postActionWorkspaceFingerprint: \`${record.postActionWorkspaceFingerprint}\``,
    `- moduleMap: \`${record.selection.moduleMapLogicalRef}\``,
    `- moduleMapFingerprint: \`${record.selection.moduleMapFingerprint}\``,
    `- selectionFingerprint: \`${record.selection.selectionFingerprint}\``,
    `- capabilityRelation: \`${record.selection.capabilityRelation.kind}\``,
    `- Verification environment: \`${evidence.environment}\``,
    `- Delivery Full Test status: \`${evidence.fullTestStatus}\``,
    '',
    '## Selected modules',
    '',
    ...(record.selection.moduleIds.length === 0 ? ['- none'] : record.selection.moduleIds.map((moduleId) => `- \`${moduleId}\``)),
    '',
    '## Selected capabilities',
    '',
    ...(record.selection.capabilityIds.length === 0 ? ['- none'] : record.selection.capabilityIds.map((capabilityId) => `- \`${capabilityId}\``)),
    '',
    '## Selected verification scopes',
    '',
    ...(record.selection.verificationScopes.length === 0 ? ['- none'] : record.selection.verificationScopes.map((scope) => `- \`${scope}\``)),
    '',
    '## Verification checks',
    '',
    ...checkLines,
    '## Actual ChangeSet',
    '',
    ...(record.actualChangeSet.length === 0 ? ['- none'] : record.actualChangeSet.map((entry) => `- \`${entry.kind}\` \`${entry.path}\``)),
    '',
  ].join('\n');
}

export function extractVerificationStatus(markdown: string): VerificationStatus {
  const matches = [...markdown.matchAll(/<!--\s*flowkit-change-verification-status:\s*([^\s>]+)\s*-->/g)];
  if (matches.length !== 1) throw new FlowkitError('VERIFICATION_STATUS_INVALID', 'verification.md must contain exactly one Flowkit verification status marker');
  return validateStatus(matches[0]![1]);
}

function logicalRefForRunRecord(runDir: string): string {
  const normalized = runDir.replaceAll('\\', '/');
  const marker = '/.flowkit/runs/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'Run directory is not under .flowkit/runs', { runDir });
  return `${normalized.slice(index + 1)}/${VERIFICATION_SELECTION_FILE}`;
}

async function readExistingRecord(path: string): Promise<string> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Cannot read existing immutable verification selection record', { path, detail: error instanceof Error ? error.message : String(error) }); }
}

function normalizedLogicalRef(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} must be a normalized repository-relative logical path`);
  return value;
}
function nonEmpty(value: unknown, label: string): string { if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`); return value; }
function requireSha(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be SHA-256`); return value; }
function requireGitSha(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[0-9a-f]{40,64}$/.test(value)) fail(`${label} must be a Git object id`); return value; }
function validateStatus(value: unknown): VerificationStatus { if (value !== 'not-run' && value !== 'passed' && value !== 'failed' && value !== 'not-applicable') fail('verificationStatus must be not-run|passed|failed|not-applicable'); return value; }
function fail(message: string): never { throw new FlowkitError('SCHEMA_VALIDATION_FAILED', message); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
