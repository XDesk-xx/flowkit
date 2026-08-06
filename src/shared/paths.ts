import { posix, win32 } from 'node:path';

/**
 * Normalize path separators to POSIX `/`.
 * Converts Windows `\` separators to POSIX `/`.
 */
export function normalizeSeparators(path: string): string {
  return path.split(win32.sep).join(posix.sep);
}

/**
 * Join path segments using POSIX `/`.
 * Each segment is normalized before joining.
 */
export function joinPath(...segments: string[]): string {
  return segments.map(normalizeSeparators).join(posix.sep);
}

/**
 * Compute relative path from `from` to `to` using POSIX separators.
 */
export function relativePath(from: string, to: string): string {
  const normalizedFrom = normalizeSeparators(from);
  const normalizedTo = normalizeSeparators(to);
  return posix.relative(normalizedFrom, normalizedTo);
}
