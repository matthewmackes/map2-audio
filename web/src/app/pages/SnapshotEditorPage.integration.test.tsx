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
})
