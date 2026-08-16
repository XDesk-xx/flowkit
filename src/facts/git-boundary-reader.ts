/**
 * C1/F1 Git boundary reader.
 *
 * Git owns repository topology and commit bytes. This reader projects Delivery
 * ownership and parses formal boundary identity, but it deliberately does not
 * validate Owner authority. Cross-authority checkpoint admission is completed
 * by FormalFactReader against the point-in-time Delivery Manifest.
 */

import { runCommand } from '../shared/external-command.js';
import type { GitBoundaryFact } from './formal-fact-snapshot.js';

interface GitCommitRecord {
  readonly sha: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly deliveryStartId?: string;
}

export interface GitCheckpointBoundaryCandidate {
  readonly commitSha: string;
  readonly summary: string;
  readonly owningDeliveryId: string;
  readonly subjectChangeId?: string;
  readonly deliveryTrailer?: string;
  readonly changeTrailer?: string;
  readonly boundaryTrailer?: string;
  readonly ownerAuthorizationTrailer?: string;
  /** True only when every current formal checkpoint identity field is exact. */
  readonly formalIdentityValid: boolean;
  /** Historical compatibility input; never sufficient for current admission. */
  readonly legacyCheckpointSubject: boolean;
}

export interface GitBoundaryReadProjection {
  readonly boundaries: readonly GitBoundaryFact[];
  readonly checkpointCandidates: readonly GitCheckpointBoundaryCandidate[];
}

/**
 * Read Git topology plus checkpoint candidates for one Delivery.
 *
 * A checkpoint candidate is not yet a formal checkpoint fact: Owner temporal
 * authority is intentionally outside this Git-only reader.
 */
export async function readGitBoundaryProjection(
  repoRoot: string,
  deliveryId: string,
): Promise<GitBoundaryReadProjection> {
  const result = await runCommand(
    'git',
    ['log', '--all', '--format=%H%x1f%P%x1f%s%x1f%B%x1e'],
    { cwd: repoRoot },
  );

  if (result.exitCode !== 0) {
    return { boundaries: [], checkpointCandidates: [] };
  }

  const records = parseCommitRecords(result.stdout);
  const starts = records.filter((record) => record.deliveryStartId !== undefined);
  if (!starts.some((record) => record.deliveryStartId === deliveryId)) {
    return { boundaries: [], checkpointCandidates: [] };
  }

  const bySha = new Map(records.map((record) => [record.sha, record] as const));
  const boundaries: GitBoundaryFact[] = [];
  const checkpointCandidates: GitCheckpointBoundaryCandidate[] = [];

  for (const record of records) {
    if (record.deliveryStartId === deliveryId) {
      boundaries.push({
        kind: 'delivery-start',
        commitSha: record.sha,
        summary: record.subject,
      });
      continue;
    }

    const owner = owningDeliveryId(record.sha, starts, bySha);
    if (owner !== deliveryId) continue;

    if (
      (record.subject.includes('delivery-final') || record.subject.includes('finalize')) &&
      record.subject.includes(deliveryId)
    ) {
      boundaries.push({
        kind: 'delivery-final',
        commitSha: record.sha,
        summary: record.subject,
      });
      continue;
    }

    const checkpointMatch = /^chore\(flowkit\):\s*checkpoint\s+(\S+)$/i.exec(record.subject);
    const legacyCheckpointSubject = checkpointMatch !== null || /checkpoint/i.test(record.subject);
    if (!legacyCheckpointSubject) continue;

    const subjectChangeId = checkpointMatch?.[1];
    const deliveryValues = trailerValues(record.body, 'Flowkit-Delivery');
    const changeValues = trailerValues(record.body, 'Flowkit-Change');
    const boundaryValues = trailerValues(record.body, 'Flowkit-Boundary');
    const ownerValues = trailerValues(record.body, 'Owner-Authorization');
    const deliveryTrailer = singleValue(deliveryValues);
    const changeTrailer = singleValue(changeValues);
    const boundaryTrailer = singleValue(boundaryValues);
    const ownerAuthorizationTrailer = singleValue(ownerValues);

    const formalIdentityValid =
      subjectChangeId !== undefined &&
      deliveryValues.length === 1 && deliveryTrailer === deliveryId &&
      changeValues.length === 1 && changeTrailer === subjectChangeId &&
      boundaryValues.length === 1 && boundaryTrailer === 'change-checkpoint' &&
      ownerValues.length === 1 && ownerAuthorizationTrailer !== undefined &&
      /^owner:[0-9a-f]{64}$/.test(ownerAuthorizationTrailer);

    checkpointCandidates.push({
      commitSha: record.sha,
      summary: record.subject,
      owningDeliveryId: owner,
      ...(subjectChangeId !== undefined ? { subjectChangeId } : {}),
      ...(deliveryTrailer !== undefined ? { deliveryTrailer } : {}),
      ...(changeTrailer !== undefined ? { changeTrailer } : {}),
      ...(boundaryTrailer !== undefined ? { boundaryTrailer } : {}),
      ...(ownerAuthorizationTrailer !== undefined ? { ownerAuthorizationTrailer } : {}),
      formalIdentityValid,
      legacyCheckpointSubject,
    });
  }

  return { boundaries, checkpointCandidates };
}

