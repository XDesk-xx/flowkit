import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FlowkitError } from '../../../src/shared/errors.js';
import {
  collectRunIds,
  allocateNextRunId,
  validateCandidateRunId,
} from '../../../src/persistence/run-id-fs.js';

let tempRoot: string;

async function makeTempRoot(): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join: pathJoin } = await import('node:path');
  tempRoot = await mkdtemp(pathJoin(tmpdir(), 'flowkit-runid-'));
  return tempRoot;
}

async function cleanupTempRoot(): Promise<void> {
  await rm(tempRoot, { recursive: true, force: true });
}

async function createRunDir(deliveryDir: string, changeId: string | undefined, runId: string): Promise<void> {
  const runDir = changeId !== undefined ? join(deliveryDir, changeId, runId) : join(deliveryDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'context.json'), '{}');
}

describe('collectRunIds', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('collects Run-IDs from Change-level and Delivery-level dirs (task 8.2)', async () => {
    const deliveryDir = join(tempRoot, 'D1');
    await createRunDir(deliveryDir, 'C1', '20260806-001-explore');
    await createRunDir(deliveryDir, 'C1', '20260806-003-propose');
    await createRunDir(deliveryDir, undefined, '20260806-002-full-test');

    const ids = await collectRunIds(deliveryDir);
    assert.deepEqual(ids, [
      '20260806-001-explore',
      '20260806-002-full-test',
      '20260806-003-propose',
    ]);
  });

  it('skips staging directories (.tmp-*)', async () => {
    const deliveryDir = join(tempRoot, 'D2');
    await createRunDir(deliveryDir, 'C1', '20260806-001-explore');
    // Create a staging dir.
    await mkdir(join(deliveryDir, '.tmp-20260806-002-explore'), { recursive: true });
    const ids = await collectRunIds(deliveryDir);
    assert.deepEqual(ids, ['20260806-001-explore']);
  });

  it('returns empty when directory does not exist', async () => {
    const ids = await collectRunIds(join(tempRoot, 'nonexistent'));
    assert.deepEqual(ids, []);
  });
});

describe('allocateNextRunId', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('delegates to B1 allocateNextNnn (task 8.3)', async () => {
    const deliveryDir = join(tempRoot, 'D3');
    await createRunDir(deliveryDir, 'C1', '20260806-005-explore');
    const result = await allocateNextRunId(deliveryDir, '20260806', 'propose');
    assert.equal(result.nnn, 6);
    assert.equal(result.runId, '20260806-006-propose');
  });

  it('returns 1 for empty Delivery', async () => {
    const deliveryDir = join(tempRoot, 'D4');
    const result = await allocateNextRunId(deliveryDir, '20260806', 'explore');
    assert.equal(result.nnn, 1);
    assert.equal(result.runId, '20260806-001-explore');
  });
});

describe('validateCandidateRunId', () => {
  before(makeTempRoot);
  after(cleanupTempRoot);

  it('delegates to B1 validateCandidateNnn + uniqueness (task 8.4, 8.5)', async () => {
    const deliveryDir = join(tempRoot, 'D5');
    await createRunDir(deliveryDir, 'C1', '20260806-005-explore');
    await assert.doesNotReject(() =>
      validateCandidateRunId('20260806-006-propose', deliveryDir),
    );
  });

  it('rejects non-monotonic NNN', async () => {
    const deliveryDir = join(tempRoot, 'D6');
    await createRunDir(deliveryDir, 'C1', '20260806-005-explore');
    await assert.rejects(
      () => validateCandidateRunId('20260806-003-propose', deliveryDir),
      (e: unknown) => e instanceof FlowkitError && e.code === 'RUN_ID_NNN_NOT_MONOTONIC',
    );
  });

  it('rejects duplicate full Run-ID', async () => {
    const deliveryDir = join(tempRoot, 'D7');
    await createRunDir(deliveryDir, 'C1', '20260806-005-explore');
    await assert.rejects(
      () => validateCandidateRunId('20260806-005-explore', deliveryDir),
      (e: unknown) => e instanceof FlowkitError,
    );
  });
});
