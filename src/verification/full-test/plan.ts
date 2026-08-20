import type { BoundedFullTestLogicalCheck, FullTestBoundedResolverId } from '../../domain/full-test.js';

export const FULL_TEST_LOGICAL_CHECKS: readonly BoundedFullTestLogicalCheck[] = [
  { id: 'quality', resolverId: 'flowkit-quality', perTargetTimeoutMs: 120_000 },
  { id: 'typecheck', resolverId: 'flowkit-typecheck', perTargetTimeoutMs: 120_000 },
  { id: 'lint', resolverId: 'flowkit-lint', perTargetTimeoutMs: 120_000 },
  { id: 'build', resolverId: 'flowkit-build', perTargetTimeoutMs: 120_000 },
  { id: 'openspec-all', resolverId: 'flowkit-openspec-all', perTargetTimeoutMs: 120_000 },
  { id: 'full', resolverId: 'flowkit-full-tests', perTargetTimeoutMs: 120_000 },
];

export const FULL_TEST_LOGICAL_IDS = FULL_TEST_LOGICAL_CHECKS.map((check) => check.id);

export function fullTestLogicalCheckForResolver(resolverId: FullTestBoundedResolverId): BoundedFullTestLogicalCheck | undefined {
  return FULL_TEST_LOGICAL_CHECKS.find((check) => check.resolverId === resolverId);
}
