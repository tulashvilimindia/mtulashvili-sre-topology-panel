// Mock @grafana/ui BEFORE importing the component under test — Icon needs a
// stub so jsdom doesn't choke on the real theme-aware component tree.
jest.mock('@grafana/ui', () => ({
  Icon: ({ name }: { name: string }) => {
    const React = require('react');
    return React.createElement('span', { 'data-testid': 'grafana-icon' }, name);
  },
  IconName: {},
}));

// Mock the datasource range helper so tests don't hit fetch
jest.mock('../../utils/datasourceQuery', () => ({
  queryDatasourceRange: jest.fn().mockResolvedValue([]),
  TimeseriesPoint: {},
}));

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NodePopup } from '../NodePopup';
import { TopologyNode, FiringAlert } from '../../types';

function makeNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: 'n-1',
    name: 'Test Node',
    role: 'test role',
    type: 'server',
    metrics: [],
    position: { x: 0, y: 0 },
    compact: false,
    ...overrides,
  };
}

describe('NodePopup', () => {
  test('renders the node name in the header', async () => {
    render(<NodePopup node={makeNode({ name: 'Web Server 01' })} onClose={jest.fn()} />);
    expect(screen.getByText('Web Server 01')).toBeInTheDocument();
  });

  test('close button fires onClose handler', async () => {
    const onClose = jest.fn();
    render(<NodePopup node={makeNode()} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close');
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows "No metrics configured" when node has no summary metrics', async () => {
    render(<NodePopup node={makeNode()} onClose={jest.fn()} />);
    // Wait for the fetch effect to settle (returns empty via mock)
    await waitFor(() => {
      expect(screen.getByText('No metrics configured')).toBeInTheDocument();
    });
  });

  test('renders firing alert section with rule name as a link', async () => {
    const alerts: FiringAlert[] = [
      { ruleName: 'HighCPU', state: 'firing', labels: { instance: 'web-01' } },
    ];
    render(<NodePopup node={makeNode()} firingAlerts={alerts} onClose={jest.fn()} />);
    expect(screen.getByText('HighCPU')).toBeInTheDocument();
    expect(screen.getByText(/Firing alerts \(1\)/)).toBeInTheDocument();
    // Rule name is rendered as an <a> that links to /alerting/list?search=
    const link = screen.getByText('HighCPU').closest('a');
    expect(link).toHaveAttribute('href', '/alerting/list?search=HighCPU');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('uses /alerting/grafana/{uid}/view link when ruleUid is present', async () => {
    const alerts: FiringAlert[] = [
      { ruleName: 'HighCPU', state: 'firing', labels: {}, ruleUid: 'abc-123' },
    ];
    render(<NodePopup node={makeNode()} firingAlerts={alerts} onClose={jest.fn()} />);
    const link = screen.getByText('HighCPU').closest('a');
    expect(link).toHaveAttribute('href', '/alerting/grafana/abc-123/view');
  });

  test('runbook button renders when annotations.runbook_url is set', async () => {
    const alerts: FiringAlert[] = [
      {
        ruleName: 'HighCPU',
        state: 'firing',
        labels: {},
        annotations: { runbook_url: 'https://wiki.example.com/runbooks/cpu' },
      },
    ];
    render(<NodePopup node={makeNode()} firingAlerts={alerts} onClose={jest.fn()} />);
    const runbook = screen.getByText('Runbook');
    expect(runbook.closest('a')).toHaveAttribute('href', 'https://wiki.example.com/runbooks/cpu');
  });

  test('summary annotation renders below rule name', async () => {
    const alerts: FiringAlert[] = [
      {
        ruleName: 'HighCPU',
        state: 'firing',
        labels: {},
        annotations: { summary: 'CPU saturated on web-01' },
      },
    ];
    render(<NodePopup node={makeNode()} firingAlerts={alerts} onClose={jest.fn()} />);
    expect(screen.getByText('CPU saturated on web-01')).toBeInTheDocument();
  });

  test('description annotation is used as fallback when summary is missing', async () => {
    const alerts: FiringAlert[] = [
      {
        ruleName: 'HighCPU',
        state: 'firing',
        labels: {},
        annotations: { description: 'Fallback text' },
      },
    ];
    render(<NodePopup node={makeNode()} firingAlerts={alerts} onClose={jest.fn()} />);
    expect(screen.getByText('Fallback text')).toBeInTheDocument();
  });

  test('observability link renders as external <a> with interpolated url', async () => {
    const node = makeNode({
      alertLabelMatchers: { instance: 'web-01.prod:9100' },
      observabilityLinks: [
        {
          label: 'Logs',
          url: '/explore?instance=${instance}',
        },
      ],
    });
    render(<NodePopup node={node} onClose={jest.fn()} />);
    const logLink = screen.getByText('Logs').closest('a');
    expect(logLink).toHaveAttribute('href', '/explore?instance=web-01.prod:9100');
    expect(logLink).toHaveAttribute('target', '_blank');
  });

  test('observability link with unknown token leaves ${token} literal in url', async () => {
    const node = makeNode({
      observabilityLinks: [{ label: 'Logs', url: 'https://logs/${typo}' }],
    });
    render(<NodePopup node={node} onClose={jest.fn()} />);
    const link = screen.getByText('Logs').closest('a');
    expect(link).toHaveAttribute('href', 'https://logs/${typo}');
  });

  test('built-in tokens ${name} and ${id} resolve from node props', async () => {
    const node = makeNode({
      id: 'n-srv-01',
      name: 'web-01',
      observabilityLinks: [{ label: 'Dashboard', url: 'https://dash/${id}?n=${name}' }],
    });
    render(<NodePopup node={node} onClose={jest.fn()} />);
    const link = screen.getByText('Dashboard').closest('a');
    expect(link).toHaveAttribute('href', 'https://dash/n-srv-01?n=web-01');
  });

  test('Edit button is hidden when onEdit is not provided', () => {
    render(<NodePopup node={makeNode()} onClose={jest.fn()} />);
    expect(screen.queryByLabelText('Edit node')).not.toBeInTheDocument();
  });

  test('Edit button appears when onEdit is provided and fires the handler', () => {
    const onEdit = jest.fn();
    render(<NodePopup node={makeNode()} onClose={jest.fn()} onEdit={onEdit} />);
    const button = screen.getByLabelText('Edit node');
    expect(button).toBeInTheDocument();
    button.click();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
