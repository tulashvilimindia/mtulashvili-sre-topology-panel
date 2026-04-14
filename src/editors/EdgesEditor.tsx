import React, { useCallback, useState, useMemo } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button } from '@grafana/ui';
import { TopologyPanelOptions, TopologyEdge, DEFAULT_EDGE } from '../types';
import { EdgeCard } from './components/EdgeCard';
import { generateId } from './utils/editorUtils';
import './editors.css';

type Props = StandardEditorProps<TopologyEdge[], object, TopologyPanelOptions>;

export const EdgesEditor: React.FC<Props> = ({ value, onChange, context }) => {
  // Stable references via useMemo so useCallback deps don't fire on every parent render
  const edges = useMemo(() => value || [], [value]);
  const nodes = useMemo(() => context.options?.nodes || [], [context.options?.nodes]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const newEdge: TopologyEdge = {
      ...(DEFAULT_EDGE as TopologyEdge),
      id: generateId('e'),
      sourceId: nodes.length > 0 ? nodes[0].id : '',
      targetId: nodes.length > 1 ? nodes[1].id : '',
    };
    onChange([...edges, newEdge]);
    setExpandedIds((prev) => new Set(prev).add(newEdge.id));
  }, [edges, nodes, onChange]);

  const handleChange = useCallback(
    (updated: TopologyEdge) => {
      onChange(edges.map((e) => (e.id === updated.id ? updated : e)));
    },
    [edges, onChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(edges.filter((e) => e.id !== id));
    },
    [edges, onChange]
  );

  const handleDuplicate = useCallback(
    (edge: TopologyEdge) => {
      const dup: TopologyEdge = {
        ...edge,
        id: generateId('e'),
      };
      onChange([...edges, dup]);
      setExpandedIds((prev) => new Set(prev).add(dup.id));
    },
    [edges, onChange]
  );

  return (
    <div>
      <div className="topo-editor-header">
        <span className="topo-editor-header-title">
          Relationships<span className="topo-editor-count">({edges.length})</span>
        </span>
        <Button size="sm" variant="secondary" icon="plus" onClick={handleAdd}>
          Add
        </Button>
      </div>
      {edges.length === 0 && (
        <div className="topo-editor-empty">No relationships defined. Add edges to connect nodes.</div>
      )}
      {edges.map((edge) => (
        <EdgeCard
          key={edge.id}
          edge={edge}
          nodes={nodes}
          isOpen={expandedIds.has(edge.id)}
          onToggle={() => toggleExpand(edge.id)}
          onChange={handleChange}
          onDelete={() => handleDelete(edge.id)}
          onDuplicate={() => handleDuplicate(edge)}
        />
      ))}
    </div>
  );
};
