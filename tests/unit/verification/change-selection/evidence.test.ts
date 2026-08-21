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

function architectureOnlySelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['architecture'],
    moduleIds: ['architecture'],
    capabilityIds: ['flowkit-architecture-assets'],
    capabilityRefs: ['openspec/changes/d1/specs/flowkit-architecture-assets/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-architecture'],
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


function h1CliSelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['cli-diagnostics'],
    moduleIds: ['cli-diagnostics'],
    capabilityIds: ['flowkit-stable-runner-and-self-hosting-acceptance'],
    capabilityRefs: ['openspec/changes/h1/specs/flowkit-stable-runner-and-self-hosting-acceptance/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-cli'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

function h1ExecutionSelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['execution'],
    moduleIds: ['execution'],
    capabilityIds: ['flowkit-stable-runner-and-self-hosting-acceptance'],
    capabilityRefs: ['openspec/changes/h1/specs/flowkit-stable-runner-and-self-hosting-acceptance/spec.md'],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-execution'],
  };
  return {
    ...payload,
    selectionFingerprint: createHash('sha256').update(canonicalStringify(payload)).digest('hex'),
  };
}

function externalToolsSelection(): VerificationSelection {
  const payload = {
    moduleMapLogicalRef: 'src/verification/change-selection/module-map.ts',
    moduleMapFingerprint: currentVerificationCatalogFingerprint(),
    seedModuleIds: ['external-tools'],
    moduleIds: ['external-tools'],
    capabilityIds: ['flowkit-external-tool-runtime', 'flowkit-integration-boundaries'],
    capabilityRefs: [
      'openspec/changes/c1/specs/flowkit-external-tool-runtime/spec.md',
      'openspec/changes/c1/specs/flowkit-integration-boundaries/spec.md',
    ],
    capabilityRelation: { kind: 'matched' as const },
    verificationScopes: ['tests-external-tools'],
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


const G1_CHANGE_PHYSICAL_CASES = [
  'drives the happy lifecycle through real archive, verify projection, completion and checkpoint readiness without a Git checkpoint',
  'keeps non-author blockers out of revise while explicit review creates direct same-stage re-review; author blockers permit revise',
  'fails closed for stale review target and missing Owner activation',
  'exact-resumes the same pending Run after a future-Delivery fresh clone with no chat/provider state',
  'keeps changed-surface outcome-unknown archive pending and resumes the same generation after explicit recovery admission',
  'projects not-published Verification from structured authority and fails closed when OpenSpec projection is unavailable',
  'records Change Verification failure through apply admission instead of fabricating success',
] as const;

const G1_ADAPTER_PHYSICAL_CASES = [
  'replays the real F1 retry+archive terminal and fails closed on ambiguous/corrupt archived authority',
  'keeps historical E1 selection/evidence point-in-time even when the current Catalog fingerprint differs',
  'fresh-clones a different future Delivery, resumes one exact pending Action, rebuilds context, and does not auto-next',
] as const;

async function writePassingExecutionExactTargets(root: string): Promise<void> {
  await mkdir(join(root, 'tests', 'integration'), { recursive: true });
  for (const name of [
    'f1-archive-and-checkpoint-boundary.test.ts',
    'f1-delivery-finalize-and-git-boundary.test.ts',
  ]) {
    await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
  }
}

async function writePassingCliBoundedTargets(root: string, executable: string): Promise<void> {
  await mkdir(join(root, 'tests', 'integration'), { recursive: true });
  await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
  await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
  for (const name of [
    'a1-delivery-readiness-and-full-test-behavior.test.ts',
    'b1-delivery-findings-and-corrective-change.test.ts',
    'diagnostic-cli.test.ts',
  ]) {
    await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
  }
  await writeFile(
    join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'),
    "import { test } from 'node:test'; test('diagnostic process ok', () => {});\n",
    'utf8',
  );
  await writeFile(join(root, 'tests', 'integration', 'g1-change-cli-end-to-end.test.ts'), [
    "import assert from 'node:assert/strict';",
    "import { test } from 'node:test';",
    ...G1_CHANGE_PHYSICAL_CASES.map((name, index) => index === 0
      ? `test(${JSON.stringify(name)}, () => assert.equal(process.env['FLOWKIT_OPENSPEC_BIN'], ${JSON.stringify(executable)}));`
      : `test(${JSON.stringify(name)}, () => {});`),
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'tests', 'integration', 'g1-sync-resume-and-single-action-agent-adapter.test.ts'), [
    "import { test } from 'node:test';",
    ...G1_ADAPTER_PHYSICAL_CASES.map((name) => `test(${JSON.stringify(name)}, () => {});`),
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'tests', 'integration', 'h1-stable-runner-and-self-hosting-acceptance.test.ts'), [
    "import { test } from 'node:test';",
    `test(${JSON.stringify('physically installs the candidate runner and exercises fresh-process diagnostics without source-workspace runtime')}, () => {});`,
    "test('phase body', () => {});",
    '',
  ].join('\n'), 'utf8');
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
  it('physically executes the D1 Architecture target through tests-architecture and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'architecture'), { recursive: true });
      await writeFile(join(root, 'tests', 'unit', 'architecture', 'ok.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'd1-architecture-baseline-and-delivery-plan.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('d1 architecture sentinel', () => assert.fail('D1 architecture selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');
      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'd1',
          runDir: join(root, '.flowkit', 'runs', 'd1-sentinel'),
          producingRunId: '20990101-009-apply',
          selection: architectureOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /d1-architecture-baseline-and-delivery-plan\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('physically executes the E1 Architecture target through tests-architecture and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'architecture'), { recursive: true });
      await writeFile(join(root, 'tests', 'integration', 'd1-architecture-baseline-and-delivery-plan.test.ts'), "import { test } from 'node:test'; test('d1 ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'e1-architecture-actual-compare-and-system-promotion.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('e1 architecture sentinel', () => assert.fail('E1 architecture selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');
      await writeFile(join(root, 'tests', 'unit', 'architecture', 'ok.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'e1',
          runDir: join(root, '.flowkit', 'runs', 'e1-sentinel'),
          producingRunId: '20990101-010-apply',
          selection: architectureOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /e1-architecture-actual-compare-and-system-promotion\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
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

  it('physically executes the G1 sync/resume single-action target through tests-cli and fails on its sentinel', async () => {
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
      const target = join(root, 'tests', 'integration', 'g1-sync-resume-and-single-action-agent-adapter.test.ts');
      await writeFile(target, [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('g1 sync sentinel', () => assert.fail('G1 sync/resume selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'g1-sync',
          runDir: join(root, '.flowkit', 'runs', 'g1-sync-sentinel'),
          producingRunId: '20990101-009-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /g1-sync-resume-and-single-action-agent-adapter\.test\.ts/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });


  it('physically executes the H1 self-hosting target through tests-cli and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      for (const name of [
        'a1-delivery-readiness-and-full-test-behavior.test.ts',
        'b1-delivery-findings-and-corrective-change.test.ts',
        'diagnostic-cli-process.test.ts',
        'diagnostic-cli.test.ts',
        'g1-change-cli-end-to-end.test.ts',
        'g1-sync-resume-and-single-action-agent-adapter.test.ts',
      ]) {
        await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      }
      const target = join(root, 'tests', 'integration', 'h1-stable-runner-and-self-hosting-acceptance.test.ts');
      await writeFile(target, [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('h1 formal branch sentinel', () => { if (process.env.FLOWKIT_H1_FORMAL_PHASE === '1') assert.fail('H1 full E2E formal branch sentinel'); });",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'h1',
          runDir: join(root, '.flowkit', 'runs', 'h1-sentinel'),
          producingRunId: '20990101-010-apply',
          selection: h1CliSelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /h1-stable-runner-and-self-hosting-acceptance\.test\.ts/);
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /FLOWKIT_H1_FORMAL_PHASE=1/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deduplicates only the legacy npm-installed diagnostic smoke when H1 full installed-runner coverage is selected', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      for (const name of [
        'a1-delivery-readiness-and-full-test-behavior.test.ts',
        'b1-delivery-findings-and-corrective-change.test.ts',
        'diagnostic-cli.test.ts',
        'g1-change-cli-end-to-end.test.ts',
        'g1-sync-resume-and-single-action-agent-adapter.test.ts',
      ]) {
        await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      }
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('executes all four commands without mutating repository files', () => {});",
        "test('executes the npm-installed flowkit bin surface', () => assert.fail('legacy installed smoke must be H1-deduplicated'));",
        "test('rejects unknown commands with exit 2 on stderr', () => {});",
        '',
      ].join('\n'), 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'h1-stable-runner-and-self-hosting-acceptance.test.ts'), "import { test } from 'node:test'; test('h1 phase', () => {});\n", 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'h1',
          runDir: join(root, '.flowkit', 'runs', 'h1-dedup'),
          producingRunId: '20990101-011-apply',
          selection: h1CliSelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'passed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /diagnostic-cli-process\.test\.ts/);
        assert.doesNotMatch(evidence.checks[0]?.commandOrMethod ?? '', /npm-installed flowkit bin surface/);
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /FLOWKIT_H1_FORMAL_PHASE=26/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the legacy npm-installed diagnostic smoke active for non-H1 tests-cli selection', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'cli'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'diagnostics'), { recursive: true });
      for (const name of [
        'a1-delivery-readiness-and-full-test-behavior.test.ts',
        'b1-delivery-findings-and-corrective-change.test.ts',
        'diagnostic-cli.test.ts',
        'g1-change-cli-end-to-end.test.ts',
        'g1-sync-resume-and-single-action-agent-adapter.test.ts',
        'h1-stable-runner-and-self-hosting-acceptance.test.ts',
      ]) {
        await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      }
      await writeFile(join(root, 'tests', 'integration', 'diagnostic-cli-process.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('executes all four commands without mutating repository files', () => {});",
        "test('executes the npm-installed flowkit bin surface', () => assert.fail('non-H1 legacy installed smoke sentinel'));",
        "test('rejects unknown commands with exit 2 on stderr', () => {});",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'g1',
          runDir: join(root, '.flowkit', 'runs', 'non-h1-installed-smoke'),
          producingRunId: '20990101-013-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /diagnostic-cli-process\.test\.ts/);
        assert.doesNotMatch(evidence.checks[0]?.commandOrMethod ?? '', /FLOWKIT_H1_FORMAL_PHASE/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('propagates a bounded B1 heavy-case failure into the original tests-execution logical evidence for H1', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'services'), { recursive: true });
      for (const name of [
        'f1-archive-and-checkpoint-boundary.test.ts',
        'f1-delivery-finalize-and-git-boundary.test.ts',
      ]) {
        await writeFile(join(root, 'tests', 'integration', name), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      }
      await writeFile(join(root, 'tests', 'unit', 'services', 'b1-run-execution-service.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('creates one Delivery-wide Run then resumes the same pending semantic input', () => assert.fail('H1 B1 bounded worker sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'h1',
          runDir: join(root, '.flowkit', 'runs', 'h1-execution-sentinel'),
          producingRunId: '20990101-012-apply',
          selection: h1ExecutionSelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: {} as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.equal(evidence.checks[0]?.scope, 'tests-execution');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /b1-run-execution-service\.test\.ts/);
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /creates one Delivery-wide Run/);
      } finally {
        if (previousNodeTestContext === undefined) delete process.env['NODE_TEST_CONTEXT'];
        else process.env['NODE_TEST_CONTEXT'] = previousNodeTestContext;
      }
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
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
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

  it('physically executes the B1 corrective public route through tests-cli and fails on its sentinel', async () => {
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
        join(root, 'tests', 'integration', 'a1-delivery-readiness-and-full-test-behavior.test.ts'),
      ]) await writeFile(path, "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'b1-delivery-findings-and-corrective-change.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('b1 route sentinel', () => assert.fail('B1 corrective selected target sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'b1',
          runDir: join(root, '.flowkit', 'runs', 'b1-sentinel'),
          producingRunId: '20990101-008-apply',
          selection: cliOnlySelection(),
          fullTestStatus: 'not-ready',
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: '/fixture/openspec', argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: '/fixture/openspec' } }) } as unknown as OpenSpecCliAdapter,
        });
        assert.equal(evidence.overallStatus, 'failed');
        assert.match(evidence.checks[0]?.commandOrMethod ?? '', /b1-delivery-findings-and-corrective-change\.test\.ts/);
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
      await writePassingCliBoundedTargets(root, executable);

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
          openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: executable, argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: executable } }) } as unknown as OpenSpecCliAdapter,
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

  it('physically executes the C1 external-tool targets through tests-external-tools and fails on its sentinel', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await mkdir(join(root, 'tests', 'unit', 'external-tools'), { recursive: true });
      const integrationTarget = join(root, 'tests', 'integration', 'c1-external-tool-runtime-and-archify-cli-contract.test.ts');
      const unitTarget = join(root, 'tests', 'unit', 'external-tools', 'managed-tool.test.ts');
      await writeFile(integrationTarget, "import { test } from 'node:test'; test('c1 integration ok', () => {});\n", 'utf8');
      await writeFile(unitTarget, "import { test } from 'node:test'; test('managed tool ok', () => {});\n", 'utf8');

      const input = {
        repoRoot: root,
        changeId: 'c1',
        runDir: join(root, '.flowkit', 'runs', 'c1-external-tools'),
        producingRunId: '20990101-010-apply',
        selection: externalToolsSelection(),
        fullTestStatus: 'not-ready' as const,
        openSpecAdapter: {} as OpenSpecCliAdapter,
      };
      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      try {
        const passed = await executeVerificationSelection(input);
        assert.equal(passed.overallStatus, 'passed');
        assert.match(passed.checks[0]?.commandOrMethod ?? '', /c1-external-tool-runtime-and-archify-cli-contract\.test\.ts/);
        assert.match(passed.checks[0]?.commandOrMethod ?? '', /tests\/unit\/external-tools/);

        await writeFile(integrationTarget, [
          "import assert from 'node:assert/strict';",
          "import { test } from 'node:test';",
          "test('C1 external-tool sentinel', () => assert.fail('C1 selected target sentinel'));",
          '',
        ].join('\n'), 'utf8');
        const failed = await executeVerificationSelection(input);
        assert.equal(failed.overallStatus, 'failed');
        assert.match(failed.checks[0]?.commandOrMethod ?? '', /c1-external-tool-runtime-and-archify-cli-contract\.test\.ts/);
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
        openSpecAdapter: { resolveInvocation: async () => ({ toolId: 'openspec', source: 'legacy-compat', command: executable, argsPrefix: [], propagationEnv: { FLOWKIT_OPENSPEC_BIN: executable } }) } as unknown as OpenSpecCliAdapter,
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
      await writePassingExecutionExactTargets(root);
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
  it('physically executes the Reset-added B1 OpenSpec action-context target through tests-execution', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'unit', 'services'), { recursive: true });
      await writePassingExecutionExactTargets(root);
      await writeFile(join(root, 'tests', 'unit', 'services', 'b1-openspec-action-context.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('b1 action-context sentinel', () => assert.fail('b1 action-context sentinel'));",
        '',
      ].join('\n'), 'utf8');

      const previousNodeTestContext = process.env['NODE_TEST_CONTEXT'];
      delete process.env['NODE_TEST_CONTEXT'];
      let evidence;
      try {
        evidence = await executeVerificationSelection({
          repoRoot: root,
          changeId: 'c1-reset',
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
      assert.equal(evidence.checks[0]?.scope, 'tests-execution');
      assert.match(evidence.checks[0]?.commandOrMethod ?? '', /tests\/unit\/services\/b1-openspec-action-context\.test\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('physically executes the new F1 Delivery Finalize integration through tests-execution', async () => {
    const root = await createTempDir();
    try {
      await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
      await writeFile(join(root, 'package.json'), '{"type":"module"}\n', 'utf8');
      await mkdir(join(root, 'tests', 'integration'), { recursive: true });
      await writeFile(join(root, 'tests', 'integration', 'f1-archive-and-checkpoint-boundary.test.ts'), "import { test } from 'node:test'; test('ok', () => {});\n", 'utf8');
      await writeFile(join(root, 'tests', 'integration', 'f1-delivery-finalize-and-git-boundary.test.ts'), [
        "import assert from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "test('f1 finalize execution sentinel', () => assert.fail('f1 finalize sentinel'));",
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
      assert.match(evidence.checks[0]?.commandOrMethod ?? '', /tests\/integration\/f1-delivery-finalize-and-git-boundary\.test\.ts/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
