import { useCallback, useRef, useState } from 'react';
import { TokenFile } from '../../shared/types';

const MAX_HISTORY = 100;

interface TreeHistoryAPI {
  /** Current tree (null until loaded). */
  tree: TokenFile | null;
  /** Replace the tree without recording history (initial load / hard reset). */
  resetTree: (tree: TokenFile | null) => void;
  /** Replace the tree and push the previous value onto the undo stack. */
  setTree: (next: TokenFile) => void;
  /** Pop one step backward. No-op if nothing to undo. */
  undo: () => void;
  /** Pop one step forward. No-op if nothing to redo. */
  redo: () => void;
  /** Whether an undo step is available. */
  canUndo: boolean;
  /** Whether a redo step is available. */
  canRedo: boolean;
}

/**
 * Tree state with a bounded past/future undo stack.
 * We don't deep-clone snapshots — callers are expected to pass new tree
 * objects to setTree, never to mutate the previous one (cloneTree is used
 * everywhere in the editor already).
 */
export function useTreeHistory(): TreeHistoryAPI {
  const [tree, setInternalTree] = useState<TokenFile | null>(null);
  const pastRef = useRef<TokenFile[]>([]);
  const futureRef = useRef<TokenFile[]>([]);
  // Force re-render when stacks change (for canUndo/canRedo)
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump((n) => n + 1), []);

  const resetTree = useCallback((next: TokenFile | null) => {
    pastRef.current = [];
    futureRef.current = [];
    setInternalTree(next);
    refresh();
  }, [refresh]);

  const setTree = useCallback((next: TokenFile) => {
    setInternalTree((prev) => {
      if (prev) {
        pastRef.current.push(prev);
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
      }
      futureRef.current = []; // any new edit invalidates redo
      return next;
    });
    refresh();
  }, [refresh]);

  const undo = useCallback(() => {
    setInternalTree((prev) => {
      if (!prev) return prev;
      const previous = pastRef.current.pop();
      if (!previous) return prev;
      futureRef.current.push(prev);
      if (futureRef.current.length > MAX_HISTORY) futureRef.current.shift();
      return previous;
    });
    refresh();
  }, [refresh]);

  const redo = useCallback(() => {
    setInternalTree((prev) => {
      if (!prev) return prev;
      const next = futureRef.current.pop();
      if (!next) return prev;
      pastRef.current.push(prev);
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
      return next;
    });
    refresh();
  }, [refresh]);

  return {
    tree,
    resetTree,
    setTree,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
