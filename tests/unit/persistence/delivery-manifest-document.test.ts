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
