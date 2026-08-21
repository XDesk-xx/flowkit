import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import type { BoundedFullTestLogicalCheck } from '../../domain/full-test.js';
import { resolveOpenSpecInvocation } from '../../integrations/openspec/openspec-executable.js';
import { FlowkitError } from '../../shared/errors.js';

export interface FullTestPhysicalTarget {
  readonly logicalCheckId: string;
  readonly physicalTargetId: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

export interface ResolvedFullTestLogicalCheck {
  readonly check: BoundedFullTestLogicalCheck;
  readonly targets: readonly FullTestPhysicalTarget[];
  readonly cleanupPaths: readonly string[];
}


async function collectTestFiles(root: string, relativeDirectory: string): Promise<string[]> {
  const absoluteDirectory = resolve(root, relativeDirectory);
  let entries;
  try { entries = await readdir(absoluteDirectory, { withFileTypes: true }); }
  catch { return []; }
  const results: string[] = [];
  for (const entry of entries) {
    const childRelative = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) results.push(...await collectTestFiles(root, childRelative));
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) results.push(childRelative.split(sep).join('/'));
  }
  return results;
}

export async function resolveAllFullTestFiles(root: string): Promise<string[]> {
  const files = [...await collectTestFiles(root, 'tests/unit'), ...await collectTestFiles(root, 'tests/integration')];
  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

const DIAGNOSTIC = 'tests/integration/diagnostic-cli-process.test.ts';
const G1_CHANGE = 'tests/integration/g1-change-cli-end-to-end.test.ts';
const G1_ADAPTER = 'tests/integration/g1-sync-resume-and-single-action-agent-adapter.test.ts';
const H1 = 'tests/integration/h1-stable-runner-and-self-hosting-acceptance.test.ts';
const B1 = 'tests/unit/services/b1-run-execution-service.test.ts';

export const FULL_TEST_HEAVY_OVERRIDE_FILES = [DIAGNOSTIC, G1_CHANGE, G1_ADAPTER, H1, B1] as const;

const DIAGNOSTIC_CASES = [
  'executes all four commands without mutating repository files',
  'executes the npm-installed flowkit bin surface',
  'rejects unknown commands with exit 2 on stderr',
] as const;

const G1_CHANGE_CASES = [
  'drives the happy lifecycle through real archive, verify projection, completion and checkpoint readiness without a Git checkpoint',
  'keeps non-author blockers out of revise while explicit review creates direct same-stage re-review; author blockers permit revise',
  'fails closed for stale review target and missing Owner activation',
  'exact-resumes the same pending Run after a future-Delivery fresh clone with no chat/provider state',
  'keeps changed-surface outcome-unknown archive pending and resumes the same generation after explicit recovery admission',
  'projects not-published Verification from structured authority and fails closed when OpenSpec projection is unavailable',
  'records Change Verification failure through apply admission instead of fabricating success',
] as const;

const G1_ADAPTER_CASES = [
  'replays the real F1 retry+archive terminal and fails closed on ambiguous/corrupt archived authority',
  'keeps historical E1 selection/evidence point-in-time even when the current Catalog fingerprint differs',
  'fresh-clones a different future Delivery, resumes one exact pending Action, rebuilds context, and does not auto-next',
] as const;

const H1_SMOKE_CASE = 'physically installs the candidate runner and exercises fresh-process diagnostics without source-workspace runtime';
const H1_E2E_CASE = 'uses one independently installed Flowkit distribution to manage a future Delivery end to end and resume it from a fresh checkout';

const B1_SUITE_PATTERNS = [
  'I1 Proposal archive-sync admission wiring',
  'E1 new preparation boundary',
  'E2 post-checkpoint three-file writer',
  'I1 exact-candidate re-verification lifecycle',
  'B1 fixed ActionDefinition catalog',
  'D2 archive terminal continuation regressions',
  'D1 structured Owner facts and reset-aware lineage',
] as const;

const B1_PREPARATION_CASES = [
  'creates one Delivery-wide Run then resumes the same pending semantic input',
  'fails closed on contractRef version drift without publishing a second pending Run',
  'admits logical result after legitimate Action output mutation and Core derives artifact refs',
  'keeps blocked next while explicit review creates a new same-stage Reviewer generation',
  'failed execution retries as a new Run/NNN without provider-session identity',
  'Apply package carries exact Owner ref and remains Change-only/minimal',
  'rejects a tampered contractRef even when caller preserves the old fingerprint',
  'rejects tampered authority identity outside contractRefs before terminal publication',
  'still fails closed when immutable approved proposal content drifts during pending Apply',
  'resumes the same pending Apply after Action-owned tasks and verification progress',
  'resumes the same pending revise-apply after its own tasks and verification mutations',
  'fails closed when pending review-explore target bytes drift outside Reviewer mutation boundary',
  'fails closed when pending review-propose target bytes drift outside Reviewer mutation boundary',
  'resumes the exact pending archive after Action-owned OpenSpec relocation',
  'resumes the exact pending archive after Action-owned Change completed progress',
  'does not create a new archive Run after completion when no pending archive identity exists',
  'keeps current C1 self-archive resumable after canonical spec merge and active root relocation',
  'admits terminal result for the exact persisted pending archive after Change completed progress',
  'rejects fabricated completed archive admission when the persisted pending identity is gone',
  'keeps non-archive terminal admission bound to the active Change',
  'projects the same persisted pending archive through inspect/status/doctor/resume-context after completion',
  'keeps completed diagnostics at none when no pending archive exists',
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function standaloneEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const npmExecPath = base['npm_execpath'];
  const env: NodeJS.ProcessEnv = { ...base, FORCE_COLOR: '0', NO_COLOR: '1' };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_') || key === 'INIT_CWD') delete env[key];
  }
  if (npmExecPath !== undefined && npmExecPath !== '') env['FLOWKIT_NPM_EXEC_PATH'] = npmExecPath;
  return env;
}

