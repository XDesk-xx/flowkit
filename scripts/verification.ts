import { access, readdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveOpenSpecInvocation } from '../src/integrations/openspec/openspec-executable.js';
import { runCommand as runExternalCommand } from '../src/shared/external-command.js';
import { resolveAffectedTests, resolveAllTests } from './affected-scopes.js';
import { runPlatformCommand } from './platform-command.js';
import type { FullTestProtocolPayload } from '../src/domain/full-test.js';
import { executeBoundedFullTest } from '../src/verification/full-test/executor.js';
import { FULL_TEST_LOGICAL_CHECKS } from '../src/verification/full-test/plan.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDir, '..');

const TEST_BUDGETS = {
  focused: { targetMs: 2_000, warningMs: 5_000 },
  affected: { targetMs: 30_000, warningMs: 60_000 },
  full: { targetMs: 30_000, warningMs: 60_000 },
} as const;

const STEP_BUDGETS: Readonly<Record<string, { targetMs: number; warningMs: number }>> = {
  typecheck: { targetMs: 10_000, warningMs: 20_000 },
  lint: { targetMs: 10_000, warningMs: 20_000 },
  build: { targetMs: 10_000, warningMs: 20_000 },
};

export interface VerificationStep {
  name: string;
  kind: 'npm' | 'openspec';
  args: string[];
}

export function verifyChangePlan(scopes: readonly string[]): VerificationStep[] {
  const hasNone = scopes.includes('none');
  if (scopes.length === 0) throw new Error('verify:change requires at least one scope or none');
  if (hasNone && scopes.length !== 1) throw new Error('none cannot be combined with affected scopes');
  return [
    { name: 'quality', kind: 'npm', args: ['run', 'quality'] },
    ...(hasNone ? [] : [{ name: 'affected', kind: 'npm' as const, args: ['run', 'test:affected', '--', ...scopes] }]),
    { name: 'typecheck', kind: 'npm', args: ['run', 'typecheck'] },
    { name: 'lint', kind: 'npm', args: ['run', 'lint'] },
    { name: 'build', kind: 'npm', args: ['run', 'build'] },
    { name: 'openspec-change', kind: 'openspec', args: ['validate', '<active-change>', '--strict', '--no-interactive'] },
    { name: 'openspec-specs', kind: 'openspec', args: ['validate', '--specs', '--strict', '--no-interactive'] },
  ];
}

export function verifyFullPlan(): VerificationStep[] {
  return FULL_TEST_LOGICAL_CHECKS.map((check) => ({
    name: check.id,
    kind: check.id === 'openspec-all' ? 'openspec' as const : 'npm' as const,
    args: check.id === 'openspec-all'
      ? ['validate', '--all', '--strict', '--no-interactive']
      : ['run', check.id === 'full' ? 'test:full' : check.id],
  }));
}

function environmentLine(): string {
  return `environment: platform=${process.platform} arch=${process.arch} node=${process.version}`;
}

function timingMessage(label: string, durationMs: number, targetMs: number, warningMs: number): void {
  const seconds = (durationMs / 1_000).toFixed(3);
  console.log(`timing: ${label} duration=${seconds}s target=${(targetMs / 1_000).toFixed(0)}s warning=${(warningMs / 1_000).toFixed(0)}s`);
  if (durationMs > warningMs) {
    console.warn(`warning: timing-budget ${label} duration=${seconds}s exceeded warning=${(warningMs / 1_000).toFixed(0)}s`);
  }
}

async function validateFocusedFiles(inputs: readonly string[]): Promise<string[]> {
  if (inputs.length === 0) throw new Error('test:focused requires at least one tests/**/*.test.ts file');
  const selected = new Set<string>();
  for (const input of inputs) {
    const normalized = input.split('\\').join('/');
    if (!normalized.startsWith('tests/') || !normalized.endsWith('.test.ts')) {
      throw new Error(`invalid focused test path: ${input}`);
    }
    const absolute = resolve(projectRoot, normalized);
    const rel = relative(projectRoot, absolute);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new Error(`focused test escapes repository root: ${input}`);
    }
    await access(absolute, constants.R_OK);
    selected.add(rel.split(sep).join('/'));
  }
  return [...selected].sort((a, b) => a.localeCompare(b));
}

