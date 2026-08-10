import { writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Atomically write a file by first writing to a temporary file in the same
 * directory, then renaming it to the target path. If the write or rename
 * fails, the temporary file is cleaned up.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string,
): Promise<void> {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.tmp-${randomBytes(8).toString('hex')}`);

  try {
    await writeFile(tempPath, data, 'utf-8');
    await rename(tempPath, filePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
