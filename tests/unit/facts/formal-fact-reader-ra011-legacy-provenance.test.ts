import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readFormalFactSnapshot } from '../../../src/facts/formal-fact-reader.js';

async function read(root: string, deliveryId: string) {
  return readFormalFactSnapshot({ repoRoot: root, deliveryId, runsPathPrefix: '.flowkit/runs', openspecChangesPath: 'openspec/changes', manifestPathPrefix: '.flowkit/manifests' });
}

async function manifest(root: string, deliveryId: string): Promise<void> {
  const dir = join(root, '.flowkit', 'manifests');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${deliveryId}.yaml`), `id: ${deliveryId}\ndelivery:\n  state: active\n  fullTestStatus: not-ready\nchanges:\n  - key: Q1\n    id: execution-model-correction\n    state: completed\n    architectureImpact: false\n    required: true\n    dependsOn: []\n  - key: Q2\n    id: run-authority-boundary-correction\n    state: active\n    architectureImpact: false\n    required: true\n    dependsOn:\n      - execution-model-correction\n`);
}

describe('Q2/v6 bounded historical provenance', () => {
  it('legacy/heavy records inside completed Change do not enter current snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-history-'));
    const deliveryId = 'D1';
    try {
      await manifest(root, deliveryId);
      const dir = join(root, '.flowkit', 'runs', deliveryId, 'execution-model-correction', '20260806-098-propose');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'action.md'), '# historical\n');
      await writeFile(join(dir, 'context.json'), JSON.stringify({ schemaVersion: 1, runId: 'legacy-shape', action: 'propose' }));
      await writeFile(join(dir, 'result.json'), JSON.stringify({ schemaVersion: 1, runId: 'legacy-shape', status: 'completed', heavyBookkeeping: { hashes: ['x'] } }));
      const snapshot = await read(root, deliveryId);
      assert.equal(snapshot.runs.length, 0);
      assert.equal(snapshot.conflicts.length, 0, JSON.stringify(snapshot.conflicts));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('history exclusion does not weaken active schemaVersion 2 admission', async () => {
    const root = await mkdtemp(join(tmpdir(), 'flowkit-q2-active-'));
    const deliveryId = 'D1';
    try {
      await manifest(root, deliveryId);
      const dir = join(root, '.flowkit', 'runs', deliveryId, 'run-authority-boundary-correction', '20260806-156-apply');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'action.md'), '# apply\n');
      await writeFile(join(dir, 'context.json'), JSON.stringify({ schemaVersion: 2, runId: 'wrong-id' }));
      const snapshot = await read(root, deliveryId);
      assert.ok(snapshot.conflicts.length > 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