async function runNodeTests(
  files: readonly string[],
  concurrency: 1 | 2 | 4,
  label: 'focused' | 'affected' | 'full',
  env: NodeJS.ProcessEnv = standaloneProjectEnv(),
): Promise<number> {
  if (files.length === 0) throw new Error(`${label} resolved no tests`);
  console.log(environmentLine());
  console.log(`tests: layer=${label} files=${files.length} concurrency=${concurrency}`);

  const processHeavy = new Set([
    'tests/integration/diagnostic-cli-process.test.ts',
    'tests/integration/verification-commands.test.ts',
  ]);
  const batches = label === 'full'
    ? [
        ...files.filter((file) => processHeavy.has(file)).map((file) => [file]),
        files.filter((file) => !processHeavy.has(file)),
      ].filter((batch) => batch.length > 0)
    : [[...files]];

  const started = process.hrtime.bigint();
  for (const [index, batch] of batches.entries()) {
    if (batches.length > 1) console.log(`tests: full-batch=${index + 1}/${batches.length} files=${batch.length}`);
    const result = await runPlatformCommand(
      process.execPath,
      ['--import', 'tsx', '--test', `--test-concurrency=${concurrency}`, ...batch],
      { cwd: projectRoot, env, stdio: 'inherit' },
    );
    if (result.exitCode !== 0) return result.exitCode;
  }

  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const budget = TEST_BUDGETS[label];
  timingMessage(`${label}-tests`, durationMs, budget.targetMs, budget.warningMs);
  return 0;
}

async function activeChangeId(): Promise<string> {
  const root = resolve(projectRoot, 'openspec/changes');
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length !== 1) throw new Error(`expected exactly one active OpenSpec change, found ${candidates.length}`);
  return candidates[0]!;
}

function standaloneProjectEnv(): NodeJS.ProcessEnv {
  const npmExecPath = process.env.npm_execpath;
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().startsWith('npm_') || key === 'INIT_CWD') delete env[key];
  }
  if (npmExecPath) env.FLOWKIT_NPM_EXEC_PATH = npmExecPath;
  return env;
}


async function resolvedProjectOpenSpecInvocation() {
  return resolveOpenSpecInvocation({ env: process.env, platform: process.platform });
}

function applyOpenSpecPropagation(env: NodeJS.ProcessEnv, propagation: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  delete env['FLOWKIT_OPENSPEC_BIN'];
  delete env['FLOWKIT_HOME'];
  return { ...env, ...propagation };
}

export async function fullTestEnvironment(): Promise<NodeJS.ProcessEnv> {
  const invocation = await resolvedProjectOpenSpecInvocation();
  return applyOpenSpecPropagation(standaloneProjectEnv(), invocation.propagationEnv);
}

function writeCapturedOutput(stdout: string, stderr: string): void {
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
}

