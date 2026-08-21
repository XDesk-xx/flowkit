import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { buildRepositoryStableResumeProjection, buildResumeProjection } from '../../../src/diagnostics/resume-projection.js';
import type { FormalFactSnapshot } from '../../../src/facts/formal-fact-snapshot.js';
import { createTempDir } from '../../fixtures/helpers.js';
import { buildChange, buildSnapshot } from '../policy/fixtures.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function snapshotWithArchitecture(impact: boolean): FormalFactSnapshot {
  return {
    ...buildSnapshot({ changes: [buildChange({ key: 'G1', id: 'future-resume-adapter-proof' })] }),
    deliveryArchitectureImpact: impact,
  };
}

describe('G1 resume projection', () => {
  it('derives repository-stable architecture refs without manufacturing durable state', async () => {
    const root = await createTempDir();
    roots.push(root);
    const snapshot = snapshotWithArchitecture(true);
    const jsonRoot = join(root, 'architecture', snapshot.deliveryId, 'json');
    await mkdir(jsonRoot, { recursive: true });
    const current = '{"kind":"current"}\n';
    const planned = '{"kind":"planned"}\n';
    await writeFile(join(jsonRoot, 'current.architecture.json'), current, 'utf8');
    await writeFile(join(jsonRoot, 'planned.architecture.json'), planned, 'utf8');

    const projected = buildRepositoryStableResumeProjection({ repoRoot: root, snapshot });
    assert.deepEqual(projected.architecture.current, {
      status: 'present',
      path: `architecture/${snapshot.deliveryId}/json/current.architecture.json`,
      sha256: createHash('sha256').update(current).digest('hex'),
    });
    assert.deepEqual(projected.architecture.planned, {
      status: 'present',
      path: `architecture/${snapshot.deliveryId}/json/planned.architecture.json`,
      sha256: createHash('sha256').update(planned).digest('hex'),
    });
    assert.deepEqual(projected.architecture.actual, {
      status: 'absent',
      path: `architecture/${snapshot.deliveryId}/json/actual.architecture.json`,
    });
    assert.equal(projected.managedTools, undefined);
  });

  it('projects not-applicable architecture and bounded managed-tool readiness without ambient fallback', async () => {
    const root = await createTempDir();
    roots.push(root);
    const snapshot = snapshotWithArchitecture(false);
    const projected = await buildResumeProjection({
      repoRoot: root,
      snapshot,
      includeManagedTools: true,
      env: { FLOWKIT_HOME: join(root, 'empty-flowkit-home') },
    });
    assert.equal(projected.architecture.current.status, 'not-applicable');
    assert.equal(projected.architecture.planned.status, 'not-applicable');
    assert.equal(projected.architecture.actual.status, 'not-applicable');
    assert.equal(projected.managedTools?.openspec.status, 'unavailable');
    assert.equal(projected.managedTools?.archify.status, 'unavailable');
  });
});
