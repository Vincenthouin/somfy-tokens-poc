import React from 'react';
import { TokenFile } from '../../shared/types';
import { isGroup, getNodeAt, ALL_LAYERS } from '../utils/tokenTree';

interface Props {
  tree: TokenFile;
  selectedPath: string[];
  onSelect: (path: string[]) => void;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}

interface TreeNodeProps extends Props {
  path: string[];
  label: string;
  level: number;
}

/**
 * Recursive tree node. Renders a clickable row + collapsible children if it's a group.
 */
const TreeNode: React.FC<TreeNodeProps> = (props) => {
  const { tree, path, label, level, selectedPath, onSelect, expanded, onToggle } = props;
  const node = getNodeAt(tree, path);
  const groupChildren = isGroup(node)
    ? Object.keys(node).filter((k) => isGroup(node[k]))
    : [];
  const allChildren = isGroup(node) ? Object.keys(node) : [];
  const tokenCount = countTokensUnder(node);

  const key = path.join('.');
  const isExpanded = expanded.has(key);
  const isSelected = selectedPath.join('.') === key;
  const hasGroupChildren = groupChildren.length > 0;

  return (
    <>
      <div
        className={`tree-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + level * 12 }}
        onClick={() => onSelect(path)}
      >
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
        <span className="tree-label">{label}</span>
        <span className="tree-count">{tokenCount}</span>
      </div>
      {isExpanded &&
        groupChildren.map((child) => (
          <TreeNode
            key={child}
            tree={tree}
            path={[...path, child]}
            label={child}
            level={level + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
      {/* Show leaf tokens count too via children list (not clickable in tree) */}
      {isExpanded && allChildren.length === 0 && (
        <div className="tree-empty" style={{ paddingLeft: 8 + (level + 1) * 12 }}>
          (vide)
        </div>
      )}
    </>
  );
};

export const SidebarTree: React.FC<Props> = (props) => {
  const { tree, selectedPath, onSelect } = props;

  return (
    <aside className="sidebar-tree">
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
        />
      ))}
    </aside>
  );
};

function countTokensUnder(node: any): number {
  if (!node || typeof node !== 'object') return 0;
  if (node && typeof node === 'object' && '$value' in node) return 1;
  let n = 0;
  for (const k of Object.keys(node)) n += countTokensUnder(node[k]);
  return n;
}
