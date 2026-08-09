import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { createTempDir } from '../fixtures/helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(thisDir, '../..');
const binPath = resolve(projectRoot, 'src/bin/flowkit.ts');
const tsxCliPath = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function makeRepo(): Promise<string> {
  const root = await createTempDir();
  roots.push(root);
  const deliveryId = '20260806-01-process';
  await mkdir(join(root, '.flowkit', 'runs', deliveryId), { recursive: true });
  await mkdir(join(root, 'openspec', 'delivery-groups'), { recursive: true });
  await mkdir(join(root, 'openspec', 'changes', 'diagnostic-cli'), { recursive: true });
  await writeFile(
    join(root, 'openspec', 'delivery-groups', `${deliveryId}.yaml`),
    [
      `id: ${deliveryId}`,
      'delivery:',
      '  state: active',
      '  fullTestStatus: not-ready',
      'changes:',
      '  - key: E1',
      '    id: diagnostic-cli',
      '    state: active',
      '    required: true',
      '    dependsOn: []',
    ].join('\n'),
  );
  await writeFile(join(root, 'openspec', 'changes', 'diagnostic-cli', 'explore.md'), '# Explore\n');
  return root;
}

async function snapshotFiles(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else result.set(relative(root, path), await readFile(path, 'utf-8'));
    }
  }
  await walk(root);
  return result;
}

async function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const shell = process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd');
    const child = spawn(executable, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code: code ?? -1, stdout, stderr }));
  });
}

async function run(root: string, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return runProcess(process.execPath, [tsxCliPath, binPath, command], root);
}

async function installPackedFlowkitBin(): Promise<string> {
  const packageRoot = await createTempDir();
  const installRoot = await createTempDir();
  roots.push(packageRoot, installRoot);
  await writeFile(join(installRoot, 'package.json'), '{\n  "private": true\n}\n');

  const build = await runProcess(npmExecutable, ['run', 'build'], projectRoot);
  assert.equal(build.code, 0, build.stderr);

  const packed = await runProcess(
    npmExecutable,
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packageRoot],
    projectRoot,
  );
  assert.equal(packed.code, 0, packed.stderr);
  const packResult = JSON.parse(packed.stdout) as Array<{ filename?: unknown }>;
  assert.equal(packResult.length, 1);
  assert.equal(typeof packResult[0]?.filename, 'string');
  const tarball = join(packageRoot, packResult[0]!.filename as string);

  const installed = await runProcess(
    npmExecutable,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--no-save', tarball],
    installRoot,
  );
  assert.equal(installed.code, 0, installed.stderr);

  return join(
    installRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'flowkit.cmd' : 'flowkit',
  );
}

describe('diagnostic CLI real process boundary', () => {
  it('executes all four commands without mutating repository files', async () => {
    const root = await makeRepo();
    const before = await snapshotFiles(root);
    for (const command of ['status', 'next', 'doctor', 'resume-context']) {
      const first = await run(root, command);
      const second = await run(root, command);
      assert.equal(first.code, 0, `${command}: ${first.stderr}`);
      assert.equal(first.stdout, second.stdout);
      assert.equal(first.stderr, '');
    }
    assert.deepEqual(await snapshotFiles(root), before);
  });

  it('executes the npm-installed flowkit bin surface', async () => {
    const root = await makeRepo();
    const installedBin = await installPackedFlowkitBin();

    const version = await runProcess(installedBin, ['--version'], root);
    assert.equal(version.code, 0, version.stderr);
    assert.equal(version.stdout, '0.1.0\n');
    assert.equal(version.stderr, '');

    const status = await runProcess(installedBin, ['status'], root);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, /^delivery: 20260806-01-process\n/);
    assert.equal(status.stderr, '');
  });

  it('rejects unknown commands with exit 2 on stderr', async () => {
    const root = await makeRepo();
    const result = await run(root, 'unknown');
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^usage: flowkit /);
  });
});
