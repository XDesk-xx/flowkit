import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export const OPENSPEC_THIN_INTEGRATION_CHANGE_ID = 'openspec-1-7-thin-integration';

/**
 * C1 becomes the structured OpenSpec reader for Changes *after* C1 has closed.
 * During C1's own archive bootstrap window OpenSpec can already have merged the
 * canonical capability spec and relocated the active Change while the Delivery
 * Manifest still projects C1 as active. Passing that current Change id keeps
 * the Reader on the bounded pre-C1 path semantics until C1 is completed.
 */
export async function isOpenSpecThinIntegrationActive(
  repoRoot: string,
  currentChangeId?: string,
): Promise<boolean> {
  if (currentChangeId === OPENSPEC_THIN_INTEGRATION_CHANGE_ID) return false;
  try {
    return (await stat(join(repoRoot, 'openspec/specs/flowkit-openspec-1-7-thin-integration/spec.md'))).isFile();
  } catch {
    return false;
  }
}