/**
 * Git-only formal identity summary. Owner temporal admission is intentionally
 * not represented here; lifecycle Policy consumes FormalFactReader output.
 */
export async function readGitBoundarySummaries(
  repoRoot: string,
  deliveryId: string,
): Promise<GitBoundaryFact[]> {
  const projection = await readGitBoundaryProjection(repoRoot, deliveryId);
  const checkpoints = projection.checkpointCandidates
    .filter((candidate) => candidate.subjectChangeId !== undefined && candidate.formalIdentityValid)
    .map((candidate): GitBoundaryFact => ({
      kind: 'change-checkpoint',
      commitSha: candidate.commitSha,
      summary: candidate.summary,
      changeId: candidate.subjectChangeId!,
    }));
  return [...projection.boundaries, ...checkpoints];
}

function parseCommitRecords(stdout: string): GitCommitRecord[] {
  const records: GitCommitRecord[] = [];
  for (const rawRecord of stdout.split('\x1e')) {
    const record = rawRecord.replace(/^\n+/, '').replace(/\n+$/, '');
    if (record.length === 0) continue;
    const fields = record.split('\x1f');
    if (fields.length < 4) continue;
    const sha = fields[0] ?? '';
    const parentsText = fields[1] ?? '';
    const subject = fields[2] ?? '';
    const body = fields.slice(3).join('\x1f');
    if (sha === '' || subject === '') continue;
    const startMatch = /^chore\(flowkit\):\s*start\s+(\S+)/i.exec(subject);
    records.push({
      sha,
      parents: parentsText.length === 0 ? [] : parentsText.split(' '),
      subject,
      body,
      ...(startMatch?.[1] !== undefined ? { deliveryStartId: startMatch[1] } : {}),
    });
  }
  return records;
}

function trailerValues(body: string, name: string): string[] {
  const prefix = `${name.toLowerCase()}:`;
  const values: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    values.push(trimmed.slice(trimmed.indexOf(':') + 1).trim());
  }
  return values;
}

function singleValue(values: readonly string[]): string | undefined {
  return values.length === 1 && values[0] !== '' ? values[0] : undefined;
}

/** Return the nearest unambiguous Delivery Start owner for a commit. */
function owningDeliveryId(
  commitSha: string,
  starts: readonly GitCommitRecord[],
  bySha: ReadonlyMap<string, GitCommitRecord>,
): string | null {
  const ancestors = starts.filter((start) => isAncestor(start.sha, commitSha, bySha));
  if (ancestors.length === 0) return null;

  const maximal = ancestors.filter(
    (candidate) => !ancestors.some(
      (other) => other.sha !== candidate.sha && isAncestor(candidate.sha, other.sha, bySha),
    ),
  );
  if (maximal.length !== 1) return null;
  return maximal[0]?.deliveryStartId ?? null;
}

function isAncestor(
  ancestorSha: string,
  commitSha: string,
  bySha: ReadonlyMap<string, GitCommitRecord>,
): boolean {
  if (ancestorSha === commitSha) return true;
  const seen = new Set<string>();
  const stack = [...(bySha.get(commitSha)?.parents ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    if (current === ancestorSha) return true;
    seen.add(current);
    stack.push(...(bySha.get(current)?.parents ?? []));
  }
  return false;
}
