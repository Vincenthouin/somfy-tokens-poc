import { TokenFile, TokenGroup, Token, FlatToken } from '../../shared/types';

const LAYERS = ['primitives', 'semantic', 'composite', 'component'];

function isToken(node: any): node is Token {
  return node && typeof node === 'object' && '$value' in node;
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
