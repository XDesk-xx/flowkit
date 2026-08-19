import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '../..');
const fixtureRoot = join(projectRoot, 'tests', 'fixtures', 'h1-stable-runner-and-self-hosting-acceptance');
const flowkitHome = process.env['FLOWKIT_HOME'];
const roots: string[] = [];

interface ProcResult { readonly code: number; readonly stdout: string; readonly stderr: string; readonly durationMs: number }
interface InstalledRunner { readonly consumerRoot: string; readonly packageRoot: string; readonly binPath: string; readonly packSize: number; readonly unpackedSize: number; readonly fileCount: number; readonly runCli: (input: { argv: readonly string[]; cwd: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }> }

function requiredFlowkitHome(): string {
  assert.ok(flowkitHome, 'H1 requires exact managed FLOWKIT_HOME with offline OpenSpec/Archify');
  return flowkitHome;
}

async function tempRoot(prefix: string): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await exec('git', [...args], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  return result.stdout.trim();
}

async function runNode(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<ProcResult> {
  const started = performance.now();
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd,
      env: { ...process.env, ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code: code ?? -1, stdout, stderr, durationMs: performance.now() - started }));
  });
}

async function extractNpmPackage(tarball: string, packageRoot: string): Promise<void> {
  const archive = gunzipSync(await readFile(tarball));
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const readText = (start: number, length: number) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/u, '');
    const name = readText(0, 100);
    const prefix = readText(345, 155);
    const fullName = prefix === '' ? name : `${prefix}/${name}`;
    const sizeText = readText(124, 12).trim();
    const size = sizeText === '' ? 0 : Number.parseInt(sizeText, 8);
    const type = String.fromCharCode(header[156] ?? 0);
    const relative = fullName === 'package' ? '' : fullName.startsWith('package/') ? fullName.slice('package/'.length) : fullName;
    const bodyStart = offset + 512;
    if (relative !== '') {
      const target = join(packageRoot, relative);
      if (type === '5') await mkdir(target, { recursive: true });
      else if (type === '0' || type === '\0') {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, archive.subarray(bodyStart, bodyStart + size));
      } else {
        assert.fail(`unsupported npm package tar entry type ${JSON.stringify(type)} for ${fullName}`);
      }
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
}

