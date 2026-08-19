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
import { validateCurrentVerificationSelection, validateVerificationSelection, type VerificationSelection } from './selection.js';

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


export interface CurrentVerificationPublication {
  readonly producingRunId: string;
  readonly canonicalBase: string;
  readonly postActionWorkspaceFingerprint: string;
  readonly selection: VerificationSelection;
  readonly verificationStatus: VerificationStatus;
  readonly actualChangeSet: readonly ActualChangeSetEntry[];
}

export interface ReverificationLineage {
  readonly reverificationOfRunId: string;
  readonly originApplyVerificationFingerprint: string;
  readonly previousVerificationRef: string;
  readonly previousVerificationFingerprint: string;
}

interface VerificationMarkdownModel {
  readonly producingRunId: string;
  readonly canonicalBase: string;
  readonly postActionWorkspaceFingerprint: string;
  readonly selection: VerificationSelection;
  readonly verificationStatus: VerificationStatus;
  readonly actualChangeSet: readonly ActualChangeSetEntry[];
  readonly reverification?: ReverificationLineage;
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
  validateCurrentVerificationSelection(input.selection);
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

/** Post-E2 three-file publication: verification.md is the authority; no Run sidecar is written. */
export async function publishCurrentVerificationMarkdown(input: {
  readonly canonicalVerificationPath: string;
  readonly model: CurrentVerificationPublication;
  readonly evidence: VerificationEvidenceRecord;
}): Promise<{ readonly logicalRef: string; readonly versionFingerprint: string; readonly selectionFingerprint: string; readonly status: 'passed' | 'failed' | 'not-applicable' }> {
  const selection = validateCurrentVerificationSelection(input.model.selection);
  validateVerificationEvidenceForSelection(input.evidence, selection, input.model.producingRunId);
  if (input.model.verificationStatus !== input.evidence.overallStatus) throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'current verification status does not match execution evidence');
  const rendered = renderVerificationMarkdown(input.model, input.evidence);
  await mkdir(dirname(input.canonicalVerificationPath), { recursive: true });
  const staging = `${input.canonicalVerificationPath}.${process.pid}.flowkit-staging`;
  await writeFile(staging, rendered, 'utf8');
  await rename(staging, input.canonicalVerificationPath);
  return {
    logicalRef: normalizeCurrentVerificationLogicalRef(input.canonicalVerificationPath),
    versionFingerprint: sha256(rendered),
    selectionFingerprint: selection.selectionFingerprint,
    status: input.evidence.overallStatus,
  };
}

export async function preserveCurrentVerificationPublication(input: {
  readonly canonicalVerificationPath: string;
  readonly expectedCurrentBytes?: string;
}): Promise<{ readonly logicalRef: string; readonly fingerprint: string; readonly bytes: string }> {
  let bytes: string;
  try { bytes = await readFile(input.canonicalVerificationPath, 'utf8'); }
  catch (error) { throw new FlowkitError('VERIFICATION_RETRY_HISTORY_CONFLICT', 'current Verification publication is unavailable', { detail: error instanceof Error ? error.message : String(error) }); }
  if (input.expectedCurrentBytes !== undefined && input.expectedCurrentBytes !== bytes) {
    throw new FlowkitError('VERIFICATION_RETRY_HISTORY_CONFLICT', 'current Verification publication changed before immutable history preservation');
  }
  const fingerprint = sha256(bytes);
  const authorityLogicalRef = normalizeCurrentVerificationLogicalRef(input.canonicalVerificationPath);
  const authorityDir = authorityLogicalRef.slice(0, authorityLogicalRef.lastIndexOf('/'));
  const historyDir = join(dirname(input.canonicalVerificationPath), 'verification-history');
  await mkdir(historyDir, { recursive: true });
  const historyPath = join(historyDir, `${fingerprint}.md`);
  try {
    await writeFile(historyPath, bytes, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    let existing: string;
    try { existing = await readFile(historyPath, 'utf8'); }
    catch { throw new FlowkitError('VERIFICATION_RETRY_HISTORY_CONFLICT', 'cannot read existing immutable Verification history publication', { historyPath, detail: error instanceof Error ? error.message : String(error) }); }
    if (existing !== bytes) {
      throw new FlowkitError('VERIFICATION_RETRY_HISTORY_CONFLICT', 'fingerprint-addressed Verification history bytes differ from the publication they claim to preserve', { historyPath, fingerprint });
    }
  }
  return { logicalRef: `${authorityDir}/verification-history/${fingerprint}.md`, fingerprint, bytes };
}

export async function publishReverificationMarkdown(input: {
  readonly canonicalVerificationPath: string;
  readonly model: CurrentVerificationPublication;
  readonly evidence: VerificationEvidenceRecord;
  readonly lineage: ReverificationLineage;
}): Promise<{ readonly logicalRef: string; readonly versionFingerprint: string; readonly selectionFingerprint: string; readonly status: 'passed' | 'failed' | 'not-applicable' }> {
  const selection = validateCurrentVerificationSelection(input.model.selection);
  validateVerificationEvidenceForSelection(input.evidence, selection, input.model.producingRunId);
  if (input.model.verificationStatus !== input.evidence.overallStatus) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 're-verification status does not match execution evidence');
  }
  validateReverificationLineageShape(input.lineage);
  if (input.lineage.reverificationOfRunId !== input.model.producingRunId) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 're-verification lineage origin Run differs from producing Apply');
  }
  const rendered = renderVerificationMarkdown({ ...input.model, reverification: input.lineage }, input.evidence);
  await mkdir(dirname(input.canonicalVerificationPath), { recursive: true });
  const staging = `${input.canonicalVerificationPath}.${process.pid}.flowkit-staging`;
  await writeFile(staging, rendered, 'utf8');
  await rename(staging, input.canonicalVerificationPath);
  return {
    logicalRef: normalizeCurrentVerificationLogicalRef(input.canonicalVerificationPath),
    versionFingerprint: sha256(rendered),
    selectionFingerprint: selection.selectionFingerprint,
    status: input.evidence.overallStatus,
  };
}

