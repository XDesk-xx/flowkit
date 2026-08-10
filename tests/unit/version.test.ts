import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVersion } from '../../src/cli/version.js';

describe('version', () => {
  it('returns 0.1.0', () => {
    assert.equal(getVersion(), '0.1.0');
  });
});
