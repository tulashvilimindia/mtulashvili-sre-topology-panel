// ─── Grafana UI primitives stubbed ────────────────────────────────────
//
// ThresholdList uses Button, IconButton, Input. Stub them as thin native
// React wrappers so the pure-function logic (cycleColor, value-change,
// add/delete) is what the tests exercise.

jest.mock('@grafana/ui', () => {
  const React = require('react');
  return {
    Button: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
      React.createElement('button', { ...props, type: 'button' }, props.children),
    IconButton: (props: Record<string, unknown>) =>
      React.createElement('button', {
        ...props,
        type: 'button',
        'aria-label': props.tooltip ?? props.name,
      }),
    Input: (props: {
      value?: unknown;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      width?: number;
      type?: string;
    }) =>
      React.createElement('input', {
        type: props.type ?? 'text',
        value: (props.value as string) ?? '',
        onChange: props.onChange,
      }),
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThresholdList } from '../ThresholdList';
import { ThresholdStep } from '../../../types';

function renderThresholdList(initial: ThresholdStep[] = []) {
  const onChange = jest.fn();
  const result = render(<ThresholdList thresholds={initial} onChange={onChange} />);
  return { ...result, onChange };
}

describe('ThresholdList — CRUD', () => {
  test('Add threshold appends a { value: 0, color: "green" } row', () => {
    const { onChange } = renderThresholdList([]);
    fireEvent.click(screen.getByText('Add threshold'));
    expect(onChange).toHaveBeenCalledWith([{ value: 0, color: 'green' }]);
  });

  test('Remove-threshold button drops the matching row', () => {
    const { onChange } = renderThresholdList([
      { value: 0, color: 'green' },
      { value: 70, color: 'yellow' },
      { value: 90, color: 'red' },
    ]);
    // Remove the middle (yellow) row.
    const removes = screen.getAllByLabelText('Remove threshold');
    fireEvent.click(removes[1]);
    expect(onChange).toHaveBeenCalledWith([
      { value: 0, color: 'green' },
      { value: 90, color: 'red' },
    ]);
  });

  test('Changing a value fires onChange with the new value, other rows untouched', () => {
    const { onChange } = renderThresholdList([
      { value: 0, color: 'green' },
      { value: 70, color: 'yellow' },
    ]);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { value: '85' } });
    expect(onChange).toHaveBeenCalledWith([
      { value: 0, color: 'green' },
      { value: 85, color: 'yellow' },
    ]);
  });

  test('Empty value input coerces to 0 (parseFloat safety net)', () => {
    const { onChange } = renderThresholdList([{ value: 50, color: 'yellow' }]);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith([{ value: 0, color: 'yellow' }]);
  });
});

describe('ThresholdList — cycleColor', () => {
  test('clicking the color swatch cycles green → yellow → red → green', () => {
    // Start at green, cycle 3 times, assert the full rotation.
    const { onChange, rerender } = renderThresholdList([{ value: 50, color: 'green' }]);
    const swatch = screen.getByRole('button', { name: /Color: green/ });
    fireEvent.click(swatch);
    expect(onChange).toHaveBeenLastCalledWith([{ value: 50, color: 'yellow' }]);

    // Feed the updated state back through the parent — the component is
    // stateless, so re-render with the new colour and click again.
    rerender(<ThresholdList thresholds={[{ value: 50, color: 'yellow' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Color: yellow/ }));
    expect(onChange).toHaveBeenLastCalledWith([{ value: 50, color: 'red' }]);

    rerender(<ThresholdList thresholds={[{ value: 50, color: 'red' }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Color: red/ }));
    expect(onChange).toHaveBeenLastCalledWith([{ value: 50, color: 'green' }]);
  });

  test('keyboard Enter on the color swatch triggers a cycle', () => {
    const { onChange } = renderThresholdList([{ value: 0, color: 'green' }]);
    const swatch = screen.getByRole('button', { name: /Color: green/ });
    swatch.focus();
    fireEvent.keyDown(swatch, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith([{ value: 0, color: 'yellow' }]);
  });

  test('keyboard Space on the color swatch triggers a cycle', () => {
    const { onChange } = renderThresholdList([{ value: 0, color: 'green' }]);
    const swatch = screen.getByRole('button', { name: /Color: green/ });
    swatch.focus();
    fireEvent.keyDown(swatch, { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith([{ value: 0, color: 'yellow' }]);
  });

  test('other keys do NOT cycle the color', () => {
    const { onChange } = renderThresholdList([{ value: 0, color: 'green' }]);
    const swatch = screen.getByRole('button', { name: /Color: green/ });
    swatch.focus();
    fireEvent.keyDown(swatch, { key: 'ArrowRight' });
    fireEvent.keyDown(swatch, { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