async function managedEnvironment(base: NodeJS.ProcessEnv): Promise<{ env: NodeJS.ProcessEnv; openspec: Awaited<ReturnType<typeof resolveOpenSpecInvocation>> }> {
  const openspec = await resolveOpenSpecInvocation({ env: base, platform: process.platform });
  const env = standaloneEnvironment(base);
  delete env['FLOWKIT_OPENSPEC_BIN'];
  delete env['FLOWKIT_HOME'];
  return { env: { ...env, ...openspec.propagationEnv }, openspec };
}

function nodeTarget(input: {
  logicalCheckId: string;
  physicalTargetId: string;
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  file?: string;
  files?: readonly string[];
  testNamePattern?: string;
  extraEnv?: Readonly<NodeJS.ProcessEnv>;
}): FullTestPhysicalTarget {
  const files = input.files ?? (input.file === undefined ? [] : [input.file]);
  return {
    logicalCheckId: input.logicalCheckId,
    physicalTargetId: input.physicalTargetId,
    command: process.execPath,
    args: [
      '--import', 'tsx', '--test', '--test-concurrency=1',
      ...(input.testNamePattern === undefined ? [] : [`--test-name-pattern=${input.testNamePattern}`]),
      ...files,
    ],
    env: { ...input.env, ...(input.extraEnv ?? {}) },
  };
}

function assertExactStaticCases(source: string, path: string, expected: readonly string[]): void {
  const actual = [...source.matchAll(/\bit\('([^']+)'/g)].map((match) => match[1]!);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', `heavy override case titles drifted for ${path}`, { expected, actual });
  }
}

