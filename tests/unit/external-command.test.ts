import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDir } from '../fixtures/helpers.js';
import { resolveCommandForPlatform, resolvePowerShellScriptCommand, runCommand } from '../../src/shared/external-command.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('runCommand', () => {
  it('captures stdout and exit code', async () => {
    const result = await runCommand('node', [
      '-e',
      'process.stdout.write("hello")',
    ]);
    assert.equal(result.stdout, 'hello');
    assert.equal(result.exitCode, 0);
    assert.equal(result.kind, 'exited');
  });

  it('captures stderr', async () => {
    const result = await runCommand('node', [
      '-e',
      'process.stderr.write("error")',
    ]);
    assert.equal(result.stderr, 'error');
    assert.equal(result.exitCode, 0);
  });

  it('captures non-zero exit code', async () => {
    const result = await runCommand('node', ['-e', 'process.exit(1)']);
    assert.equal(result.exitCode, 1);
    assert.equal(result.spawned, true);
    assert.equal(result.timedOut, false);
  });

  it('reports a bounded spawn failure without throwing', async () => {
    const result = await runCommand('__flowkit_missing_executable__', []);
    assert.equal(result.spawned, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.timedOut, false);
    assert.equal(result.kind, 'spawn-failed');
    assert.ok(result.spawnError?.message);
  });

  it('kills a read-only command after the configured timeout', async () => {
    const result = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], { timeout: 40 });
    assert.equal(result.spawned, true);
    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
    assert.equal(
      result.kind,
      process.platform === 'win32' ? 'outcome-unknown' : 'timed-out-cancelled',
    );
  });

  it('returns outcome-unknown for a Windows timeout without proven process-tree ownership', async () => {
    const result = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
      timeout: 40,
      platform: 'win32',
    });
    assert.equal(result.kind, 'outcome-unknown');
    assert.equal(result.timedOut, true);
  })

  it('returns timed-out-cancelled only when the injected Windows process-tree authority confirms termination', async () => {
    let seenPid = 0;
    const result = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
      timeout: 40,
      platform: 'win32',
      windowsProcessTreeCanceller: async ({ pid, command, args }) => {
        seenPid = pid;
        try { process.kill(pid, 'SIGKILL'); } catch { /* process may have exited in the timeout race */ }
        assert.equal(command.endsWith('node') || command.endsWith('node.exe'), true);
        assert.ok(args.length > 0);
        return { terminated: true, diagnostics: [`ownedPid=${pid}`, 'tree=terminated'] };
      },
    });
    assert.ok(seenPid > 0);
    assert.equal(result.kind, 'timed-out-cancelled');
    assert.deepEqual(result.processTreeDiagnostics, [`ownedPid=${seenPid}`, 'tree=terminated']);
  });

  it('keeps outcome-unknown with diagnostics when Windows whole-tree termination cannot be confirmed', async () => {
    const result = await runCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
      timeout: 40,
      platform: 'win32',
      windowsProcessTreeCanceller: async ({ pid }) => { try { process.kill(pid, 'SIGKILL'); } catch { /* process may have exited in the timeout race */ } return { terminated: false, diagnostics: [`ownedPid=${pid}`, 'descendant=still-running'] }; },
    });
    assert.equal(result.kind, 'outcome-unknown');
    assert.equal(result.timedOut, true);
    assert.ok(result.processTreeDiagnostics?.some((line) => line === 'descendant=still-running'));
  });
;



  it('routes Windows .ps1 through bounded PowerShell argv without shell evaluation', () => {
    assert.deepEqual(resolvePowerShellScriptCommand('C:/tools/openspec.ps1', ['status', '--json'], 'pwsh.exe'), {
      command: 'pwsh.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', 'C:/tools/openspec.ps1', 'status', '--json'],
      usedWindowsLauncher: true,
    });
  });

  it('falls back from missing pwsh to Windows PowerShell but not after a launcher starts', async () => {
    const root = await createTempDir();
    roots.push(root);
    const isWin32 = process.platform === 'win32';

    // The runCommand Windows .ps1 branch spawns the launcher directly (bounded
    // PowerShell argv), so the launcher MUST be a real executable on Windows.
    // POSIX shebang + chmod launchers only work on non-Windows. On Windows we
    // use the real pwsh.exe with real .ps1 fixtures so the fallback/terminal
    // semantics are still exercised with real spawn semantics.
    let okLauncher: string;
    let failingLauncher: string;
    let forbiddenFallback: string;
    let okCommand = 'openspec.ps1';
    let failingCommand = 'openspec.ps1';

    if (isWin32) {
      okLauncher = process.env['PWSH_EXE'] ?? 'pwsh.exe';
      failingLauncher = okLauncher;
      forbiddenFallback = okLauncher;
      okCommand = join(root, 'openspec-ok.ps1');
      failingCommand = join(root, 'openspec-fail.ps1');
      await writeFile(okCommand, '[Console]::Write("ok")\n');
      await writeFile(failingCommand, 'exit 7\n');
    } else {
      okLauncher = join(root, 'powershell-ok');
      failingLauncher = join(root, 'powershell-fail');
      forbiddenFallback = join(root, 'powershell-forbidden');
      await writeFile(okLauncher, `#!/bin/sh
printf "ok"
`);
      await writeFile(failingLauncher, `#!/bin/sh
exit 7
`);
      await writeFile(forbiddenFallback, `#!/bin/sh
printf "should-not-run"
`);
      await Promise.all([okLauncher, failingLauncher, forbiddenFallback].map((path) => chmod(path, 0o755)));
    }

    const fallback = await runCommand(okCommand, ['status'], {
      platform: 'win32',
      powerShellCandidates: ['__missing_pwsh__', okLauncher],
    });
    assert.equal(fallback.spawned, true);
    assert.equal(fallback.exitCode, 0);
    assert.equal(fallback.stdout, 'ok');

    const terminal = await runCommand(failingCommand, ['status'], {
      platform: 'win32',
      powerShellCandidates: [failingLauncher, forbiddenFallback],
    });
    assert.equal(terminal.spawned, true);
    assert.equal(terminal.exitCode, 7);
    assert.equal(terminal.stdout, '');
  });

  it('reports a machine-distinguishable failure when no PowerShell launcher exists', async () => {
    const result = await runCommand('openspec.ps1', [], {
      platform: 'win32',
      powerShellCandidates: ['__missing_pwsh_a__', '__missing_pwsh_b__'],
    });
    assert.equal(result.spawned, false);
    assert.equal(result.spawnError?.code, 'POWERSHELL_NOT_FOUND');
  });

  it('routes Windows command shims through explicit ComSpec but leaves non-Windows direct', () => {
    assert.deepEqual(resolveCommandForPlatform('openspec.cmd', ['status'], { platform: 'win32', comSpec: 'C:/Windows/System32/cmd.exe' }), {
      command: 'C:/Windows/System32/cmd.exe',
      args: ['/d', '/s', '/c', 'openspec.cmd', 'status'],
      usedWindowsLauncher: true,
    });
    assert.deepEqual(resolveCommandForPlatform('openspec.cmd', ['status'], { platform: 'linux' }), {
      command: 'openspec.cmd', args: ['status'], usedWindowsLauncher: false,
    });
  });
});
