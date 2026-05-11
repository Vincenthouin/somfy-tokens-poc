import React from 'react';
import { FlatToken } from '../../shared/types';

interface Props {
  tokens: FlatToken[];
  active: string;
  onChange: (filter: string) => void;
}

const TYPE_GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: 'all', label: 'All', types: [] },
  { id: 'color', label: 'Color', types: ['color'] },
  { id: 'spacing', label: 'Dimension', types: ['dimension'] },
  { id: 'typography', label: 'Typography', types: ['typography', 'fontFamily', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing'] },
  { id: 'shadow', label: 'Shadow', types: ['shadow'] },
  { id: 'number', label: 'Number', types: ['number'] },
  { id: 'other', label: 'Other', types: ['string', 'duration', 'cubicBezier', 'border'] },
];

export function matchesFilter(token: FlatToken, filterId: string): boolean {
  if (filterId === 'all') return true;
  const group = TYPE_GROUPS.find((g) => g.id === filterId);
  if (!group) return false;
  return token.type ? group.types.includes(token.type) : false;
}

export const FilterPills: React.FC<Props> = ({ tokens, active, onChange }) => {
  return (
    <div className="filter-pills">
      {TYPE_GROUPS.map((g) => {
        const count = g.id === 'all' ? tokens.length : tokens.filter((t) => matchesFilter(t, g.id)).length;
        if (count === 0 && g.id !== 'all' && g.id !== active) return null;
        return (
          <button
            key={g.id}
            className={`filter-pill ${active === g.id ? 'active' : ''}`}
            onClick={() => onChange(g.id)}
          >
            {g.label}
            <span className="filter-pill-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
};
