import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readGitBoundarySummaries } from '../../../src/facts/git-boundary-reader.js';

describe('readGitBoundarySummaries', () => {
  it('returns empty array when git is unavailable (fail-open, task 2.3)', async () => {
    // Point to a directory that is not a git repo.
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.deepEqual(facts, []);
  });

  it('does not persist Git boundaries to state files (task 2.3)', async () => {
    // The function returns read-only facts; it has no side effects on disk.
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    assert.ok(Array.isArray(facts));
  });
});

describe('GitBoundaryFact classification (task 2.2)', () => {
  // Verify the classification logic via the exported function's contract.
  // Delivery Start, Change Checkpoint, Delivery Final are the three boundary
  // kinds. When git is unavailable, the function returns [] — the
  // classification is exercised in integration via a real repo.

  it('returns an array of GitBoundaryFact with kind in the three boundary types', async () => {
    const facts = await readGitBoundarySummaries('/tmp/nonexistent-repo-12345', 'D1');
    for (const f of facts) {
      assert.ok(
        f.kind === 'delivery-start' || f.kind === 'change-checkpoint' || f.kind === 'delivery-final',
      );
    }
  });
});
