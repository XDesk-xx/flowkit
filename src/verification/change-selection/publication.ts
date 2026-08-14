import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ActualChangeSetEntry } from './contracts.js';
import type { EntryWorkspaceSnapshot } from './entry-snapshot.js';
import type { VerificationSelection } from './selection.js';
import { FlowkitError } from '../../shared/errors.js';

export interface VerificationSelectionPublication {
  readonly schemaVersion: 1;
  readonly producingRunId: string;
  readonly producingSemanticInputFingerprint: string;
  readonly canonicalBase: string;
  readonly entryWorkspaceIdentity: {
    readonly schemaVersion: 1;
    readonly canonicalBase: string;
    readonly workspaceFingerprint: string;
  };
  readonly postActionWorkspaceFingerprint: string;
  readonly actualChangeSet: readonly ActualChangeSetEntry[];
  readonly selection: VerificationSelection;
  readonly rendererVersion: 1;
  readonly verificationMarkdownLogicalRef: string;
  readonly verificationMarkdownFingerprint: string;
}

export interface PublishVerificationSelectionInput {
  readonly runDir: string;
  readonly canonicalVerificationPath: string;
  readonly record: VerificationSelectionPublication;
}

export const VERIFICATION_SELECTION_FILE = 'verification-selection.json';

export function buildVerificationSelectionPublication(input: Omit<VerificationSelectionPublication, 'schemaVersion' | 'rendererVersion' | 'verificationMarkdownFingerprint'>): VerificationSelectionPublication {
  const draft = { ...input, schemaVersion: 1 as const, rendererVersion: 1 as const };
  return {
    ...draft,
    verificationMarkdownFingerprint: sha256(renderVerificationMarkdown(draft)),
  };
}

/** Publish the mutable Markdown first, then commit the immutable per-Run record. */
export async function publishVerificationSelection(input: PublishVerificationSelectionInput): Promise<void> {
  const rendered = renderVerificationMarkdown(input.record);
  if (sha256(rendered) !== input.record.verificationMarkdownFingerprint) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_INVALID', 'Verification selection record does not bind rendered Markdown bytes');
  }
  await mkdir(dirname(input.canonicalVerificationPath), { recursive: true });
  const markdownStagingPath = `${input.canonicalVerificationPath}.${process.pid}.flowkit-staging`;
  await writeFile(markdownStagingPath, rendered, 'utf8');
  await rename(markdownStagingPath, input.canonicalVerificationPath);

  const recordPath = join(input.runDir, VERIFICATION_SELECTION_FILE);
  const serialized = `${JSON.stringify(input.record, null, 2)}\n`;
  try {
    await writeFile(recordPath, serialized, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    const existing = await readExistingRecord(recordPath);
    if (existing !== serialized) {
      throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Immutable verification selection record already exists with different bytes', {
        recordPath,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Validate the completed Core publication during exact terminal replay. */
export async function validatePublishedVerificationSelection(input: {
  readonly runDir: string;
  readonly canonicalVerificationPath: string;
  readonly producingRunId: string;
}): Promise<boolean> {
  const recordPath = join(input.runDir, VERIFICATION_SELECTION_FILE);
  let raw: string;
  try {
    raw = await readFile(recordPath, 'utf8');
  } catch {
    return false;
  }
  let record: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('record must be an object');
    record = parsed as Record<string, unknown>;
  } catch (error) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record is malformed', {
      recordPath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  let markdown: string;
  try {
    markdown = await readFile(input.canonicalVerificationPath, 'utf8');
  } catch (error) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record has no canonical Markdown counterpart', {
      recordPath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  if (record['producingRunId'] !== input.producingRunId || record['verificationMarkdownFingerprint'] !== sha256(markdown)) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Existing immutable verification selection record does not exact-bind canonical Markdown', { recordPath });
  }
  return true;
}

export function renderVerificationMarkdown(record: Omit<VerificationSelectionPublication, 'verificationMarkdownFingerprint'> | VerificationSelectionPublication): string {
  return [
    '# Change Verification',
    '',
    '> Bootstrap verification: this E1 publication validates the new v5 selection model; historical v4 Runs are not v5 dogfood.',
    '<!-- flowkit-change-verification-status: not-run -->',
    '',
    `- Producing Run: \`${record.producingRunId}\``,
    `- canonicalBase: \`${record.canonicalBase}\``,
    `- postActionWorkspaceFingerprint: \`${record.postActionWorkspaceFingerprint}\``,
    `- selectionFingerprint: \`${record.selection.selectionFingerprint}\``,
    '',
    '## Selected modules',
    '',
    ...record.selection.moduleIds.map((moduleId) => `- \`${moduleId}\``),
    '',
    '## Selected verification scopes',
    '',
    ...record.selection.verificationScopes.map((scope) => `- \`${scope}\``),
    '',
    '## Actual ChangeSet',
    '',
    ...record.actualChangeSet.map((entry) => `- \`${entry.kind}\` \`${entry.path}\``),
    '',
  ].join('\n');
}

async function readExistingRecord(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new FlowkitError('VERIFICATION_PUBLICATION_CONFLICT', 'Cannot read existing immutable verification selection record', {
      path,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