function assertB1Closure(source: string): void {
  const topSuites = [...source.matchAll(/^describe\('([^']+)'/gm)].map((match) => match[1]!);
  const expectedSuites = [...B1_SUITE_PATTERNS, 'B1 preparation and admission'];
  if (JSON.stringify([...topSuites].sort()) !== JSON.stringify([...expectedSuites].sort())) {
    throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'B1 heavy override suite titles drifted', { expectedSuites, topSuites });
  }
  const preparationStart = source.indexOf("describe('B1 preparation and admission'");
  const nextSuite = source.indexOf("describe('D1 structured Owner facts and reset-aware lineage'", preparationStart);
  if (preparationStart < 0 || nextSuite < 0) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'B1 preparation suite boundaries are unavailable');
  const preparationSource = source.slice(preparationStart, nextSuite);
  const actualCases = [...preparationSource.matchAll(/\bit\('([^']+)'/g)].map((match) => match[1]!);
  if (JSON.stringify([...actualCases].sort()) !== JSON.stringify([...B1_PREPARATION_CASES].sort())) {
    throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'B1 preparation case titles drifted', { expected: B1_PREPARATION_CASES, actual: actualCases });
  }
}

function assertH1Closure(source: string): void {
  const defaults = [...source.matchAll(/\bit\('([^']+)'/g)].map((match) => match[1]!);
  if (JSON.stringify([...defaults].sort()) !== JSON.stringify([H1_SMOKE_CASE, H1_E2E_CASE].sort())) {
    throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'H1 default case titles drifted', { defaults });
  }
  const markers = [
    "process.env['FLOWKIT_H1_FORMAL_PHASE']",
    "process.env['FLOWKIT_H1_FORMAL_STATE_ROOT']",
    'if (Number.isInteger(formalPhase))',
    'await runSelfHostingPhase(formalPhase, formalStateRoot)',
    'return;',
    'for (let phase = 1; phase <= 26; phase += 1) await runSelfHostingPhase(phase, stateRoot);',
  ];
  for (const marker of markers) {
    if (!source.includes(marker)) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'H1 formal branch drifted', { marker });
  }
}

async function resolveFullTargets(repoRoot: string, check: BoundedFullTestLogicalCheck, env: NodeJS.ProcessEnv): Promise<ResolvedFullTestLogicalCheck> {
  const discovered = await resolveAllFullTestFiles(repoRoot);
  const discoveredSet = new Set(discovered);
  for (const heavy of FULL_TEST_HEAVY_OVERRIDE_FILES) {
    if (!discoveredSet.has(heavy)) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', `heavy override file missing: ${heavy}`);
  }

  const sourceByHeavy = new Map<string, string>();
  for (const heavy of FULL_TEST_HEAVY_OVERRIDE_FILES) sourceByHeavy.set(heavy, await readFile(join(repoRoot, heavy), 'utf8'));
  assertExactStaticCases(sourceByHeavy.get(DIAGNOSTIC)!, DIAGNOSTIC, DIAGNOSTIC_CASES);
  assertExactStaticCases(sourceByHeavy.get(G1_CHANGE)!, G1_CHANGE, G1_CHANGE_CASES);
  assertExactStaticCases(sourceByHeavy.get(G1_ADAPTER)!, G1_ADAPTER, G1_ADAPTER_CASES);
  assertH1Closure(sourceByHeavy.get(H1)!);
  assertB1Closure(sourceByHeavy.get(B1)!);

  const targets: FullTestPhysicalTarget[] = [];
  const ordinary = discovered.filter((file) => !(FULL_TEST_HEAVY_OVERRIDE_FILES as readonly string[]).includes(file));
  for (const file of ordinary) {
    targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `ordinary:${file}`, repoRoot, env, file }));
  }
  for (const [index, title] of DIAGNOSTIC_CASES.entries()) targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `diagnostic:${index + 1}`, repoRoot, env, file: DIAGNOSTIC, testNamePattern: escapeRegex(title) }));
  for (const [index, title] of G1_CHANGE_CASES.entries()) targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `g1-change:${index + 1}`, repoRoot, env, file: G1_CHANGE, testNamePattern: escapeRegex(title) }));
  for (const [index, title] of G1_ADAPTER_CASES.entries()) targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `g1-adapter:${index + 1}`, repoRoot, env, file: G1_ADAPTER, testNamePattern: escapeRegex(title) }));
  targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: 'h1:installed-runner-smoke', repoRoot, env, file: H1, testNamePattern: escapeRegex(H1_SMOKE_CASE) }));

  const stateRoot = await mkdtemp(join(tmpdir(), 'flowkit-full-test-h1-'));
  for (let phase = 1; phase <= 26; phase += 1) {
    targets.push(nodeTarget({
      logicalCheckId: check.id,
      physicalTargetId: `h1:e2e-phase-${phase}`,
      repoRoot,
      env,
      file: H1,
      extraEnv: { FLOWKIT_H1_FORMAL_PHASE: String(phase), FLOWKIT_H1_FORMAL_STATE_ROOT: stateRoot },
    }));
  }
  for (const [index, suite] of B1_SUITE_PATTERNS.entries()) targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `b1:suite-${index + 1}`, repoRoot, env, file: B1, testNamePattern: escapeRegex(suite) }));
  for (const [index, title] of B1_PREPARATION_CASES.entries()) targets.push(nodeTarget({ logicalCheckId: check.id, physicalTargetId: `b1:preparation-${index + 1}`, repoRoot, env, file: B1, testNamePattern: escapeRegex(title) }));

  const coveredFiles = new Set(targets.flatMap((target) => {
    const testFiles = target.args.filter((arg) => arg.startsWith('tests/') && arg.endsWith('.test.ts'));
    return testFiles;
  }));
  const missing = discovered.filter((file) => !coveredFiles.has(file));
  const extra = [...coveredFiles].filter((file) => !discoveredSet.has(file));
  if (missing.length > 0 || extra.length > 0) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'full test file partition is not coverage-complete', { missing, extra });

  const physicalIds = targets.map((target) => target.physicalTargetId);
  if (new Set(physicalIds).size !== physicalIds.length) throw new FlowkitError('FULL_TEST_RESOLVER_CLOSURE_FAILED', 'full test physical target ids overlap');
  return { check, targets, cleanupPaths: [stateRoot] };
}

