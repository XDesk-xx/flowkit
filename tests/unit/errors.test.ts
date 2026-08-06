import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FlowkitError } from '../../src/shared/errors.js';

describe('FlowkitError', () => {
  it('creates with code and message', () => {
    const error = new FlowkitError('TEST_001', 'test error');
    assert.equal(error.code, 'TEST_001');
    assert.equal(error.message, 'test error');
    assert.equal(error.name, 'FlowkitError');
  });

  it('creates with context', () => {
    const error = new FlowkitError('TEST_002', 'test error', { key: 'value' });
    assert.deepEqual(error.context, { key: 'value' });
  });

  it('serializes to JSON with context', () => {
    const error = new FlowkitError('TEST_003', 'test error', { key: 'value' });
    const json = error.toJSON();
    assert.equal(json.code, 'TEST_003');
    assert.equal(json.message, 'test error');
    assert.deepEqual(json.context, { key: 'value' });
  });

  it('serializes to JSON without context when undefined', () => {
    const error = new FlowkitError('TEST_004', 'test error');
    const json = error.toJSON();
    assert.equal(json.code, 'TEST_004');
    assert.equal(json.message, 'test error');
    assert.equal('context' in json, false);
  });

  it('is an instance of Error', () => {
    const error = new FlowkitError('TEST_005', 'test error');
    assert.ok(error instanceof Error);
  });
});
