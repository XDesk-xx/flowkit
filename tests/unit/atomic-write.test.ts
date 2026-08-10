import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { atomicWriteFile } from '../../src/shared/atomic-write.js';
import { createTempDir, cleanupTempDir } from '../fixtures/helpers.js';

describe('atomicWriteFile', () => {
  it('writes content to the target file', async () => {
    const dir = await createTempDir();
    try {
      const filePath = `${dir}/test.txt`;
      await atomicWriteFile(filePath, 'hello');
      const content = await readFile(filePath, 'utf-8');
      assert.equal(content, 'hello');
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it('overwrites existing file', async () => {
    const dir = await createTempDir();
    try {
      const filePath = `${dir}/test.txt`;
      await atomicWriteFile(filePath, 'old');
      await atomicWriteFile(filePath, 'new');
      const content = await readFile(filePath, 'utf-8');
      assert.equal(content, 'new');
    } finally {
      await cleanupTempDir(dir);
    }
  });

  it('does not leave temp files on success', async () => {
    const dir = await createTempDir();
    try {
      const filePath = `${dir}/test.txt`;
      await atomicWriteFile(filePath, 'hello');
      const files = await readdir(dir);
      assert.deepEqual(files.sort(), ['test.txt']);
    } finally {
      await cleanupTempDir(dir);
    }
  });
});
