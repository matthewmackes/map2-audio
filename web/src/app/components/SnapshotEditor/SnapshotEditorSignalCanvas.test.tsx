import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { JuceGridSignalCanvas } from './SnapshotEditorSignalCanvas'

const pluginMeta = {
  'plugin://drive': {
    uri: 'plugin://drive',
    name: 'Drive',
    category: 'Drive',
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

describe('SnapshotEditorSignalCanvas', () => {
  it('assembles the chain row with head, terminals, node, meter, and side panel', () => {
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
        audioOutputStatus={{ isRunning: true, meterLevels: [0.25, 0.5] }}
      />,
    )

    expect(screen.getByTestId('snapshot-signal-chain-row')).toBeInTheDocument()
    expect(screen.getByLabelText('IN terminal')).toBeInTheDocument()
    expect(screen.getByLabelText('OUT terminal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drive' })).toBeInTheDocument()
    expect(screen.getAllByText('Main Chain')).toHaveLength(2)
    expect(screen.getByLabelText('Main Chain chain side panel')).toBeInTheDocument()
  })

  it('routes plugin selection, bypass, and delete through live handlers', () => {
    const handleSelect = jest.fn()
    const handleBypass = jest.fn()
    const handleDelete = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="A"
        pluginMeta={pluginMeta}
        selectedPluginUri="plugin://drive"
        selectedPluginPosition={0}
        onPluginSelect={handleSelect}
        onToggleBypass={handleBypass}
        onDeletePlugin={handleDelete}
        onReorderPlugins={jest.fn()}
        audioStatus={{ isRunning: true }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Drive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bypass Drive' }))
    fireEvent.click(screen.getByTestId('snapshot-signal-node-delete-0'))

    expect(handleSelect).toHaveBeenCalledWith('plugin://drive', 0)
    expect(handleBypass).toHaveBeenCalledWith('plugin://drive', true, 0)
    expect(handleDelete).toHaveBeenCalledWith('plugin://drive', 0)
  })

  it('hides mutation controls in readonly mode', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="B"
        pluginMeta={pluginMeta}
        selectedPluginUri="plugin://drive"
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onDeletePlugin={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        showAddPluginSlot
        readOnly
      />,
    )

    expect(screen.queryByRole('button', { name: 'Bypass Drive' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('snapshot-signal-node-delete-0')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add effect' })).not.toBeInTheDocument()
  })

  it('renders system blocks with a badge and no delete affordance', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain({
          plugins: [
            {
              uri: 'map2://juce/dynamics/gate',
              name: 'Noise Gate',
              position: 0,
              bypassed: false,
              parameters: {},
              loader_state: {
                system_block_role: 'noise_gate',
                system_block_locked: true,
                system_block_label: 'SYS',
              },
            },
          ],
        })}
        chainLabel="C"
        pluginMeta={pluginMeta}
        selectedPluginUri="map2://juce/dynamics/gate"
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onDeletePlugin={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('snapshot-signal-system-badge-0')).toHaveTextContent('SYS')
    expect(screen.queryByTestId('snapshot-signal-node-delete-0')).not.toBeInTheDocument()
  })

  it('renders the sidechain connector for sidechain routing', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="E"
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        audioStatus={{ routingMode: 'sidechain', isRunning: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sidechain from KEY SEND' })).toHaveClass('snapshot-sidechain-connector')
  })

  it('routes chain header and side-panel callbacks', () => {
    const handleRename = jest.fn()
    const handleDuplicate = jest.fn()
    const handleActivate = jest.fn()
    const handleDelete = jest.fn()
    const handleMute = jest.fn()
    const handleSolo = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={buildChain()}
        chainLabel="D"
        chainMuted
        chainSoloed
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onRenameChain={handleRename}
        onDuplicateChain={handleDuplicate}
        onToggleChainActive={handleActivate}
        onDeleteChain={handleDelete}
        onMuteToggle={handleMute}
        onSoloToggle={handleSolo}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename Main Chain' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate Main Chain' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate Main Chain' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Main Chain' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Unmute Main Chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unsolo Main Chain' }))

    expect(handleRename).toHaveBeenCalledTimes(1)
    expect(handleDuplicate).toHaveBeenCalledTimes(1)
    expect(handleActivate).toHaveBeenCalledTimes(1)
    expect(handleDelete).toHaveBeenCalledTimes(1)
    expect(handleMute).toHaveBeenCalledTimes(1)
    expect(handleSolo).toHaveBeenCalledTimes(1)
  })
})
