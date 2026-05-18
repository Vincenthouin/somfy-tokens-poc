import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TokenFile } from '../../shared/types';
import { isGroup, getNodeAt, ALL_LAYERS, isDescendantPath } from '../utils/tokenTree';
import { TreeContextMenu, TreeContextMenuItem } from './TreeContextMenu';

interface Props {
  tree: TokenFile;
  selectedPath: string[];
  onSelect: (path: string[]) => void;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  // New mutation callbacks (all optional for backward compat in tests).
  onRename?: (path: string[], newName: string) => void;
  onMove?: (
    fromPath: string[],
    toParentPath: string[],
    placement?: { beforeName?: string; afterName?: string }
  ) => void;
  onAddGroup?: (parentPath: string[], name: string) => void;
  onAddToken?: (parentPath: string[]) => void; // routes to AddTokenModal
  onDuplicate?: (path: string[]) => void;
  onDelete?: (path: string[]) => void;
}

type DropZone = 'before' | 'inside' | 'after';

interface DragInfo {
  fromPath: string[];
  isToken: boolean;
}

interface DropTarget {
  path: string[];
  zone: DropZone;
}

interface ContextState {
  x: number;
  y: number;
  path: string[];
  isToken: boolean;
}

interface PendingNew {
  parentPath: string[];
  kind: 'group';
}

// Auto-expand after hovering this long with a drag over a collapsed group.
const HOVER_EXPAND_MS = 600;

