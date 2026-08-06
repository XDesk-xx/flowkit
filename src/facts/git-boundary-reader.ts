/**
 * C1 formal-fact-reader-and-persistence: Git boundary summary read-only
 * Reader (D11).
 *
 * Reads Delivery Start, Change Checkpoint, and Delivery Final commit summaries
 * from Git. The summary is read-only — it MUST NOT be persisted to any state
 * file (D11).
 *
 * Boundary commit classification (by message convention):
 *   - Delivery Start:       `chore(flowkit): start <delivery-id>`
 *   - Change Checkpoint:    message contains `checkpoint` + change references
 *   - Delivery Final:       message contains `delivery-final` / `finalize`
 */

import { runCommand } from '../shared/external-command.js';
import type { GitBoundaryFact } from './formal-fact-snapshot.js';

/**
 * Read Git formal-boundary commit summaries for a Delivery.
 *
 * @param repoRoot - Absolute path to the Git repository root.
 * @param deliveryId - The Delivery id to filter boundaries by.
 * @returns Read-only Git boundary facts; empty when no boundaries found or Git
 *   is unavailable.
 */
export async function readGitBoundarySummaries(
  repoRoot: string,
  deliveryId: string,
): Promise<GitBoundaryFact[]> {
  const facts: GitBoundaryFact[] = [];

  // Fetch commit hashes + subjects for the Delivery. Use `--all` to include
  // boundary commits regardless of the current branch.
  const result = await runCommand(
    'git',
    [
      'log',
      '--all',
      '--format=%H%x09%s',
      '--',
    ],
    { cwd: repoRoot },
  );

  if (result.exitCode !== 0) {
    // Git unavailable or not a repo — return empty (fail-open for Git; Reader
    // collects formal facts from filesystem sources as primary authority).
    return [];
  }

  const lines = result.stdout.split('\n').filter((l) => l.length > 0);
  for (const line of lines) {
    const [sha, subject] = line.split('\t');
    if (sha === undefined || subject === undefined) {
      continue;
    }
    const fact = classifyBoundary(sha, subject, deliveryId);
    if (fact !== null) {
      facts.push(fact);
    }
  }

  return facts;
}

/**
 * Classify a commit as a Git formal boundary, or `null` when it is not a
 * boundary commit for the given Delivery.
 */
function classifyBoundary(
  commitSha: string,
  subject: string,
  deliveryId: string,
): GitBoundaryFact | null {
  // Delivery Start: `chore(flowkit): start <delivery-id>`
  const startMatch = /^chore\(flowkit\):\s*start\s+(\S+)/.exec(subject);
  if (startMatch && startMatch[1] === deliveryId) {
    return {
      kind: 'delivery-start',
      commitSha,
      summary: subject,
    };
  }

  // Delivery Final: subject contains `delivery-final` or `finalize` + delivery id.
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

  // Change Checkpoint: subject contains `checkpoint` (case-insensitive).
  if (/checkpoint/i.test(subject)) {
    return {
      kind: 'change-checkpoint',
      commitSha,
      summary: subject,
    };
  }

  return null;
}
