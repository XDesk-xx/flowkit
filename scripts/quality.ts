import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDir, '..');

export interface FunctionMetric {
  name: string;
  line: number;
  loc: number;
  complexity: number;
  nesting: number;
  parameters: number;
}

export interface FileMetric {
  path: string;
  loc: number;
  functions: FunctionMetric[];
}

export interface QualityReport {
  hardFailures: string[];
  warnings: string[];
  files: FileMetric[];
}

const FILE_THRESHOLDS = { warning: 300, elevated: 500 };
const FUNCTION_THRESHOLDS = { warning: 60, elevated: 100 };
const COMPLEXITY_THRESHOLDS = { warning: 10, elevated: 15 };
const NESTING_THRESHOLDS = { warning: 4, elevated: 6 };
const PARAMETER_THRESHOLDS = { warning: 5, elevated: 8 };
const FS_MODULES = new Set(['node:fs', 'node:fs/promises', 'fs', 'fs/promises']);

function isCallable(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

function callableName(node: ts.FunctionLikeDeclaration): string {
  if ('name' in node && node.name) return node.name.getText();
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  return '<anonymous>';
}

function effectiveLineSet(source: string): Set<number> {
  const sourceFile = ts.createSourceFile('metric.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const lines = new Set<number>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const start = scanner.getTokenPos();
    const end = Math.max(start, scanner.getTextPos() - 1);
    const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
    for (let line = startLine; line <= endLine; line += 1) lines.add(line);
  }
  return lines;
}

function countLinesInNode(sourceFile: ts.SourceFile, lines: ReadonlySet<number>, node: ts.Node): number {
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(node.getStart(sourceFile), node.end - 1)).line + 1;
  let count = 0;
  for (const line of lines) {
    if (line >= startLine && line <= endLine) count += 1;
  }
  return count;
}

function isLogicalComplexity(node: ts.Node): boolean {
  return ts.isBinaryExpression(node)
    && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
      .includes(node.operatorToken.kind);
}

function isStructuredControl(node: ts.Node): boolean {
  return ts.isIfStatement(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node)
    || ts.isCatchClause(node)
    || ts.isCaseClause(node)
    || ts.isConditionalExpression(node);
}

function calculateCallableComplexity(root: ts.FunctionLikeDeclaration): { complexity: number; nesting: number } {
  let complexity = 1;
  let maxNesting = 0;

  const visit = (node: ts.Node, nesting: number): void => {
    if (node !== root && isCallable(node)) return;
    const structured = isStructuredControl(node);
    const nextNesting = structured ? nesting + 1 : nesting;
    if (structured) {
      complexity += 1;
      maxNesting = Math.max(maxNesting, nextNesting);
    } else if (isLogicalComplexity(node)) {
      complexity += 1;
    }
    node.forEachChild((child) => visit(child, nextNesting));
  };

  root.forEachChild((child) => visit(child, 0));
  return { complexity, nesting: maxNesting };
}

export function analyzeTypeScriptSource(path: string, source: string): FileMetric {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lines = effectiveLineSet(source);
  const functions: FunctionMetric[] = [];

  const visit = (node: ts.Node): void => {
    if (isCallable(node)) {
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const complexity = calculateCallableComplexity(node);
      functions.push({
        name: callableName(node),
        line: start.line + 1,
        loc: countLinesInNode(sourceFile, lines, node),
        complexity: complexity.complexity,
        nesting: complexity.nesting,
        parameters: node.parameters.length,
      });
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);

  return {
    path,
    loc: lines.size,
    functions: functions.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name)),
  };
}

async function walkFiles(root: string, relativeDir: string, suffix: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(resolve(root, relativeDir), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, child, suffix)));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(child.split(sep).join('/'));
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function warningLevel(value: number, thresholds: { warning: number; elevated: number }): 'warning' | 'elevated-warning' | undefined {
  if (value > thresholds.elevated) return 'elevated-warning';
  if (value > thresholds.warning) return 'warning';
  return undefined;
}