export const SidebarTree: React.FC<Props> = (props) => {
  const { tree, selectedPath, onSelect } = props;
  const [editingPath, setEditingPath] = useState<string[] | null>(null);
  const [pendingNew, setPendingNew] = useState<PendingNew | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextState | null>(null);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const hoverExpandTimer = useRef<number | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // F2 / Enter to rename, Del to delete, ⌘D duplicate, ⌘N new sibling group,
  // ⌘⇧N new child group. Bound to the document but only fire when a tree row
  // is selected and we're not inside an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingPath || pendingNew) return; // an input is open — let it handle keys
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (selectedPath.length === 0) return;
      const path = selectedPath;
      const isLayer = path.length === 1;

      if (e.key === 'F2' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
        if (!isLayer && props.onRename) {
          e.preventDefault();
          setEditingPath(path);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isLayer && props.onDelete) {
          e.preventDefault();
          props.onDelete(path);
        }
        return;
      }
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === 'd' || e.key === 'D') && props.onDuplicate && !isLayer) {
        e.preventDefault();
        props.onDuplicate(path);
        return;
      }
      if (cmd && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        // New sibling group
        if (path.length === 0) return;
        e.preventDefault();
        const parent = path.slice(0, -1);
        setPendingNew({ parentPath: parent, kind: 'group' });
        return;
      }
      if (cmd && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        // New child group
        const node = getNodeAt(tree, path);
        if (!isGroup(node)) return;
        e.preventDefault();
        // Expand parent so the new row is visible.
        if (!props.expanded.has(path.join('.'))) props.onToggle(path.join('.'));
        setPendingNew({ parentPath: path, kind: 'group' });
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingPath, pendingNew, selectedPath, tree, props]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string[]) => {
      e.preventDefault();
      e.stopPropagation();
      const node = getNodeAt(tree, path);
      const isToken = !isGroup(node);
      setContextMenu({ x: e.clientX, y: e.clientY, path, isToken });
    },
    [tree]
  );

  const buildMenuItems = (ctx: ContextState): Array<TreeContextMenuItem | 'separator'> => {
    const { path, isToken } = ctx;
    const isLayer = path.length === 1;
    const items: Array<TreeContextMenuItem | 'separator'> = [
      {
        label: 'Rename',
        shortcut: 'F2',
        disabled: isLayer || !props.onRename,
        onClick: () => setEditingPath(path),
      },
    ];
    if (!isToken && props.onAddGroup) {
      items.push({
        label: 'New subgroup',
        shortcut: '⌘⇧N',
        onClick: () => {
          if (!props.expanded.has(path.join('.'))) props.onToggle(path.join('.'));
          setPendingNew({ parentPath: path, kind: 'group' });
        },
      });
    }
    if (!isToken && props.onAddToken) {
      items.push({
        label: 'New token',
        onClick: () => props.onAddToken!(path),
      });
    }
    if (props.onDuplicate && !isLayer) {
      items.push({
        label: 'Duplicate',
        shortcut: '⌘D',
        onClick: () => props.onDuplicate!(path),
      });
    }
    items.push('separator');
    items.push({
      label: 'Delete',
      shortcut: '⌫',
      disabled: isLayer || !props.onDelete,
      danger: true,
      onClick: () => props.onDelete!(path),
    });
    return items;
  };

  const startDrag = (e: React.DragEvent, path: string[], isToken: boolean) => {
    setDragInfo({ fromPath: path, isToken });
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers require data to be set or drag is cancelled.
    e.dataTransfer.setData('text/plain', path.join('.'));
  };

  const endDrag = () => {
    setDragInfo(null);
    setDropTarget(null);
    if (hoverExpandTimer.current) {
      window.clearTimeout(hoverExpandTimer.current);
      hoverExpandTimer.current = null;
    }
  };

  const handleDragOverRow = (
    e: React.DragEvent,
    rowEl: HTMLDivElement,
    path: string[],
    isTokenTarget: boolean
  ) => {
    if (!dragInfo) return;
    // Can't drop on self or descendants.
    if (isDescendantPath(path, dragInfo.fromPath)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = rowEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const h = rect.height;
    let zone: DropZone;
    // Tokens don't accept "inside" — only reorder.
    if (isTokenTarget) {
      zone = offsetY < h / 2 ? 'before' : 'after';
    } else {
      if (offsetY < h * 0.3) zone = 'before';
      else if (offsetY > h * 0.7) zone = 'after';
      else zone = 'inside';
    }
    setDropTarget({ path, zone });

    // Auto-expand on hover-inside of collapsed group.
    if (zone === 'inside' && !isTokenTarget) {
      const key = path.join('.');
      if (!props.expanded.has(key)) {
        if (hoverExpandTimer.current) window.clearTimeout(hoverExpandTimer.current);
        hoverExpandTimer.current = window.setTimeout(() => {
          props.onToggle(key);
        }, HOVER_EXPAND_MS);
      }
    } else if (hoverExpandTimer.current) {
      window.clearTimeout(hoverExpandTimer.current);
      hoverExpandTimer.current = null;
    }
  };

  const handleDropRow = (e: React.DragEvent, path: string[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragInfo || !dropTarget || !props.onMove) {
      endDrag();
      return;
    }
    if (isDescendantPath(path, dragInfo.fromPath)) {
      endDrag();
      return;
    }

    if (dropTarget.zone === 'inside') {
      props.onMove(dragInfo.fromPath, path);
    } else {
      // before / after: drop is a sibling of `path`. Parent = path[:-1].
      const parent = path.slice(0, -1);
      const sibling = path[path.length - 1];
      const placement =
        dropTarget.zone === 'before' ? { beforeName: sibling } : { afterName: sibling };
      props.onMove(dragInfo.fromPath, parent, placement);
    }
    endDrag();
  };

  // Drop on the "empty space" at the bottom of the sidebar = move to top-level
  // (parent = []). Only meaningful for top-level groups.
  const handleDropOnEmpty = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragInfo || !props.onMove) {
      endDrag();
      return;
    }
    if (dragInfo.fromPath.length > 1) {
      // Moving a sub-node to top-level only makes sense if it's a valid layer name.
      // To avoid surprises, require the source to be a top-level item.
      endDrag();
      return;
    }
    endDrag();
  };

  return (
    <aside
      className="sidebar-tree"
      onDragOver={(e) => {
        // Allow drop on empty area
        if (dragInfo) e.preventDefault();
      }}
      onDrop={handleDropOnEmpty}
    >
      <div
        className={`tree-row tree-root ${selectedPath.length === 0 ? 'selected' : ''}`}
        onClick={() => onSelect([])}
      >
        <span className="tree-toggle" />
        <span className="tree-label">Tous les tokens</span>
        <span className="tree-count">{countTokensUnder(tree)}</span>
      </div>
      {ALL_LAYERS.filter((l) => (tree as any)[l]).map((layer) => (
        <TreeNode
          key={layer}
          {...props}
          path={[layer]}
          label={layer}
          level={0}
          editingPath={editingPath}
          setEditingPath={setEditingPath}
          pendingNew={pendingNew}
          setPendingNew={setPendingNew}
          handleContextMenu={handleContextMenu}
          dragInfo={dragInfo}
          dropTarget={dropTarget}
          startDrag={startDrag}
          endDrag={endDrag}
          handleDragOverRow={handleDragOverRow}
          handleDropRow={handleDropRow}
        />
      ))}

      {contextMenu && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu)}
          onClose={closeContextMenu}
        />
      )}
    </aside>
  );
};

