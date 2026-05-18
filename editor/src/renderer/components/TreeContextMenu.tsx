import React, { useEffect, useRef } from 'react';

export interface TreeContextMenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: Array<TreeContextMenuItem | 'separator'>;
  onClose: () => void;
}

export const TreeContextMenu: React.FC<Props> = ({ x, y, items, onClose }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on click-outside / Esc.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp position so the menu stays on screen.
  const adjusted = clampToViewport(x, y, 200, items.length * 28);

  return (
    <div
      ref={ref}
      className="tree-context-menu"
      style={{ top: adjusted.y, left: adjusted.x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={'sep' + i} className="tree-context-separator" />
        ) : (
          <button
            key={item.label + i}
            className={`tree-context-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="tree-context-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
};

function clampToViewport(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w - 8;
  const maxY = window.innerHeight - h - 8;
  return { x: Math.min(x, Math.max(0, maxX)), y: Math.min(y, Math.max(0, maxY)) };
}