export interface ParsedCurrentVerificationPublication {
  readonly producingRunId: string;
  readonly canonicalBase: string;
  readonly postActionWorkspaceFingerprint: string;
  readonly selectionFingerprint: string;
  readonly status: VerificationStatus;
  readonly reverification?: ReverificationLineage;
}

export function parseCurrentVerificationPublication(markdown: string): ParsedCurrentVerificationPublication {
  const producingRunId = matchOne(markdown, /^- Producing Run: `([^`]+)`$/m, 'Producing Run');
  const canonicalBase = matchOne(markdown, /^- canonicalBase: `([0-9a-f]{40,64})`$/m, 'canonicalBase');
  const postActionWorkspaceFingerprint = matchOne(markdown, /^- postActionWorkspaceFingerprint: `([0-9a-f]{64})`$/m, 'postActionWorkspaceFingerprint');
  const selectionFingerprint = matchOne(markdown, /^- selectionFingerprint: `([0-9a-f]{64})`$/m, 'selectionFingerprint');
  const status = extractVerificationStatus(markdown);
  const retryRun = /^- reverificationOfRunId: `([^`]+)`$/m.exec(markdown)?.[1];
  const origin = /^- originApplyVerificationFingerprint: `([0-9a-f]{64})`$/m.exec(markdown)?.[1];
  const previousRef = /^- previousVerificationRef: `([^`]+)`$/m.exec(markdown)?.[1];
  const previousFingerprint = /^- previousVerificationFingerprint: `([0-9a-f]{64})`$/m.exec(markdown)?.[1];
  const parts = [retryRun, origin, previousRef, previousFingerprint];
  if (parts.some((part) => part !== undefined) && parts.some((part) => part === undefined)) {
    throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification publication carries incomplete lineage metadata');
  }
  const reverification = retryRun === undefined ? undefined : validateReverificationLineageShape({
    reverificationOfRunId: retryRun,
    originApplyVerificationFingerprint: origin!,
    previousVerificationRef: previousRef!,
    previousVerificationFingerprint: previousFingerprint!,
  });
  return { producingRunId, canonicalBase, postActionWorkspaceFingerprint, selectionFingerprint, status, ...(reverification !== undefined && { reverification }) };
}

export async function validateCurrentReverificationChain(input: {
  readonly canonicalVerificationPath: string;
  readonly logicalVerificationRef?: string;
  readonly currentMarkdown: string;
  readonly originRunId: string;
  readonly originBinding: { readonly versionFingerprint: string; readonly selectionFingerprint: string; readonly status: VerificationStatus };
}): Promise<ParsedCurrentVerificationPublication> {
  const current = parseCurrentVerificationPublication(input.currentMarkdown);
  if (current.reverification === undefined) {
    throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 'current publication does not carry explicit re-verification lineage');
  }
  if (current.producingRunId !== input.originRunId || current.reverification.reverificationOfRunId !== input.originRunId ||
      current.reverification.originApplyVerificationFingerprint !== input.originBinding.versionFingerprint ||
      current.selectionFingerprint !== input.originBinding.selectionFingerprint) {
    throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 'current re-verification publication does not bind the producing Apply terminal identity');
  }
  const authorityLogicalRef = input.logicalVerificationRef ?? normalizeCurrentVerificationLogicalRef(input.canonicalVerificationPath);
  const authorityDir = authorityLogicalRef.slice(0, authorityLogicalRef.lastIndexOf('/'));
  const historyPrefix = `${authorityDir}/verification-history/`;
  const historyDir = join(dirname(input.canonicalVerificationPath), 'verification-history');
  const seen = new Set<string>();
  let node = current;
  for (let depth = 0; depth < 32; depth += 1) {
    const lineage = node.reverification;
    if (lineage === undefined) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification chain terminated before the original Apply publication');
    }
    if (lineage.reverificationOfRunId !== input.originRunId || lineage.originApplyVerificationFingerprint !== input.originBinding.versionFingerprint ||
        node.producingRunId !== input.originRunId || node.postActionWorkspaceFingerprint !== current.postActionWorkspaceFingerprint ||
        node.selectionFingerprint !== input.originBinding.selectionFingerprint) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification chain changed origin Apply, candidate, or selection identity');
    }
    const fingerprint = lineage.previousVerificationFingerprint;
    if (seen.has(fingerprint)) throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification history chain contains a cycle', { fingerprint });
    seen.add(fingerprint);
    const expectedRef = `${historyPrefix}${fingerprint}.md`;
    if (lineage.previousVerificationRef !== expectedRef) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification predecessor ref is outside the validated Verification history namespace', { expectedRef, actual: lineage.previousVerificationRef });
    }
    let previousBytes: string;
    try { previousBytes = await readFile(join(historyDir, `${fingerprint}.md`), 'utf8'); }
    catch (error) { throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification predecessor history publication is missing', { fingerprint, detail: error instanceof Error ? error.message : String(error) }); }
    if (sha256(previousBytes) !== fingerprint) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification predecessor history publication fingerprint mismatch', { fingerprint });
    }
    const previous = parseCurrentVerificationPublication(previousBytes);
    if (previous.producingRunId !== input.originRunId || previous.postActionWorkspaceFingerprint !== current.postActionWorkspaceFingerprint || previous.selectionFingerprint !== input.originBinding.selectionFingerprint) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification predecessor changed origin Apply, candidate, or selection identity');
    }
    if (fingerprint === input.originBinding.versionFingerprint) {
      if (previous.reverification !== undefined || previous.status !== input.originBinding.status) {
        throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 'origin Verification history publication does not exact-match the producing Apply terminal binding');
      }
      return current;
    }
    if (previous.reverification === undefined) {
      throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification chain cannot terminate at a non-origin publication');
    }
    node = previous;
  }
  throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification history chain exceeds the bounded depth');
}

function validateReverificationLineageShape(value: ReverificationLineage): ReverificationLineage {
  if (value.reverificationOfRunId.trim() === '' || !/^[0-9a-f]{64}$/.test(value.originApplyVerificationFingerprint) ||
      !/^[0-9a-f]{64}$/.test(value.previousVerificationFingerprint) || value.previousVerificationRef.trim() === '' ||
      value.previousVerificationRef.startsWith('/') || value.previousVerificationRef.includes('\\')) {
    throw new FlowkitError('VERIFICATION_RETRY_CHAIN_CONFLICT', 're-verification lineage metadata is invalid');
  }
  return value;
}

function matchOne(markdown: string, pattern: RegExp, label: string): string {
  const matches = [...markdown.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', `verification.md must contain exactly one ${label}`);
  return matches[0][1];
}

function normalizeCurrentVerificationLogicalRef(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const marker = '/openspec/changes/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'current verification path must be inside openspec/changes', { path });
  return normalized.slice(index + 1);
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
  validateCurrentVerificationSelection(record.selection);
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
    // Historical terminal replay validates persisted immutable facts only. The
    // point-in-time Markdown fingerprint was checked before terminal CAS; future
    // renderer/Catalog bytes are deliberately not replay authorities.
    validateVerificationEvidenceForSelection(evidence.record, record.selection, record.producingRunId);
    if (record.verificationStatus !== evidence.record.overallStatus) {
      throw new Error('selection/evidence status mismatch');
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
  record: VerificationMarkdownModel,
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
    '> Flowkit Change Verification publication. Selection identity is logical and point-in-time; concrete commands belong to the verification executor.',
    `<!-- flowkit-change-verification-status: ${record.verificationStatus} -->`,
    '',
    `- Producing Run: \`${record.producingRunId}\``,
    `- canonicalBase: \`${record.canonicalBase}\``,
    `- postActionWorkspaceFingerprint: \`${record.postActionWorkspaceFingerprint}\``,
    `- verificationCatalog: \`${record.selection.moduleMapLogicalRef}\``,
    `- verificationCatalogFingerprint: \`${record.selection.moduleMapFingerprint}\``,
    `- selectionFingerprint: \`${record.selection.selectionFingerprint}\``,
    ...(record.reverification === undefined ? [] : [
      `- reverificationOfRunId: \`${record.reverification.reverificationOfRunId}\``,
      `- originApplyVerificationFingerprint: \`${record.reverification.originApplyVerificationFingerprint}\``,
      `- previousVerificationRef: \`${record.reverification.previousVerificationRef}\``,
      `- previousVerificationFingerprint: \`${record.reverification.previousVerificationFingerprint}\``,
    ]),
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
    '## Selected logical checks',
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
