import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { validateVerificationSelectionRecord } from '../../src/verification/change-selection/publication.js';
import { validateVerificationEvidenceForSelection, validateVerificationEvidenceRecord } from '../../src/verification/change-selection/evidence.js';
import type { FormalFactSnapshot } from '../../src/facts/formal-fact-snapshot.js';
import { next } from '../../src/policy/next.js';
import { currentVerificationCatalogFingerprint, validateVerificationSelection } from '../../src/verification/change-selection/selection.js';

const fixtureRoot = join(process.cwd(), 'tests', 'fixtures', 'e2-change-verification-generalization', 'historical-e1');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('E2 generic verification / historical compatibility', () => {
  for (const run of ['127', '133'] as const) {
    it(`reads historical E1 ${run} persisted authority without comparing it to the future current Catalog`, async () => {
      const runRoot = join(fixtureRoot, run);
      const selectionRaw = await readFile(join(runRoot, 'verification-selection.json'), 'utf8');
      const evidenceRaw = await readFile(join(runRoot, 'verification-evidence.json'), 'utf8');
      const result = JSON.parse(await readFile(join(runRoot, 'result.json'), 'utf8')) as {
        terminalBinding?: { verificationSelection?: { versionFingerprint?: string } };
      };
      const selectionRecord = validateVerificationSelectionRecord(JSON.parse(selectionRaw) as unknown);
      const historical = validateVerificationSelection(selectionRecord.selection);
      const evidence = validateVerificationEvidenceRecord(JSON.parse(evidenceRaw) as unknown);
      validateVerificationEvidenceForSelection(evidence, historical, selectionRecord.producingRunId);
      assert.notEqual(historical.moduleMapFingerprint, currentVerificationCatalogFingerprint());
      assert.equal(result.terminalBinding?.verificationSelection?.versionFingerprint, sha256(selectionRaw));
    });
  }

  it('keeps the formal dependency graph E1 → E2 → F1 → G1 and makes F1 the first post-E2 consumer', () => {
    const base: FormalFactSnapshot = {
      deliveryId: '20990202-01-e2-graph',
      deliveryState: 'active',
      deliveryFullTestStatus: 'not-ready',
      changes: [
        { key: 'E1', id: 'change-verification-selection-and-change-set', state: 'completed', required: true, dependsOn: [], architectureImpact: false },
        { key: 'E2', id: 'change-verification-generalization-and-lean-run-normalization', state: 'planned', required: true, dependsOn: ['change-verification-selection-and-change-set'], architectureImpact: false },
        { key: 'F1', id: 'archive-and-checkpoint-boundary', state: 'planned', required: true, dependsOn: ['change-verification-generalization-and-lean-run-normalization'], architectureImpact: false },
        { key: 'G1', id: 'change-cli-end-to-end-and-performance', state: 'planned', required: true, dependsOn: ['archive-and-checkpoint-boundary'], architectureImpact: false },
      ],
      runs: [], openSpecArtifacts: [],
      gitBoundaries: [{ kind: 'change-checkpoint', commitSha: 'a'.repeat(40), summary: 'E1 checkpoint', changeId: 'change-verification-selection-and-change-set' }],
      ownerAuthorizations: [], reviewVerdicts: [], conflicts: [],
    };
    const before = next(base);
    assert.equal(before.kind, 'owner-decision');
    if (before.kind !== 'owner-decision') assert.fail('expected E2 activation');
    assert.equal(before.decision, 'activate-change');
    assert.deepEqual(before.context.eligibleChangeKeys, ['E2']);

    const after: FormalFactSnapshot = {
      ...base,
      changes: base.changes.map((change) => change.key === 'E2' ? { ...change, state: 'completed' as const } : change),
      gitBoundaries: [
        ...base.gitBoundaries,
        { kind: 'change-checkpoint', commitSha: 'b'.repeat(40), summary: 'E2 checkpoint', changeId: 'change-verification-generalization-and-lean-run-normalization' },
      ],
    };
    const ready = next(after);
    assert.equal(ready.kind, 'owner-decision');
    if (ready.kind !== 'owner-decision') assert.fail('expected F1 activation');
    assert.equal(ready.decision, 'activate-change');
    assert.deepEqual(ready.context.eligibleChangeKeys, ['F1']);
    assert.equal(ready.context.changeKey, 'F1');
  });
});