async function loadInstalledRunner(stateRoot: string): Promise<InstalledRunner> {
  const consumerRoot = join(stateRoot, 'consumer');
  const packageRoot = join(consumerRoot, 'node_modules', 'flowkit');
  const metadata = JSON.parse(await readFile(join(stateRoot, 'runner-metadata.json'), 'utf8')) as {
    packSize: number;
    unpackedSize: number;
    fileCount: number;
  };
  const binPath = join(packageRoot, 'dist', 'bin', 'flowkit.js');
  const cliFacadePath = join(packageRoot, 'dist', 'cli', 'main.js');
  assert.equal((await stat(binPath)).isFile(), true);
  assert.equal((await stat(cliFacadePath)).isFile(), true);
  assert.equal(binPath.startsWith(projectRoot), false, 'installed runner must not resolve into source workspace');
  const cliModule = await import(pathToFileURL(cliFacadePath).href) as { runCli: (input: { argv: readonly string[]; cwd: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }> };
  return { consumerRoot, packageRoot, binPath, ...metadata, runCli: cliModule.runCli };
}

async function installCandidateAt(stateRoot: string): Promise<InstalledRunner> {
  await mkdir(stateRoot, { recursive: true });
  let started = performance.now();
  await exec('npm', ['run', 'build'], { cwd: projectRoot, env: { ...process.env, FLOWKIT_HOME: requiredFlowkitHome() }, maxBuffer: 20 * 1024 * 1024 });
  if (process.env['FLOWKIT_H1_TIMING'] === '1') console.log(`# H1 install build ${(performance.now() - started).toFixed(1)}ms`);
  started = performance.now();
  const packRoot = join(stateRoot, 'pack');
  await rm(packRoot, { recursive: true, force: true });
  await mkdir(packRoot, { recursive: true });
  const packed = await exec('npm', ['pack', '--json', '--pack-destination', packRoot], { cwd: projectRoot, maxBuffer: 20 * 1024 * 1024 });
  if (process.env['FLOWKIT_H1_TIMING'] === '1') console.log(`# H1 install pack ${(performance.now() - started).toFixed(1)}ms`);
  const metadata = JSON.parse(packed.stdout) as Array<{ filename: string; size: number; unpackedSize: number; files: unknown[] }>;
  assert.equal(metadata.length, 1);
  const item = metadata[0]!;
  const tarball = join(packRoot, item.filename);
  const consumerRoot = join(stateRoot, 'consumer');
  await rm(consumerRoot, { recursive: true, force: true });
  await mkdir(join(consumerRoot, 'node_modules', 'flowkit'), { recursive: true });
  await writeFile(join(consumerRoot, 'package.json'), '{"name":"h1-independent-consumer","private":true,"type":"module"}\n', 'utf8');
  await extractNpmPackage(tarball, join(consumerRoot, 'node_modules', 'flowkit'));
  await writeFile(join(stateRoot, 'runner-metadata.json'), `${JSON.stringify({ packSize: item.size, unpackedSize: item.unpackedSize, fileCount: item.files.length })}\n`, 'utf8');
  return loadInstalledRunner(stateRoot);
}

async function installCandidate(): Promise<InstalledRunner> {
  const stateRoot = await tempRoot('flowkit-h1-install-');
  return installCandidateAt(stateRoot);
}

async function installedCli(runner: InstalledRunner, repoRoot: string, args: readonly string[]): Promise<ProcResult> {
  return runNode([runner.binPath, ...args], repoRoot, { FLOWKIT_HOME: requiredFlowkitHome() });
}

function installedProcessCli(runner: InstalledRunner, repoRoot: string, args: readonly string[]): Promise<ProcResult> {
  return runNode([runner.binPath, ...args], repoRoot, { FLOWKIT_HOME: requiredFlowkitHome() });
}

function json(result: ProcResult): Record<string, unknown> {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

async function jsonFile(root: string, name: string, value: unknown): Promise<string> {
  const path = join(root, '.h1-inputs', name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

const completed = (summary: string) => ({ executionStatus: 'completed', summary });
const approved = (summary: string) => ({ executionStatus: 'completed', summary, reviewVerdict: 'approved', reviewFindings: [], reviewFindingConvergence: [] });

async function admit(runner: InstalledRunner, root: string, action: 'explore' | 'review' | 'propose' | 'apply', payload: unknown, suffix: string): Promise<Record<string, unknown>> {
  const resultPath = await jsonFile(root, `result-${suffix}.json`, payload);
  return json(await installedCli(runner, root, [action, '--result', resultPath]));
}

async function copyExploreArtifact(root: string, changeId: string): Promise<void> {
  const source = join(fixtureRoot, 'change-template');
  const target = join(root, 'openspec', 'changes', changeId);
  await writeFile(join(target, 'explore.md'), await readFile(join(source, 'explore.md'), 'utf8'), 'utf8');
}

async function copyProposalArtifacts(root: string, changeId: string, capabilityId: string): Promise<void> {
  const source = join(fixtureRoot, 'change-template');
  const target = join(root, 'openspec', 'changes', changeId);
  await writeFile(join(target, 'proposal.md'), (await readFile(join(source, 'proposal.md'), 'utf8')).replaceAll('__CAPABILITY_ID__', capabilityId), 'utf8');
  await writeFile(join(target, 'design.md'), (await readFile(join(source, 'design.md'), 'utf8')).replaceAll('__CHANGE_ID__', changeId), 'utf8');
  await writeFile(join(target, 'tasks.md'), await readFile(join(source, 'tasks.md'), 'utf8'), 'utf8');
  await mkdir(join(target, 'specs', capabilityId), { recursive: true });
  await writeFile(
    join(target, 'specs', capabilityId, 'spec.md'),
    (await readFile(join(source, 'specs', 'flowkit-h1-future-fixture', 'spec.md'), 'utf8')).replaceAll('__CAPABILITY_ID__', capabilityId),
    'utf8',
  );
}

async function writeArchitecture(root: string, deliveryId: string, kind: 'current' | 'planned' | 'actual', revision: string): Promise<void> {
  const architecture = JSON.parse(await readFile(join(fixtureRoot, 'architecture-template.json'), 'utf8')) as Record<string, unknown>;
  const meta = architecture['meta'] as Record<string, unknown>;
  meta['title'] = `H1 future fixture ${kind} Architecture`;
  meta['subtitle'] = `${kind} authored as disposable H1 external input`;
  meta['repository'] = { url: 'https://github.com/XDesk-xx/flowkit-h1-fixture', revision };
  meta['output'] = `${kind}.html`;
  for (const component of architecture['components'] as Array<Record<string, unknown>>) {
    for (const source of (component['sources'] as Array<Record<string, unknown>> | undefined) ?? []) {
      if (source['path'] === 'openspec/delivery-groups/20260817-01-delivery-execution-loop.yaml') {
        source['path'] = kind === 'actual' ? `openspec/delivery-groups/${deliveryId}.yaml` : 'src/policy/unified-entry.ts';
      }
    }
  }
  if (kind === 'actual') {
    const first = (architecture['components'] as Array<Record<string, unknown>>)[0];
    if (first !== undefined) first['sublabel'] = 'H1 final';
  }
  const path = join(root, 'architecture', deliveryId, 'json', `${kind}.architecture.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(architecture, null, 2)}\n`, 'utf8');
}

async function exactArchifyValidate(root: string, architecturePath: string): Promise<void> {
  const entry = join(requiredFlowkitHome(), 'tools', 'archify', '2.14.0', 'runtime', 'archify', 'bin', 'archify.mjs');
  const result = await runNode([entry, 'validate', 'architecture', architecturePath, '--repo-root', root, '--json'], root, { FLOWKIT_HOME: requiredFlowkitHome() });
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal((JSON.parse(result.stdout) as Record<string, unknown>)['ok'], true);
}

async function applyCheckpointPlan(root: string, handoff: Record<string, unknown>): Promise<void> {
  const normalization = handoff['normalization'] as { operations: Array<{ path: string; operations: string[] }> };
  for (const item of normalization.operations) {
    const path = join(root, item.path);
    let text = await readFile(path, 'utf8');
    for (const operation of item.operations) {
      if (operation === 'collapse-redundant-eof-blank-lines') text = text.replace(/\n+$/u, '\n');
      else if (operation === 'ensure-exactly-one-final-newline') text = `${text.replace(/\n*$/u, '')}\n`;
      else assert.fail(`unexpected normalization operation: ${operation}`);
    }
    await writeFile(path, text, 'utf8');
  }
  await git(root, ['diff', '--check']);
  await git(root, ['add', '.']);
  await git(root, ['diff', '--cached', '--check']);
  const subject = String(handoff['subject']);
  const trailers = handoff['trailers'] as string[];
  await git(root, ['commit', '-m', subject, '-m', trailers.join('\n')]);
}

async function countRunDirectories(root: string, deliveryId: string): Promise<number> {
  const base = join(root, '.flowkit', 'runs', deliveryId);
  let total = 0;
  async function walk(path: string, depth: number): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const next = join(path, entry.name);
      if (depth === 1 && /^\d{8}-\d{3}-/.test(entry.name)) total += 1;
      else await walk(next, depth + 1);
    }
  }
  await walk(base, 0);
  return total;
}

async function runExploreAction(
  runner: InstalledRunner,
  root: string,
  changeId: string,
  suffix: string,
): Promise<void> {
  json(await installedCli(runner, root, ['activate', '--change', changeId, '--source-ref', `owner:h1:${suffix}:activate`, '--spec-delta-mode', 'required']));
  json(await installedCli(runner, root, ['explore']));
  await copyExploreArtifact(root, changeId);
  await admit(runner, root, 'explore', completed(`${suffix} explored`), `${suffix}-explore`);
}

async function runReviewAction(
  runner: InstalledRunner,
  root: string,
  summary: string,
  resultSuffix: string,
): Promise<void> {
  json(await installedCli(runner, root, ['review']));
  await admit(runner, root, 'review', approved(summary), resultSuffix);
}

async function runProposeAction(
  runner: InstalledRunner,
  root: string,
  changeId: string,
  capabilityId: string,
  suffix: string,
): Promise<void> {
  json(await installedCli(runner, root, ['propose']));
  await copyProposalArtifacts(root, changeId, capabilityId);
  await admit(runner, root, 'propose', completed(`${suffix} proposed`), `${suffix}-propose`);
}

async function runApplyAction(
  runner: InstalledRunner,
  root: string,
  deliveryId: string,
  changeId: string,
  suffix: string,
  viaAdapter: boolean,
): Promise<number> {
  json(await installedCli(runner, root, ['owner', 'record', '--decision', 'authorize-apply', '--change', changeId, '--source-ref', `owner:h1:${suffix}:apply`]));
  let providerCalls = 0;
  const tasksPath = join(root, 'openspec', 'changes', changeId, 'tasks.md');
  if (viaAdapter) {
    const installedAdapterPath = join(runner.packageRoot, 'dist', 'services', 'g1-single-action-agent-adapter.js');
    assert.equal(installedAdapterPath.startsWith(projectRoot), false);
    const module = await import(pathToFileURL(installedAdapterPath).href) as {
      runSingleActionAgent: (input: {
        repoRoot: string;
        deliveryId: string;
        entry: 'next';
        execute: (view: { actionPackage: { run: { action: string; changeId: string } } }) => Promise<{ executionStatus: 'completed'; summary: string }>;
      }) => Promise<{ providerInvocations: number; postPolicy: { kind: string; action?: string } }>;
    };
    const previousHome = process.env['FLOWKIT_HOME'];
    process.env['FLOWKIT_HOME'] = requiredFlowkitHome();
    try {
      const adapterResult = await module.runSingleActionAgent({
        repoRoot: root,
        deliveryId,
        entry: 'next',
        execute: async (view) => {
          providerCalls += 1;
          assert.equal(view.actionPackage.run.action, 'apply');
          assert.equal(view.actionPackage.run.changeId, changeId);
          await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'), 'utf8');
          return { executionStatus: 'completed', summary: `${suffix} applied through installed adapter` };
        },
      });
      assert.equal(adapterResult.providerInvocations, 1);
      assert.equal(adapterResult.postPolicy.kind, 'action');
      assert.equal(adapterResult.postPolicy.action, 'review-apply');
    } finally {
      if (previousHome === undefined) delete process.env['FLOWKIT_HOME'];
      else process.env['FLOWKIT_HOME'] = previousHome;
    }
  } else {
    json(await installedCli(runner, root, ['apply']));
    await writeFile(tasksPath, (await readFile(tasksPath, 'utf8')).replaceAll('- [ ]', '- [x]'), 'utf8');
    await admit(runner, root, 'apply', completed(`${suffix} implemented`), `${suffix}-apply`);
  }
  return providerCalls;
}

async function runChangeVerification(runner: InstalledRunner, root: string): Promise<void> {
  const verification = json(await installedCli(runner, root, ['verify']));
  assert.equal(verification['status'], 'passed');
  assert.ok((verification['selectedLogicalChecks'] as string[]).includes('openspec-current-change-strict'));
}

async function runArchiveAction(
  runner: InstalledRunner,
  root: string,
  changeId: string,
  suffix: string,
): Promise<void> {
  json(await installedCli(runner, root, ['owner', 'record', '--decision', 'authorize-archive', '--change', changeId, '--source-ref', `owner:h1:${suffix}:archive`]));
  const archive = json(await installedCli(runner, root, ['archive']));
  assert.equal(archive['status'], 'completed');
}

async function runCheckpointBoundary(
  runner: InstalledRunner,
  root: string,
  deliveryId: string,
  changeId: string,
  suffix: string,
): Promise<void> {
  const owner = json(await installedCli(runner, root, ['owner', 'record', '--decision', 'authorize-checkpoint', '--change', changeId, '--source-ref', `owner:h1:${suffix}:checkpoint`]));
  const checkpointOwnerRef = String(owner['ownerDecisionRef']);
  const beforeStatus = await git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  const beforeHead = await git(root, ['rev-parse', 'HEAD']);
  const beforeRuns = await countRunDirectories(root, deliveryId);
  const handoff = json(await installedCli(runner, root, ['checkpoint-handoff', '--delivery', deliveryId]));
  assert.equal(handoff['changeId'], changeId);
  assert.equal(handoff['ownerAuthorizationRef'], checkpointOwnerRef);
  assert.equal(handoff['baseRevision'], beforeHead);
  assert.deepEqual(handoff['preflight'], ['git diff --check', 'git diff --cached --check']);
  assert.equal(await git(root, ['status', '--porcelain=v1', '--untracked-files=all']), beforeStatus);
  assert.equal(await git(root, ['rev-parse', 'HEAD']), beforeHead);
  assert.equal(await countRunDirectories(root, deliveryId), beforeRuns, 'read-only handoff must not create a Run');
  await applyCheckpointPlan(root, handoff);
  assert.equal(await countRunDirectories(root, deliveryId), beforeRuns, 'checkpoint Git mechanics must not create a Run');
}

const futureDeliveryId = '20991231-41-self-hosted-delivery';
const futureChangeA = 'future-change-a';
const futureChangeB = 'future-change-b';
const futureCapabilityA = 'flowkit-stable-runner-and-self-hosting-acceptance';
const futureCapabilityB = 'flowkit-sync-resume-and-single-action-agent-adapter';

async function runSelfHostingPhase(phase: number, stateRoot: string): Promise<void> {
  assert.ok(Number.isInteger(phase) && phase >= 1 && phase <= 26, `invalid H1 formal phase ${phase}`);
  if (process.env['FLOWKIT_TEST_FORCE_H1_SELF_HOSTING_FAILURE'] === '1' && phase === 1) {
    assert.fail('H1 full E2E formal branch sentinel');
  }
  const target = join(stateRoot, 'repo');
  if (phase === 1) { await installCandidateAt(stateRoot); return; }
  const runner = await loadInstalledRunner(stateRoot);

  if (phase === 2) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await git(target, ['init']);
    await git(target, ['config', 'user.email', 'flowkit@example.test']);
    await git(target, ['config', 'user.name', 'Flowkit H1']);
    await git(target, ['remote', 'add', 'origin', 'https://github.com/XDesk-xx/flowkit-h1-fixture']);
    await mkdir(join(target, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(join(target, '.flowkit', 'runs'), { recursive: true });
    await mkdir(join(target, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration'), { recursive: true });
    await cp(join(fixtureRoot, 'bootstrap-specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'), join(target, 'openspec', 'specs', 'flowkit-openspec-1-7-thin-integration', 'spec.md'));
    await mkdir(join(target, 'src', 'cli'), { recursive: true });
    await mkdir(join(target, 'src', 'facts'), { recursive: true });
    await mkdir(join(target, 'src', 'policy'), { recursive: true });
    await writeFile(join(target, 'src', 'cli', 'change-action.ts'), '// H1 fixture source evidence\n', 'utf8');
    await writeFile(join(target, 'src', 'facts', 'formal-fact-reader.ts'), '// H1 fixture source evidence\n', 'utf8');
    await writeFile(join(target, 'src', 'policy', 'unified-entry.ts'), '// H1 fixture source evidence\n', 'utf8');
    await writeFile(join(target, '.gitignore'), 'architecture/**/html/\n.h1-inputs/\n', 'utf8');
    await writeFile(join(target, 'full-test.mjs'), [
      "import { writeFileSync } from 'node:fs';",
      "const payload={schemaVersion:1,status:'passed',summary:'H1 future Delivery Full Test passed',totalDurationMs:5,checks:[{id:'future-full',status:'passed',durationMs:5}]};",
      "writeFileSync(process.env.FLOWKIT_FULL_TEST_RESULT_PATH, JSON.stringify(payload));",
      'process.exit(0);',
      '',
    ].join('\n'), 'utf8');
    await git(target, ['add', '.']);
    await git(target, ['commit', '-m', 'fixture baseline before self-hosted Delivery']);
    const inputPath = await jsonFile(target, 'delivery.json', {
      id: futureDeliveryId,
      goal: 'Prove installed Flowkit can manage a future Delivery end to end.',
      branch: `delivery/${futureDeliveryId}`,
      scope: { included: ['self-hosting fixture'], excluded: ['registry', 'automation'] },
      acceptance: ['future Delivery completes through installed Flowkit'],
      architecture: { impact: true, archifyPlan: 'required' },
      fullTestPlan: ['future-full'],
      fullTestExecution: {
        id: 'future-full', kind: 'command', command: process.execPath, args: [join(target, 'full-test.mjs')], launcherMode: 'direct', scope: 'delivery', timeoutMs: 30000,
        resultProtocol: 'flowkit-full-test-result-v1', resultAuthority: 'verification', expectedTerminalStatuses: ['passed', 'failed'],
      },
      changes: [
        { key: 'A1', id: futureChangeA, goal: 'First future fixture Change.', required: true, dependsOn: [], outputs: [], architectureImpact: true },
        { key: 'B1', id: futureChangeB, goal: 'Second future fixture Change.', required: true, dependsOn: [futureChangeA], outputs: [], architectureImpact: true },
      ],
    });
    json(await installedCli(runner, target, ['create', 'delivery', '--input', inputPath, '--source-ref', 'owner:h1:create-delivery']));
    return;
  }
  if (phase === 3) {
    const preDeliveryRevision = await git(target, ['rev-parse', 'HEAD']);
    await writeArchitecture(target, futureDeliveryId, 'current', preDeliveryRevision);
    await writeArchitecture(target, futureDeliveryId, 'planned', preDeliveryRevision);
    await exactArchifyValidate(target, join(target, 'architecture', futureDeliveryId, 'json', 'current.architecture.json'));
    await exactArchifyValidate(target, join(target, 'architecture', futureDeliveryId, 'json', 'planned.architecture.json'));
    await git(target, ['add', '.']);
    await git(target, ['diff', '--cached', '--check']);
    await git(target, ['commit', '-m', `chore(flowkit): start ${futureDeliveryId}`, '-m', `Flowkit-Delivery: ${futureDeliveryId}\nFlowkit-Boundary: delivery-start`]);
    return;
  }
  if (phase === 4) {
    const version = await installedProcessCli(runner, target, ['--version']);
    assert.equal(version.code, 0, version.stderr);
    assert.match(version.stdout, /0\.1\.0/);
    assert.equal((await stat(join(target, 'node_modules')).catch(() => undefined)), undefined, 'target repo must not have node_modules');
    assert.equal((await installedProcessCli(runner, target, ['status'])).code, 0);
    assert.equal((await installedCli(runner, target, ['architecture', 'render', 'current'])).code, 0);
    assert.equal((await installedCli(runner, target, ['architecture', 'render', 'planned'])).code, 0);
    await rm(join(target, 'architecture', futureDeliveryId, 'html'), { recursive: true, force: true });
    return;
  }

  if (phase === 5) { await runExploreAction(runner, target, futureChangeA, 'a'); return; }
  if (phase === 6) { await runReviewAction(runner, target, 'a explore approved', 'a-review-explore'); return; }
  if (phase === 7) { await runProposeAction(runner, target, futureChangeA, futureCapabilityA, 'a'); return; }
  if (phase === 8) { await runReviewAction(runner, target, 'a proposal approved', 'a-review-propose'); return; }
  if (phase === 9) { assert.equal(await runApplyAction(runner, target, futureDeliveryId, futureChangeA, 'a', true), 1); return; }
  if (phase === 10) { await runReviewAction(runner, target, 'a apply approved', 'a-review-apply'); return; }
  if (phase === 11) { await runChangeVerification(runner, target); return; }
  if (phase === 12) { await runArchiveAction(runner, target, futureChangeA, 'a'); return; }
  if (phase === 13) { await runCheckpointBoundary(runner, target, futureDeliveryId, futureChangeA, 'a'); return; }

  if (phase === 14) { await runExploreAction(runner, target, futureChangeB, 'b'); return; }
  if (phase === 15) { await runReviewAction(runner, target, 'b explore approved', 'b-review-explore'); return; }
  if (phase === 16) { await runProposeAction(runner, target, futureChangeB, futureCapabilityB, 'b'); return; }
  if (phase === 17) { await runReviewAction(runner, target, 'b proposal approved', 'b-review-propose'); return; }
  if (phase === 18) { assert.equal(await runApplyAction(runner, target, futureDeliveryId, futureChangeB, 'b', false), 0); return; }
  if (phase === 19) { await runReviewAction(runner, target, 'b apply approved', 'b-review-apply'); return; }
  if (phase === 20) { await runChangeVerification(runner, target); return; }
  if (phase === 21) { await runArchiveAction(runner, target, futureChangeB, 'b'); return; }
  if (phase === 22) { await runCheckpointBoundary(runner, target, futureDeliveryId, futureChangeB, 'b'); return; }

  if (phase === 23) {
    const ready = await installedCli(runner, target, ['next']);
    assert.equal(ready.code, 0, ready.stderr);
    assert.match(ready.stdout, /authorize-full-test/);
    const beforeFullRuns = await countRunDirectories(target, futureDeliveryId);
    json(await installedCli(runner, target, ['owner', 'record', '--decision', 'authorize-full-test', '--source-ref', 'owner:h1:full-test']));
    const full = json(await installedCli(runner, target, ['delivery', 'full-test']));
    assert.equal(full['executionStatus'], 'passed');
    assert.equal(await countRunDirectories(target, futureDeliveryId), beforeFullRuns, 'Delivery Full Test must not create a Run');
    return;
  }
  if (phase === 24) {
    const checkpointRevision = await git(target, ['rev-parse', 'HEAD']);
    await writeArchitecture(target, futureDeliveryId, 'actual', checkpointRevision);
    const actualPath = join(target, 'architecture', futureDeliveryId, 'json', 'actual.architecture.json');
    await exactArchifyValidate(target, actualPath);
    assert.equal((await installedCli(runner, target, ['architecture', 'render', 'actual'])).code, 0);
    assert.equal((await installedCli(runner, target, ['architecture', 'compare', 'planned', 'actual'])).code, 0);
    assert.match((await installedCli(runner, target, ['next'])).stdout, /accept-architecture/);
    json(await installedCli(runner, target, ['owner', 'record', '--decision', 'accept-architecture', '--source-ref', 'owner:h1:accept-architecture']));
    assert.match((await installedCli(runner, target, ['next'])).stdout, /authorize-delivery-finalize/);
    return;
  }
  if (phase === 25) {
    const checkpointRevision = await git(target, ['rev-parse', 'HEAD']);
    const beforeFinalizeRuns = await countRunDirectories(target, futureDeliveryId);
    json(await installedCli(runner, target, ['owner', 'record', '--decision', 'authorize-delivery-finalize', '--source-ref', 'owner:h1:finalize']));
    const finalize = json(await installedCli(runner, target, ['delivery', 'finalize', '--delivery', futureDeliveryId]));
    assert.equal(finalize['changed'], true);
    assert.equal(await countRunDirectories(target, futureDeliveryId), beforeFinalizeRuns, 'Finalize must not create a Run');
    const finalHandoff = json(await installedCli(runner, target, ['delivery', 'final-handoff', '--delivery', futureDeliveryId]));
    assert.equal(finalHandoff['qualifiedBaseRevision'], checkpointRevision);
    await git(target, ['diff', '--check']);
    await git(target, ['add', ...(finalHandoff['paths'] as string[])]);
    await git(target, ['diff', '--cached', '--check']);
    await git(target, ['commit', '-m', String(finalHandoff['subject']), '-m', (finalHandoff['trailers'] as string[]).join('\n')]);
    return;
  }

  const cloneParent = join(stateRoot, 'fresh-clone');
  await rm(cloneParent, { recursive: true, force: true });
  await mkdir(cloneParent, { recursive: true });
  const fresh = join(cloneParent, 'repo');
  await git(cloneParent, ['clone', '--quiet', target, fresh]);
  assert.equal((await stat(join(fresh, 'node_modules')).catch(() => undefined)), undefined);
  assert.match(await git(fresh, ['log', '-1', '--pretty=%B']), /Flowkit-Boundary: delivery-final/);
  const nextDeliveryId = '20991231-42-next-self-hosted-delivery';
  const nextInput = await jsonFile(fresh, 'next-delivery.json', {
    id: nextDeliveryId,
    goal: 'Prove the installed runner can start the next Delivery after the accepted H1 final boundary.',
    branch: `delivery/${nextDeliveryId}`,
    scope: { included: ['continuation proof'], excluded: [] },
    acceptance: ['next Delivery is repository-resumable'],
    architecture: { impact: false, archifyPlan: 'not-required' },
    fullTestPlan: ['future-full'],
    fullTestExecution: {
      id: 'future-full', kind: 'command', command: process.execPath, args: [join(fresh, 'full-test.mjs')], launcherMode: 'direct', scope: 'delivery', timeoutMs: 30000,
      resultProtocol: 'flowkit-full-test-result-v1', resultAuthority: 'verification', expectedTerminalStatuses: ['passed', 'failed'],
    },
    changes: [{ key: 'A1', id: 'next-future-change', goal: 'Continuation proof Change.', required: true, dependsOn: [], outputs: [], architectureImpact: false }],
  });
  json(await installedProcessCli(runner, fresh, ['create', 'delivery', '--input', nextInput, '--source-ref', 'owner:h1:next-delivery']));
  const resume = await installedProcessCli(runner, fresh, ['resume-context']);
  assert.equal(resume.code, 0, resume.stderr);
  assert.match(resume.stdout, new RegExp(nextDeliveryId));
  const finalNext = await installedProcessCli(runner, fresh, ['next']);
  assert.equal(finalNext.code, 0, finalNext.stderr);
  assert.match(finalNext.stdout, /activate-change/);
  console.log(`# H1 formal self-hosting completed ${JSON.stringify({ phases: 26, runCount: await countRunDirectories(target, futureDeliveryId), packageCompressedBytes: runner.packSize, packageUnpackedBytes: runner.unpackedSize, packageFileCount: runner.fileCount })}`);
}

describe('H1 stable runner and self-hosting acceptance', { concurrency: false }, () => {
  const formalPhase = Number.parseInt(process.env['FLOWKIT_H1_FORMAL_PHASE'] ?? '', 10);
  const formalStateRoot = process.env['FLOWKIT_H1_FORMAL_STATE_ROOT'];
  if (Number.isInteger(formalPhase)) {
    it(`executes formal future-Delivery self-hosting phase ${formalPhase}`, async () => {
      assert.ok(formalStateRoot, 'formal H1 phase requires FLOWKIT_H1_FORMAL_STATE_ROOT');
      await runSelfHostingPhase(formalPhase, formalStateRoot);
    });
    return;
  }

  it('physically installs the candidate runner and exercises fresh-process diagnostics without source-workspace runtime', async () => {
    const runner = await installCandidate();
    const target = await tempRoot('flowkit-h1-fast-target-');
    const deliveryId = '20991231-40-installed-runner-smoke';
    await mkdir(join(target, 'openspec', 'delivery-groups'), { recursive: true });
    await mkdir(join(target, '.flowkit', 'runs'), { recursive: true });
    await writeFile(join(target, 'openspec', 'delivery-groups', `${deliveryId}.yaml`), [
      `id: ${deliveryId}`,
      'delivery:', '  state: active', '  fullTestStatus: not-ready',
      'changes:', '  - key: A1', '    id: future-smoke-change', '    goal: "installed runner smoke"', '    required: true', '    dependsOn: []', '    state: planned', '    architectureImpact: false', '    outputs: []', '',
    ].join('\n'), 'utf8');
    await git(target, ['init']);
    await git(target, ['config', 'user.email', 'flowkit@example.test']);
    await git(target, ['config', 'user.name', 'Flowkit H1']);
    await git(target, ['add', '.']);
    await git(target, ['commit', '-m', `chore(flowkit): start ${deliveryId}`, '-m', `Flowkit-Delivery: ${deliveryId}\nFlowkit-Boundary: delivery-start`]);
    const version = await installedProcessCli(runner, target, ['--version']);
    assert.equal(version.code, 0, version.stderr);
    assert.match(version.stdout, /0\.1\.0/);
    for (const args of [['status'], ['resume-context']] as const) {
      const result = await installedProcessCli(runner, target, args);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, new RegExp(deliveryId));
    }
    const nextResult = await installedProcessCli(runner, target, ['next']);
    assert.equal(nextResult.code, 0, nextResult.stderr);
    assert.match(nextResult.stdout, /activate-change/);
    assert.equal((await stat(join(target, 'node_modules')).catch(() => undefined)), undefined);
    assert.ok(runner.binPath.startsWith(runner.consumerRoot));
    assert.equal(runner.binPath.startsWith(projectRoot), false);
  });

  it('uses one independently installed Flowkit distribution to manage a future Delivery end to end and resume it from a fresh checkout', async () => {
    const stateRoot = await tempRoot('flowkit-h1-full-state-');
    for (let phase = 1; phase <= 26; phase += 1) await runSelfHostingPhase(phase, stateRoot);
  });
});