export async function executeProjectStep(
  step: VerificationStep,
): Promise<{ exitCode: number; durationMs: number }> {
  const sharedFullCheck = FULL_TEST_LOGICAL_CHECKS.find((candidate) => candidate.id === step.name);
  if (sharedFullCheck !== undefined) {
    const result = await executeBoundedFullTest(projectRoot, {
      id: 'technical-full-test-step',
      kind: 'bounded-command-plan',
      logicalChecks: [sharedFullCheck],
      scope: 'delivery',
      resultProtocol: 'flowkit-full-test-result-v1',
      resultAuthority: 'verification',
      expectedTerminalStatuses: ['passed', 'failed'],
    }, { env: process.env });
    if (result.kind === 'execution-error') return { exitCode: 2, durationMs: 0 };
    const check = result.payload.checks[0];
    return { exitCode: check?.status === 'passed' ? 0 : 1, durationMs: check?.durationMs ?? result.payload.totalDurationMs };
  }
  if (step.kind === 'openspec') {
    const args = [...step.args];
    const index = args.indexOf('<active-change>');
    if (index !== -1) args[index] = await activeChangeId();
    const invocation = await resolvedProjectOpenSpecInvocation();
    const started = process.hrtime.bigint();
    const outcome = await runExternalCommand(invocation.command, [...invocation.argsPrefix, ...args], {
      cwd: projectRoot,
      env: applyOpenSpecPropagation({ ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, invocation.propagationEnv),
      platform: process.platform,
    });
    writeCapturedOutput(outcome.stdout, outcome.stderr);
    return {
      exitCode: outcome.exitCode,
      durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
    };
  }

  switch (step.name) {
    case 'affected': {
      const separator = step.args.indexOf('--');
      const scopes = separator === -1 ? [] : step.args.slice(separator + 1);
      const started = process.hrtime.bigint();
      const exitCode = await runNodeTests(await resolveAffectedTests(projectRoot, scopes), 2, 'affected');
      return { exitCode, durationMs: Number(process.hrtime.bigint() - started) / 1_000_000 };
    }
    default:
      throw new Error(`unsupported verification step: ${step.name}`);
  }
}

export type VerificationStepExecutor = (step: VerificationStep) => Promise<{ exitCode: number; durationMs: number }>;

export async function runVerificationPlanDetailed(
  plan: readonly VerificationStep[],
  executeStep: VerificationStepExecutor = executeProjectStep,
): Promise<{ readonly exitCode: number; readonly payload: FullTestProtocolPayload }> {
  console.log(environmentLine());
  const started = process.hrtime.bigint();
  const checks: { id: string; status: 'passed' | 'failed'; durationMs: number }[] = [];
  let exitCode = 0;
  for (const step of plan) {
    console.log(`step: ${step.name} status=running`);
    const result = await executeStep(step);
    const status = result.exitCode === 0 ? 'passed' : 'failed';
    const durationMs = Math.max(0, Math.round(result.durationMs));
    checks.push({ id: step.name, status, durationMs });
    const duration = (result.durationMs / 1_000).toFixed(3);
    console.log(`step: ${step.name} status=${status} duration=${duration}s`);
    const budget = STEP_BUDGETS[step.name];
    if (budget) timingMessage(step.name, result.durationMs, budget.targetMs, budget.warningMs);
    if (result.exitCode !== 0) { exitCode = result.exitCode; break; }
  }
  const totalDurationMs = Math.max(0, Math.round(Number(process.hrtime.bigint() - started) / 1_000_000));
  const status: 'passed' | 'failed' = exitCode === 0 ? 'passed' : 'failed';
  return {
    exitCode,
    payload: {
      schemaVersion: 1,
      status,
      summary: status === 'passed' ? 'all full-test checks passed' : 'full-test check failed',
      totalDurationMs,
      checks,
    },
  };
}

export async function runVerificationPlan(
  plan: readonly VerificationStep[],
  executeStep: VerificationStepExecutor = executeProjectStep,
): Promise<number> {
  return (await runVerificationPlanDetailed(plan, executeStep)).exitCode;
}

async function publishFullTestProtocol(path: string, payload: FullTestProtocolPayload): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, path);
}

export type VerificationPlanDetailedRunner = typeof runVerificationPlanDetailed;

export async function main(argv = process.argv.slice(2), runDetailed: VerificationPlanDetailedRunner = runVerificationPlanDetailed): Promise<number> {
  const [mode, ...args] = argv;
  switch (mode) {
    case 'test:focused':
      return runNodeTests(await validateFocusedFiles(args), 1, 'focused');
    case 'test:affected':
      return runNodeTests(await resolveAffectedTests(projectRoot, args), 2, 'affected');
    case 'test:full':
      return runNodeTests(await resolveAllTests(projectRoot), 4, 'full', await fullTestEnvironment());
    case 'verify:change':
      return runVerificationPlan(verifyChangePlan(args));
    case 'verify:full': {
      const result = await runDetailed(verifyFullPlan());
      const resultPath = process.env['FLOWKIT_FULL_TEST_RESULT_PATH'];
      if (resultPath !== undefined) await publishFullTestProtocol(resultPath, result.payload);
      return result.exitCode;
    }
    case 'verify:step': {
      if (args.length !== 1) throw new Error('verify:step requires exactly one full-plan step name');
      const step = verifyFullPlan().find((candidate) => candidate.name === args[0]);
      if (!step) throw new Error(`unknown verify:step: ${args[0]}`);
      return runVerificationPlan([step]);
    }
    default:
      throw new Error('usage: verification.ts test:focused|test:affected|test:full|verify:change|verify:full|verify:step [...]');
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