// ===== Recursive TreeNode =====

interface TreeNodeProps extends Props {
  path: string[];
  label: string;
  level: number;
  editingPath: string[] | null;
  setEditingPath: (p: string[] | null) => void;
  pendingNew: PendingNew | null;
  setPendingNew: (p: PendingNew | null) => void;
  handleContextMenu: (e: React.MouseEvent, path: string[]) => void;
  dragInfo: DragInfo | null;
  dropTarget: DropTarget | null;
  startDrag: (e: React.DragEvent, path: string[], isToken: boolean) => void;
  endDrag: () => void;
  handleDragOverRow: (e: React.DragEvent, rowEl: HTMLDivElement, path: string[], isToken: boolean) => void;
  handleDropRow: (e: React.DragEvent, path: string[]) => void;
}

const TreeNode: React.FC<TreeNodeProps> = (props) => {
  const {
    tree,
    path,
    label,
    level,
    selectedPath,
    onSelect,
    expanded,
    onToggle,
    editingPath,
    setEditingPath,
    pendingNew,
    setPendingNew,
    handleContextMenu,
    dragInfo,
    dropTarget,
    startDrag,
    endDrag,
    handleDragOverRow,
    handleDropRow,
  } = props;

  const node = getNodeAt(tree, path);
  const nodeIsGroup = isGroup(node);
  const groupChildren = nodeIsGroup ? Object.keys(node).filter((k) => isGroup(node[k])) : [];
  const allChildren = nodeIsGroup ? Object.keys(node) : [];
  const tokenCount = countTokensUnder(node);

  const key = path.join('.');
  const isExpanded = expanded.has(key);
  const isSelected = selectedPath.join('.') === key;
  const hasGroupChildren = groupChildren.length > 0;
  const isLayer = path.length === 1;
  const isEditing = editingPath?.join('.') === key;

  const rowRef = useRef<HTMLDivElement | null>(null);
  const isDragSource = dragInfo?.fromPath.join('.') === key;
  const isDropTarget = dropTarget?.path.join('.') === key;
  const dropZone: DropZone | null = isDropTarget ? dropTarget!.zone : null;

  // Siblings (used by inline rename to detect collisions).
  const parentPath = path.slice(0, -1);
  const siblingsObj =
    parentPath.length === 0 ? (tree as any) : getNodeAt(tree, parentPath);
  const siblingNames =
    siblingsObj && typeof siblingsObj === 'object'
      ? Object.keys(siblingsObj).filter((n) => n !== path[path.length - 1])
      : [];

  const startEdit = () => {
    if (!isLayer && props.onRename) setEditingPath(path);
  };

  const onRowClick = (e: React.MouseEvent) => {
    if (isEditing) return;
    onSelect(path);
  };

  const onDoubleClickLabel = (e: React.MouseEvent) => {
    if (isLayer) return;
    e.stopPropagation();
    startEdit();
  };

  // Show "new subgroup" inline row when pendingNew matches this group.
  const showPendingChild =
    nodeIsGroup &&
    pendingNew &&
    pendingNew.parentPath.join('.') === key &&
    pendingNew.kind === 'group';

  return (
    <>
      <div
        ref={rowRef}
        className={[
          'tree-row',
          isSelected ? 'selected' : '',
          isDragSource ? 'drag-source' : '',
          isDropTarget && dropZone === 'inside' ? 'drop-inside' : '',
        ].join(' ').trim()}
        style={{ paddingLeft: 8 + level * 12 }}
        onClick={onRowClick}
        onContextMenu={(e) => handleContextMenu(e, path)}
        draggable={!isLayer && !isEditing && !!props.onMove}
        onDragStart={(e) => startDrag(e, path, !nodeIsGroup)}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (rowRef.current) handleDragOverRow(e, rowRef.current, path, !nodeIsGroup);
        }}
        onDrop={(e) => handleDropRow(e, path)}
      >
        {isDropTarget && dropZone === 'before' && <div className="drop-bar drop-bar-top" />}
        {isDropTarget && dropZone === 'after' && <div className="drop-bar drop-bar-bottom" />}

        <button
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasGroupChildren) onToggle(key);
          }}
          disabled={!hasGroupChildren}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {hasGroupChildren ? (isExpanded ? '▾' : '▸') : ''}
        </button>

        {isEditing ? (
          <InlineRenameInput
            initial={path[path.length - 1]}
            onConfirm={(name) => {
              if (props.onRename) props.onRename(path, name);
              setEditingPath(null);
            }}
            onCancel={() => setEditingPath(null)}
            siblingNames={siblingNames}
          />
        ) : (
          <span className="tree-label" onDoubleClick={onDoubleClickLabel}>{label}</span>
        )}

        {!isEditing && (
          <>
            <span className="tree-count">{tokenCount}</span>
            {!isLayer && (
              <div className="tree-actions">
                {nodeIsGroup && props.onAddGroup && (
                  <button
                    className="tree-action-btn"
                    title="New subgroup"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isExpanded) onToggle(key);
                      setPendingNew({ parentPath: path, kind: 'group' });
                    }}
                  >
                    +
                  </button>
                )}
                <button
                  className="tree-action-btn"
                  title="More actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, path);
                  }}
                >
                  ⋯
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {isExpanded &&
        groupChildren.map((child) => (
          <TreeNode
            key={child}
            {...props}
            path={[...path, child]}
            label={child}
            level={level + 1}
          />
        ))}

      {showPendingChild && (
        <div
          className="tree-row"
          style={{ paddingLeft: 8 + (level + 1) * 12 }}
        >
          <span className="tree-toggle" />
          <InlineRenameInput
            initial=""
            placeholder="new-group"
            onConfirm={(name) => {
              if (props.onAddGroup) props.onAddGroup(path, name);
              setPendingNew(null);
            }}
            onCancel={() => setPendingNew(null)}
            siblingNames={nodeIsGroup ? Object.keys(node) : []}
          />
        </div>
      )}

      {isExpanded && allChildren.length === 0 && !showPendingChild && (
        <div className="tree-empty" style={{ paddingLeft: 8 + (level + 1) * 12 }}>
          (vide)
        </div>
      )}
    </>
  );
};

