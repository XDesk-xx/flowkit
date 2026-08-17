import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { OpenSpecCliAdapter } from '../../../../src/integrations/openspec/openspec-cli-adapter.js';
import { FlowkitError } from '../../../../src/shared/errors.js';
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

function cliOnlySelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['cli-diagnostics'],
    moduleIds: ['cli-diagnostics'],
    capabilityIds: ['flowkit-change-cli-end-to-end-and-performance'],
    capabilityRefs: ['openspec/changes/g1/specs/flowkit-change-cli-end-to-end-and-performance/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-cli'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

function openspecRuntimeSelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['openspec-runtime'],
    moduleIds: ['openspec-runtime'],
    capabilityIds: ['flowkit-openspec-1-7-thin-integration'],
    capabilityRefs: ['openspec/specs/flowkit-openspec-1-7-thin-integration/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-openspec-runtime'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

function verificationOnlySelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['verification-selection'],
    moduleIds: ['verification-selection'],
    capabilityIds: ['flowkit-core-hardening-and-release-candidate'],
    capabilityRefs: ['openspec/changes/i1/specs/flowkit-core-hardening-and-release-candidate/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-verification'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

function archiveSyncOnlySelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['change-contract'],
    moduleIds: ['change-contract'],
    capabilityIds: ['flowkit-openspec-1-7-thin-integration'],
    capabilityRefs: ['openspec/changes/i1/specs/flowkit-openspec-1-7-thin-integration/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['openspec-current-change-archive-sync'],
  };
  return { ...payload, selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex') };
}

describe('verification evidence affected Node union', () => {
  it('uses the reusable archive-sync preflight as a formal logical check and fails closed on structured failure', async () => {
    const root = await createTempDir();
    try {
      const baseInput = {
        repoRoot: root,
        changeId: 'i1',
        runDir: join(root, '.flowkit', 'runs', 'archive-sync'),
        producingRunId: '20990101-006-apply',
        selection: archiveSyncOnlySelection(),
        fullTestStatus: 'not-ready' as const,
      };
      const passed = await executeVerificationSelection({
        ...baseInput,
        openSpecAdapter: {
          preflightArchiveSync: async () => ({
            kind: 'success', change: 'i1', archivedAs: '2099-01-01-i1', path: 'openspec/changes/archive/2099-01-01-i1', specsUpdated: true,
          }),
        } as unknown as OpenSpecCliAdapter,
      });
      assert.equal(passed.overallStatus, 'passed');
      assert.equal(passed.checks[0]?.scope, 'openspec-current-change-archive-sync');
      assert.equal(passed.checks[0]?.outcomeKind, 'openspec-archive-sync');

      const failed = await executeVerificationSelection({
        ...baseInput,
        openSpecAdapter: {
          preflightArchiveSync: async () => { throw new FlowkitError('OPENSPEC_ARCHIVE_SYNC_PREFLIGHT_FAILED', 'archive merge incomplete'); },
        } as unknown as OpenSpecCliAdapter,
      });
      assert.equal(failed.overallStatus, 'failed');
      assert.match(failed.checks[0]?.summary ?? '', /archive-sync.*failed closed/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('physically executes the G1 CLI E2E target through tests-cli and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'g1-change-cli-end-to-end.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('g1 sentinel', () => assert.fail('g1 selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      let evidence;
      try {
        evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'g1',
          runDir: join(root, '.flowkit', 'runs', 'sentinel'),
          producingRunId: '20990101-003-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveExecutable: async () => '/fixture/openspec' } as OpenSpecCliAdapter,
        });
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }

      assert.equal(evidence.overallStatus, 'failed');
      assert.match(evidence.checks[0]?.commandOrMethod ?? '', /g1-change-cli-end-to-end\.test\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('physically executes the A1 public Full Test behavior regression through tests-cli and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      for (const path of [
        join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'),
        join(root, 'tests', 'integration', 'diagnostic-cli.test.ts'),
        join(root, 'tests', 'integration', 'g1-change-cli-end-to-end.test.ts'),
      ]) await writeFile(path, "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'a1-delivery-readiness-and-full-test-behavior.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('a1 route sentinel', () => assert.fail('A1 public Full Test selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'a1',
          runDir: join(root, '.flowkit', 'runs', 'a1-sentinel'),
          producingRunId: '20990101-007-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveExecutable: async () => '/fixture/openspec' } as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /a1-delivery-readiness-and-full-test-behavior\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('propagates the current resolved OpenSpec executable when tests-cli physically includes G1', async () => {
    const root = await createTempDir();
    const executable = '/resolved/openspec-1.7.0';
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'g1-change-cli-end-to-end.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        `test('g1 env', () => assert.equal(process.env['FLOWKIT_OPENSPEC_BIN'], ${JSON.stringify(executable)}));`,
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'g1',
          runDir: join(root, '.flowkit', 'runs', 'g1-env'),
          producingRunId: '20990101-003-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveExecutable: async () => executable } as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'passed');
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('physically executes the real OpenSpec target, propagates the selected executable, and fails on its sentinel', async () => {
    const root = await createTempDir();
    const executable = '/fixture/openspec-1.7.0';
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'integrations'), { recursive: true });
      await writeFile(join(root, 'tests', 'unit', 'external-command.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'unit', 'integrations', 'openspec-cli-adapter.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      const realTarget = join(root, 'tests', 'integration', 'openspec-1-7-real-cli.test.ts');
      await writeFile(realTarget, [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        `test('openspec env', () => assert.equal(process.env['FLOWKIT_OPENSPEC_BIN'], ${JSON.stringify(executable)}));`,
        '',
      ].join('\n'), 'utf8');

      const input = {
        repoRoot: root,
        changeId: 'openspec-runtime',
        runDir: join(root, '.flowkit', 'runs', 'sentinel'),
        producingRunId: '20990101-004-apply',
        selection: openspecRuntimeSelection(),
        fullTestStatus: 'not-ready' as const,
        openSpecAdapter: { resolveExecutable: async () => executable } as OpenSpecCliAdapter,
      };
      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const passed = await executeVerificationSelection(input);
        assert.equal(passed.overallStatus, 'passed');
        assert.match(passed.checks[0]?.commandOrMethod ?? '', /tests\/integration\/openspec-1-7-real-cli\.test\.ts/);

        await writeFile(realTarget, [
          "import assert from 'node:assert/strict';",
          "import { test } from 'node:test';",
          `test('openspec sentinel', () => { assert.equal(process.env['FLOWKIT_OPENSPEC_BIN'], ${JSON.stringify(executable)}); assert.fail('real openspec selected target sentinel'); });`,
          '',
        ].join('\n'), 'utf8');
        const failed = await executeVerificationSelection(input);
        assert.equal(failed.overallStatus, 'failed');
        assert.match(failed.checks[0]?.commandOrMethod ?? '', /tests\/integration\/openspec-1-7-real-cli\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('physically executes verification-plan through tests-verification and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'verification', 'change-selection'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'verification'), { recursive: true });
      for (const path of [
        join(root, 'tests', 'integration', 'e1-change-verification-selection.test.ts'),
        join(root, 'tests', 'integration', 'e2-change-verification-generalization.test.ts'),
        join(root, 'tests', 'unit', 'verification', 'affected-scopes.test.ts'),
        join(root, 'tests', 'unit', 'verification', 'change-selection', 'placeholder.test.ts'),
      ]) {
        await writeFile(path, "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      }
      const planTarget = join(root, 'tests', 'unit', 'verification', 'verification-plan.test.ts');
      await writeFile(planTarget, "import { test } from 'node:test'; test('plan ok', () => {});\n", 'utf8');

      const input = {
        repoRoot: root,
        changeId: 'i1',
        runDir: join(root, '.flowkit', 'runs', 'sentinel'),
        producingRunId: '20990101-005-apply',
        selection: verificationOnlySelection(),
        fullTestStatus: 'not-ready' as const,
        openSpecAdapter: {} as OpenSpecCliAdapter,
      };
      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const passed = await executeVerificationSelection(input);
        assert.equal(passed.overallStatus, 'passed');
        assert.match(passed.checks[0]?.commandOrMethod ?? '', /tests\/unit\/verification\/verification-plan\.test\.ts/);

        await writeFile(planTarget, [
          "import assert from 'node:assert/strict';",
          "import { test } from 'node:test';",
          "test('I1 verification-plan sentinel', () => assert.fail('I1-RE-001 sentinel'));",
          '',
        ].join('\n'), 'utf8');
        const failed = await executeVerificationSelection(input);
        assert.equal(failed.overallStatus, 'failed');
        assert.match(failed.checks[0]?.commandOrMethod ?? '', /tests\/unit\/verification\/verification-plan\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
