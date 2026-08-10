/**
 * C1 formal-fact-reader-and-persistence: Git boundary summary read-only Reader.
 *
 * Git is the authority for Delivery Start, Change Checkpoint, and Delivery
 * Final boundaries. Flowkit only projects boundaries that belong to the
 * requested Delivery; it does not persist a second checkpoint state.
 */

import { runCommand } from '../shared/external-command.js';
import type { GitBoundaryFact } from './formal-fact-snapshot.js';

interface GitCommitRecord {
  readonly sha: string;
  readonly parents: readonly string[];
  readonly subject: string;
  readonly deliveryStartId?: string;
}

/**
 * Read Git formal-boundary commit summaries for one Delivery.
 *
 * Delivery ownership is derived from Git topology: a boundary belongs to the
 * nearest Delivery Start ancestor. This keeps legacy checkpoint subjects
 * (which do not carry deliveryId) readable without allowing a later/other
 * Delivery's same-named checkpoint to leak into the current Delivery.
 */
export async function readGitBoundarySummaries(
  repoRoot: string,
  deliveryId: string,
): Promise<GitBoundaryFact[]> {
  const result = await runCommand(
    'git',
    ['log', '--all', '--format=%H%x09%P%x09%s'],
    { cwd: repoRoot },
  );

  if (result.exitCode !== 0) {
    return [];
  }

  const records = parseCommitRecords(result.stdout);
  const starts = records.filter((record) => record.deliveryStartId !== undefined);
  if (!starts.some((record) => record.deliveryStartId === deliveryId)) {
    // Without this Delivery's Git start boundary, checkpoint ownership cannot
    // be established safely. Do not guess from checkpoint subjects alone.
    return [];
  }

  const bySha = new Map(records.map((record) => [record.sha, record] as const));
  const facts: GitBoundaryFact[] = [];

  for (const record of records) {
    if (record.deliveryStartId === deliveryId) {
      facts.push({
        kind: 'delivery-start',
        commitSha: record.sha,
        summary: record.subject,
      });
      continue;
    }

    if (owningDeliveryId(record.sha, starts, bySha) !== deliveryId) {
      continue;
    }

    const fact = classifyOwnedBoundary(record.sha, record.subject, deliveryId);
    if (fact !== null) {
      facts.push(fact);
    }
  }

  return facts;
}

function parseCommitRecords(stdout: string): GitCommitRecord[] {
  const records: GitCommitRecord[] = [];
  for (const line of stdout.split('\n')) {
    if (line.length === 0) {
      continue;
    }
    const firstTab = line.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : line.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) {
      continue;
    }
    const sha = line.slice(0, firstTab);
    const parentsText = line.slice(firstTab + 1, secondTab);
    const subject = line.slice(secondTab + 1);
    const startMatch = /^chore\(flowkit\):\s*start\s+(\S+)/i.exec(subject);
    records.push({
      sha,
      parents: parentsText.length === 0 ? [] : parentsText.split(' '),
      subject,
      ...(startMatch?.[1] !== undefined ? { deliveryStartId: startMatch[1] } : {}),
    });
  }
  return records;
}

/** Return the nearest unambiguous Delivery Start owner for a commit. */
function owningDeliveryId(
  commitSha: string,
  starts: readonly GitCommitRecord[],
  bySha: ReadonlyMap<string, GitCommitRecord>,
): string | null {
  const ancestors = starts.filter((start) => isAncestor(start.sha, commitSha, bySha));
  if (ancestors.length === 0) {
    return null;
  }

  // Keep only maximal starts: a start is not the owner when another start is a
  // descendant of it and also an ancestor of the candidate. Multiple maximal
  // starts mean a merge made ownership ambiguous; fail closed for that boundary.
  const maximal = ancestors.filter(
    (candidate) => !ancestors.some(
      (other) => other.sha !== candidate.sha && isAncestor(candidate.sha, other.sha, bySha),
    ),
  );
  if (maximal.length !== 1) {
    return null;
  }
  return maximal[0]?.deliveryStartId ?? null;
}

function isAncestor(
  ancestorSha: string,
  commitSha: string,
  bySha: ReadonlyMap<string, GitCommitRecord>,
): boolean {
  if (ancestorSha === commitSha) {
    return true;
  }
  const seen = new Set<string>();
  const stack = [...(bySha.get(commitSha)?.parents ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    if (current === ancestorSha) {
      return true;
    }
    seen.add(current);
    stack.push(...(bySha.get(current)?.parents ?? []));
  }
  return false;
}

function classifyOwnedBoundary(
  commitSha: string,
  subject: string,
  deliveryId: string,
): GitBoundaryFact | null {
  if (
    (subject.includes('delivery-final') || subject.includes('finalize')) &&
    subject.includes(deliveryId)
  ) {
    return {
      kind: 'delivery-final',
      commitSha,
      summary: subject,
    };
  }

  const checkpointMatch = /^chore\(flowkit\):\s*checkpoint\s+(\S+)/i.exec(subject);
  if (checkpointMatch?.[1] !== undefined) {
    return {
      kind: 'change-checkpoint',
      commitSha,
      summary: subject,
      changeId: checkpointMatch[1],
    };
  }

  if (/checkpoint/i.test(subject)) {
    return {
      kind: 'change-checkpoint',
      commitSha,
      summary: subject,
    };
  }

  return null;
}
