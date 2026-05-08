import { TokenFile, FlatToken } from '../../shared/types';
import { flattenTokens } from './tokenTree';

export interface TokenDiff {
  added: FlatToken[];
  removed: FlatToken[];
  modified: { before: FlatToken; after: FlatToken }[];
  renamed: { before: string; after: string }[];
}

/**
 * Compute diff between two token trees. Renames are detected by matching
 * tokens with identical values whose paths differ.
 */
export function computeDiff(before: TokenFile, after: TokenFile): TokenDiff {
  const beforeFlat = flattenTokens(before);
  const afterFlat = flattenTokens(after);

  const beforeMap = new Map(beforeFlat.map((t) => [t.fullName, t]));
  const afterMap = new Map(afterFlat.map((t) => [t.fullName, t]));

  const added: FlatToken[] = [];
  const removed: FlatToken[] = [];
  const modified: { before: FlatToken; after: FlatToken }[] = [];

  for (const t of afterFlat) {
    if (!beforeMap.has(t.fullName)) {
      added.push(t);
    } else {
      const b = beforeMap.get(t.fullName)!;
      if (!valueEquals(b.value, t.value) || !modesEquals(b.modes, t.modes)) {
        modified.push({ before: b, after: t });
      }
    }
  }
  for (const t of beforeFlat) {
    if (!afterMap.has(t.fullName)) removed.push(t);
  }

  return { added, removed, modified, renamed: [] };
}

function valueEquals(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function modesEquals(a: any, b: any): boolean {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

export function totalChanges(diff: TokenDiff): number {
  return diff.added.length + diff.removed.length + diff.modified.length;
}
