import React, { useCallback, useState } from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button } from '@grafana/ui';
import { TopologyPanelOptions, NodeGroup } from '../types';
import { GroupCard } from './components/GroupCard';
import { generateId } from './utils/editorUtils';
import './editors.css';

type Props = StandardEditorProps<NodeGroup[], object, TopologyPanelOptions>;

export const GroupsEditor: React.FC<Props> = ({ value, onChange, context }) => {
  const groups = value || [];
  const nodes = context.options?.nodes || [];
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const newGroup: NodeGroup = {
      id: generateId('grp'),
      label: 'New group',
      type: 'custom',
      nodeIds: [],
      style: 'dashed',
    };
    onChange([...groups, newGroup]);
    setExpandedIds((prev) => new Set(prev).add(newGroup.id));
  }, [groups, onChange]);

  const handleChange = useCallback(
    (updated: NodeGroup) => {
      onChange(groups.map((g) => (g.id === updated.id ? updated : g)));
    },
    [groups, onChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(groups.filter((g) => g.id !== id));
    },
    [groups, onChange]
  );

  return (
    <div>
      <div className="topo-editor-header">
        <span className="topo-editor-header-title">
          Groups<span className="topo-editor-count">({groups.length})</span>
        </span>
        <Button size="sm" variant="secondary" icon="plus" onClick={handleAdd}>
          Add
        </Button>
      </div>
      {groups.length === 0 && <div className="topo-editor-empty">No groups defined. Add one to visually group nodes.</div>}
      {groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          nodes={nodes}
          isOpen={expandedIds.has(group.id)}
          onToggle={() => toggleExpand(group.id)}
          onChange={handleChange}
          onDelete={() => handleDelete(group.id)}
        />
      ))}
    </div>
  );
};
