import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { OpenSpecCliAdapter } from '../../../../src/integrations/openspec/openspec-cli-adapter.js';
import { executeVerificationSelection } from '../../../../src/verification/change-selection/evidence.js';
import { currentVerificationCatalogFingerprint, type VerificationSelection } from '../../../../src/verification/change-selection/selection.js';
import { createTempDir } from '../../../fixtures/helpers.js';

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function executionOnlySelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['execution'],
    moduleIds: ['execution'],
    capabilityIds: ['flowkit-lean-run-and-action-package'],
    capabilityRefs: ['openspec/changes/e2/specs/flowkit-lean-run-and-action-package/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-execution'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

describe('verification evidence affected Node union', () => {
  it('includes changed service regressions so a failing a1-write sentinel fails tests-execution evidence', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'unit', 'services'), { recursive: true });
      await writeFile(join(root, 'tests', 'unit', 'services', 'a1-write-service.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('sentinel', () => assert.fail('affected sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      let evidence;
      try {
        evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'e2',
          runDir: join(root, '.flowkit', 'runs', 'sentinel'),
          producingRunId: '20990101-001-apply',
          selection: executionOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: {} as OpenSpecCliAdapter,
        });
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }

      assert.equal(evidence.overallStatus, 'failed');
      assert.equal(evidence.checks.length, 1);
      assert.equal(evidence.checks[0]?.scope, 'tests-execution');
      assert.match(evidence.checks[0]?.commandOrMethod ?? '', /tests\/unit\/services\/a1-write-service\.test\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('physically executes the F1 lifecycle integration through tests-execution', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await writeFile(join(root, 'tests', 'integration', 'f1-archive-and-checkpoint-boundary.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('f1 execution sentinel', () => assert.fail('f1 sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      let evidence;
      try {
        evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'f1',
          runDir: join(root, '.flowkit', 'runs', 'sentinel'),
          producingRunId: '20990101-002-apply',
          selection: executionOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: {} as OpenSpecCliAdapter,
        });
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }

      assert.equal(evidence.overallStatus, 'failed');
      assert.match(evidence.checks[0]?.commandOrMethod ?? '', /tests\/integration\/f1-archive-and-checkpoint-boundary\.test\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