// ===== Inline rename input =====

interface InlineRenameInputProps {
  initial: string;
  placeholder?: string;
  siblingNames: string[];
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  initial,
  placeholder,
  siblingNames,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, []);

  const validate = (name: string): string | null => {
    const v = name.trim();
    if (!v) return 'Le nom est requis';
    if (v.includes('.') || v.includes('/')) return 'Caractères interdits : . /';
    if (v !== initial && siblingNames.includes(v)) return 'Nom déjà utilisé';
    return null;
  };

  const submit = () => {
    const err = validate(value);
    if (err) {
      setError(err);
      return;
    }
    if (value.trim() === initial) {
      onCancel();
      return;
    }
    onConfirm(value.trim());
  };

  return (
    <span className="tree-rename-wrap">
      <input
        ref={ref}
        className="tree-rename-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          e.stopPropagation();
        }}
        onBlur={submit}
        onClick={(e) => e.stopPropagation()}
      />
      {error && <span className="tree-rename-error">{error}</span>}
    </span>
  );
};

function countTokensUnder(node: any): number {
  if (!node || typeof node !== 'object') return 0;
  if (node && typeof node === 'object' && '$value' in node) return 1;
  let n = 0;
  for (const k of Object.keys(node)) n += countTokensUnder(node[k]);
  return n;
}