export async function resolveFullTestLogicalCheck(
  repoRoot: string,
  check: BoundedFullTestLogicalCheck,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedFullTestLogicalCheck> {
  const managed = await managedEnvironment(baseEnv);
  const env = managed.env;
  switch (check.resolverId) {
    case 'flowkit-quality':
      return { check, targets: [{ logicalCheckId: check.id, physicalTargetId: 'quality', command: process.execPath, args: ['--import', 'tsx', 'scripts/quality.ts'], env: { ...env } }], cleanupPaths: [] };
    case 'flowkit-typecheck': {
      const tsc = resolve(repoRoot, 'node_modules/typescript/bin/tsc');
      return { check, targets: [
        { logicalCheckId: check.id, physicalTargetId: 'typecheck:source', command: process.execPath, args: [tsc, '--noEmit'], env: { ...env } },
        { logicalCheckId: check.id, physicalTargetId: 'typecheck:tests', command: process.execPath, args: [tsc, '--noEmit', '-p', 'tsconfig.test.json'], env: { ...env } },
      ], cleanupPaths: [] };
    }
    case 'flowkit-lint':
      return { check, targets: [{ logicalCheckId: check.id, physicalTargetId: 'lint', command: process.execPath, args: [resolve(repoRoot, 'node_modules/eslint/bin/eslint.js'), '.'], env: { ...env } }], cleanupPaths: [] };
    case 'flowkit-build':
      return { check, targets: [{ logicalCheckId: check.id, physicalTargetId: 'build', command: process.execPath, args: [resolve(repoRoot, 'node_modules/typescript/bin/tsc')], env: { ...env } }], cleanupPaths: [] };
    case 'flowkit-openspec-all':
      return { check, targets: [{ logicalCheckId: check.id, physicalTargetId: 'openspec-all', command: managed.openspec.command, args: [...managed.openspec.argsPrefix, 'validate', '--all', '--strict', '--no-interactive'], env: { ...env } }], cleanupPaths: [] };
    case 'flowkit-full-tests':
      return resolveFullTargets(repoRoot, check, env);
    default:
      throw new FlowkitError('FULL_TEST_RESOLVER_UNKNOWN', `unknown Full Test resolver ${String(check.resolverId)}`);
  }
}