function collectMetricWarnings(file: FileMetric): string[] {
  const warnings: string[] = [];
  const fileLevel = warningLevel(file.loc, FILE_THRESHOLDS);
  if (fileLevel) warnings.push(`${fileLevel}: file-loc ${file.path} value=${file.loc} threshold=${fileLevel === 'warning' ? 300 : 500}`);
  for (const fn of file.functions) {
    const prefix = `${file.path}:${fn.line} ${fn.name}`;
    const values: Array<[string, number, { warning: number; elevated: number }]> = [
      ['function-loc', fn.loc, FUNCTION_THRESHOLDS],
      ['complexity', fn.complexity, COMPLEXITY_THRESHOLDS],
      ['nesting', fn.nesting, NESTING_THRESHOLDS],
      ['parameters', fn.parameters, PARAMETER_THRESHOLDS],
    ];
    for (const [metric, value, thresholds] of values) {
      const level = warningLevel(value, thresholds);
      if (level) warnings.push(`${level}: ${metric} ${prefix} value=${value} threshold=${level === 'warning' ? thresholds.warning : thresholds.elevated}`);
    }
  }
  return warnings;
}

function importedModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const modules: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) modules.push(expression.text);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]!)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) modules.push(node.arguments[0]!.text);
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') modules.push(node.arguments[0]!.text);
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return modules;
}

export async function inspectQuality(root = projectRoot): Promise<QualityReport> {
  const hardFailures: string[] = [];
  const warnings: string[] = [];

  const forbiddenMjs = [
    ...(await walkFiles(root, 'src', '.mjs')),
    ...(await walkFiles(root, 'tests', '.mjs')),
  ];
  for (const file of forbiddenMjs) hardFailures.push(`forbidden-mjs: ${file}`);

  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf-8')) as { bin?: unknown };
  const flowkitBin = typeof packageJson.bin === 'object' && packageJson.bin !== null
    ? (packageJson.bin as Record<string, unknown>).flowkit
    : undefined;
  if (flowkitBin !== 'dist/bin/flowkit.js') hardFailures.push('bin-contract: package.json bin.flowkit must equal dist/bin/flowkit.js');

  const binSource = await readFile(resolve(root, 'src/bin/flowkit.ts'), 'utf-8');
  if (!binSource.startsWith('#!/usr/bin/env node\n')) hardFailures.push('bin-shebang: src/bin/flowkit.ts must start with #!/usr/bin/env node');

  for (const area of ['src/domain', 'src/policy']) {
    for (const path of await walkFiles(root, area, '.ts')) {
      const source = await readFile(resolve(root, path), 'utf-8');
      const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      for (const moduleName of importedModuleSpecifiers(sourceFile)) {
        if (FS_MODULES.has(moduleName)) hardFailures.push(`filesystem-boundary: ${path} imports ${moduleName}`);
      }
    }
  }

  const files: FileMetric[] = [];
  for (const path of await walkFiles(root, 'src', '.ts')) {
    const source = await readFile(resolve(root, path), 'utf-8');
    const metric = analyzeTypeScriptSource(path, source);
    files.push(metric);
    warnings.push(...collectMetricWarnings(metric));
  }

  return {
    hardFailures: hardFailures.sort((a, b) => a.localeCompare(b)),
    warnings: warnings.sort((a, b) => a.localeCompare(b)),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export async function runQuality(root = projectRoot): Promise<number> {
  const report = await inspectQuality(root);
  console.log(`quality: ${report.hardFailures.length === 0 ? 'passed' : 'failed'}`);
  console.log(`hard-failures: ${report.hardFailures.length}`);
  for (const failure of report.hardFailures) console.error(`error: ${failure}`);
  console.log(`warnings: ${report.warnings.length}`);
  for (const warning of report.warnings) console.warn(warning);
  return report.hardFailures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runQuality().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
