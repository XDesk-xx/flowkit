import { loadDiagnosticContext } from './context-loader.js';
import { renderDoctor, diagnoseRepository } from '../diagnostics/doctor.js';
import { renderNext } from '../diagnostics/next.js';
import { renderResumeContext } from '../diagnostics/resume-context.js';
import { renderStatus } from '../diagnostics/status.js';
import { getVersion } from './version.js';

export interface CliInvocation {
  readonly argv: readonly string[];
  readonly cwd: string;
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

const COMMANDS = new Set(['status', 'next', 'doctor', 'resume-context']);

export async function runCli(invocation: CliInvocation): Promise<CliResult> {
  const args = [...invocation.argv];
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    return { exitCode: 0, stdout: `${getVersion()}\n`, stderr: '' };
  }
  if (args.length !== 1 || !COMMANDS.has(args[0]!)) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `usage: flowkit <status|next|doctor|resume-context|--version>\n`,
    };
  }

  try {
    const { snapshot } = await loadDiagnosticContext(invocation.cwd);
    switch (args[0]) {
      case 'status':
        return { exitCode: 0, stdout: renderStatus(snapshot), stderr: '' };
      case 'next':
        return { exitCode: 0, stdout: renderNext(snapshot), stderr: '' };
      case 'resume-context':
        return { exitCode: 0, stdout: renderResumeContext(snapshot), stderr: '' };
      case 'doctor': {
        const report = diagnoseRepository(snapshot);
        return {
          exitCode: report.overall === 'error' ? 1 : 0,
          stdout: renderDoctor(snapshot),
          stderr: '',
        };
      }
      default:
        return { exitCode: 2, stdout: '', stderr: 'usage error\n' };
    }
  } catch (error) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `flowkit: ${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
}
