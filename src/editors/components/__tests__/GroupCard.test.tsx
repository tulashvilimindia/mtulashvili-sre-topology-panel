// ─── Grafana UI primitives stubbed ────────────────────────────────────
//
// GroupCard uses CollapsableSection, Input, RadioButtonGroup (twice — Type
// and Style), IconButton, and a multi-select Select for members. The
// multi-select Select is the most complex to stub — it renders one
// checkbox-like option per node so members can be toggled on and off.

jest.mock('@grafana/ui', () => {
  const React = require('react');
  return {
    IconButton: (props: Record<string, unknown>) =>
      React.createElement('button', {
        ...props,
        type: 'button',
        'aria-label': props.tooltip ?? props.name,
      }),
    Input: (props: {
      value?: unknown;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      placeholder?: string;
    }) =>
      React.createElement('input', {
        type: 'text',
        value: (props.value as string) ?? '',
        onChange: props.onChange,
        placeholder: props.placeholder,
      }),
    CollapsableSection: (props: {
      label?: React.ReactNode;
      isOpen?: boolean;
      onToggle?: () => void;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        'section',
        { 'data-testid': 'collapsable', 'data-is-open': String(!!props.isOpen) },
        React.createElement('button', { onClick: props.onToggle, type: 'button' }, props.label),
        props.isOpen ? React.createElement('div', {}, props.children) : null
      ),
    RadioButtonGroup: (props: {
      options?: Array<{ label: string; value: string }>;
      value?: string;
      onChange?: (v: string) => void;
    }) =>
      React.createElement(
        'div',
        { role: 'radiogroup' },
        (props.options ?? []).map((o) =>
          React.createElement(
            'label',
            { key: o.value },
            React.createElement('input', {
              type: 'radio',
              checked: props.value === o.value,
              onChange: () => props.onChange?.(o.value),
              'data-testid': `radio-${o.value}`,
            }),
            o.label
          )
        )
      ),
    // The multi-select Select: one option per node, selected members are
    // ticked. onChange receives the full selected array in Grafana's shape
    // `[{ label, value }, ...]` — our stub mirrors that.
    Select: (props: {
      isMulti?: boolean;
      options?: Array<{ label: string; value: string }>;
      value?: Array<{ label: string; value: string }>;
      onChange?: (v: Array<{ label: string; value: string }>) => void;
      placeholder?: string;
    }) => {
      if (!props.isMulti) {
        // GroupCard only uses isMulti, but defensive: single-select fallback.
        return React.createElement('select', {
          'data-testid': 'single-select',
          value: (props.value as unknown as string) ?? '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
            props.onChange?.(e.target.value as unknown as Array<{ label: string; value: string }>),
        });
      }
      const selectedValues = new Set((props.value ?? []).map((v) => v.value));
      return React.createElement(
        'div',
        { role: 'listbox', 'data-testid': 'multi-select' },
        (props.options ?? []).map((o) =>
          React.createElement(
            'label',
            { key: o.value },
            React.createElement('input', {
              type: 'checkbox',
              checked: selectedValues.has(o.value),
              'data-testid': `member-${o.value}`,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const next = new Set(selectedValues);
                if (e.target.checked) { next.add(o.value); }
                else { next.delete(o.value); }
                const nextSelection = (props.options ?? [])
                  .filter((opt) => next.has(opt.value))
                  .map((opt) => ({ label: opt.label, value: opt.value }));
                props.onChange?.(nextSelection);
              },
            }),
            o.label
          )
        )
      );
    },
  };
});

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GroupCard } from '../GroupCard';
import { NodeGroup, TopologyNode } from '../../../types';

const NODES: TopologyNode[] = [
  { id: 'n-a', name: 'Alpha', role: '', type: 'server', metrics: [], position: { x: 0, y: 0 }, compact: false },
  { id: 'n-b', name: 'Beta', role: '', type: 'database', metrics: [], position: { x: 0, y: 0 }, compact: false },
  { id: 'n-c', name: 'Gamma', role: '', type: 'server', metrics: [], position: { x: 0, y: 0 }, compact: false },
];

function renderGroupCard(overrides: Partial<NodeGroup> = {}) {
  const onChange = jest.fn();
  const onDelete = jest.fn();
  const group: NodeGroup = {
    id: 'grp-1',
    label: 'HA Pair',
    type: 'ha_pair',
    nodeIds: ['n-a', 'n-b'],
    style: 'dashed',
    ...overrides,
  };
  const result = render(
    <GroupCard
      group={group}
      nodes={NODES}
      isOpen={true}
      onToggle={jest.fn()}
      onChange={onChange}
      onDelete={onDelete}
    />
  );
  return { ...result, onChange, onDelete };
}

describe('GroupCard', () => {
  test('renders the group label in the header', () => {
    renderGroupCard({ label: 'My Custom Group' });
    // Label shown both as the input value AND as the collapsable header.
    expect(screen.getAllByText('My Custom Group').length).toBeGreaterThan(0);
  });

  test('editing the Label input writes group.label via onChange', () => {
    const { onChange } = renderGroupCard({ label: 'Old' });
    const input = screen.getByDisplayValue('Old') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: 'New label' } });
    });
    const last = onChange.mock.calls.at(-1)![0] as NodeGroup;
    expect(last.label).toBe('New label');
  });

  test('selecting a different Type radio updates group.type', () => {
    const { onChange } = renderGroupCard({ type: 'ha_pair' });
    fireEvent.click(screen.getByTestId('radio-cluster'));
    const last = onChange.mock.calls.at(-1)![0] as NodeGroup;
    expect(last.type).toBe('cluster');
  });

  test('selecting a different Style radio updates group.style', () => {
    const { onChange } = renderGroupCard({ style: 'dashed' });
    fireEvent.click(screen.getByTestId('radio-solid'));
    const last = onChange.mock.calls.at(-1)![0] as NodeGroup;
    expect(last.style).toBe('solid');
  });

  test('toggling a member checkbox adds the node to nodeIds', () => {
    const { onChange } = renderGroupCard({ nodeIds: ['n-a'] });
    // n-c is not a member — click it to add.
    fireEvent.click(screen.getByTestId('member-n-c'));
    const last = onChange.mock.calls.at(-1)![0] as NodeGroup;
    expect(last.nodeIds.sort()).toEqual(['n-a', 'n-c']);
  });

  test('un-checking a member removes it from nodeIds', () => {
    const { onChange } = renderGroupCard({ nodeIds: ['n-a', 'n-b'] });
    fireEvent.click(screen.getByTestId('member-n-a'));
    const last = onChange.mock.calls.at(-1)![0] as NodeGroup;
    expect(last.nodeIds).toEqual(['n-b']);
  });

  test('delete button fires onDelete', () => {
    const { onDelete } = renderGroupCard();
    fireEvent.click(screen.getByLabelText('Delete group'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
