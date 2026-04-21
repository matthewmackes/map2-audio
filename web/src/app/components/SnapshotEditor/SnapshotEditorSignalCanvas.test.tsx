import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { JuceGridSignalCanvas } from './SnapshotEditorSignalCanvas'

jest.mock('../../hooks/useVuMeters', () => ({
  __esModule: true,
  default: () => ({
    levels: {
      inputLeft: -60,
      inputRight: -60,
      outputLeft: -24,
      outputRight: -12,
      running: true,
    },
    peakHold: {
      inputLeft: -60,
      inputRight: -60,
      outputLeft: -24,
      outputRight: -12,
    },
    isConnected: true,
    isRunning: true,
    resetPeaks: () => {},
  }),
}))

const pluginMeta = {
  'plugin://drive': {
    uri: 'plugin://drive',
    name: 'Drive',
    category: 'Distortion',
  },
  'map2://juce/dynamics/gate': {
    uri: 'map2://juce/dynamics/gate',
    name: 'Noise Gate',
    category: 'Dynamics',
  },
} as any

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    name: 'Main Chain',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
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
    ...overrides,
  }
}

describe('SnapshotEditorSignalCanvas (UnifiedChannelGrid)', () => {
  it('renders the grid shell with the chain row and a Block for the plugin', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        audioStatus={{ isRunning: true, routingMode: 'series' }}
      />,
    )

    expect(screen.getByTestId('snapshot-signal-canvas')).toBeInTheDocument()
    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Drive/ })).toBeInTheDocument()
    expect(screen.getByText('Main Chain')).toBeInTheDocument()
  })

  it('renders the empty Tile when no chain is selected', () => {
    render(
      <JuceGridSignalCanvas
        chain={null}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByText('Select a chain to view and edit')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('applies canvas-level settings to the root container', () => {
    const { container } = render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        flowAnimation="packet"
        gridBackdrop={false}
        nodeShape="hex"
      />,
    )

    const canvas = container.querySelector('.snapshot-editor-signal-canvas')
    expect(canvas).toHaveAttribute('data-flow', 'packet')
    expect(canvas).toHaveAttribute('data-grid-backdrop', 'false')
    expect(canvas).toHaveAttribute('data-node-shape', 'hex')
  })

  it('routes block click → onPluginSelect with uri + slot index', () => {
    const handleSelect = jest.fn()
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={handleSelect}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Drive/ }))
    expect(handleSelect).toHaveBeenCalledWith('plugin://drive', 0)
  })

  it('routes empty-slot click → onAddPlugin(position) when not read-only', () => {
    const handleAdd = jest.fn()
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={handleAdd}
      />,
    )

    const emptySlots = screen.getAllByRole('button', { name: /Add block to slot/ })
    expect(emptySlots.length).toBeGreaterThan(0)
    fireEvent.click(emptySlots[0])
    // First empty slot after slot 0 (which has Drive) is slot 1
    expect(handleAdd).toHaveBeenCalledWith(1)
  })

  it('routes mute + solo header buttons to onMuteToggle / onSoloToggle', () => {
    const handleMute = jest.fn()
    const handleSolo = jest.fn()
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onMuteToggle={handleMute}
        onSoloToggle={handleSolo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(handleMute).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    expect(handleSolo).toHaveBeenCalledTimes(1)
  })

  it('reflects selected plugin as the selected block in the grid', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri="plugin://drive"
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    const block = screen.getByRole('button', { name: /Drive/ })
    expect(block).toHaveAttribute('aria-pressed', 'true')
  })
})
