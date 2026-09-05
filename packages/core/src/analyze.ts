import path from 'node:path';
import ts from 'typescript';
import { type Analysis, type Finding, type Rule, RuleSchema } from './protocol.js';
import { type Project } from './project.js';

export function moduleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) return node.moduleReference.expression;
  if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments.length === 1) {
    const arg = node.arguments[0];
    if (arg && ts.isStringLiteralLike(arg)) return arg;
  }
  return undefined;
}

function calleeName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const parent = calleeName(node.expression);
    return parent ? `${parent}.${node.name.text}` : undefined;
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    const parent = calleeName(node.expression);
    return parent ? `${parent}.${node.argumentExpression.text}` : undefined;
  }
  return undefined;
}

function protectedByCatch(node: ts.Node): boolean {
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isFunctionLike(parent)) return false;
    if (ts.isTryStatement(parent) && parent.tryBlock === child && parent.catchClause) return true;
  }
  return false;
}

export function analyze(project: Project, inputRules: Rule[] = []): Analysis {
  const rules = inputRules.map(rule => RuleSchema.parse(rule));
  const options: ts.CompilerOptions = {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, types: [], skipLibCheck: true};
  const original = ts.createCompilerHost(options);
  const libDir = path.dirname(ts.getDefaultLibFilePath(options));
  const sources = new Map([...project.files].map(([name, text]) => [path.join(project.root, name), text]));
  const isLib = (name: string) => path.dirname(name) === libDir && /^lib\..*\.d\.ts$/.test(path.basename(name));
  const read = (name: string) => sources.get(name) ?? (isLib(name) ? original.readFile(name) : undefined);
  const host: ts.CompilerHost = {...original,
    fileExists: name => sources.has(name) || (isLib(name) && original.fileExists(name)),
    readFile: read,
    directoryExists: dir => [...sources.keys()].some(name => name.startsWith(dir + path.sep)) || dir === libDir,
    getDirectories: () => [], realpath: name => name,
    getCurrentDirectory: () => project.root,
    getSourceFile: (name, version) => {
      const text = read(name);
      return text === undefined ? undefined : ts.createSourceFile(name, text, version, true);
    },
    writeFile: () => { throw new Error('Compiler writes are disabled'); },
  };
  const program = ts.createProgram([...sources.keys()], options, host);
  const compilerFacts: Finding[] = ts.getPreEmitDiagnostics(program).map(d => {
    const start = d.start ?? 0;
    const pos = d.file?.getLineAndCharacterOfPosition(start);
    return {source: 'compiler', code: `TS${d.code}`, message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      file: d.file ? path.relative(project.root, d.file.fileName).split(path.sep).join('/') : '',
      start, length: d.length ?? 0, line: pos ? pos.line + 1 : 0, column: pos ? pos.character + 1 : 0};
  });
  const ruleFindings: Finding[] = [];
  for (const name of sources.keys()) {
    const file = program.getSourceFile(name)!;
    function report(node: ts.Node, rule: Rule, message: string) {
      const start = node.getStart(file);
      const pos = file.getLineAndCharacterOfPosition(start);
      ruleFindings.push({source: 'rule', code: rule.kind, message,
        file: path.relative(project.root, name).split(path.sep).join('/'), start,
        length: node.getWidth(file), line: pos.line + 1, column: pos.character + 1});
    }
    function visit(node: ts.Node) {
      for (const rule of rules) {
        if (rule.kind === 'forbidden-import') {
          const literal = moduleLiteral(node);
          if (literal?.text === rule.module) report(literal, rule, `Import of ${rule.module} is forbidden`);
        } else if (ts.isCallExpression(node) && calleeName(node.expression) === rule.callee) {
          if (rule.kind === 'forbidden-call') report(node.expression, rule, `Call to ${rule.callee} is forbidden`);
          else {
            let expression: ts.Node = node;
            while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
            if (ts.isAwaitExpression(expression.parent) && !protectedByCatch(node)) {
              report(node, rule, `Awaited ${rule.callee} requires a local try/catch`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  const sort = (a: Finding, b: Finding) => a.file.localeCompare(b.file) || a.start - b.start || a.code.localeCompare(b.code);
  return {compilerFacts: compilerFacts.sort(sort), ruleFindings: ruleFindings.sort(sort)};
}
