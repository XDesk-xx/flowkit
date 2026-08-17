import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DeliveryManifestDocument } from '../../../src/persistence/delivery-manifest-document.js';
import { FlowkitError } from '../../../src/shared/errors.js';

const manifest = [
  'id: D1',
  'delivery:',
  '  state: active',
  '  fullTestStatus: not-ready',
  'changes:',
  '  - key: A1',
  '    id: change-a',
  '    goal: "A"',
  '    required: true',
  '    dependsOn: []',
  '    state: active',
  '    architectureImpact: false',
  '    outputs: []',
  '',
].join('\n');

describe('DeliveryManifestDocument line-ending compatibility', () => {
  it('normalizes pure CRLF to canonical LF', () => {
    const doc = DeliveryManifestDocument.parse(manifest.replace(/\n/g, '\r\n'));
    assert.equal(doc.toString(), manifest);
    assert.equal(doc.toString().includes('\r'), false);
  });

  it('rejects mixed LF/CRLF and bare carriage returns', () => {
    const mixed = manifest.replace('\n', '\r\n');
    assert.throws(
      () => DeliveryManifestDocument.parse(mixed),
      (error: unknown) => error instanceof FlowkitError && error.code === 'MANIFEST_UNSUPPORTED_SHAPE',
    );
    assert.throws(
      () => DeliveryManifestDocument.parse(manifest.replace('id: D1', 'id: D1\r')),
      (error: unknown) => error instanceof FlowkitError && error.code === 'MANIFEST_UNSUPPORTED_SHAPE',
    );
  });
});


const fullTestManifest = [
  'id: D1',
  'delivery:',
  '  state: active',
  '  fullTestStatus: authorized',
  'changes:',
  '  - key: A1',
  '    id: change-a',
  '    goal: "A"',
  '    required: true',
  '    dependsOn: []',
  '    state: completed',
  '    architectureImpact: false',
  '    outputs: []',
  'verification:',
  '  fullTest:',
  '    requiresOwnerAuthorization: true',
  '',
].join('\n');

describe('A1 DeliveryManifestDocument Full Test owned blocks', () => {
  it('publishes a terminal result by atomically rendering status + closed result fields', () => {
    const doc = DeliveryManifestDocument.parse(fullTestManifest);
    doc.publishFullTestResult({
      schemaVersion: 1,
      status: 'passed',
      summary: 'all checks passed',
      totalDurationMs: 11,
      checks: [{ id: 'full', status: 'passed', durationMs: 11 }],
      resultRef: `verification:full-test:${'a'.repeat(64)}`,
    });
    const text = doc.toString();
    assert.match(text, /fullTestStatus: passed/);
    assert.match(text, /result:\n {6}schemaVersion: 1\n {6}status: passed/);
    assert.match(text, /resultRef: "verification:full-test:a{64}"/);
  });

  it('renders outcome-unknown as a bounded executionBlock without changing authorized status', () => {
    const doc = DeliveryManifestDocument.parse(fullTestManifest);
    doc.setFullTestExecutionBlock({ schemaVersion: 1, reason: 'outcome-unknown', summary: 'tree not proven terminal' });
    const text = doc.toString();
    assert.match(text, /fullTestStatus: authorized/);
    assert.match(text, /executionBlock:\n {6}schemaVersion: 1\n {6}reason: outcome-unknown/);
    assert.doesNotMatch(text, /\n {4}result:/);
  });
});
