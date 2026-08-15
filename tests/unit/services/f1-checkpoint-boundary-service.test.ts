import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ownerDecisionRefFor } from '../../../src/domain/owner-provenance.js';
import { prepareCheckpointBoundaryHandoff } from '../../../src/services/f1-checkpoint-boundary-service.js';
import { createTempDir } from '../../fixtures/helpers.js';

async function fixture(withAuthorization: boolean): Promise<{ root: string; deliveryId: string; changeId: string; ownerRef: string }> {
  const root = await createTempDir();
  const deliveryId = '20990301-01-f1-handoff';
  const changeId = 'archive-and-checkpoint-boundary';
  const sourceRef = 'owner:test:f1-handoff';
  const ownerRef = ownerDecisionRefFor({ decision: 'authorize-checkpoint', deliveryId, changeId, sourceRef });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await writeFile(join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
    `id: ${deliveryId}`,
    'delivery:',
    '  state: active',
    '  fullTestStatus: not-ready',
    'changes:',
    '  - key: F1',
    `    id: ${changeId}`,
    '    state: completed',
    '    architectureImpact: false',
    '    required: true',
    '    dependsOn: []',
    ...(withAuthorization ? [
      'ownerDecisions:',
      `  - ref: "${ownerRef}"`,
      '    decision: "authorize-checkpoint"',
      `    deliveryId: "${deliveryId}"`,
      `    changeId: "${changeId}"`,
      `    sourceRef: "${sourceRef}"`,
    ] : []),
    '',
  ].join('\n'), 'utf8');

  const runId = '20990301-001-archive';
  const runDir = join(root, '.flowkit', 'runs', deliveryId, changeId, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'action.md'), '# Archive\n', 'utf8');
  await writeFile(join(runDir, 'context.json'), `${JSON.stringify({
    schemaVersion: 2,
    runId,
    deliveryId,
    changeKey: 'F1',
    changeId,
    action: 'archive',
    role: 'author',
    ownerAuthorization: 'explicit',
    runPath: `.flowkit/runs/${deliveryId}/${changeId}/${runId}/`,
  }, null, 2)}\n`, 'utf8');
  await writeFile(join(runDir, 'result.json'), `${JSON.stringify({
    runStatus: 'completed',
    actionResult: { action: 'archive', executionStatus: 'completed', summary: 'archived' },
  }, null, 2)}\n`, 'utf8');
  return { root, deliveryId, changeId, ownerRef };
}

describe('F1 checkpoint boundary handoff service', () => {
  it('returns deterministic subject/trailers/preflight without Git mutation', async () => {
    const f = await fixture(true);
    try {
      const handoff = await prepareCheckpointBoundaryHandoff(f.root, f.deliveryId);
      assert.equal(handoff.changeId, f.changeId);
      assert.equal(handoff.ownerAuthorizationRef, f.ownerRef);
      assert.equal(handoff.subject, `chore(flowkit): checkpoint ${f.changeId}`);
      assert.deepEqual(handoff.trailers, [
        `Flowkit-Delivery: ${f.deliveryId}`,
        `Flowkit-Change: ${f.changeId}`,
        'Flowkit-Boundary: change-checkpoint',
        `Owner-Authorization: ${f.ownerRef}`,
      ]);
      assert.deepEqual(handoff.preflight, ['git diff --check', 'git diff --cached --check']);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it('fails closed when exact checkpoint Owner authority is absent', async () => {
    const f = await fixture(false);
    try {
      await assert.rejects(
        () => prepareCheckpointBoundaryHandoff(f.root, f.deliveryId),
        /exactly one matching authorize-checkpoint Owner fact/,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
