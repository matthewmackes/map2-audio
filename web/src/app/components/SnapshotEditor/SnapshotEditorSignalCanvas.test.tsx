import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { JuceGridSignalCanvas } from './SnapshotEditorSignalCanvas'

const pluginMeta = {
  'plugin://drive': {
    uri: 'plugin://drive',
    name: 'Drive',
    category: 'Drive',
  },
  'map2://juce/nam': {
    uri: 'map2://juce/nam',
    name: 'Neural Amp Modeler',
    category: 'Amplifier',
  },
} as any

function buildChain(bypassed: boolean, uri = 'plugin://drive', name = 'Drive', pluginCount = 1) {
  return {
    id: 101,
    name: 'Main Chain',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    plugins: Array.from({ length: pluginCount }, (_, index) => ({
      uri,
      name: pluginCount > 1 ? `${name} ${index + 1}` : name,
      position: index,
      bypassed: index === 0 ? bypassed : false,
      parameters: {},
    })),
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: null,
  }
}

describe('SnapshotEditorSignalCanvas', () => {
  it('marks bypassed plugins with the dimmed card class', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(true)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).toHaveClass('is-bypassed')
  })

  it('keeps active plugins at full-opacity state', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).not.toHaveClass('is-bypassed')
  })

  it('applies the NAM magenta accent even when the plugin category is Amplifier', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false, 'map2://juce/nam', 'Neural Amp Modeler')}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).toHaveStyle('--juce-grid-signal-accent: #ff7eb6')
  })

  it('renders a single forward lane with explicit input and output terminals', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false, 'plugin://drive', 'Drive', 6)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    const row = screen.getByTestId('juce-grid-signal-row-0')
    const slotKinds = Array.from(row.querySelectorAll<HTMLElement>('[data-slot-kind]')).map((node) => node.dataset.slotKind)

    expect(row).toHaveAttribute('data-row-direction', 'forward')
    expect(screen.queryByTestId('juce-grid-signal-row-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('juce-grid-signal-terminal-input')).toHaveTextContent('IN')
    expect(screen.getByTestId('juce-grid-signal-terminal-output')).toHaveTextContent('OUT')
    expect(slotKinds[0]).toBe('terminal')
    expect(slotKinds[slotKinds.length - 1]).toBe('terminal')
  })

  it('uses a merge terminal for parallel blend routing', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        audioStatus={{ routingMode: 'parallel_blend' }}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-terminal-output')).toHaveTextContent('SUM')
    expect(screen.getByLabelText('Merge bus node')).toBeInTheDocument()
  })

  it('hides destructive editing affordances when the canvas is read-only', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false, 'plugin://drive', 'Drive', 2)}
        pluginMeta={pluginMeta}
        selectedPluginUri="plugin://drive"
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onDeletePlugin={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        readOnly
      />,
    )

    expect(screen.queryByRole('button', { name: 'Add effect' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('juce-grid-signal-plugin-bypass-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('juce-grid-signal-plugin-delete-0')).not.toBeInTheDocument()
  })

  it('shows bypass and delete controls only for the selected plugin card and fires live handlers immediately', () => {
    const handleToggleBypass = jest.fn()
    const handleDelete = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={buildChain(false)}
        pluginMeta={pluginMeta}
        selectedPluginUri="plugin://drive"
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={handleToggleBypass}
        onDeletePlugin={handleDelete}
        onReorderPlugins={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('juce-grid-signal-plugin-bypass-0'))
    fireEvent.click(screen.getByTestId('juce-grid-signal-plugin-delete-0'))

    expect(screen.queryByTestId('juce-grid-signal-plugin-bypass-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('juce-grid-signal-plugin-delete-1')).not.toBeInTheDocument()
    expect(handleToggleBypass).toHaveBeenCalledWith('plugin://drive', true, 0)
    expect(handleDelete).toHaveBeenCalledWith('plugin://drive', 0)
  })

  it('keeps selected-card controls hidden when no plugin is selected', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onDeletePlugin={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.queryByTestId('juce-grid-signal-plugin-bypass-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('juce-grid-signal-plugin-delete-0')).not.toBeInTheDocument()
  })
})
