import ts from 'typescript';

function literal(node: ts.Node | undefined): string | undefined {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function moduleSpecifier(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    return literal(node.moduleSpecifier);
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
    return literal(node.moduleReference.expression);
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return literal(node.argument.literal);
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  )
    return literal(node.arguments[0]);
  return undefined;
}

function jsonExtends(file: string, content: string): string[] {
  const parsed = ts.parseConfigFileTextToJson(file, content);
  const config: unknown = parsed.config;
  if (parsed.error || !config || typeof config !== 'object') return [];
  const inherited = (config as { extends?: unknown }).extends;
  if (typeof inherited === 'string') return [inherited];
  return Array.isArray(inherited)
    ? inherited.filter((value): value is string => typeof value === 'string')
    : [];
}

/** Read syntax only; repository configuration modules are never evaluated by inventory. */
export function configurationSpecifiers(file: string, content: string): string[] {
  if (file.endsWith('.json')) return jsonExtends(file, content);
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    const specifier = moduleSpecifier(node);
    if (specifier !== undefined) specifiers.add(specifier);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, content, ts.ScriptTarget.Latest));
  return [...specifiers];
}
