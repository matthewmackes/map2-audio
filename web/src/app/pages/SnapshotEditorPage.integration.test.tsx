import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { SnapshotEditorSnapshotInspectorControls } from '../components/SnapshotEditor/SnapshotEditorSnapshotStatusPanel'
import { JuceGridSignalCanvas } from '../components/SnapshotEditor/SnapshotEditorSignalCanvas'

jest.mock('../hooks/useVuMeters', () => ({
  __esModule: true,
  default: () => ({
    levels: {
      inputLeft: -60,
      inputRight: -60,
      outputLeft: -60,
      outputRight: -60,
      running: false,
    },
    peakHold: {
      inputLeft: -60,
      inputRight: -60,
      outputLeft: -60,
      outputRight: -60,
    },
    isConnected: false,
    isRunning: false,
    resetPeaks: () => {},
  }),
}))

jest.mock('../hooks/useCPUMetrics', () => {
  const _metrics = {
    totalCpuPercent: 0,
    xrunCount: 0,
    timestamp: 0,
    perPluginPercent: {},
  }
  const _result = {
    metrics: _metrics,
    isConnected: false,
    isLoading: false,
    isError: false,
    status: 'ok' as const,
    hasXruns: false,
    getPluginCpu: (_id: string | number) => 0,
    getTopConsumers: () => [],
    warningThreshold: 70,
    criticalThreshold: 90,
  }
  return {
    __esModule: true,
    useCPUMetrics: () => _result,
    default: () => _result,
  }
})

const mockSpecialSettings = {
  'snapshot_editor.flow_animation': 'packet',
  'snapshot_editor.grid_backdrop': false,
  'snapshot_editor.node_shape': 'hex',
} as const

const mockChain = {
  id: 101,
  name: 'Main Chain',
  is_active: true,
  created_at: '2026-04-20T00:00:00Z',
  updated_at: '2026-04-20T00:00:00Z',
  plugins: [
    {
      uri: 'plugin://drive',
      name: 'Drive',
      position: 0,
      bypassed: false,
      parameters: {},
    },
  ],
  loop_insertions: [],
  effects_loops: [],
  runtime_sync: null,
}

const mockPluginMeta = {
  'plugin://drive': {
    uri: 'plugin://drive',
    name: 'Drive',
    category: 'Drive',
  },
} as any

function resolveMockSignalCanvasSettings() {
  return {
    flowAnimation: mockSpecialSettings['snapshot_editor.flow_animation'],
    gridBackdrop: mockSpecialSettings['snapshot_editor.grid_backdrop'],
    nodeShape: mockSpecialSettings['snapshot_editor.node_shape'],
  }
}

function SnapshotEditorPageIntegrationHarness() {
  const signalCanvasSettings = resolveMockSignalCanvasSettings()

  return (
    <section aria-label="Snapshot editor integration harness">
      <SnapshotEditorSnapshotInspectorControls
        activeWorkspaceActionId="signal-grid"
        onOpenSignalGrid={jest.fn()}
        onOpenDirectory={jest.fn()}
        onOpenParameters={jest.fn()}
        onOpenAutomation={jest.fn()}
        onOpenVersionHistory={jest.fn()}
        onOpenHelp={jest.fn()}
      />

      <main aria-label="Signal flow workspace">
        <JuceGridSignalCanvas
          chain={mockChain as any}
          chainLabel="A"
          pluginMeta={mockPluginMeta}
          selectedPluginUri={null}
          selectedPluginPosition={null}
          onPluginSelect={jest.fn()}
          onToggleBypass={jest.fn()}
          onReorderPlugins={jest.fn()}
          flowAnimation={signalCanvasSettings.flowAnimation}
          gridBackdrop={signalCanvasSettings.gridBackdrop}
          nodeShape={signalCanvasSettings.nodeShape}
        />
      </main>
    </section>
  )
}

function SnapshotEditorParameterPanelHarness() {
  return (
    <section aria-label="Block parameter editor">
      <div className="juce-grid-page__bottom-editor-body">
        <div className="juce-grid-page__bottom-editor-parameter-stack">
          <div className="juce-grid-page__snapshot-inspector-row juce-grid-page__snapshot-inspector-row--parameter-editor">
            <SnapshotEditorSnapshotInspectorControls
              activeWorkspaceActionId="parameters"
              onOpenSignalGrid={jest.fn()}
              onOpenDirectory={jest.fn()}
              onOpenParameters={jest.fn()}
              onOpenAutomation={jest.fn()}
              onOpenVersionHistory={jest.fn()}
              onOpenHelp={jest.fn()}
              onOpenSnapshots={jest.fn()}
              onCreateSnapshot={jest.fn()}
              onOpenProgressModal={jest.fn()}
            />
          </div>
          <div role="region" aria-label="Drive parameters">
            Drive parameter controls
          </div>
        </div>
      </div>
    </section>
  )
}

describe('SnapshotEditorPage integration', () => {
  it('assembles the snapshot inspector navigation and signal canvas with mocked Special Settings', () => {
    const { container } = render(<SnapshotEditorPageIntegrationHarness />)

    expect(screen.queryByRole('navigation', { name: 'Snapshot navigation' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Snapshot workspace destinations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Signal Grid' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Signal flow workspace')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drive' })).toBeInTheDocument()

    const signalCanvas = container.querySelector('.snapshot-editor-signal-canvas')
    expect(signalCanvas).toHaveAttribute('data-flow', 'packet')
    expect(signalCanvas).toHaveAttribute('data-grid-backdrop', 'false')
    expect(signalCanvas).toHaveAttribute('data-node-shape', 'hex')
    expect(container.querySelector('.ucg-grid')).toBeInTheDocument()
  })

  it('keeps snapshot inspector actions reachable above an open block parameter editor', () => {
    render(<SnapshotEditorParameterPanelHarness />)

    expect(screen.getByLabelText('Snapshot workspace destinations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Signal Grid' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Directory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parameters' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Automation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Version History' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish to live' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Snapshots' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Drive parameters' })).toBeInTheDocument()
  })
})
