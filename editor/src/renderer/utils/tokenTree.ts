import { TokenFile, TokenGroup, Token, FlatToken } from '../../shared/types';

const LAYERS = ['primitives', 'semantic', 'composite', 'component'];

export const ALL_LAYERS = LAYERS;

function isToken(node: any): node is Token {
  return node && typeof node === 'object' && '$value' in node;
}

export { isToken };

/**
 * Check whether a node is a group (a non-token nested object).
 */
export function isGroup(node: any): node is TokenGroup {
  return node && typeof node === 'object' && !isToken(node) && !Array.isArray(node);
}

/**
 * Get any node (token OR group) at a path. Returns null if not found.
 */
export function getNodeAt(tree: TokenFile, path: string[]): any {
  let node: any = tree;
  for (const seg of path) {
    if (!node || typeof node !== 'object') return null;
    node = node[seg];
    if (node === undefined) return null;
  }
  return node;
}

/**
 * List the immediate children at a path. Returns [] if path doesn't lead to a group.
 * Each child has its name and a flag indicating whether it's a group or a token.
 */
export function getChildrenAt(
  tree: TokenFile,
  path: string[]
): Array<{ name: string; isGroup: boolean }> {
  if (path.length === 0) {
    return LAYERS.filter((l) => isGroup((tree as any)[l])).map((l) => ({ name: l, isGroup: true }));
  }
  const node = getNodeAt(tree, path);
  if (!isGroup(node)) return [];
  return Object.keys(node).map((name) => ({
    name,
    isGroup: isGroup(node[name]),
  }));
}

/**
 * Add a token at parentPath/name. Throws if parentPath isn't a group, or if name collides.
 * Mutates the tree.
 */
export function addToken(
  tree: TokenFile,
  parentPath: string[],
  name: string,
  token: Token
): void {
  if (!name) throw new Error('Le nom du token est requis');
  const parent = getNodeAt(tree, parentPath);
  if (!isGroup(parent)) {
    throw new Error(`Le chemin ${parentPath.join('.')} n'est pas un groupe valide`);
  }
  if (parent[name] !== undefined) {
    throw new Error(`Un token ou groupe nommé "${name}" existe déjà à cet emplacement`);
  }
  parent[name] = token;
}

/**
 * Add an empty group at parentPath/name. Throws on collision.
 * If parentPath is empty, creates a top-level layer.
 * Mutates the tree.
 */
export function addGroup(tree: TokenFile, parentPath: string[], name: string): void {
  if (!name) throw new Error('Le nom du groupe est requis');
  if (parentPath.length === 0) {
    if ((tree as any)[name] !== undefined) {
      throw new Error(`Un layer/groupe nommé "${name}" existe déjà`);
    }
    (tree as any)[name] = {};
    return;
  }
  const parent = getNodeAt(tree, parentPath);
  if (!isGroup(parent)) {
    throw new Error(`Le chemin ${parentPath.join('.')} n'est pas un groupe valide`);
  }
  if (parent[name] !== undefined) {
    throw new Error(`Un token ou groupe nommé "${name}" existe déjà à cet emplacement`);
  }
  parent[name] = {};
}

/**
 * Delete any node (token OR group) at a path. Mutates the tree.
 * Returns true if a node was deleted, false otherwise.
 */
export function deleteNodeAt(tree: TokenFile, path: string[]): boolean {
  if (path.length === 0) return false;
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent = parentPath.length === 0 ? (tree as any) : getNodeAt(tree, parentPath);
  if (!parent || typeof parent !== 'object') return false;
  if (parent[last] === undefined) return false;
  delete parent[last];
  return true;
}

/**
 * Find all tokens whose value references any token under the given path prefix.
 * Used to block deletion of a group containing tokens that are referenced elsewhere.
 * Returns the paths of the referencing tokens (those OUTSIDE the prefix).
 */
export function findReferencesUnder(tree: TokenFile, prefixPath: string[]): {
  referenced: string;       // full name of the referenced token under the prefix
  referencedBy: string[];   // full name of the referencing token (outside the prefix)
}[] {
  const flat = flattenTokens(tree);
  const prefix = prefixPath.join('.');
  const tokensUnder = flat.filter((t) => t.fullName === prefix || t.fullName.startsWith(prefix + '.'));
  const results: { referenced: string; referencedBy: string[] }[] = [];

  for (const target of tokensUnder) {
    const refs = findReferences(tree, target.fullName).filter(
      (p) => !p.join('.').startsWith(prefix + '.') && p.join('.') !== prefix
    );
    if (refs.length > 0) {
      results.push({
        referenced: target.fullName,
        referencedBy: refs.map((p) => p.join('.')),
      });
    }
  }
  return results;
}

/**
 * Flatten the nested token tree into a list of FlatTokens for UI display.
 */
export function flattenTokens(tree: TokenFile): FlatToken[] {
  const result: FlatToken[] = [];

  function walk(node: any, path: string[]) {
    if (isToken(node)) {
      const layer = path[0];
      // category = the second segment (e.g. 'color', 'dimension', 'font')
      const category = path[1] || 'misc';
      result.push({
        path,
        fullName: path.join('.'),
        layer,
        category,
        type: node.$type,
        value: node.$value,
        description: node.$description,
        modes: node.$extensions?.modes,
      });
      return;
    }
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        walk(node[key], [...path, key]);
      }
    }
  }

  for (const layer of LAYERS) {
    if (tree[layer]) walk(tree[layer], [layer]);
  }

  return result;
}

/**
 * Get a token from the tree at the given path.
 */
export function getTokenAt(tree: TokenFile, path: string[]): Token | null {
  let node: any = tree;
  for (const seg of path) {
    if (!node || typeof node !== 'object') return null;
    node = node[seg];
  }
  return isToken(node) ? node : null;
}

