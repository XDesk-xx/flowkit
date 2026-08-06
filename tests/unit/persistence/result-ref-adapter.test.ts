import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeResultFileHash,
  buildRunResultRef,
  reconstructActionResult,
  verifyResultRef,
  resolveRunResultRef,
  RUN_RESULT_KIND,
} from '../../../src/persistence/result-ref-adapter.js';

describe('computeResultFileHash', () => {
  it('produces a stable SHA-256 hex digest (task 7.2)', () => {
    const content = '{"runStatus":"completed"}';
    const hash = computeResultFileHash(content);
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]+$/);
    assert.equal(computeResultFileHash(content), hash);
  });

  it('produces different digests for different content', () => {
    assert.notEqual(
      computeResultFileHash('a'),
      computeResultFileHash('b'),
    );
  });
});

describe('buildRunResultRef', () => {
  it('constructs a ResultRef with content-hash fingerprint (task 7.3, 12.20)', () => {
    const runPath = '.flowkit/runs/D1/C1/20260806-001-explore/';
    const content = '{"runStatus":"completed"}';
    const ref = buildRunResultRef(runPath, content);
    assert.equal(ref.ref, '.flowkit/runs/D1/C1/20260806-001-explore/result.json');
    assert.equal(ref.versionFingerprint, computeResultFileHash(content));
    assert.equal(ref.kind, RUN_RESULT_KIND);
  });

  it('write-read consistency (task 12.20)', () => {
    const runPath = 'runs/20260806-001-explore/';
    const content = '{"runStatus":"completed","summary":"done"}';
    const ref = buildRunResultRef(runPath, content);
    assert.equal(verifyResultRef(ref, content), true);
  });
});

describe('verifyResultRef', () => {
  it('returns true when fingerprint matches (task 7.5)', () => {
    const content = '{"x":1}';
    const ref = buildRunResultRef('p/', content);
    assert.equal(verifyResultRef(ref, content), true);
  });

  it('detects replacement when fingerprint mismatches (task 12.21, 12.22)', () => {
    const original = '{"x":1}';
    const replaced = '{"x":2}';
    const ref = buildRunResultRef('p/', original);
    assert.equal(verifyResultRef(ref, replaced), false);
  });
});

describe('reconstructActionResult', () => {
  it('derives runRef from file content and rebuilds ActionResult (task 7.4)', () => {
    const withoutRunRef = {
      action: 'explore' as const,
      executionStatus: 'completed' as const,
      summary: 'done',
    };
    const runPath = 'runs/20260806-001-explore/';
    const content = '{"runStatus":"completed"}';
    const ar = reconstructActionResult(withoutRunRef, runPath, content);
    assert.equal(ar.action, 'explore');
    assert.equal(ar.summary, 'done');
    assert.equal(ar.runRef.versionFingerprint, computeResultFileHash(content));
    assert.equal(ar.runRef.kind, RUN_RESULT_KIND);
  });

  it('does not include runRef in the input projection (task 12.23)', () => {
    // reconstructActionResult derives runRef; the input MUST NOT carry runRef.
    const withoutRunRef = {
      action: 'propose' as const,
      executionStatus: 'completed' as const,
      summary: 'done',
    };
    assert.ok(!('runRef' in withoutRunRef));
    const ar = reconstructActionResult(withoutRunRef, 'p/', 'content');
    assert.ok('runRef' in ar);
  });
});

describe('resolveRunResultRef', () => {
  it('resolves ref back to the result.json path (task 7.6)', () => {
    const ref = buildRunResultRef('runs/20260806-001-explore/', 'content');
    const path = resolveRunResultRef(ref);
    assert.equal(path, 'runs/20260806-001-explore/result.json');
  });

  it('throws for non-run-result kind', () => {
    assert.throws(() =>
      resolveRunResultRef({ ref: 'x', versionFingerprint: 'v', kind: 'other' }),
    );
  });
});
