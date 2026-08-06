import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSeparators,
  joinPath,
  relativePath,
} from '../../src/shared/paths.js';

describe('paths', () => {
  describe('normalizeSeparators', () => {
    it('converts backslashes to forward slashes', () => {
      assert.equal(normalizeSeparators('a\\b\\c'), 'a/b/c');
    });

    it('leaves forward slashes unchanged', () => {
      assert.equal(normalizeSeparators('a/b/c'), 'a/b/c');
    });

    it('handles mixed separators', () => {
      assert.equal(normalizeSeparators('a\\b/c\\d'), 'a/b/c/d');
    });
  });

  describe('joinPath', () => {
    it('joins segments with forward slashes', () => {
      assert.equal(joinPath('a', 'b', 'c'), 'a/b/c');
    });

    it('normalizes backslashes in segments', () => {
      assert.equal(joinPath('a\\b', 'c'), 'a/b/c');
    });

    it('handles single segment', () => {
      assert.equal(joinPath('a'), 'a');
    });
  });

  describe('relativePath', () => {
    it('computes relative path', () => {
      assert.equal(relativePath('/a/b', '/a/b/c'), 'c');
    });

    it('computes relative path with ../', () => {
      assert.equal(relativePath('/a/b', '/a/d'), '../d');
    });
  });
});