/**
 * Set a token in the tree at the given path (mutates).
 */
export function setTokenAt(tree: TokenFile, path: string[], token: Token): void {
  let node: any = tree;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (!node[seg] || typeof node[seg] !== 'object') node[seg] = {};
    node = node[seg];
  }
  node[path[path.length - 1]] = token;
}

/**
 * Delete a token at the given path (mutates).
 */
export function deleteTokenAt(tree: TokenFile, path: string[]): void {
  let node: any = tree;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]];
    if (!node) return;
  }
  delete node[path[path.length - 1]];
}

/**
 * Deep clone the token tree.
 */
export function cloneTree(tree: TokenFile): TokenFile {
  return JSON.parse(JSON.stringify(tree));
}

/**
 * Find all tokens whose value (string or object) references the given alias.
 * Returns the paths of those referencing tokens.
 */
export function findReferences(tree: TokenFile, aliasName: string): string[][] {
  const flat = flattenTokens(tree);
  const ref = `{${aliasName}}`;
  const matches: string[][] = [];

  for (const t of flat) {
    if (containsReference(t.value, ref)) {
      matches.push(t.path);
    }
    if (t.modes) {
      if (containsReference(t.modes.light, ref) || containsReference(t.modes.dark, ref)) {
        matches.push(t.path);
      }
    }
  }
  return matches;
}

function containsReference(value: any, ref: string): boolean {
  if (typeof value === 'string') return value.includes(ref);
  if (Array.isArray(value)) return value.some((v) => containsReference(v, ref));
  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => containsReference(v, ref));
  }
  return false;
}

/**
 * Replace all references to `oldAlias` with `newAlias` throughout the tree (mutates).
 */
export function renameReferences(tree: TokenFile, oldAlias: string, newAlias: string): number {
  const oldRef = `{${oldAlias}}`;
  const newRef = `{${newAlias}}`;
  let count = 0;

  function replaceInValue(value: any): any {
    if (typeof value === 'string') {
      if (value.includes(oldRef)) {
        count++;
        return value.split(oldRef).join(newRef);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(replaceInValue);
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const k of Object.keys(value)) out[k] = replaceInValue(value[k]);
      return out;
    }
    return value;
  }

  function walk(node: any) {
    if (isToken(node)) {
      node.$value = replaceInValue(node.$value);
      if (node.$extensions?.modes) {
        if (node.$extensions.modes.light !== undefined)
          node.$extensions.modes.light = replaceInValue(node.$extensions.modes.light);
        if (node.$extensions.modes.dark !== undefined)
          node.$extensions.modes.dark = replaceInValue(node.$extensions.modes.dark);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k]);
    }
  }

  walk(tree);
  return count;
}

/**
 * Get all token full-names from the tree (used for the alias picker).
 */
export function getAllTokenNames(tree: TokenFile): string[] {
  return flattenTokens(tree).map((t) => t.fullName);
}

/**
 * Determine if a value is an alias reference: matches `{some.token.path}`.
 */
export function isAlias(value: any): boolean {
  return typeof value === 'string' && /^\{[^}]+\}$/.test(value.trim());
}

export function aliasTarget(value: string): string {
  return value.trim().replace(/^\{|\}$/g, '');
}

/**
 * Whether a token has at least one "empty" value somewhere — either the top-level
 * value is an empty string, or one of its mode entries (light/dark) is.
 * Used to surface ⚠ warnings in the UI without blocking the save.
 */
export function tokenHasEmptyValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return false; // numeric tuples (cubicBezier) etc.
  if (typeof value === 'object') {
    for (const v of Object.values(value)) {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
    }
  }
  return false;
}

/**
 * Walk every alias reference inside a value and return the list of broken targets
 * (alias strings whose resolved path doesn't exist in the tree).
 */
function collectBrokenAliasesInValue(value: any, tree: TokenFile, acc: string[]) {
  if (typeof value === 'string') {
    if (isAlias(value)) {
      const targetPath = aliasTarget(value).split('.');
      if (!getTokenAt(tree, targetPath)) acc.push(aliasTarget(value));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectBrokenAliasesInValue(v, tree, acc);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) collectBrokenAliasesInValue(value[k], tree, acc);
  }
}

/**
 * For each token in the tree, list any alias references whose target doesn't exist.
 * Keyed by the token's fullName for fast lookup in the renderer.
 */
export function findBrokenAliases(tree: TokenFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of flattenTokens(tree)) {
    const broken: string[] = [];
    collectBrokenAliasesInValue(t.value, tree, broken);
    if (t.modes) {
      collectBrokenAliasesInValue(t.modes.light, tree, broken);
      collectBrokenAliasesInValue(t.modes.dark, tree, broken);
    }
    if (broken.length > 0) out.set(t.fullName, Array.from(new Set(broken)));
  }
  return out;
}

/**
 * Recursively resolve an alias chain to its literal value.
 * Stops on first literal, on missing target, or after MAX_DEPTH to avoid infinite loops.
 * For object values (typography, shadow), recursively resolves any nested alias inside.
 */
export function resolveValue(value: any, tree: TokenFile, depth = 0): any {
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) return value;

  if (typeof value === 'string') {
    if (!isAlias(value)) return value;
    const targetPath = aliasTarget(value).split('.');
    const target = getTokenAt(tree, targetPath);
    if (!target) return value; // broken alias — keep as-is
    return resolveValue(target.$value, tree, depth + 1);
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, tree, depth + 1));
  }

  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) {
      out[k] = resolveValue(value[k], tree, depth + 1);
    }
    return out;
  }

  return value;
}
